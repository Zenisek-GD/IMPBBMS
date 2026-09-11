import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import puppeteer from "puppeteer-core";
import { REPORTS } from "../services/reportPolicy.js";

// Real rendered routes, with deterministic API fixtures. No municipal records
// or real accounts are used; workflow/database guards have separate integration tests.
test("procurement screens support TWG declaration, committee attendance, settings and all report routes", {timeout:120000}, async (t) => {
  const executablePath = [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file)=>file&&fs.existsSync(file));
  assert.ok(executablePath,"Set CHROME_PATH to an installed browser.");
  const app = express(), dist=path.resolve("../municipal-frontend/dist");
  app.use(express.static(dist)); app.get("*",(_req,res)=>res.sendFile(path.join(dist,"index.html")));
  const server=await new Promise((resolve)=>{const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));});
  const browser=await puppeteer.launch({executablePath,headless:true});
  t.after(async()=>{await browser.close();await new Promise((resolve)=>server.close(resolve));});
  const origin=`http://127.0.0.1:${server.address().port}`,page=await browser.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  let role="twgMember",declared=false,declarationWrites=0;
  const committee=["BAC Chairperson","BAC Vice-Chairperson","BAC Member 1","BAC Member 2","BAC Member 3"].map((position,index)=>({id:index+1,name:`Officer ${index+1}`,position,role:index===0?"bacChairperson":index===1?"bacViceChairperson":"bacMember"}));
  const policy={membershipCount:5,quorumCount:3,memberIds:[1,2,3,4,5],requirePresidingOfficer:true,requiredFailedAttempts:2,requireFailureDocuments:true};
  const rfq={id:1,referenceNo:"ITB-QA-001",title:"Municipal consulting project",category:"consulting",status:"opened",abc:1000,qualityWeight:75,financialWeight:25,consultingPassingScore:60,twgRequired:true,closingDate:"2026-09-15T02:00:00Z",openingDate:"2026-09-15T05:00:00Z"};
  const reportData=(report)=>({key:report.key,title:report.title,columns:[{key:"reference",label:"Reference"},{key:"project",label:"Procurement project"},{key:"amount",label:"Amount (PHP)",type:"number"}],rows:[{id:1,reference:"ITB-QA-001",project:"Municipal consulting project",amount:1000}],total:1,page:1,pageSize:25,totalPages:1,filters:{year:[2026],category:["consulting"],status:["opened"]},generatedAt:new Date().toISOString()});
  await page.setRequestInterception(true);
  page.on("request",async(request)=>{
    const url=new URL(request.url());
    if(!url.pathname.startsWith("/api/")) return url.origin===origin||url.protocol==="data:"?request.continue():request.abort();
    let data={};const key=url.pathname.slice(4);
    if(key==="/auth/me") data={id:9,name:"QA Officer",email:"qa@example.test",role,roleName:role,permissions:role==="twgMember"?["bidding.view","bidding.technicalInput"]:role==="bacChairperson"?["bidding.view","bidding.evaluate","bidding.chairEvaluation"]:["settings.manage","bidding.view","app.view","contract.view","audit.viewAll","audit.export"],themePreference:"light",loginSessionExpiresAt:Date.now()+600000,serverTime:Date.now(),mfaVerified:true,mfaEnrollmentRequired:false};
    else if(key==="/settings") data={lgu:{name:"QA Municipality",lguType:"municipality",incomeClass:"1st"},branding:{systemName:"ProcureNance"},thresholds:{},options:{lguTypes:["municipality"],incomeClasses:["1st"]}};
    else if(key==="/settings/procurement") data={policy,committee,committeeCandidates:committee,compositionWarnings:[]};
    else if(key==="/settings/thresholds") data={limits:[],methods:[{key:"competitiveBidding",name:"Competitive Bidding"}]};
    else if(key==="/settings/shortcuts") data={};
    else if(key.includes("notifications")) data=[];
    else if(key==="/reports/pending-counts") data={counts:{"/evaluation":declared?0:1},queues:{twg:declared?0:1},generatedAt:new Date().toISOString()};
    else if(key==="/bidding/rfqs") data=[rfq];
    else if(key==="/bidding/rfqs/1/bids") data={blind:true,qualityWeight:75,financialWeight:25,bids:[{id:1,blindLabel:"Bidder A",vendorName:null,status:"opened",totalBidPrice:null,evaluationCount:0,evaluations:[]}]};
    else if(key==="/bidding/rfqs/1/twg") data={required:true,declaration:declared?{noConflictDeclared:true,declaredAt:new Date().toISOString()}:null,assessments:role==="bacChairperson"?[{id:1,bidId:1,memberId:8,memberName:"TWG Officer",status:"submitted",noConflictDeclared:true,declaredAt:new Date().toISOString(),submittedAt:new Date().toISOString(),recommendation:"compliant",remarks:"Meets requirements.",requirements:[]}]:[]};
    else if(key==="/bidding/rfqs/1/twg/declaration") {assert.equal(JSON.parse(request.postData()).declared,true);declared=true;declarationWrites++;data={message:"Declaration recorded. You may now prepare the technical assessment."};}
    else if(key==="/bidding/bac-committee") data={policy,committee};
    else if(key==="/bidding/awards"||key==="/documents") data=[];
    else if(key==="/reports/catalog") data=REPORTS;
    else if(key.startsWith("/reports/")) data=reportData(REPORTS.find(report=>key.endsWith(report.key))??REPORTS[0]);
    await request.respond({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  const text=()=>page.evaluate(()=>document.body.innerText);
  const click=(label)=>page.evaluate((label)=>{const button=[...document.querySelectorAll("button")].find(button=>button.textContent.trim()===label);if(!button)throw new Error(`Missing button: ${label}`);button.click();},label);
  const disabled=(label)=>page.evaluate((label)=>[...document.querySelectorAll("button")].find(button=>button.textContent.trim()===label)?.disabled,label);
  await page.setViewport({width:1280,height:900});
  await page.goto(origin+"/evaluation",{waitUntil:"networkidle0"});
  await page.waitForFunction(()=>document.body.innerText.includes("Record declaration"));
  assert.equal(await disabled("TWG assessment"),true);assert.equal(await disabled("Record declaration"),true);
  await page.click('input[type="checkbox"]');await click("Record declaration");
  await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="TWG assessment"&&!button.disabled));
  assert.equal(declarationWrites,1);await click("TWG assessment");await page.waitForSelector('[role="dialog"]');
  assert.match(await text(),/Technical findings/);assert.match(await text(),/Written justification/);await click("Cancel");
  role="bacChairperson";await page.goto(origin+"/evaluation",{waitUntil:"networkidle0"});
  await click("Close technical evaluation");await page.waitForSelector('[role="dialog"]');
  assert.match(await text(),/required quorum has not been met/);
  const checks=await page.$$('[role="dialog"] input[type="checkbox"]');for(const check of checks.slice(0,3))await check.click();
  await page.select('[role="dialog"] select',"1");assert.match(await text(),/Configured quorum is satisfied/);await click("Cancel");
  role="systemAdministrator";await page.goto(origin+"/admin/settings",{waitUntil:"networkidle0"});
  await page.waitForFunction(()=>document.body.innerText.includes("Save approved procurement settings"));
  assert.match(await text(),/Official signatories and positions/);
  await page.goto(origin+"/admin/settings/thresholds",{waitUntil:"networkidle0"});await click("Add applicable limit");
  await page.waitForSelector('[role="dialog"]');assert.match(await text(),/Legal \/ policy reference/);await page.keyboard.press("Escape");
  for(const report of REPORTS){await page.goto(origin+`/reports/${report.key}`,{waitUntil:"networkidle0"});await page.waitForFunction(()=>document.body.innerText.includes("ITB-QA-001"));assert.match(await text(),new RegExp(report.title));}
  await page.setViewport({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"report table must scroll within its container on mobile");
  assert.deepEqual(errors,[]);
});
