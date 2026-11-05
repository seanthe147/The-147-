import { test } from "node:test";
import assert from "node:assert/strict";
import { repairPlan, alcoholIdentityMismatch } from "./stock-repair-plan.ts";
const item=(id:number)=>({id,active:true,name:"Test beer",categoryId:1,countUnit:"keg",containerSize:"50L",supplierCode:"same"});
test("repair previews block duplicate rows in the same count and supplier mismatches",()=>{
  const state:any={items:[item(1),item(2)],counts:[{stockItemId:1,countId:7},{stockItemId:2,countId:7}],deliveries:[],links:[]};
  assert.match(repairPlan(state,[]).duplicates[0].blockedReason!,/same count/);
  state.counts=[];assert.equal(repairPlan(state,[]).duplicates[0].blockedReason,null);
  state.items[1].supplierCode="other";assert.match(repairPlan(state,[]).duplicates[0].blockedReason!,/Supplier/);
});
test("alcohol-free identity is not confused with regular stock or sugar-free drinks",()=>{
  assert.equal(alcoholIdentityMismatch("Cider 0%","Cider"),true);
  assert.equal(alcoholIdentityMismatch("Cider 0.0%","Cider Alcohol-Free"),false);
  assert.equal(alcoholIdentityMismatch("Coca-Cola Zero","Coca-Cola Zero"),false);
});
