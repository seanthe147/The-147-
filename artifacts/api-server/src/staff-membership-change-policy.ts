export function staffPlanChangePolicy(input: {
  role?: string; current: { name: string; tier?: string; priceMonthly: number };
  target: { name: string; tier?: string; priceMonthly: number };
  commitmentEndDate?: string | null; today: string; consolidation?: boolean;
}) {
  const downgrade = input.target.priceMonthly <= input.current.priceMonthly && !input.consolidation;
  if (!["staff", "manager", "owner"].includes(input.role ?? "")) throw new Error("Staff permission is required.");
  if (/^vip$/i.test(input.target.tier ?? "")) throw new Error("VIP is invitation-only and cannot be selected.");
  const platinum = /platinum|maximum|black/i.test(`${input.current.name} ${input.current.tier ?? ""}`);
  if (downgrade && platinum && !["manager", "owner"].includes(input.role!)) {
    throw new Error("Only a manager or owner can downgrade Platinum membership.");
  }
  if (downgrade && input.commitmentEndDate && input.commitmentEndDate > input.today) {
    throw new Error(`The minimum term ends on ${input.commitmentEndDate}. Schedule the downgrade after that date.`);
  }
  return { downgrade };
}
