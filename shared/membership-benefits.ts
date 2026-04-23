import type { MembershipPlan } from "./schema";

export type BenefitKey = "hours" | "discount" | "priority" | "guests" | "loyalty" | "app";

export interface MembershipBenefit {
  key: BenefitKey;
  text: string;
}

interface BenefitInput {
  hoursIncluded?: number | null;
  hoursUnit?: string | null;
  foodDrinkDiscount?: number | null;
  priorityBooking?: boolean | null;
  guestPassesMonthly?: number | null;
  loyaltyMultiplier?: number | null;
}

function plural(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * Canonical, user-facing benefit list for a membership plan.
 *
 * Single source of truth shared by the customer app, the staff dashboard,
 * and the public marketing page. Order matters — surfaces should render the
 * list in the returned order.
 *
 * Loyalty rule: a "loyalty points" line is shown ONLY when the plan has a
 * multiplier greater than 1. Plans with multiplier === 1 do not show a
 * loyalty line, because every customer (member or not) earns standard
 * loyalty points anyway.
 */
export function getPlanBenefits(plan: BenefitInput): MembershipBenefit[] {
  const benefits: MembershipBenefit[] = [];

  if (plan.hoursIncluded === 0) {
    // Explicit zero — admin has said this plan does not include any snooker
    // hours. Omit the snooker line entirely rather than misrepresenting it
    // as "unlimited" (which is what an unset/null value means).
  } else if (plan.hoursIncluded && plan.hoursIncluded > 0) {
    const unit = plan.hoursUnit === "year" ? "per year" : "per month";
    const hourWord = plural(plan.hoursIncluded, "hour", "hours");
    benefits.push({ key: "hours", text: `${plan.hoursIncluded} ${hourWord} snooker ${unit}` });
  } else {
    benefits.push({ key: "hours", text: "Unlimited snooker access" });
  }

  if (plan.foodDrinkDiscount && plan.foodDrinkDiscount > 0) {
    benefits.push({ key: "discount", text: `${plan.foodDrinkDiscount}% food & drink discount` });
  }

  if (plan.priorityBooking) {
    benefits.push({ key: "priority", text: "Priority table booking" });
  }

  if (plan.guestPassesMonthly && plan.guestPassesMonthly > 0) {
    const passWord = plural(plan.guestPassesMonthly, "guest pass", "guest passes");
    benefits.push({ key: "guests", text: `${plan.guestPassesMonthly} ${passWord} per month` });
  }

  if (plan.loyaltyMultiplier && plan.loyaltyMultiplier > 1) {
    benefits.push({
      key: "loyalty",
      text: `${plan.loyaltyMultiplier}\u00d7 loyalty points on every visit`,
    });
  }

  benefits.push({ key: "app", text: "Manage everything in The 147 app" });

  return benefits;
}

export function getPlanBenefitTexts(plan: BenefitInput): string[] {
  return getPlanBenefits(plan).map((b) => b.text);
}
