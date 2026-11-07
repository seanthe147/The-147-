import { test } from "node:test";
import assert from "node:assert/strict";
import { availableKegPacks } from "./stock-keg-packs.ts";

test("confirmed brands offer 50L without changing the historical count size",()=>{
  for (const name of ["Coors 3.4%", "Carling", "Madri Excepcional"]) {
    for (const size of [50,100]) {
      const item = {name,countUnit:"keg",containerSize:`${size}L`,purchasePacks:[]};
      assert.deepEqual(availableKegPacks(item),[{label:"50L keg",quantityUnits:50/size,costPence:null}]);
      assert.equal(item.containerSize,`${size}L`);
      assert.deepEqual(item.purchasePacks,[]);
    }
  }
});
test("verified pack prices and supplier codes are retained without duplicate choices",()=>{
  const pack={label:"50L Coors",quantityUnits:0.5,costPence:12614,supplierCode:"5005796"};
  assert.deepEqual(availableKegPacks({name:"Coors 3.4%",countUnit:"keg",containerSize:"100L",purchasePacks:[pack]}),[pack]);
});
test("no packs are invented for other drinks, archived stock or unknown count sizes",()=>{
  const base={name:"Carling",countUnit:"keg",containerSize:"100L"};
  for(const overrides of [{name:"Carling Black Fruit Cider 3.4%"},{name:"Guinness"},{active:false},{mergedIntoId:10},{countUnit:"bottle"},{containerSize:null},{containerSize:"30L"}]){
    assert.deepEqual(availableKegPacks({...base,...overrides}),[]);
  }
});
