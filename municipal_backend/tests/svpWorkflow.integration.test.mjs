import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

test('SVP terms, quotation evidence, disclosure and single responsive quotation remain consistent', { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== '1', timeout: 180000 }, async (t) => {
  const scratch = `impbbms_svp_test_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST:'127.0.0.1', DB_PORT:String(port), DB_NAME:scratch, DB_USER:'root', DB_PASSWORD:'', NODE_ENV:'test' });
  const admin = await mysql.createConnection({ host:'127.0.0.1', port, user:'root', password:'' });
  assert.match(scratch, /^impbbms_svp_test_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let m;
  t.after(async () => { await m?.sequelize.close(); assert.match(scratch, /^impbbms_svp_test_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  m = await import('../models/index.js'); await m.sequelize.sync();
  const api = await import('../controllers/biddingController.js');
  const docs = await import('../controllers/documentController.js');
  const { OtpChallenge } = await import('../models/otpChallengeModel.js');
  const { verifyChain } = await import('../services/auditLog.js');
  const roles = {};
  const user = async (name, roleKey) => {
    const role = roles[roleKey] ??= await m.Role.create({ key:roleKey, name:roleKey });
    const actor = await m.User.create({ name, email:`${name}@example.test`, password:'ExampleTestPassword123!', roleId:role.id, status:'active' }); actor.Role=role; return actor;
  };
  const supplier=await user('supplier','supplier'), outsider=await user('outsider','supplier'), chair=await user('chair','bacChairperson'), vice=await user('vice','bacViceChairperson');
  const members=[]; for(let n=0;n<3;n++) members.push(await user(`member${n}`,'bacMember'));
  const secretariat=await user('secretariat','bacSecretariat');
  const vendor=await m.Vendor.create({ userId:supplier.id, businessName:'SVP supplier', registrationStatus:'verified', philgepsRegistrationNo:'SVP-PG', philgepsExpiry:'2099-01-01' });
  await m.Vendor.create({ userId:outsider.id, businessName:'Other supplier', registrationStatus:'verified' });
  const mode=await m.ProcurementMode.create({ key:'smallValueProcurement', name:'Small Value Procurement', minimumOffers:3, requiresBidSecurity:true });
  let serial=0;
  const makeRfq=(status='opened', due='evaluation')=>m.Rfq.create({ referenceNo:`RFQ-SVP-${++serial}`, title:'Three office desktop computers', abc:1000, category:'goods', procurementModeId:mode.id, status, twgRequired:false,
    closingDate:'2026-01-01T02:00:00Z', openingDate:'2026-01-01T03:00:00Z', svpTechnicalSpecifications:'Three desktop computers, with stated specifications, delivery and eligibility evidence requirements.', svpEligibilityDueStage:due });
  const makeBid=(rfq,status='opened')=>m.Bid.create({ rfqId:rfq.id, vendorId:vendor.id, status, submittedAt:new Date('2026-01-01T01:00:00Z'), totalBidPrice:900, blindLabel:'Bidder A', technicalSubmitted:true, financialSealed:true });
  const file=()=>{const buffer=Buffer.from('%PDF-1.4\nSVP test evidence\n%%EOF');return {buffer,mimetype:'application/pdf',originalname:'evidence.pdf',size:buffer.length};};
  const evidence=(bid,type='svpTechnicalOffer')=>m.Document.create({ filename:'evidence.pdf', mimeType:'application/pdf', sizeBytes:file().size, content:file().buffer, checksum:crypto.createHash('sha256').update(file().buffer).digest('hex'), entityRef:'bid',entityId:bid.id,docType:type,uploadedById:supplier.id,uploadedAt:new Date() });
  const call=async(handler,actor,params={},body={},extra={})=>{let output,status=200;await handler({currentUser:actor,params,body,query:{},permissions:new Set(actor.Role.key==='supplier'?['bidding.submitBid']:['bidding.view','bidding.publish','bidding.evaluate','bidding.recommendAward']),ip:'127.0.0.1',...extra},{status(code){status=code;return this;},json(value){output=value;return this;},setHeader(){},send(value){output=value;return this;}});if(status>=400)throw Object.assign(new Error(output?.message??'Rejected'),{status});return output;};
  const late=(bid,actor=supplier)=>call(api.submitSvpEligibilityEvidence,actor,{bidId:bid.id},{},{file:file()});
  const listing=(bid,actor)=>call(docs.listDocuments,actor,{}, {},{query:{entityRef:'bid',entityId:bid.id}});

  await t.test('draft terms require detailed specifications and an allowed due stage and become immutable after publication',async()=>{
    const rfq=await makeRfq('draft');
    await assert.rejects(call(api.updateSvpTerms,secretariat,{id:rfq.id},{svpTechnicalSpecifications:'short',svpEligibilityDueStage:'offer'}),/technical specifications/);
    await assert.rejects(call(api.updateSvpTerms,secretariat,{id:rfq.id},{svpTechnicalSpecifications:rfq.svpTechnicalSpecifications,svpEligibilityDueStage:'afterAward'}),/Choose when/);
    await call(api.updateSvpTerms,secretariat,{id:rfq.id},{svpTechnicalSpecifications:'Revised desktop specifications, three units, delivery and required legal documents.',svpEligibilityDueStage:'beforeAward'});
    const audit=await m.AuditLog.findOne({where:{actionType:'rfq.svpTermsChanged',entityId:rfq.id}});
    assert.equal(audit.beforeState.svpEligibilityDueStage,'evaluation');assert.equal(audit.afterState.svpEligibilityDueStage,'beforeAward');
    await rfq.update({status:'published'});
    await assert.rejects(call(api.updateSvpTerms,secretariat,{id:rfq.id},{}),/Only draft/);
  });
  await t.test('submission requires the signed offer and due eligibility file, consumes a scoped verification ticket and omits SVP bid security',async()=>{
    const rfq=await makeRfq('published','offer');await rfq.update({closingDate:new Date(Date.now()+3600000),openingDate:new Date(Date.now()+7200000)});
    await assert.rejects(call(api.submitBid,supplier,{id:rfq.id},{totalBidPrice:900}),/signed technical offer/);
    await assert.rejects(call(api.submitBid,supplier,{id:rfq.id},{totalBidPrice:900},{files:{technicalOffer:[file()]}}),/requires the eligibility documents/);
    const reference=crypto.randomUUID(),ticket=crypto.randomBytes(32).toString('hex');
    await OtpChallenge.create({reference,purpose:'bidSubmission',codeHash:'fixture',deliveredTo:supplier.email,userId:supplier.id,expiresAt:new Date(Date.now()+600000),consumedAt:new Date(),ticketHash:crypto.createHash('sha256').update(ticket).digest('hex'),ticketExpiresAt:new Date(Date.now()+600000),contextRef:'rfq',contextId:rfq.id});
    const submitted=await call(api.submitBid,supplier,{id:rfq.id},{totalBidPrice:900,reference,ticket},{files:{technicalOffer:[file()],eligibilityEvidence:[file()]}});
    assert.equal(submitted.status,'submitted');assert.equal(submitted.bidSecurity,undefined);
    assert.equal(await m.Document.count({where:{entityRef:'bid',entityId:submitted.id}}),2);
    assert.equal(await m.Security.count({where:{entityRef:'bid',entityId:submitted.id}}),0);
    assert.ok((await OtpChallenge.findOne({where:{reference}})).ticketUsedAt);
    assert.equal((await call(api.listMyQuotations,supplier)).length,1);assert.deepEqual(await call(api.listMyQuotations,outsider),[]);
  });
  await t.test('reviewer prices and files remain sealed until valid recorded opening; unrelated suppliers never gain file access',async()=>{
    const rfq=await makeRfq('closed');const bid=await makeBid(rfq);await evidence(bid);
    const sealed=await call(api.listBidsForRfq,chair,{id:rfq.id});assert.equal(sealed.blind,true);assert.equal(sealed.bids[0].vendorName,bid.blindLabel);assert.equal(sealed.bids[0].vendorId,null);assert.equal(sealed.bids[0].totalBidPrice,null);assert.deepEqual(sealed.bids[0].evidence,[]);
    assert.equal((await listing(bid,supplier)).length,1);await assert.rejects(listing(bid,outsider),error=>error.status===403);await assert.rejects(listing(bid,chair),error=>error.status===403);
    await rfq.update({status:'opened'});await assert.rejects(listing(bid,chair),error=>error.status===403);
    const opening=await m.BidOpeningRecord.create({rfqId:rfq.id,openedAt:'2026-01-01T02:30:00Z',openedById:chair.id});
    assert.equal((await call(api.listBidsForRfq,chair,{id:rfq.id})).blind,true);
    await opening.update({openedAt:'2026-01-01T03:00:00Z'});
    const opened=await call(api.listBidsForRfq,chair,{id:rfq.id});assert.equal(opened.blind,false);assert.equal(opened.bids[0].vendorName,vendor.businessName);assert.equal(opened.bids[0].totalBidPrice,900);assert.equal(opened.bids[0].evidence.length,1);
    assert.equal((await listing(bid,chair)).length,1);await assert.rejects(listing(bid,outsider),error=>error.status===403);
  });
  await t.test('late evidence obeys its published due stage and quotation ownership',async()=>{
    for(const [due,status,bidStatus,allowed] of [['offer','opened','opened',false],['evaluation','published','submitted',false],['evaluation','opened','opened',true],['evaluation','evaluated','technicalPassed',false],['beforeAward','evaluated','technicalPassed',true],['beforeAward','evaluated','technicalFailed',false],['beforeAward','awarded','postQualified',false]]){
      const rfq=await makeRfq(status,due),bid=await makeBid(rfq,bidStatus);
      await assert.rejects(late(bid,outsider),error=>error.status===403);
      if(allowed){const saved=await late(bid);assert.ok(saved.checksum);await assert.rejects(late(bid),/already submitted and cannot be replaced/);}
      else await assert.rejects(late(bid));
      assert.equal(await m.Document.count({where:{entityRef:'bid',entityId:bid.id,docType:'svpEligibilityEvidence'}}),allowed?1:0);
    }
  });
  await t.test('concurrent uploads retain one immutable evidence file and an audit failure rolls back the file',async()=>{
    const rfq=await makeRfq(),bid=await makeBid(rfq);
    const outcomes=await Promise.allSettled([late(bid),late(bid)]);assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);
    assert.equal(await m.AuditLog.count({where:{actionType:'bidding.eligibilityEvidenceSubmitted',entityId:bid.id}}),1);
    const other=await makeBid(await makeRfq());
    m.AuditLog.addHook('beforeCreate','svpAuditFailure',()=>{throw new Error('SVP audit unavailable');});
    try{await assert.rejects(late(other),/SVP audit unavailable/);}finally{m.AuditLog.removeHook('beforeCreate','svpAuditFailure');}
    assert.equal(await m.Document.count({where:{entityRef:'bid',entityId:other.id}}),0);
  });
  await t.test('one compliant verified quotation can be recommended even when the stored legacy mode asks for three offers',async()=>{
    const rfq=await makeRfq('evaluated','beforeAward'),bid=await makeBid(rfq,'technicalPassed');await bid.update({financialSealed:false});
    await assert.rejects(call(api.submitPostQualification,chair,{bidId:bid.id},{result:'passed',remarks:'All supplier findings compliant.',checklist:{legal:'ok',technical:'ok',financial:'ok'}}),/technical offer and eligibility evidence/);
    await evidence(bid);await late(bid);
    await assert.rejects(call(api.submitPostQualification,chair,{bidId:bid.id},{result:'passed',remarks:'Incomplete findings.',checklist:{legal:'ok'}}),/legal, technical and financial findings/);
    await call(api.submitPostQualification,chair,{bidId:bid.id},{result:'passed',remarks:'All RFQ-specific legal, technical and financial evidence verified.',checklist:{legal:'ok',technical:'ok',financial:'ok'}});
    const award=await call(api.recommendAward,chair,{bidId:bid.id},{attendingMemberIds:[chair.id,vice.id,members[0].id],presidingMemberId:chair.id,remarks:'The sole quotation is responsive to the RFQ.'});
    assert.equal(award.offersReceived,1);assert.equal(award.status,'pendingHopeApproval');assert.equal(award.amount,900);
  });
  assert.equal((await verifyChain({})).intact,true);
});
