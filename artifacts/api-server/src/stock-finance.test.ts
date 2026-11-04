import { test } from "node:test";
import assert from "node:assert/strict";
import { stockFinancials } from "./stock-finance.ts";
import { accumulateStockOrder } from "./stock-sales.ts";
import { stockInvoicePrices, packQuantity } from "./stock-invoice-data.ts";

test("weighted costs, keg conversions and shortage cash value use full precision", () => {
  const r = stockFinancials({ openingUnits: 1, closingUnits: .5, openingCostPence: 10000, conversion: 100,
    deliveries: [{ quantityUnits: 1, invoiceLineCostPence: 20000 }], sold: 140, netSalesPence: 50000 });
  assert.equal(r.costPerBaseUnitPence, 150);
  assert.equal(r.closingValuePence, 7500);
  assert.equal(r.consumedCostPence, 22500);
  assert.equal(r.varianceValuePence, 1500);
  assert.equal(r.grossProfitPence, 27500);
  assert.equal(r.grossMarginPercent, 55);
});
test("unknown costs are not zeros, explicit zeros are, surplus is negative", () => {
  const input = { openingUnits: 10, closingUnits: 8, openingCostPence: 100, conversion: 1, deliveries: [], sold: 4, netSalesPence: 1000 };
  assert.equal(stockFinancials(input).varianceValuePence, -200);
  assert.equal(stockFinancials({ ...input, openingCostPence: null }).grossProfitPence, null);
  assert.equal(stockFinancials({ ...input, openingUnits: null }).grossProfitPence, null);
  assert.equal(stockFinancials({ ...input, conversion: null }).grossProfitPence, null);
  assert.equal(stockFinancials({ ...input, openingCostPence: 0 }).consumedCostPence, 0);
  assert.equal(stockFinancials({ ...input, closingUnits: 20 }).grossProfitPence, null);
});
test("invoice packs keep Coors 50/100L on one item and third-party costs use LWC", () => {
  const coors50 = stockInvoicePrices.find(r => r.key === "MC-5005796")!;
  assert.equal(packQuantity(coors50, { countUnit: "keg", containerSize: "100L" }), .5);
  assert.equal(coors50.packCostPence / .5, 25228);
  assert.equal(stockInvoicePrices.filter(r => r.name.startsWith("J2O")).every(r => r.supplier === "LWC" && r.packCostPence === 1921), true);
  assert.equal(stockInvoicePrices.some(r => /control|tequila rose/i.test(r.name)), false);
});
test("net sales exclude VAT and itemised refunds without restocking refunded goods", () => {
  const money = (amount: number) => ({ amount, currency: "GBP" });
  const q = new Map<string, number>(), r = new Map<string, number|null>();
  const order: any = { line_items: [{ uid: "a", catalog_object_id: "pint", quantity: "2", total_money: money(1200), total_tax_money: money(200) }],
    returns: [{ return_line_items: [{ source_line_item_uid: "a", total_money: money(600), total_tax_money: money(100) }] }],
    return_amounts: { total_money: money(600) } };
  accumulateStockOrder(order, q, r);
  assert.equal(q.get("pint"), 2);
  assert.equal(r.get("pint"), 500);
  accumulateStockOrder({ ...order, returns: [] }, q, r);
  assert.equal(r.get("pint"), null, "unallocated refund must not yield invented profit");
});
