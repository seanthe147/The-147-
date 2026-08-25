import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createPushRegistrationSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashPushRegistrationSecret(token: string, secret: string): string {
  return createHash("sha256").update(`${token}\0${secret}`).digest("hex");
}

export function matchesPushRegistrationSecret(
  token: string,
  secret: unknown,
  expectedHash: string | null | undefined,
): secret is string {
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/.test(secret) || !expectedHash) {
    return false;
  }
  const actual = Buffer.from(hashPushRegistrationSecret(token, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}