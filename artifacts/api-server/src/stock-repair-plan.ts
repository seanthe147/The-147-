import { createHash } from "node:crypto";
export function alcoholIdentityMismatch(stockName:string, squareName:string) {
  const noAlcohol=/(?:\b0(?:[.,]0)?\s*%|alcohol[\s-]*free|low\s*(?:&|and)\s*no)/i;
  return noAlcohol.test(stockName)!==noAlcohol.test(squareName);
}
export function repairPlan(state: any, variations: any[]) {
  const { items, links, counts, deliveries } = state;
  const groups = new Map<string, any[]>();
  for (const i of items.filter((i: any) => i.active)) {
    const key = JSON.stringify([i.name.trim().toLowerCase(), i.countUnit, i.containerSize, i.categoryId]);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const duplicates = [...groups.values()].filter(g => g.length > 1).map(g => {
    g.sort((a,b) => a.id-b.id);
    const ids = new Set(g.map(i=>i.id));
    const histories = counts.filter((l: any)=>ids.has(l.stockItemId));
    const countConflicts = [...new Set(histories.map((l:any)=>l.countId))].flatMap(countId=>{
      const lines=histories.filter((l:any)=>l.countId===countId);
      if(lines.length<2)return [];
      return [{countId,count:state.countHeaders?.find((c:any)=>c.id===countId)??null,
        lines:lines.map((l:any)=>({...l,itemName:g.find(i=>i.id===l.stockItemId)?.name,
          currentCountUnit:g.find(i=>i.id===l.stockItemId)?.countUnit}))}];
    });
    const overlapping = countConflicts.length>0;
    const identity = (i:any)=>JSON.stringify([i.supplier,i.supplierCode,i.caseSize,i.servesPerUnit,i.unitCostPence,i.purchasePacks]);
    const incompatible = g.some(i=>identity(i)!==identity(g[0]));
    const groupLinks=links.filter((l:any)=>ids.has(l.stockItemId));
    const disagree=groupLinks.some((l:any)=>groupLinks.some((other:any)=>other.squareVariationId===l.squareVariationId&&Number(other.soldUnitFactor)!==Number(l.soldUnitFactor)));
    return {keepId:g[0].id,archiveIds:g.slice(1).map(i=>i.id),name:g[0].name,countConflicts,
      blockedReason:overlapping?"Both copies appear in the same count; quantities need manual reconciliation.":incompatible?"Supplier identity, costs, yields or purchase packs differ; review before merging.":disagree?"Serving conversions disagree; review before merging.":null};
  });
  const canonical = (id: number) => duplicates.find(g=>!g.blockedReason && g.archiveIds.includes(id))?.keepId ?? id;
  const effective = items.flatMap((i:any) => {
    const own=links.filter((l:any)=>l.stockItemId===i.id);
    return own.length?own:i.squareCatalogVariationId?[{stockItemId:i.id,squareVariationId:i.squareCatalogVariationId,soldUnitFactor:"1"}]:[];
  });
  const unsafeLinks=effective.flatMap((l:any)=>{
    const i=items.find((i:any)=>i.id===l.stockItemId), v=variations.find(v=>v.variationId===l.squareVariationId);
    let reason="";
    if(!i.active)reason="Archived stock still owns a Square variation";
    else if(!v)reason="Variation missing from current Square catalogue";
    else if(alcoholIdentityMismatch(i.name,v.itemName))reason="Alcohol-free and regular product identities do not match";
    else if(new Set(effective.filter((x:any)=>x.squareVariationId===l.squareVariationId).map((x:any)=>canonical(x.stockItemId))).size>1)reason="Variation belongs to different physical products";
    else if(i.countUnit!=="keg" && /^(half|half pint|pints?|½)$/i.test(v.variationName))reason="Draught sale assigned to non-keg stock";
    else if(i.countUnit==="keg" && !l.verifiedAt && !/^(half|half pint|pints?|½)$/i.test(v.variationName))reason="Keg serving size is unconfirmed";
    else if(/^(single|double|shot|glass)$/i.test(v.variationName) && Number(l.soldUnitFactor)>=1)reason="Measure incorrectly consumes a whole bottle";
    else if(!(Number(l.soldUnitFactor)>0))reason="Invalid conversion";
    return reason?[{stockItemId:i.id,name:i.name,variationId:l.squareVariationId,variationName:v?.displayName??l.squareVariationId,reason}]:[];
  });
  return {version:createHash("sha256").update(JSON.stringify({state,variations})).digest("hex"),duplicates,unsafeLinks};
}
