import { test } from "node:test";
import assert from "node:assert/strict";
import { birthdayError } from "./customer-birthday.ts";
const now = new Date("2026-11-13T12:00:00Z");
test("birthday required and cannot be cleared", () => {
  for (const v of [null, undefined, "", " ", 2000]) assert.ok(birthdayError(v, now));
});
test("under-18s allowed; valid leap day accepted", () => {
  for (const v of ["2015-06-10", "2024-02-29", "1980-12-31"]) assert.equal(birthdayError(v, now), null);
});
test("impossible dates, future dates and non-ISO values rejected", () => {
  for (const v of ["2025-02-29", "2020-13-01", "2026-11-14", "31/12/1980", "0000-01-01"]) assert.ok(birthdayError(v, now));
});
test("UK calendar day used around midnight in summer", () => {
  assert.equal(birthdayError("2026-06-02", new Date("2026-06-01T23:30:00Z")), null);
});
