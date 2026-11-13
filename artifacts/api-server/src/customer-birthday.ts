/** A birthday is required, but membership has no minimum-age restriction. */
export function birthdayError(value: unknown, now = new Date()): string | null {
  if (typeof value !== "string" || !value.trim()) return "Date of birth is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid date of birth.";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "Enter a valid date of birth.";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (value > today) return "Date of birth cannot be in the future.";
  if (now.getUTCFullYear() - year > 120) return "Enter a valid date of birth.";
  return null;
}
