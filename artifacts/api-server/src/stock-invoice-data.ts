/** Verified product lines only; excludes customer/account details, container controls,
 * and free promotions. Price source policy: brewery brands Molson, others LWC. */
export type InvoicePrice = { key: string; name: string; supplier: string; supplierCode: string;
  packLabel: string; packUnits: number; packCostPence: number; invoiceDate: string;
  kind: "keg" | "bottle" | "can" | "bib"; size: string; aliases: string[] };
const rows: Array<[string, string, string, number, number, InvoicePrice["kind"], string, string[]?]> = [
  ["13322015", "Hawkstone Hedgerow", "50L keg", 50, 20099, "keg", "50L", ["hawkstone hedgerow"]],
  ["19020004", "Guinness", "11 gallon keg", 50.00699, 14804, "keg", "11G", ["guinness"]],
  ["16680157", "Birra Moretti", "50L keg", 50, 15500, "keg", "50L"],
  ["12510001", "Fosters", "11 gallon keg", 50.00699, 10344, "keg", "11G"],
  ["16690014", "Peroni", "50L keg", 50, 15699, "keg", "50L"],
  ["12561114", "Bud Light", "50L keg", 50, 7455, "keg", "50L"],
  ["13520006", "Stella Artois", "50L keg", 50, 10278, "keg", "50L"],
  ["47890070", "Famiglia Botter Prosecco", "24 × 200ml", 24, 6231, "bottle", "200ml"],
  ["49740013", "Famiglia Botter Prosecco Rose", "24 × 200ml", 24, 6321, "bottle", "200ml"],
  ["26630123", "Desperados", "24 × 330ml", 24, 2999, "bottle", "330ml"],
  ["25010031", "Newcastle Brown Ale", "12 × 550ml", 12, 1955, "bottle", "550ml"],
  ["26120023", "Corona Extra", "24 × 330ml", 24, 2599, "bottle", "330ml", ["corona"]],
  ["29340034", "Guinness 0% Microdraught", "24 × 558ml", 24, 3389, "bottle", "558ml"],
  ["35010051", "Smirnoff Red Vodka", "1 × 1.5L", 1, 2746, "bottle", "1.5L", ["smirnoff red", "smirnoff vodka"]],
  ["52610055", "Coca-Cola", "7L BIB", 1, 7155, "bib", "7L", ["coca cola"]],
  ["52630055", "Schweppes Lemonade", "7L BIB", 1, 6410, "bib", "7L", ["lemonade"]],
  ["51420023", "J2O Dragon Berry", "24 × 275ml", 24, 1921, "bottle", "275ml", ["j2o dragon"]],
  ["51420422", "J2O Apple Raspberry", "24 × 275ml", 24, 1921, "bottle", "275ml", ["j2o apple raspberry"]],
  ["51420022", "J2O Orange Passionfruit", "24 × 275ml", 24, 1921, "bottle", "275ml", ["j2o orange passionfruit"]],
  ["58460322", "Monster Energy Green", "12 × 500ml", 12, 1742, "can", "500ml", ["monster energy"]],
  ["58460323", "Monster Mango Loco", "12 × 500ml", 12, 1742, "can", "500ml", ["monster mango"]],
  ["46770348", "Healy & Gray Chardonnay", "1 × 75cl", 1, 756, "bottle", "75cl", ["healy gray chardonnay"]],
  ["46770448", "Healy & Gray Zinfandel Rose", "1 × 75cl", 1, 756, "bottle", "75cl", ["healy gray zinfandel"]],
  ["46770248", "Healy & Gray Sauvignon Blanc", "1 × 75cl", 1, 763, "bottle", "75cl", ["healy gray sauvignon"]],
  ["46770048", "Healy & Gray Pinot Grigio", "1 × 75cl", 1, 759, "bottle", "75cl", ["healy gray pinot"]],
  ["32011150", "Gordons Pink Gin", "1 × 70cl", 1, 1400, "bottle", "70cl", ["gordons pink"]],
  ["36495146", "WKD Ice", "24 × 275ml", 24, 2399, "bottle", "275ml", ["wkd blue", "wkd ice"]],
  ["25860330", "VK Blue", "24 × 275ml", 24, 2285, "bottle", "275ml"],
  ["25860332", "VK Orange Passionfruit", "24 × 275ml", 24, 2285, "bottle", "275ml", ["vk orange passion fruit", "vk orange passionfruit"]],
  ["19070005", "Kopparberg Strawberry Lime", "30L keg", 30, 8455, "keg", "30L", ["kopparberg strawberry lime"]],
  ["28061050", "Kopparberg Raspberry", "15 × 500ml", 15, 2499, "bottle", "500ml"],
  ["28062129", "Kopparberg Mixed Fruit", "15 × 500ml", 15, 2755, "bottle", "500ml"],
  ["28100748", "Kopparberg Strawberry Lime", "15 × 500ml", 15, 2755, "bottle", "500ml", ["kopparberg strawberry lime"]],
  ["13322001", "Hawkstone Premium Lager", "50L keg", 50, 15660, "keg", "50L", ["hawkstone lager"]],
  ["51424154", "Kulana Orange Juice", "12 × 1L", 12, 2447, "bottle", "1L"],
  ["13550005", "Heineken", "11 gallon keg", 50.00699, 14232, "keg", "11G"],
  ["26050023", "Budweiser", "24 × 330ml", 24, 2249, "bottle", "330ml"],
];
export const stockInvoicePrices: InvoicePrice[] = [
  ...rows.map(([code, name, packLabel, packUnits, packCostPence, kind, size, aliases]) => ({
    key: `LWC-${code}`, name, supplier: "LWC", supplierCode: code, packLabel, packUnits, packCostPence,
    invoiceDate: "2026-09-02", kind, size, aliases: aliases ?? [name],
  })),
  ...([
    ["5004846", "Madri Excepcional", 100, 31534],
    ["5005796", "Coors 3.4%", 50, 12614],
    ["5005797", "Coors 3.4%", 100, 25228],
    ["5003539", "Aspall", 50, 13919],
    ["5000004", "Carling", 100, 25158],
  ] as const).map(([code, name, litres, cost]) => ({
    key: `MC-${code}`, name, supplier: "Molson Coors", supplierCode: code,
    packLabel: `${litres}L keg`, packUnits: litres, packCostPence: cost, invoiceDate: "2026-10-23",
    kind: "keg" as const, size: `${litres}L`, aliases: [name],
  })),
];

const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function litres(size: string | null): number | null {
  const match = size?.trim().match(/^(\d+(?:\.\d+)?)\s*(ml|cl|l|g|gal)$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return n * ({ ml: .001, cl: .01, l: 1, g: 4.54609, gal: 4.54609 }[match[2].toLowerCase()]!);
}
export function packQuantity(row: InvoicePrice, item: { countUnit: string; containerSize: string | null }): number | null {
  if (row.kind !== item.countUnit) return null;
  const size = litres(item.containerSize);
  if (row.kind === "keg") {
    if (!size || size <= 0) return null;
    // UK trade treats an 11 gallon keg as the nominal 50L pack.
    const packLitres = row.size === "11G" ? 50 : row.packUnits;
    return packLitres / (Math.abs(size - 50) < .02 ? 50 : size);
  }
  if (!size || Math.abs(size - (litres(row.size) ?? -1)) > .0001) return null;
  return row.packUnits;
}
export function invoiceMatches(row: InvoicePrice, item: { name: string; countUnit: string; containerSize: string | null; supplierCode?: string | null }) {
  if (packQuantity(row, item) === null) return false;
  return item.supplierCode === row.supplierCode || row.aliases.some(a => normal(item.name).includes(normal(a)));
}
