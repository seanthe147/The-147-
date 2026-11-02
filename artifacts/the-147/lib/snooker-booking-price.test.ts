import assert from "node:assert/strict";
import test from "node:test";
import { calculateSnookerBookingPrice, formatPounds } from "./snooker-booking-price.ts";

test("Blue and eligible Pink snooker estimates apply 10% to snooker only", () => {
  const oneHour = calculateSnookerBookingPrice(1, 10);
  assert.equal(oneHour.totalPence, 716);
  assert.equal(oneHour.savingPence, 79);
  assert.equal(formatPounds(oneHour.totalPence), "£7.16");

  const twoHours = calculateSnookerBookingPrice(2, 10);
  assert.equal(twoHours.totalPence, 1431);
  assert.equal(twoHours.savingPence, 159);
});

test("standard snooker and non-member estimates stay at full price", () => {
  const estimate = calculateSnookerBookingPrice(2, 0);
  assert.equal(estimate.totalPence, 1590);
  assert.equal(estimate.savingPence, 0);
});
