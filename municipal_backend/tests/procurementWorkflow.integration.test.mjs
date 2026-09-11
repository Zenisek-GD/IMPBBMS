import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Explicit opt-in, loopback only, unique disposable schema. Never reads or
// alters the application's configured database or its .env credentials.
test("procurement workflow and additive migration against isolated MySQL", { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180000 }, async (t) => {
  const scratch = `impbbms_procurement_test_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST:"127.0.0.1", DB_PORT:String(port), DB_NAME:scratch, DB_USER:"root", DB_PASSWORD:"", NODE_ENV:"test" });
  const admin = await mysql.createConnection({ host:"127.0.0.1", port, user:"root", password:"" });
  assert.match(scratch, /^impbbms_procurement_test_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  const m = await import("../models/index.js");
  t.after(async () => { await m.sequelize.close(); assert.match(scratch, /^impbbms_procurement_test_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  await m.sequelize.sync();
  const evalApi = await import("../controllers/evaluationController.js");
  const twgApi = await import("../controllers/twgController.js");
  const bidding = await import("../controllers/biddingController.js");
  const governance = await import("../controllers/procurementGovernanceController.js");
  const { verifyChain } = await import("../services/auditLog.js");
  const { migrateProcurementWorkflow } = await import("../services/migrateProcurementWorkflow.js");
  const { credentialStamp, requirePermission } = await import("../middleware/permissionMiddleware.js");
  const users = {};
  for (const key of ["bacChairperson", "bacViceChairperson", "bacMember", "twgMember", "bacSecretariat", "hope"]) {
    const role = await m.Role.create({ key, name:key });
    const count = key === "bacMember" ? 3 : 1;
    for (let i=0;i<count;i++) {
      const user = await m.User.create({ name:`${key} ${i}`, email:`${key}${i}@example.test`, password:"ExampleTestPassword123!", roleId:role.id, status:"active" });
      user.Role = role; users[`${key}${i}`] = user;
    }
  }
  const chair = users.bacChairperson0, member = users.bacMember0, twg = users.twgMember0, secretariat = users.bacSecretariat0;
  const attendingMemberIds = [chair.id, users.bacViceChairperson0.id, member.id];
  const mode = await m.ProcurementMode.create({ key:"competitiveBidding", name:"Competitive Bidding", minimumOffers:2 });
  await m.ProcurementMode.create({ key:"negotiatedProcurement", name:"Negotiated Procurement", minimumOffers:1 });
  const call = async (handler, user, params={}, body={}) => {
    let output;
    const req = { currentUser:user, permissions:new Set(["bidding.view","bidding.evaluate","bidding.technicalInput","bidding.publish","bidding.chairEvaluation","app.consolidate","app.approve","pr.determineMode"]), params, body, query:{}, ip:"127.0.0.1" };
    const res = { statusCode:200, status(code){this.statusCode=code; return this;}, json(value){output=value; return this;} };
    await handler(req,res);
    return { ...res, body:output };
  };
  let serial=0;
  const makeRfq = async (category="goods", status="opened") => {
    const n=++serial;
    const pr = await m.PrHeader.create({ prNumber:`PR-TEST-${n}`, dateRequired:"2026-12-01", status:"approved", totalAmount:1000, procurementModeId:mode.id });
    return m.Rfq.create({ referenceNo:`ITB-TEST-${n}`, title:`Test ${n}`, category, abc:1000, closingDate:"2026-01-01T02:00:00Z", openingDate:"2026-01-01T05:00:00Z", status, prHeaderId:pr.id, procurementModeId:mode.id });
  };
  const makeBid = async (rfq, label, price) => {
    const vendor = await m.Vendor.create({ businessName:`Test vendor ${serial} ${label}`, registrationStatus:"verified", philgepsRegistrationNo:`PG-${serial}-${label}`, philgepsExpiry:"2030-01-01" });
    return m.Bid.create({ rfqId:rfq.id, vendorId:vendor.id, totalBidPrice:price, blindLabel:label, status:"opened", technicalSubmitted:true, financialSealed:true });
  };
  const requirements = [{ requirement:"Published mandatory specification", complianceStatus:"compliant", findings:"All required evidence verified." }];

  await t.test("BAC endpoint authorization excludes TWG-only users", async () => {
    const permission = await m.Permission.create({ key:"bidding.technicalInput", module:"bidding", description:"TWG" });
    await twg.Role.addPermission(permission);
    const req = { session:{ userId:twg.id, authAt:Date.now(), loginSessionExpiresAt:Date.now()+600000, lastActivityAt:Date.now(), credentialHash:credentialStamp(twg) } };
    let status=0, next=false;
    await requirePermission("bidding.evaluate")(req,{ status(code){status=code;return this;},json(){} },()=>{next=true;});
    assert.equal(status,403); assert.equal(next,false);
  });
  await t.test("TWG declaration, immutable submission, BAC separation, score calculation and audit rollback", async () => {
    const rfq = await makeRfq("consulting");
    const a = await makeBid(rfq,"Bidder A",200), b = await makeBid(rfq,"Bidder B",100);
    await assert.rejects(call(twgApi.saveTwg,twg,{bidId:a.id},{requirements,status:"draft"}), /declaration/);
    await assert.rejects(call(evalApi.submitEvaluation,member,{bidId:a.id},{noConflictDeclared:true,criteriaBreakdown:{quality:80}}), /TWG/);
    await call(twgApi.declareTwgConflict,twg,{id:rfq.id},{declared:true});
    for (const bid of [a,b]) {
      await call(twgApi.saveTwg,twg,{bidId:bid.id},{requirements,status:"draft"});
      await assert.rejects(call(twgApi.saveTwg,twg,{bidId:bid.id},{requirements,status:"submitted",recommendation:"compliant"}), /justification/);
      await call(twgApi.saveTwg,twg,{bidId:bid.id},{requirements,status:"submitted",recommendation:"compliant",remarks:"Meets the published technical requirements."});
      await assert.rejects(call(twgApi.saveTwg,twg,{bidId:bid.id},{requirements,status:"draft"}), /cannot be edited/);
      await assert.rejects(call(evalApi.submitEvaluation,twg,{bidId:bid.id},{noConflictDeclared:true,criteriaBreakdown:{quality:80}}), /own TWG/);
      await call(evalApi.submitEvaluation,member,{bidId:bid.id},{noConflictDeclared:true,criteriaBreakdown:{quality:80}});
    }
    await assert.rejects(call(evalApi.closeEvaluation,chair,{id:rfq.id},{}), /quorum/);
    m.AuditLog.addHook("beforeCreate","testAuditFailure",()=>{throw new Error("test audit storage failure");});
    await assert.rejects(call(evalApi.closeEvaluation,chair,{id:rfq.id},{attendingMemberIds}), /test audit/);
    m.AuditLog.removeHook("beforeCreate","testAuditFailure");
    assert.equal((await rfq.reload()).status,"opened");
    assert.equal((await a.reload()).financialSealed,true);
    await call(evalApi.closeEvaluation,chair,{id:rfq.id},{attendingMemberIds});
    assert.equal((await a.reload()).combinedScore,"72.5000");
    assert.equal((await b.reload()).combinedScore,"85.0000");
    await assert.rejects(call(bidding.submitPostQualification,member,{bidId:a.id},{result:"passed"}), /highest-ranked/);
    await call(bidding.submitPostQualification,member,{bidId:b.id},{result:"passed"});
    let award = await call(bidding.recommendAward,chair,{bidId:b.id},{attendingMemberIds});
    assert.equal(award.statusCode,201);
    assert.equal(await m.BacResolution.count({where:{entityRef:"award",entityId:award.body.id}}),1);
    await assert.rejects(call(bidding.approveAward,chair,{id:award.body.id},{}), /own award/);
    assert.equal((await rfq.reload()).status,"evaluated");
    const rejectedAwardId=award.body.id;
    const grounds="Clarify the supporting post-qualification record before issuing the award.";
    await assert.rejects(call(bidding.disapproveAward,chair,{id:rejectedAwardId},{grounds}),/Another authorized/);
    await call(bidding.disapproveAward,users.hope0,{id:rejectedAwardId},{grounds});
    award=await call(bidding.recommendAward,chair,{bidId:b.id},{attendingMemberIds,remarks:"BAC reviewed and clarified the post-qualification record."});
    assert.equal(award.statusCode,201);assert.notEqual(award.body.id,rejectedAwardId);
    assert.equal((await m.Award.findByPk(rejectedAwardId)).status,"disapproved");
    await call(bidding.approveAward,users.hope0,{id:award.body.id},{});
    assert.equal((await rfq.reload()).status,"awarded");
    assert.equal((await b.reload()).status,"awarded");
    const history=await call(governance.listAttemptHistory,chair,{id:rfq.id});
    assert.equal(history.body.attempts[0].status,"successful");
    assert.equal(history.body.attempts[0].bacDecision,"Award approved");
  });
  await t.test("mandatory technical failures never reach price ranking", async () => {
    const rfq = await makeRfq(); const bid = await makeBid(rfq,"Bidder A",10);
    await call(twgApi.declareTwgConflict,twg,{id:rfq.id},{declared:true});
    await call(twgApi.saveTwg,twg,{bidId:bid.id},{requirements:[{...requirements[0],complianceStatus:"nonCompliant"}],recommendation:"nonCompliant",remarks:"Mandatory specification is missing.",status:"submitted"});
    await assert.rejects(call(evalApi.submitEvaluation,member,{bidId:bid.id},{noConflictDeclared:true,criteriaBreakdown:{specification:"compliant"},verdict:"passed"}),/mandatory TWG/);
    await call(evalApi.submitEvaluation,member,{bidId:bid.id},{noConflictDeclared:true,criteriaBreakdown:{specification:"nonCompliant"},verdict:"failed",remarks:"Mandatory specification missing."});
    await call(evalApi.closeEvaluation,chair,{id:rfq.id},{attendingMemberIds});
    assert.equal((await bid.reload()).status,"technicalFailed"); assert.equal(bid.financialSealed,true); assert.equal(bid.combinedScore,null);
    assert.equal((await call(bidding.submitPostQualification,member,{bidId:bid.id},{result:"passed"})).statusCode,409);
  });
  await t.test("no-bid opening does not silently fail, histories preserve two attempts and require independent BAC review", async () => {
    const rfq = await makeRfq("goods","closed");
    assert.equal((await call(bidding.openBids,secretariat,{id:rfq.id},{})).statusCode,409);
    assert.equal((await rfq.reload()).status,"closed");
    const evidence = [{name:"Official minutes",url:"https://example.test/official-minutes.pdf"}];
    const failure = { reason:"No bids received",resolutionNo:"Resolution No. Resolution No. 2026-001",resolutionDate:"2026-01-02",supportingDocuments:evidence,attendingMemberIds };
    await call(governance.declareFailureOfBidding,chair,{id:rfq.id},failure);
    assert.equal((await call(bidding.cancelRfq,secretariat,{id:rfq.id},{reason:"Cancel old attempt"})).statusCode,409);
    assert.equal((await rfq.reload()).status,"failed");
    assert.equal((await m.BacResolution.findOne({where:{entityRef:"rfq",entityId:rfq.id}})).resolutionNo,"2026-001");
    await assert.rejects(call(governance.submitNegotiatedReview,secretariat,{id:rfq.id},{justification:"Review",legalBasis:"Approved local policy",supportingDocuments:evidence}), /attempt|failed/i);
    const rebid = await call(governance.createRebid,secretariat,{id:rfq.id},{closingDate:"2028-01-15T02:00:00Z",openingDate:"2028-01-15T05:00:00Z"});
    const second = await m.Rfq.findByPk(rebid.body.id ?? rebid.body.rfq?.id);
    assert.ok(second); assert.notEqual(second.id,rfq.id);
    assert.equal((await rfq.reload()).status,"failed");
    await second.update({status:"closed",closingDate:"2026-01-02T02:00:00Z",openingDate:"2026-01-02T05:00:00Z"});
    await call(governance.declareFailureOfBidding,chair,{id:second.id},{...failure,resolutionNo:"2026-002"});
    await call(governance.submitNegotiatedReview,secretariat,{id:second.id},{justification:"Two attempts failed; specifications reviewed.",legalBasis:"Approved local policy",supportingDocuments:evidence});
    await assert.rejects(call(governance.startNegotiatedProcurement,secretariat,{id:second.id},{closingDate:"2028-02-01T02:00:00Z",openingDate:"2028-02-01T05:00:00Z"}), /approval|approved/i);
    await assert.rejects(call(governance.decideNegotiatedReview,secretariat,{id:second.id},{decision:"approved",remarks:"Confirmed",resolutionNo:"2026-003",resolutionDate:"2026-01-03",attendingMemberIds,presidingMemberId:chair.id}), /own|another|independent/i);
    await call(governance.decideNegotiatedReview,chair,{id:second.id},{decision:"approved",remarks:"Eligibility evidence confirmed.",resolutionNo:"2026-003",resolutionDate:"2026-01-03",attendingMemberIds});
    await call(governance.startNegotiatedProcurement,secretariat,{id:second.id},{closingDate:"2028-02-01T02:00:00Z",openingDate:"2028-02-01T05:00:00Z"});
    assert.equal(await m.ProcurementAttempt.count({where:{projectKey:`pr:${rfq.prHeaderId}`}}),3);
  });
  await t.test("cancellation preserves its attempt and subsequent procurement receives a new number", async () => {
    const rfq=await makeRfq("goods","draft");
    await call(bidding.cancelRfq,secretariat,{id:rfq.id},{reason:"Specifications require revision before publication."});
    const history=await call(governance.listAttemptHistory,secretariat,{id:rfq.id});
    assert.equal(history.body.attempts[0].status,"cancelled");assert.ok(history.body.attempts[0].completedAt);
    const replacement=await call(bidding.createRfq,secretariat,{}, {prHeaderId:rfq.prHeaderId,category:"goods",title:"Revised procurement preparation",closingDate:"2028-06-01T02:00:00Z",openingDate:"2028-06-01T05:00:00Z"});
    assert.equal(replacement.statusCode,201);assert.equal(replacement.body.attemptNumber,2);
    assert.equal((await rfq.reload()).status,"cancelled");
  });
  await t.test("plan consolidation, mode determination and bidder eligibility require committee attendance", async () => {
    const appApi = await import("../controllers/appEntryController.js");
    const prApi = await import("../controllers/prController.js");
    const vendorApi = await import("../controllers/vendorController.js");
    const entry = await m.AppEntry.create({projectTitle:"Committee review plan",abc:1000,fiscalYear:2026,targetStartQuarter:"Q1",targetCompletionQuarter:"Q2",status:"pendingConsolidation",createdById:twg.id});
    await assert.rejects(call(appApi.transitionAppEntry,secretariat,{id:entry.id},{action:"consolidate"}),/quorum/);
    await assert.rejects(call(appApi.transitionAppEntry,twg,{id:entry.id},{action:"consolidate",attendingMemberIds,presidingMemberId:chair.id}),/Another authorized/);
    await call(appApi.transitionAppEntry,secretariat,{id:entry.id},{action:"consolidate",attendingMemberIds,presidingMemberId:chair.id});
    assert.equal((await entry.reload()).status,"pendingBudgetCertification");
    const pr=await m.PrHeader.create({prNumber:"PR-COMMITTEE",dateRequired:"2028-01-01",status:"pendingModeDetermination",totalAmount:1000});
    const determination={action:"determineMode",procurementModeKey:"competitiveBidding",justification:"Committee selected open competition."};
    await assert.rejects(call(prApi.transitionPr,chair,{id:pr.id},determination),/quorum/);
    await call(prApi.transitionPr,chair,{id:pr.id},{...determination,attendingMemberIds});
    assert.equal((await pr.reload()).status,"approved");
    const vendor=await m.Vendor.create({businessName:"Committee intake",registrationStatus:"submitted",recordedByUserId:twg.id});
    await assert.rejects(call(vendorApi.reviewVendor,chair,{id:vendor.id},{decision:"return",remarks:"Missing official records."}),/quorum/);
    await call(vendorApi.reviewVendor,chair,{id:vendor.id},{decision:"return",remarks:"Missing official records.",attendingMemberIds});
    assert.equal((await vendor.reload()).registrationStatus,"returned");
  });
  await t.test("settings changes are audited and effective central limits are consumed", async () => {
    const settings=await import("../controllers/settingsController.js");
    const {getLguProfile}=await import("../models/systemSettingModel.js");
    const {procurementAmountError}=await import("../services/procurementThresholds.js");
    const policy={membershipCount:5,quorumCount:4,requiredFailedAttempts:2,memberIds:[chair.id,users.bacViceChairperson0.id,...[0,1,2].map(i=>users[`bacMember${i}`].id)]};
    await call(settings.updateProcurementSettings,secretariat,{}, {policy});
    const {assertBacAction}=await import("../services/procurementGovernance.js");
    await assert.rejects(assertBacAction({currentUser:chair,body:{attendingMemberIds}}),/quorum/);
    await call(settings.updateProcurementSettings,secretariat,{}, {policy:{...policy,quorumCount:3}});
    const created=await call(settings.createProcurementLimit,secretariat,{}, {category:"goods",procurementMethod:"competitiveBidding",minimumAmount:0,maximumAmount:1500,effectiveDate:"2020-01-01",status:"active",policyReference:"Approved municipal test policy"});
    assert.ok(procurementAmountError(1501,"competitiveBidding",await getLguProfile(),"goods"));
    await call(settings.updateProcurementLimit,secretariat,{id:created.body.id},{status:"inactive"});
    assert.equal(procurementAmountError(1501,"competitiveBidding",await getLguProfile(),"goods"),null);
    assert.equal(await m.AuditLog.count({where:{actionType:"settings.threshold.updated",entityId:created.body.id}}),1);
  });
  await t.test("procurement evidence and submitted TWG supporting documents remain immutable", async () => {
    const documents=await import("../controllers/documentController.js");
    const rfq=await makeRfq();const bid=await makeBid(rfq,"Bidder A",100);
    await call(twgApi.declareTwgConflict,twg,{id:rfq.id},{declared:true});
    const draft=await call(twgApi.saveTwg,twg,{bidId:bid.id},{requirements,status:"draft"});
    const assessmentId=draft.body.assessment?.id??draft.body.id;
    const content=Buffer.from("%PDF-1.4\nQA supporting record"),base={filename:"support.pdf",mimeType:"application/pdf",sizeBytes:content.length,content,checksum:crypto.createHash("sha256").update(content).digest("hex"),uploadedAt:new Date()};
    const attachment=await m.Document.create({...base,entityRef:"twgAssessment",entityId:assessmentId});
    await call(twgApi.saveTwg,twg,{bidId:bid.id},{requirements:[{...requirements[0],documents:[attachment.id]}],recommendation:"compliant",remarks:"Published requirements met.",status:"submitted"});
    assert.equal((await call(documents.deleteDocument,twg,{id:attachment.id})).statusCode,403);
    const evidence=await m.Document.create({...base,entityRef:"rfq",entityId:rfq.id});
    await assert.rejects(call(documents.deleteDocument,secretariat,{id:evidence.id}),/preserved/);
    assert.ok(await m.Document.findByPk(attachment.id));assert.ok(await m.Document.findByPk(evidence.id));
  });
  await t.test("additive migration is repeatable and preserves completed records and audit hashes", async () => {
    const completed = await makeRfq("goods","awarded");
    const original = { title:completed.title,status:completed.status,referenceNo:completed.referenceNo };
    const hashes = (await m.AuditLog.findAll({attributes:["sequence","hash"],order:[["sequence","ASC"]]})).map((row)=>row.get({plain:true}));
    const qi=m.sequelize.getQueryInterface();
    await qi.removeColumn(m.Rfq.getTableName(),"twgRequired");
    const first=await migrateProcurementWorkflow();
    assert.ok(first.added.includes("rfqs.twgRequired"));
    assert.deepEqual((await migrateProcurementWorkflow()).added,[]);
    await completed.reload();
    assert.equal(completed.twgRequired,false);
    assert.deepEqual({title:completed.title,status:completed.status,referenceNo:completed.referenceNo},original);
    assert.deepEqual((await m.AuditLog.findAll({attributes:["sequence","hash"],order:[["sequence","ASC"]]})).map((row)=>row.get({plain:true})).slice(0,hashes.length),hashes);
    const verification=await verifyChain({});
    assert.equal(verification.intact,true);
  });
  await t.test("existing integrity monitor accepts legitimate bulk and decimal writes", async () => {
    // These legacy scripts rebaseline and write rows. Run them only against the
    // isolated schema created above, never against a configured application DB.
    for (const file of ["services/integrityMonitor.test.mjs", "services/integrityMonitor.decimal.test.mjs"]) {
      await promisify(execFile)(process.execPath,[file],{cwd:process.cwd(),env:{...process.env,DB_NAME:scratch,DB_HOST:"127.0.0.1",DB_PORT:String(port),DB_USER:"root",DB_PASSWORD:""},windowsHide:true,timeout:60000});
    }
  });
});
