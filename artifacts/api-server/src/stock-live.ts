import { db, stockItems, stockCounts, stockCountLines, stockDeliveries, stockDeliveryLines, stockItemPosLinks } from "@workspace/db";
import { eq, and, lte, desc, asc, lt } from "drizzle-orm";
import * as square from "./square";

import { estimateStock } from "./stock-estimate";
import { stockLiveCache } from "./stock-live-cache";
import { historicalStockConversion } from "./stock-estimate";

const cachedCalculation = stockLiveCache<Awaited<ReturnType<typeof calculate>>>();

async function readInputs() {
  const now = new Date();
  return db.transaction(async tx => {
  const [items, snapshots, links, deliveries] = await Promise.all([
    tx.select().from(stockItems).where(eq(stockItems.active, true)).orderBy(asc(stockItems.id)),
    tx.select({ itemId: stockCountLines.stockItemId, quantity: stockCountLines.quantityUnits, at: stockCounts.periodEnd,
      countUnit: stockCountLines.countUnitSnapshot, conversion: stockCountLines.baseUnitsPerCountUnit })
      .from(stockCountLines).innerJoin(stockCounts, eq(stockCountLines.countId, stockCounts.id))
      .where(and(eq(stockCounts.status, "submitted"), lte(stockCounts.periodEnd, now)))
      .orderBy(desc(stockCounts.periodEnd), desc(stockCounts.id), asc(stockCountLines.id)),
    tx.select().from(stockItemPosLinks).orderBy(asc(stockItemPosLinks.id)),
    tx.select({ itemId: stockDeliveryLines.stockItemId, quantity: stockDeliveryLines.quantityUnits, at: stockDeliveries.deliveredAt })
      .from(stockDeliveryLines).innerJoin(stockDeliveries, eq(stockDeliveryLines.deliveryId, stockDeliveries.id))
      .where(lt(stockDeliveries.deliveredAt, now)).orderBy(asc(stockDeliveryLines.id)),
  ]);
  return { items, snapshots, links, deliveries };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function liveStock() {
  const inputs = await readInputs();
  return cachedCalculation(JSON.stringify(inputs), () => calculate(inputs));
}

async function calculate({ items, snapshots, links, deliveries }: Awaited<ReturnType<typeof readInputs>>) {
  const now = new Date();
  const latest = new Map<number, typeof snapshots[number]>();
  for (const snapshot of snapshots) if (!latest.has(snapshot.itemId)) latest.set(snapshot.itemId, snapshot);
  const starts = [...new Set(items.map(i => latest.get(i.id)?.at.toISOString()).filter((s): s is string => !!s))];
  const periods = new Map<string, { sales: Map<string, number>; delivered: Map<number, number>; error: string | null }>();
  // Sequential requests avoid flooding Square when products have different count dates.
  for (const start of starts) {
    const delivered = deliveries.filter(line => line.at >= new Date(start));
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
    const conversionState = historicalStockConversion(item.countUnit, item.servesPerUnit, snapshot?.countUnit ?? null,
      snapshot?.conversion ?? null, period?.delivered.get(item.id) ?? 0);
    const conversion = conversionState.conversion;
    const itemLinks = links.filter(l => l.stockItemId === item.id);
    const effective = itemLinks.length ? itemLinks : item.squareCatalogVariationId
      ? [{ squareVariationId: item.squareCatalogVariationId, soldUnitFactor: "1" }] : [];
    const issue = !snapshot ? "Needs a submitted count" : conversionState.issue
      ? conversionState.issue : !conversion || conversion <= 0 ? "Set pints per keg"
      : !effective.length ? "Link Square sales variations" : period?.error ?? null;
    const result = !issue && conversion !== null && snapshot && period
      ? estimateStock(Number(snapshot.quantity), period.delivered.get(item.id) ?? 0, conversion, effective, period.sales) : null;
    return { id: item.id, name: item.name, unit: item.countUnit === "keg" ? "pints" : item.countUnit,
      countAt: snapshot?.at ?? null, remaining: result?.remaining ?? null, sold: result?.sold ?? null, issue };
  }) };
}
