import type { Express, RequestHandler } from "express";
import { db, stockItems, stockItemPosLinks, stockCountLines, stockDeliveryLines, stockRepairAudit, stockCategories, stockCounts, stockDeliveries } from "@workspace/db";
import { eq, sql, asc, desc, inArray } from "drizzle-orm";
import { listCatalogVariations, clearCatalogVariationsCache } from "./square";
import { repairPlan, alcoholIdentityMismatch } from "./stock-repair-plan";
import { stockInvoicePrices, invoiceMatches } from "./stock-invoice-data";

async function snapshot(tx: any) {
  return {items:await tx.select().from(stockItems).orderBy(asc(stockItems.id)),
    countHeaders:await tx.select().from(stockCounts).orderBy(asc(stockCounts.id)),
    deliveryHeaders:await tx.select().from(stockDeliveries).orderBy(asc(stockDeliveries.id)),
    links:await tx.select().from(stockItemPosLinks).orderBy(asc(stockItemPosLinks.id)),
    counts:await tx.select().from(stockCountLines).orderBy(asc(stockCountLines.id)),
    deliveries:await tx.select().from(stockDeliveryLines).orderBy(asc(stockDeliveryLines.id))};
}
async function lock(tx:any) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(14700032)`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(14700031)`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(14700033)`);
  // Also blocks older entry endpoints that do not participate in advisory locking.
  await tx.execute(sql`LOCK TABLE stock_items, stock_item_pos_links, stock_count_lines, stock_delivery_lines IN SHARE ROW EXCLUSIVE MODE`);
}
function failure(message:string,status=400):never {throw Object.assign(new Error(message),{status});}
export function registerStockRepair(app:Express,auth:RequestHandler,manager:RequestHandler) {
  const handle=(fn:any):RequestHandler=>async(req,res)=>{
    try{await fn(req,res);}catch(e:any){res.status(e.status??500).json({error:e.status?e.message:"Stock repair failed. No partial changes were saved."});}
  };
  app.get("/api/stock/repair",auth,manager,handle(async(_req:any,res:any)=>{
    clearCatalogVariationsCache();
    const variations=await listCatalogVariations();
    if(!variations.length)failure("Square catalogue unavailable; repair is disabled.",503);
    const state=await db.transaction(async tx=>{await lock(tx);return snapshot(tx);});
    const history=await db.select({id:stockRepairAudit.id,action:stockRepairAudit.action,createdAt:stockRepairAudit.createdAt}).from(stockRepairAudit).orderBy(desc(stockRepairAudit.id)).limit(30);
    res.json({...repairPlan(state,variations),items:state.items.filter((i:any)=>i.active),variations,history});
  }));
  app.get("/api/stock/repair/history/:id",auth,manager,handle(async(req:any,res:any)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)failure("Invalid history ID");
    const [record]=await db.select().from(stockRepairAudit).where(eq(stockRepairAudit.id,id));
    if(!record)failure("Audit not found",404);res.json(record);
  }));
  app.post("/api/stock/repair/apply",auth,manager,handle(async(req:any,res:any)=>{
    if(req.body?.confirmed!==true || typeof req.body.version!=="string")failure("Preview and confirmation required");
    clearCatalogVariationsCache();const variations=await listCatalogVariations();
    if(!variations.length)failure("Square catalogue unavailable",503);
    const result=await db.transaction(async tx=>{
      await lock(tx);const before=await snapshot(tx);const plan=repairPlan(before,variations);
      if(req.body.version!==plan.version)failure("Stock or Square data changed. Refresh the preview before applying.",409);
      const merges=plan.duplicates.filter(g=>!g.blockedReason);
      if(!merges.length&&!plan.unsafeLinks.length)failure("No safe repairs to apply");
      // Quarantine all owners of ambiguous sales. Preserve the complete before-image.
      const unsafeRows=before.links.filter((l:any)=>plan.unsafeLinks.some((b:any)=>b.stockItemId===l.stockItemId&&b.variationId===l.squareVariationId));
      const unsafeLegacy=before.items.filter((i:any)=>plan.unsafeLinks.some((b:any)=>b.stockItemId===i.id&&b.variationId===i.squareCatalogVariationId));
      if(unsafeRows.length)await tx.delete(stockItemPosLinks).where(inArray(stockItemPosLinks.id,unsafeRows.map((l:any)=>l.id)));
      if(unsafeLegacy.length)await tx.update(stockItems).set({squareCatalogVariationId:null,squareCatalogVariationName:null,updatedAt:new Date()}).where(inArray(stockItems.id,unsafeLegacy.map((i:any)=>i.id)));
      const current=await snapshot(tx);
      const replacementLinks:any[]=[];
      for(const group of merges){
        const ids=[group.keepId,...group.archiveIds];
        const combined=new Map<string,any>();
        for(const id of ids){
          const own=current.links.filter((l:any)=>l.stockItemId===id);
          const item=current.items.find((i:any)=>i.id===id);
          const effective=own.length?own:item.squareCatalogVariationId?[{squareVariationId:item.squareCatalogVariationId,squareVariationName:item.squareCatalogVariationName,soldUnitFactor:"1"}]:[];
          for(const l of effective){
            const existing=combined.get(l.squareVariationId);
            if(existing&&Number(existing.soldUnitFactor)!==Number(l.soldUnitFactor))failure("Duplicate serving factors disagree. Manual review required.",409);
            combined.set(l.squareVariationId,l);
          }
        }
        replacementLinks.push(...[...combined.values()].map(l=>({stockItemId:group.keepId,squareVariationId:l.squareVariationId,squareVariationName:l.squareVariationName,soldUnitFactor:String(l.soldUnitFactor),verifiedAt:l.verifiedAt??null})));
      }
      if(merges.length){
        const archived=merges.flatMap(g=>g.archiveIds), allIds=merges.flatMap(g=>[g.keepId,...g.archiveIds]);
        const cases=sql.join(merges.flatMap(g=>g.archiveIds.map(id=>sql`WHEN ${id} THEN ${g.keepId}`)),sql` `);
        await tx.delete(stockItemPosLinks).where(inArray(stockItemPosLinks.stockItemId,allIds));
        if(replacementLinks.length)await tx.insert(stockItemPosLinks).values(replacementLinks);
        await tx.update(stockCountLines).set({stockItemId:sql`CASE stock_item_id ${cases} ELSE stock_item_id END`}).where(inArray(stockCountLines.stockItemId,archived));
        await tx.update(stockDeliveryLines).set({stockItemId:sql`CASE stock_item_id ${cases} ELSE stock_item_id END`}).where(inArray(stockDeliveryLines.stockItemId,archived));
        const itemCases=sql.join(merges.flatMap(g=>g.archiveIds.map(id=>sql`WHEN ${id} THEN ${g.keepId}`)),sql` `);
        await tx.update(stockItems).set({active:false,mergedIntoId:sql`CASE id ${itemCases} ELSE merged_into_id END`,updatedAt:new Date()}).where(inArray(stockItems.id,archived));
        await tx.update(stockItems).set({squareCatalogVariationId:null,squareCatalogVariationName:null,updatedAt:new Date()}).where(inArray(stockItems.id,allIds));
      }
      await tx.insert(stockRepairAudit).values({action:"Consolidate duplicates and quarantine unsafe links",actor:req.staffUsername??"manager",snapshot:{before,plan,after:await snapshot(tx)}});
      return {message:`Consolidated ${merges.length} duplicate groups; quarantined ${plan.unsafeLinks.length} unsafe assignments. Historical quantities and costs preserved. Blocked merges skipped.`};
    });res.json(result);
  }));
  app.post("/api/stock/repair/link",auth,manager,handle(async(req:any,res:any)=>{
    const {stockItemId,variationId,factor,confirmed}=req.body??{};
    if(confirmed!==true||!Number.isSafeInteger(stockItemId)||typeof variationId!=="string"||!Number.isFinite(Number(factor))||Number(factor)<=0||Number(factor)>1000)failure("Choose a product, variation and confirmed positive conversion");
    clearCatalogVariationsCache();const variations=await listCatalogVariations();const v=variations.find(v=>v.variationId===variationId);
    if(!v)failure("Variation not found in current Square catalogue");
    await db.transaction(async tx=>{
      await lock(tx);const before=await snapshot(tx);const item=before.items.find((i:any)=>i.id===stockItemId&&i.active);
      if(!item)failure("Active stock item not found",404);
      if(alcoholIdentityMismatch(item.name,v.itemName))failure("Alcohol-free and regular products must have separate matching Square links.");
      const owners=[...before.links.filter((l:any)=>l.squareVariationId===variationId).map((l:any)=>l.stockItemId),...before.items.filter((i:any)=>i.squareCatalogVariationId===variationId).map((i:any)=>i.id)];
      if(owners.some(id=>id!==stockItemId))failure("Variation still belongs to another record. Resolve its existing assignment first.",409);
      if(item.countUnit!=="keg"&&/^(half|half pint|pints?|½)$/i.test(v.variationName))failure("A draught variation needs keg stock, not a bottle");
      if(item.countUnit==="keg"&&/^(half|half pint|pints?|½)$/i.test(v.variationName)){
        const expected=/half|½/i.test(v.variationName)?0.5:1;
        if(Number(factor)!==expected)failure(`This keg serving must deduct ${expected} pints.`);
      }
      if(/^(single|double|shot|glass)$/i.test(v.variationName)&&Number(factor)>=1)failure("Enter the fraction of a bottle consumed by this measure, not a whole bottle");
      const old=before.links.filter((l:any)=>l.stockItemId===stockItemId&&l.squareVariationId===variationId);
      if(old.length)await tx.delete(stockItemPosLinks).where(inArray(stockItemPosLinks.id,old.map((l:any)=>l.id)));
      // Preserve a different legacy-only mapping when introducing explicit links.
      if(!before.links.some((l:any)=>l.stockItemId===stockItemId)&&item.squareCatalogVariationId&&item.squareCatalogVariationId!==variationId)await tx.insert(stockItemPosLinks).values({stockItemId,squareVariationId:item.squareCatalogVariationId,squareVariationName:item.squareCatalogVariationName,soldUnitFactor:"1"});
      await tx.insert(stockItemPosLinks).values({stockItemId,squareVariationId:variationId,squareVariationName:v.displayName,soldUnitFactor:String(factor),verifiedAt:new Date()});
      await tx.update(stockItems).set({squareCatalogVariationId:null,squareCatalogVariationName:null,updatedAt:new Date()}).where(eq(stockItems.id,stockItemId));
      await tx.insert(stockRepairAudit).values({action:"Confirmed serving link",actor:req.staffUsername??"manager",snapshot:{before,after:await snapshot(tx)}});
    });res.json({message:"Confirmed link saved. Other serving links preserved."});
  }));
  app.post("/api/stock/repair/create-invoice",auth,manager,handle(async(req:any,res:any)=>{
    const {key,categoryId,confirmed}=req.body??{};const row=stockInvoicePrices.find(r=>r.key===key);
    if(!row||confirmed!==true||!Number.isSafeInteger(categoryId))failure("Choose an invoice product and category and confirm");
    await db.transaction(async tx=>{
      await lock(tx);const before=await snapshot(tx);
      if(before.items.some((i:any)=>invoiceMatches(row,i)))failure("A compatible stock record already exists, including archived records. Review it instead of creating another.",409);
      const [cat]=await tx.select().from(stockCategories).where(eq(stockCategories.id,categoryId));if(!cat)failure("Category not found");
      const size=row.size==="11G"?"50L":row.size;
      const units=row.kind==="keg"?1:row.packUnits;
      const [item]=await tx.insert(stockItems).values({categoryId,name:row.name,countUnit:row.kind,containerSize:size,supplier:row.supplier,supplierCode:row.supplierCode,
        servesPerUnit:row.kind==="keg"?String(row.size==="11G"?88:Math.round(row.packUnits/0.56826125*10000)/10000):null,
        caseSize:row.kind!=="keg"&&units>1?units:null,unitCostPence:String(row.packCostPence/units),costDate:row.invoiceDate,costSource:`${row.supplier} invoice ${row.invoiceDate}`,
        purchasePacks:[{label:row.packLabel,quantityUnits:units,costPence:row.packCostPence,supplierCode:row.supplierCode}]}).returning();
      await tx.insert(stockRepairAudit).values({action:"Create verified invoice product",actor:req.staffUsername??"manager",snapshot:{created:item}});
    });res.json({message:"Product created with invoice cost and pack. Confirm its Square links separately; no delivery was added."});
  }));
}
