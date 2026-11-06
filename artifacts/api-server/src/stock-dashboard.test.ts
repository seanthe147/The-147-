import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./templates/staff-dashboard.html", import.meta.url), "utf8");
test("invoice review distinguishes applied packs and missing products and excludes archived choices",()=>{
  const list={innerHTML:""};
  const row={name:"Guinness",supplier:"LWC",supplierCode:"abc",packCostPence:100,packUnits:1,invoiceDate:"2026-09-02",matches:[{id:1,name:"Guinness",containerSize:"50L"}]};
  const context=vm.createContext({
    el:()=>list,escHtml:String,stockPence:String,stockFmtDate:String,
    stockItemPacks:(i:any)=>i.purchasePacks||[],
    _stockItems:[{id:1,name:"Guinness",supplier:"LWC",active:true,costSource:"LWC invoice 2026-09-02",purchasePacks:[{supplierCode:"abc",costPence:100}]},{id:2,name:"Archived duplicate",active:false}],
    _invoicePriceRows:[row,{...row,name:"Missing lager",matches:[]}],
  });
  const start=html.indexOf("  function renderInvoicePriceRows()");
  const end=html.indexOf("  async function applyInvoicePrice",start);
  vm.runInContext(html.slice(start,end)+"\nrenderInvoicePriceRows()",context);
  assert.match(list.innerHTML,/Invoice pack already saved/);
  assert.match(list.innerHTML,/Missing compatible product/);
  assert.match(list.innerHTML,/openStockRepair/);
  assert.doesNotMatch(list.innerHTML,/Archived duplicate/);
});
test("stock API errors preserve HTTP conflict status for the repair refresh guard", async()=>{
  const start=html.indexOf("  async function api(url,opts)");
  const end=html.indexOf("\n  }",start)+4;
  const context=vm.createContext({getToken:()=>null,fetch:async()=>new Response(JSON.stringify({error:"Refresh preview"}),{status:409})});
  vm.runInContext(html.slice(start,end)+"\nthis.callApi=api",context);
  await assert.rejects(context.callApi("/api/stock/repair/apply"),(e:any)=>e.status===409 && e.message==="Refresh preview");
});
test("dashboard scripts parse and draft handler is publicly bound", () => {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
  assert.match(html, /window\.editStockCount\s*=\s*editStockCount/);
  assert.match(html, /function escHtml\(s\)\{return esc\(s\)\.replace/);
});
test("reopening a stock draft restores dates, notes and quantities", () => {
  const nodes: Record<string, any> = {
    stockCountStart: {}, stockCountEnd: {}, stockCountNotes: {},
    stockCountItems: { appendChild: (node: any) => hidden.push(node) },
  };
  const hidden: any[] = [], visible: any = {};
  const context = vm.createContext({
    _stockDraftId: null,
    _stockSavedCounts: [{ id: 12, periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z", notes: "Draft", lines: [{ stockItemId: 1, quantityUnits: "10" }, { stockItemId: 2, quantityUnits: "3" }] }],
    startNewStockCount: () => {},
    el: (id: string) => nodes[id],
    document: {
      querySelector: (selector: string) => selector.includes('"1"') ? visible : null,
      createElement: () => ({ dataset: {} }),
    },
  });
  const start = html.indexOf("  function editStockCount(id)");
  const end = html.indexOf("  async function submitStockCount", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(html.slice(start, end) + "\neditStockCount(12)", context);
  assert.equal(context._stockDraftId, 12);
  assert.equal(nodes.stockCountEnd.value, "2026-11-01");
  assert.equal(nodes.stockCountNotes.value, "Draft");
  assert.equal(visible.value, "10");
  assert.equal(hidden[0].value, "3"); // inactive products must not disappear on edit
});
test("stock count inline handlers are bound and hidden filter rows still save", () => {
  for (const fn of ["applyStockCountFilter", "setStockCountFilter", "onStockCountInput", "setStockKegFraction", "setStockCountZero", "toggleStockCountLines", "renderStockCounts"]) {
    assert.match(html, new RegExp(`window\\.${fn}\\s*=\\s*${fn}`));
  }
  const submit = html.slice(html.indexOf("  async function submitStockCount"), html.indexOf("  async function renderStockDeliveries"));
  assert.match(submit, /querySelectorAll\('#stockCountItems \[data-item-id\]'\)/); // all inputs, not only visible rows
  assert.match(submit, /Not counted \(left blank\)/);
});
