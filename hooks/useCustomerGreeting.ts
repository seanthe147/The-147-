import { useMemo } from "react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

/**
 * Shared helper for rendering personal touches across the app
 * (home hero, loyalty header, book header, account header, order
 * confirmation, etc.).
 *
 * Returns derived strings so each screen renders a consistent
 * greeting without re-implementing the time-of-day logic. All
 * fields are `null` when no customer is signed in, so callers can
 * gate JSX with a single `if (firstName)` style check.
 *
 * - `firstName`     — first whitespace-delimited word of the
 *                     customer's name. Casual and friendly.
 *                     ("Stuart John Smith" → "Stuart".)
 * - `timeOfDay`     — "morning" | "afternoon" | "evening" based on
 *                     the device clock at render time.
 * - `greetingPart`  — capitalised "Good morning" / "Good afternoon"
 *                     / "Good evening", ready to drop into copy.
 * - `greeting`      — full "Good morning, Stuart" line. Most callers
 *                     just want this.
 *
 * Why useMemo with no deps: an open app crossing the noon or 6pm
 * boundary won't update mid-session, but every screen using this
 * hook re-renders frequently (tab focus, query refetches), so the
 * greeting will catch up on the next mount of any of these screens
 * — well before a customer would notice.
 */
export interface CustomerGreeting {
  isAuthenticated: boolean;
  firstName: string | null;
  timeOfDay: "morning" | "afternoon" | "evening" | null;
  greetingPart: string | null;
  greeting: string | null;
}

export function useCustomerGreeting(): CustomerGreeting {
  const { isAuthenticated, customer } = useCustomerAuth();

  return useMemo<CustomerGreeting>(() => {
    if (!isAuthenticated || !customer?.name) {
      return {
        isAuthenticated: !!isAuthenticated,
        firstName: null,
        timeOfDay: null,
        greetingPart: null,
        greeting: null,
      };
    }
    const firstName = customer.name.trim().split(/\s+/)[0] || null;
    if (!firstName) {
      return {
        isAuthenticated: true,
        firstName: null,
        timeOfDay: null,
        greetingPart: null,
        greeting: null,
      };
    }
    const h = new Date().getHours();
    const timeOfDay: "morning" | "afternoon" | "evening" =
      h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
    const greetingPart =
      timeOfDay === "morning"
        ? "Good morning"
        : timeOfDay === "afternoon"
        ? "Good afternoon"
        : "Good evening";
    return {
      isAuthenticated: true,
      firstName,
      timeOfDay,
      greetingPart,
      greeting: `${greetingPart}, ${firstName}`,
    };
  }, [isAuthenticated, customer?.name]);
}
