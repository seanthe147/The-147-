import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { db, stockItems, stockCategories, stockCounts, stockCountLines, stockDeliveries, stockDeliveryLines, stockItemPosLinks, stockRepairAudit } from "@workspace/db";
import { eq } from "drizzle-orm";
import { registerStockRepair } from "./stock-repair";
import { liveStock } from "./stock-live";
test("isolated repair preserves history, blocks stale previews and validates serving links", async()=>{
  if(process.env.MEMBERSHIP_BILLING_ISOLATED_TEST!=="yes")throw new Error("Isolated database required");
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async(url:any,options:any)=>{
    if(String(url).includes("squareupsandbox.com"))return new Response(JSON.stringify({objects:[{type:"ITEM",id:"beer",item_data:{name:"Test lager",variations:[
      {id:"pint",item_variation_data:{name:"Pint"}},{id:"half",item_variation_data:{name:"Half"}}]}}]}),{status:200});
    return nativeFetch(url,options);
  };
  const app=express();app.use(express.json());
  registerStockRepair(app,((req:any,res:any,next:any)=>req.headers.authorization?next():res.sendStatus(401)),
    ((req:any,res:any,next:any)=>{req.staffUsername="test-manager";return req.headers.authorization==="manager"?next():res.sendStatus(403);}));
  const server=app.listen(0);await new Promise<void>(r=>server.once("listening",r));
  const address=server.address() as any;
  const call=async(path:string,body?:any,auth="manager")=>{
    const r=await nativeFetch(`http://localhost:${address.port}/api/stock/repair${path}`,{method:body?"POST":"GET",headers:{authorization:auth,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
    return {status:r.status,body:await r.text().then(s=>{try{return JSON.parse(s);}catch{return s;}})};
  };
  try{
    assert.equal((await call("",undefined,"")).status,401);
    assert.equal((await call("",undefined,"staff")).status,403);
    const [cat]=await db.insert(stockCategories).values({name:"Repair test"}).returning();
    const [a,b,c]=await db.insert(stockItems).values([
      {name:"Test lager",categoryId:cat.id,countUnit:"keg",containerSize:"50L",servesPerUnit:"88"},
      {name:"Test lager",categoryId:cat.id,countUnit:"keg",containerSize:"50L",servesPerUnit:"88"},
      {name:"Test bottle",categoryId:cat.id,countUnit:"bottle",containerSize:"500ml"}]).returning();
    await db.insert(stockItemPosLinks).values([
      {stockItemId:a.id,squareVariationId:"pint",soldUnitFactor:"1"},
      {stockItemId:b.id,squareVariationId:"pint",soldUnitFactor:"1"},
      {stockItemId:c.id,squareVariationId:"half",soldUnitFactor:".5"}]);
    const [count]=await db.insert(stockCounts).values({periodStart:new Date("2026-01-01"),periodEnd:new Date("2026-02-01"),status:"submitted",countedBy:"test"}).returning();
    await db.insert(stockCountLines).values({countId:count.id,stockItemId:b.id,quantityUnits:"1.25",unitCostPence:"10000",notes:"preserve"});
    const [delivery]=await db.insert(stockDeliveries).values({deliveredAt:new Date(),enteredBy:"test"}).returning();
    await db.insert(stockDeliveryLines).values({deliveryId:delivery.id,stockItemId:b.id,quantityUnits:"2",invoiceLineCostPence:20000});
    const preview=await call("");assert.equal(preview.status,200);
    assert.equal(preview.body.duplicates.length,1);
    assert.equal(preview.body.unsafeLinks.length,1);
    assert.equal((await call("/apply",{version:"stale",confirmed:true})).status,409);
    const applied=await call("/apply",{version:preview.body.version,confirmed:true});
    assert.equal(applied.status,200,JSON.stringify(applied.body));
    const lines=await db.select().from(stockCountLines);assert.equal(lines[0].stockItemId,a.id);assert.equal(Number(lines[0].quantityUnits),1.25);assert.equal(lines[0].notes,"preserve");assert.equal(Number(lines[0].unitCostPence),10000);
    const deliveries=await db.select().from(stockDeliveryLines);assert.equal(deliveries[0].stockItemId,a.id);assert.equal(deliveries[0].invoiceLineCostPence,20000);
    assert.equal((await db.select().from(stockItems).where(eq(stockItems.id,b.id)))[0].active,false);
    assert.equal((await db.select().from(stockItems).where(eq(stockItems.id,b.id)))[0].mergedIntoId,a.id);
    const links=await db.select().from(stockItemPosLinks);assert.equal(links.length,1);assert.equal(links[0].stockItemId,a.id);
    assert.equal((await call("/apply",{version:preview.body.version,confirmed:true})).status,409);
    assert.equal((await call("/link",{stockItemId:c.id,variationId:"half",factor:.5,confirmed:true})).status,400);
    assert.equal((await call("/link",{stockItemId:a.id,variationId:"half",factor:.5,confirmed:true})).status,200);
    assert.equal((await db.select().from(stockItemPosLinks)).length,2);
    const audit=await db.select().from(stockRepairAudit);assert.equal(audit.length,2);
    assert.equal((await call(`/history/${audit[0].id}`)).body.snapshot.before.counts[0].stockItemId,b.id);
    const [duplicate]=await db.insert(stockItems).values({name:"Test lager",categoryId:cat.id,countUnit:"keg",containerSize:"50L",servesPerUnit:"88"}).returning();
    const [duplicateLine]=await db.insert(stockCountLines).values({stockItemId:duplicate.id,countId:count.id,quantityUnits:"2",notes:"Second original",countUnitSnapshot:"keg",baseUnitsPerCountUnit:"88",unitCostPence:"12000"}).returning();
    const blocked=await call("");
    assert.match(blocked.body.duplicates[0].blockedReason,/same count/);
    assert.equal((await call("/apply",{version:blocked.body.version,confirmed:true})).status,400);
    assert.equal((await db.select().from(stockCountLines)).length,2);
    const conflict=blocked.body.duplicates[0].countConflicts[0];
    assert.equal(conflict.count.status,"submitted");
    assert.equal(conflict.lines.length,2);
    assert.equal(conflict.lines.find((l:any)=>l.id===duplicateLine.id).notes,"Second original");
    const decision={version:blocked.body.version,keepId:a.id,countId:count.id,retainedLineId:duplicateLine.id,quantityUnits:"0",reason:"Repeated observation; physical stock confirmed empty",confirmed:true};
    const originals=await db.select().from(stockCountLines);
    const auditBefore=await db.select().from(stockRepairAudit);
    for(const auth of ["","staff"]){
      assert.equal((await call("/reconcile-count",decision,auth)).status,auth?403:401);
      assert.equal((await call(`/history/${auditBefore[0].id}`,undefined,auth)).status,auth?403:401);
    }
    for(const change of [{quantityUnits:""},{quantityUnits:null},{quantityUnits:-1},{quantityUnits:"-1"},{quantityUnits:"NaN"},{quantityUnits:"Infinity"},{reason:" "},{reason:"x".repeat(2001)},{confirmed:false}]){
      assert.equal((await call("/reconcile-count",{...decision,...change})).status,400);
    }
    assert.equal((await call("/reconcile-count",{...decision,retainedLineId:9999999})).status,409);
    assert.deepEqual(await db.select().from(stockCountLines),originals);
    assert.deepEqual(await db.select().from(stockRepairAudit),auditBefore);
    // Changing notes after a preview is enough to invalidate the decision.
    await db.update(stockCountLines).set({notes:"Changed concurrently"}).where(eq(stockCountLines.id,duplicateLine.id));
    assert.equal((await call("/reconcile-count",decision)).status,409);
    assert.equal((await db.select().from(stockCountLines)).length,2);
    const fresh=await call("");
    const result=await call("/reconcile-count",{...decision,version:fresh.body.version});
    assert.equal(result.status,200,JSON.stringify(result.body));
    const resolved=await db.select().from(stockCountLines);
    assert.equal(resolved.length,1);
    assert.equal(resolved[0].id,duplicateLine.id);
    assert.equal(Number(resolved[0].quantityUnits),0); // explicit zero, never sum 1.25 + 2
    assert.equal(resolved[0].notes,"Changed concurrently");
    assert.equal(resolved[0].countUnitSnapshot,"keg");
    assert.equal(Number(resolved[0].baseUnitsPerCountUnit),88);
    assert.equal(Number(resolved[0].unitCostPence),12000);
    assert.equal((await db.select().from(stockItems).where(eq(stockItems.id,duplicate.id)))[0].active,true);
    const reconciledAudit=(await db.select().from(stockRepairAudit)).find(r=>r.action==="Reconcile duplicate count")!;
    assert.equal(reconciledAudit.actor,"test-manager");
    const saved:any=(await call(`/history/${reconciledAudit.id}`)).body.snapshot;
    assert.equal(saved.decision.reason,decision.reason);
    assert.equal(saved.before.counts.length,2);
    assert.equal(saved.decision.originalLines.length,2);
    assert.equal(saved.before.counts.find((l:any)=>l.id===duplicateLine.id).quantityUnits,"2");
    assert.equal(saved.before.counts.find((l:any)=>l.id!==duplicateLine.id).notes,"preserve");
    assert.equal(saved.after.counts.length,1);
    assert.equal((await call("/reconcile-count",{...decision,version:fresh.body.version})).status,409);
    const mergePreview=await call("");
    assert.equal(mergePreview.body.duplicates[0].blockedReason,null);
    assert.equal((await call("/apply",{version:mergePreview.body.version,confirmed:true})).status,200);
    const finalLine=(await db.select().from(stockCountLines))[0];
    assert.equal(finalLine.stockItemId,a.id);
    assert.equal(Number(finalLine.quantityUnits),0);
    assert.equal(Number(finalLine.unitCostPence),12000);
    assert.equal(finalLine.notes,"Changed concurrently");
    const creation={key:"LWC-16680157",categoryId:cat.id,confirmed:true};
    assert.equal((await call("/create-invoice",creation)).status,200);
    assert.equal((await call("/create-invoice",creation)).status,409);
  }finally{
    await db.delete(stockRepairAudit);await db.delete(stockCountLines);await db.delete(stockDeliveryLines);
    await db.delete(stockCounts);await db.delete(stockDeliveries);await db.delete(stockItemPosLinks);await db.delete(stockItems);await db.delete(stockCategories);
    globalThis.fetch=nativeFetch;await new Promise<void>(r=>server.close(()=>r()));
  }
});

test("live stock refreshes from committed deliveries and protects saved keg yields", async () => {
  if (process.env.MEMBERSHIP_BILLING_ISOLATED_TEST !== "yes") throw new Error("Isolated database required");
  const originalFetch = globalThis.fetch;
  let salesRequests = 0;
  globalThis.fetch = async (url: any, options: any) => {
    if (String(url).includes("squareupsandbox.com")) {
      salesRequests++;
      return new Response(JSON.stringify({ orders: [] }), { status: 200 });
    }
    return originalFetch(url, options);
  };
  try {
    const [category] = await db.insert(stockCategories).values({ name: "Live fixture" }).returning();
    const [item] = await db.insert(stockItems).values({
      name: "Live keg", categoryId: category.id, countUnit: "keg",
      containerSize: "50L", servesPerUnit: "88",
    }).returning();
    await db.insert(stockItemPosLinks).values({ stockItemId: item.id, squareVariationId: "live-pint", soldUnitFactor: "1" });
    const [count] = await db.insert(stockCounts).values({
      countedBy: "fixture", status: "submitted", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-02-01"),
    }).returning();
    await db.insert(stockCountLines).values({
      countId: count.id, stockItemId: item.id, quantityUnits: "2",
      countUnitSnapshot: "keg", baseUnitsPerCountUnit: "88",
    });
    assert.equal((await liveStock()).items[0].remaining, 176);
    const calls = salesRequests;
    assert.equal((await liveStock()).items[0].remaining, 176);
    assert.equal(salesRequests, calls, "unchanged inputs reuse Square snapshot");
    await db.update(stockItems).set({ servesPerUnit: "90" }).where(eq(stockItems.id, item.id));
    assert.equal((await liveStock()).items[0].remaining, 176, "old count is not reinterpreted using today's yield");
    const [delivery] = await db.insert(stockDeliveries).values({ enteredBy: "fixture", deliveredAt: new Date("2026-03-01") }).returning();
    await db.insert(stockDeliveryLines).values({ deliveryId: delivery.id, stockItemId: item.id, quantityUnits: "1" });
    const uncertain = (await liveStock()).items[0];
    assert.equal(uncertain.remaining, null);
    assert.match(uncertain.issue!, /deliveries have no saved yield/);
    await db.update(stockItems).set({ servesPerUnit: "88" }).where(eq(stockItems.id, item.id));
    assert.equal((await liveStock()).items[0].remaining, 264, "delivery is reflected without waiting five minutes");
    await db.delete(stockDeliveries).where(eq(stockDeliveries.id, delivery.id));
    assert.equal((await liveStock()).items[0].remaining, 176, "deleted delivery invalidates cache");
    await db.update(stockCountLines).set({ baseUnitsPerCountUnit: null }).where(eq(stockCountLines.countId, count.id));
    assert.match((await liveStock()).items[0].issue!, /no saved keg yield/);
  } finally {
    globalThis.fetch = originalFetch;
    await db.delete(stockCountLines); await db.delete(stockDeliveryLines);
    await db.delete(stockCounts); await db.delete(stockDeliveries);
    await db.delete(stockItemPosLinks); await db.delete(stockItems); await db.delete(stockCategories);
  }
});
