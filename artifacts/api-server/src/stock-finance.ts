/** Periodic weighted-average stock valuation, all amounts in pence excluding VAT.
 * No inferred cost for historical snapshots or uncosted deliveries. */
export function stockFinancials(input: {
  openingUnits: number | null; closingUnits: number | null;
  openingCostPence: number | null; conversion: number | null;
  deliveries: { quantityUnits: number; invoiceLineCostPence: number | null }[];
  sold: number | null; netSalesPence: number | null;
}) {
  const { openingUnits: opening, closingUnits: closing, openingCostPence: cost, conversion, deliveries, sold } = input;
  const warnings: string[] = [];
  const round = (n: number) => Math.round(n);
  const delivered = deliveries.reduce((sum, d) => sum + d.quantityUnits, 0);
  const deliveryCost = deliveries.every(d => d.invoiceLineCostPence !== null)
    ? deliveries.reduce((sum, d) => sum + d.invoiceLineCostPence!, 0) : null;
  const openingCost = opening === null ? null : opening === 0 ? 0 : cost === null ? null : opening * cost;
  if (opening === null || closing === null) warnings.push("Opening or closing physical count is missing.");
  if (opening !== null && opening > 0 && cost === null) warnings.push("Opening count has no saved purchase cost; historical costs are not guessed.");
  if (deliveryCost === null) warnings.push("One or more delivery invoice costs are missing.");
  if (!conversion || conversion <= 0) warnings.push("Missing or incompatible unit conversion.");
  if (sold === null) warnings.push("POS sales quantity unavailable or product not linked.");
  if (input.netSalesPence === null) warnings.push("Net sales unavailable or refunds cannot be allocated safely.");
  const available = opening === null ? null : opening + delivered;
  const weighted = openingCost !== null && deliveryCost !== null && available !== null && available > 0
    ? (openingCost + deliveryCost) / available : null;
  const consumption = opening !== null && closing !== null ? opening + delivered - closing : null;
  if (consumption !== null && consumption < 0) warnings.push("Closing stock exceeds opening plus deliveries; check counts and missing deliveries.");
  const validConversion = conversion !== null && conversion > 0;
  const baseCost = validConversion && weighted !== null ? weighted / conversion : null;
  const closingValue = closing === 0 ? 0 : closing !== null && weighted !== null ? closing * weighted : null;
  const consumedCost = consumption === 0 && available === 0 ? 0
    : consumption !== null && consumption >= 0 && weighted !== null ? consumption * weighted : null;
  const varianceValue = sold !== null && consumption !== null && baseCost !== null && validConversion
    ? (consumption * conversion - sold) * baseCost : null;
  const gp = validConversion && input.netSalesPence !== null && consumedCost !== null ? input.netSalesPence - consumedCost : null;
  return {
    valuationMethod: "periodic-weighted-average",
    costPerBaseUnitPence: baseCost,
    openingValuePence: openingCost === null ? null : round(openingCost),
    deliveredValuePence: deliveryCost,
    closingValuePence: closingValue === null ? null : round(closingValue),
    consumedCostPence: consumedCost === null ? null : round(consumedCost),
    expectedSalesCostPence: sold !== null && baseCost !== null ? round(sold * baseCost) : null,
    varianceValuePence: varianceValue === null ? null : round(varianceValue),
    netSalesPence: input.netSalesPence,
    grossProfitPence: gp === null ? null : round(gp),
    grossMarginPercent: gp !== null && input.netSalesPence! > 0 ? Math.round(gp / input.netSalesPence! * 10000) / 100 : null,
    financialWarnings: warnings,
  };
}
