/** Square line totals already include line/order discounts. Exclude tax and service
 * charges, not a guessed VAT percentage. Never treat a refund as returned stock. */
export function accumulateStockOrder(order: any, quantities: Map<string, number>, revenue: Map<string, number | null>) {
  const lines = order.line_items ?? [];
  const ids = [...new Set<string>(lines.map((l: any) => l.catalog_object_id).filter(Boolean))];
  const money = (m: any) => m && m.currency === "GBP" && Number.isSafeInteger(Number(m.amount)) ? Number(m.amount) : null;
  const net = (line: any): number | null => {
    const total = money(line.total_money), tax = money(line.total_tax_money);
    const service = line.total_service_charge_money ? money(line.total_service_charge_money) : 0;
    return total !== null && tax !== null && service !== null ? total - tax - service : null;
  };
  const addRevenue = (id: string, value: number | null) => {
    revenue.set(id, value === null || revenue.get(id) === null ? null : (revenue.get(id) ?? 0) + value);
  };
  for (const line of lines) {
    const id = line.catalog_object_id;
    if (!id) continue;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty < 0) throw new Error("Square returned an invalid stock sales quantity.");
    quantities.set(id, (quantities.get(id) ?? 0) + qty);
    addRevenue(id, net(line));
  }
  let itemisedRefund = 0;
  let uncertain = false;
  for (const ret of order.returns ?? []) {
    for (const line of ret.return_line_items ?? []) {
      const source = lines.find((l: any) => l.uid === line.source_line_item_uid);
      const id = line.catalog_object_id ?? source?.catalog_object_id;
      const total = money(line.total_money);
      if (!id || !ids.includes(id) || total === null || net(line) === null) uncertain = true;
      else { itemisedRefund += total; addRevenue(id, -net(line)!); }
    }
  }
  // Cash/amount-only refunds cannot be allocated proportionately without guessing.
  const paidRefunds = (order.refunds ?? []).filter((r: any) => !r.status || r.status === "COMPLETED");
  const refundAmounts = paidRefunds.map((r: any) => money(r.amount_money));
  if (refundAmounts.some((n: number | null) => n === null)) uncertain = true;
  const refunded = Math.max(refundAmounts.reduce((s: number, n: number | null) => s + (n ?? 0), 0),
    order.return_amounts?.total_money ? money(order.return_amounts.total_money) ?? Infinity : 0,
    order.total_refunded_money ? money(order.total_refunded_money) ?? Infinity : 0);
  if (refunded > itemisedRefund || uncertain) for (const id of ids) revenue.set(id, null);
}
