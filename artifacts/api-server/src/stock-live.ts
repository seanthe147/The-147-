import { db, stockItems, stockCounts, stockCountLines, stockDeliveries, stockDeliveryLines, stockItemPosLinks } from "@workspace/db";
import { eq, and, lte, desc, gte, lt } from "drizzle-orm";
import * as square from "./square";

import { estimateStock } from "./stock-estimate";

// Share concurrent requests and cache sales snapshots, rather than polling Square per device.
let cached: { at: number; value: Awaited<ReturnType<typeof calculate>> } | undefined;
let pending: Promise<Awaited<ReturnType<typeof calculate>>> | undefined;
export async function liveStock() {
  if (cached && Date.now() - cached.at < 300_000) return cached.value;
  if (pending) return pending;
  pending = calculate().then(value => {
    cached = { at: Date.now(), value };
    return value;
  }).finally(() => { pending = undefined; });
  return pending;
}

async function calculate() {
  const now = new Date();
  const [items, snapshots, links] = await Promise.all([
    db.select().from(stockItems).where(eq(stockItems.active, true)),
    db.select({ itemId: stockCountLines.stockItemId, quantity: stockCountLines.quantityUnits, at: stockCounts.periodEnd })
      .from(stockCountLines).innerJoin(stockCounts, eq(stockCountLines.countId, stockCounts.id))
      .where(and(eq(stockCounts.status, "submitted"), lte(stockCounts.periodEnd, now)))
      .orderBy(desc(stockCounts.periodEnd), desc(stockCounts.id)),
    db.select().from(stockItemPosLinks),
  ]);
  const latest = new Map<number, typeof snapshots[number]>();
  for (const snapshot of snapshots) if (!latest.has(snapshot.itemId)) latest.set(snapshot.itemId, snapshot);
  const starts = [...new Set(items.map(i => latest.get(i.id)?.at.toISOString()).filter((s): s is string => !!s))];
  const periods = new Map<string, { sales: Map<string, number>; delivered: Map<number, number>; error: string | null }>();
  // Sequential requests avoid flooding Square when products have different count dates.
  for (const start of starts) {
    const delivered = await db.select({ itemId: stockDeliveryLines.stockItemId, quantity: stockDeliveryLines.quantityUnits })
      .from(stockDeliveryLines).innerJoin(stockDeliveries, eq(stockDeliveryLines.deliveryId, stockDeliveries.id))
      .where(and(gte(stockDeliveries.deliveredAt, new Date(start)), lt(stockDeliveries.deliveredAt, now)));
    const quantities = new Map<number, number>();
    for (const line of delivered) quantities.set(line.itemId, (quantities.get(line.itemId) ?? 0) + Number(line.quantity));
    let sales = new Map<string, number>(), error: string | null = null;
    try {
      if (!square.isConfigured()) throw new Error("Square sales are not configured");
      sales = await square.getSalesByVariation(start, now.toISOString());
    } catch { error = "Square sales unavailable — estimate cannot be calculated"; }
    periods.set(start, { sales, delivered: quantities, error });
  }
  return { updatedAt: now.toISOString(), refreshSeconds: 300, items: items.map(item => {
    const snapshot = latest.get(item.id);
    const period = snapshot ? periods.get(snapshot.at.toISOString()) : undefined;
    const conversion = item.countUnit === "keg" ? Number(item.servesPerUnit) : 1;
    const itemLinks = links.filter(l => l.stockItemId === item.id);
    const effective = itemLinks.length ? itemLinks : item.squareCatalogVariationId
      ? [{ squareVariationId: item.squareCatalogVariationId, soldUnitFactor: "1" }] : [];
    const issue = !snapshot ? "Needs a submitted count" : !conversion || conversion <= 0 ? "Set pints per keg"
      : !effective.length ? "Link Square sales variations" : period?.error ?? null;
    const result = !issue && snapshot && period
      ? estimateStock(Number(snapshot.quantity), period.delivered.get(item.id) ?? 0, conversion, effective, period.sales) : null;
    return { id: item.id, name: item.name, unit: item.countUnit === "keg" ? "pints" : item.countUnit,
      countAt: snapshot?.at ?? null, remaining: result?.remaining ?? null, sold: result?.sold ?? null, issue };
  }) };
}
