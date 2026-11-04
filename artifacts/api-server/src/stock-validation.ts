import { z } from "zod";

const quantity = z.union([z.string().trim().min(1), z.number()])
  .refine(v => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1000000000, "Quantity must be a valid non-negative number")
  .transform(v => String(Number(v)));
const positive = quantity.refine(v => Number(v) > 0, "Must be greater than zero");
const date = z.string().refine(v => v.trim() !== "" && Number.isFinite(Date.parse(v)), "Invalid date");
const id = z.number().int().positive();
const text = z.string().trim().max(500);
const money = z.number().int().min(0).max(1000000000);
export const stockItemInput = z.object({
  categoryId: id, name: text.min(1), countUnit: text.min(1),
  containerSize: text.nullable().optional(), supplier: text.nullable().optional(),
  supplierCode: text.nullable().optional(),
  caseSize: z.number().int().positive().nullable().optional(),
  servesPerUnit: positive.nullable().optional(), active: z.boolean().optional(),
  unitCostPence: quantity.refine(v => Number(v) <= 1000000000, "Cost is too large").nullable().optional(),
  costSource: text.nullable().optional(), costDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  purchasePacks: z.array(z.object({ label: text.min(1), quantityUnits: z.number().positive().finite(),
    costPence: money.nullable(), supplierCode: text.optional() })).max(30).optional(),
});
const countLines = z.array(z.object({ stockItemId: id, quantityUnits: quantity }))
  .max(2000).refine(lines => new Set(lines.map(l => l.stockItemId)).size === lines.length, "Duplicate product lines");
export const stockCountInput = z.object({
  periodStart: date.optional(), periodEnd: date.optional(),
  notes: text.nullable().optional(), status: z.enum(["draft", "submitted"]).optional(),
  lines: countLines.optional(),
}).refine(v => !v.periodStart || !v.periodEnd || Date.parse(v.periodStart) <= Date.parse(v.periodEnd),
  "Start date must not be after end date");
export const stockDeliveryInput = z.object({
  deliveredAt: date, supplier: text.nullable().optional(),
  invoiceRef: text.nullable().optional(), notes: text.nullable().optional(),
  lines: z.array(z.object({
    stockItemId: id, quantityUnits: quantity.optional(), quantityCases: quantity.optional(),
    invoiceLineCostPence: money.nullable().optional(),
  }).refine(l => l.quantityUnits !== undefined || l.quantityCases !== undefined, "Quantity required"))
    .min(1).max(2000)
    .refine(lines => new Set(lines.map(l => l.stockItemId)).size === lines.length, "Duplicate product lines")
    .refine(lines => lines.some(l => Number(l.quantityCases ?? l.quantityUnits) > 0), "Enter a positive quantity"),
});

export function validateStockInput(schema: z.ZodTypeAny) {
  return (req: any, res: any, next: () => void) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues.map(i => i.message).join("; ") });
    req.body = result.data;
    next();
  };
}
