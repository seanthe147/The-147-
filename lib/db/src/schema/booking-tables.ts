export const POOL_TABLE_NUMBERS = ["1", "2", "3", "4", "5"] as const;

export function isBookablePoolTable(value: unknown): boolean {
  return typeof value === "string" && POOL_TABLE_NUMBERS.some((number) => number === value);
}
