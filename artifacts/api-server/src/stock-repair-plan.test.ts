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
test("every overlapping count is exposed without summing and other blockers survive reconciliation",()=>{
  const state:any={items:[item(1),item(2),item(3)],countHeaders:[{id:7,status:"submitted"},{id:8,status:"draft"}],
    counts:[
      {id:1,stockItemId:1,countId:7,quantityUnits:"1.25",unitCostPence:null,notes:"Original"},
      {id:2,stockItemId:2,countId:7,quantityUnits:"2",unitCostPence:"100",countUnitSnapshot:"keg",baseUnitsPerCountUnit:"88"},
      {id:3,stockItemId:3,countId:7,quantityUnits:"0"},
      {id:4,stockItemId:2,countId:8,quantityUnits:"4"},
      {id:5,stockItemId:3,countId:8,quantityUnits:"5"},
      {id:6,stockItemId:3,countId:9,quantityUnits:"6"},
    ],deliveries:[],links:[]};
  const original=JSON.stringify(state);
  const conflicts=repairPlan(state,[]).duplicates[0].countConflicts;
  assert.equal(conflicts.length,2);
  assert.equal(conflicts[0].lines.length,3);
  assert.equal(conflicts[0].lines[0].quantityUnits,"1.25");
  assert.equal(conflicts[0].lines[0].unitCostPence,null);
  assert.equal(conflicts[1].count.status,"draft");
  assert.equal(JSON.stringify(state),original);
  state.counts=state.counts.filter((l:any)=>![2,3].includes(l.id));
  assert.match(repairPlan(state,[]).duplicates[0].blockedReason!,/same count/);
  state.counts=state.counts.filter((l:any)=>l.id!==5);
  assert.equal(repairPlan(state,[]).duplicates[0].blockedReason,null);
  state.items[1].supplierCode="different";
  assert.match(repairPlan(state,[]).duplicates[0].blockedReason!,/Supplier/);
});
