import type { Express, RequestHandler } from "express";
import { db, stockItems } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { stockInvoicePrices, invoiceMatches, packQuantity } from "./stock-invoice-data";

export function registerStockInvoicePrices(app: Express, staffAuth: RequestHandler, managerAuth: RequestHandler) {
  app.get("/api/stock/invoice-prices", staffAuth, managerAuth, async (_req, res) => {
    try {
      const items = await db.select().from(stockItems);
      res.json({ rows: stockInvoicePrices.map(row => ({ ...row,
        matches: items.filter(i => i.active && invoiceMatches(row, i)).map(i => ({
          id: i.id, name: i.name, containerSize: i.containerSize, countUnit: i.countUnit,
        })),
      })) });
    } catch { res.status(500).json({ error: "Unable to load invoice price review." }); }
  });
  app.post("/api/stock/invoice-prices", staffAuth, managerAuth, async (req, res) => {
    const row = stockInvoicePrices.find(r => r.key === req.body?.key);
    const id = req.body?.stockItemId;
    if (!row || !Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Choose a valid invoice line and stock item." });
    try {
      const updated = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(14700033)`);
        const [item] = await tx.select().from(stockItems).where(eq(stockItems.id, id)).for("update");
        if (!item) return null;
        if (!item.active || item.mergedIntoId) throw new Error("This record is archived or consolidated. Apply the invoice to its active stock record instead.");
        const quantity = packQuantity(row, item);
        // No fuzzy import into an unrelated product, even if a client submits an arbitrary ID.
        if (!invoiceMatches(row, item) || !quantity) throw new Error("Product name or pack size does not match. Correct the catalogue product before applying this invoice.");
        const packs = (item.purchasePacks ?? []).filter(p => p.supplierCode !== row.supplierCode);
        packs.push({ label: row.packLabel, quantityUnits: quantity, costPence: row.packCostPence, supplierCode: row.supplierCode });
        const [saved] = await tx.update(stockItems).set({
          supplier: row.supplier, unitCostPence: (row.packCostPence / quantity).toFixed(6),
          costSource: `${row.supplier} invoice ${row.invoiceDate}`, costDate: row.invoiceDate, purchasePacks: packs,
          updatedAt: new Date(),
        }).where(eq(stockItems.id, id)).returning();
        return saved;
      });
      if (!updated) return res.status(404).json({ error: "Stock item not found." });
      res.json(updated);
    } catch (error: any) { res.status(400).json({ error: error.message ?? "Unable to apply invoice price." }); }
  });
}
