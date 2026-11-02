import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./templates/staff-dashboard.html", import.meta.url), "utf8");
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
