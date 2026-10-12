import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { insertBookingSchema, POOL_TABLE_NUMBERS, isBookablePoolTable } from "../../../lib/db/src/schema/schema";

const booking = {
  customerName: "Booking test",
  customerEmail: "booking@example.com",
  customerPhone: "01234567890",
  date: "2099-01-01",
  startTime: "12:00",
  duration: 1,
  tableType: "pool",
  gdprConsent: true,
};

test("Pool Tables 1–5 remain bookable", () => {
  assert.deepEqual(POOL_TABLE_NUMBERS, ["1", "2", "3", "4", "5"]);
  for (const tableNumber of POOL_TABLE_NUMBERS) {
    assert(isBookablePoolTable(tableNumber));
    assert(insertBookingSchema.safeParse({ ...booking, tableNumber }).success);
  }
});

test("Pool Table 6 and invalid numbers cannot be created or repeated", () => {
  for (const tableNumber of ["6", "06", "6x", "0", "-1", "7", "1x", "", null, undefined]) {
    assert.equal(isBookablePoolTable(tableNumber), false);
    const result = insertBookingSchema.safeParse({ ...booking, tableNumber });
    assert.equal(result.success, false, String(tableNumber));
    if (!result.success) {
      assert(result.error.issues.some((issue) => issue.path.includes("tableNumber")));
    }
  }
});

test("Pool retirement does not remove Snooker Table 6 or dining bookings", () => {
  assert(insertBookingSchema.safeParse({ ...booking, tableType: "snooker", tableNumber: "6" }).success);
  assert(insertBookingSchema.safeParse({ ...booking, tableType: "dining", tableNumber: null }).success);
});

function fakeElement() {
  return { children: [] as any[], dataset: {} as Record<string, string>, className: "", textContent: "", innerHTML: "", onclick: null as unknown,
    appendChild(child: unknown) { this.children.push(child); } };
}

test("public booking widget renders exactly Pool Tables 1–5", () => {
  const html = readFileSync("src/templates/booking-widget.html", "utf8");
  const body = html.match(/function buildPoolGrid\(\) \{([\s\S]*?)\n  \}/)?.[0];
  assert(body);
  const grid = fakeElement();
  const context = vm.createContext({
    document: { getElementById: () => grid, createElement: () => fakeElement() },
  });
  vm.runInContext(`${body}; buildPoolGrid();`, context);
  assert.deepEqual(grid.children.map((child) => child.dataset.num), ["1", "2", "3", "4", "5"]);
  assert(html.includes("Select your preferred table (1–5)"));
});

test("staff dashboard excludes Pool Table 6 without silently reassigning existing bookings", () => {
  const html = readFileSync("src/templates/staff-dashboard.html", "utf8");
  const body = html.match(/function buildTableNumChips\(type\)\{([\s\S]*?)\n  \}/)?.[0];
  assert(body);
  const chipState = { tableNum: "6" };
  const grid = fakeElement();
  const context = vm.createContext({
    chipState, el: () => grid,
    document: { createElement: () => fakeElement() },
  });
  vm.runInContext(`${body}; buildTableNumChips('pool');`, context);
  assert.deepEqual(grid.children.map((child) => child.dataset.value), ["1", "2", "3", "4", "5"]);
  assert.equal(chipState.tableNum, "");
  assert(grid.children.every((child) => !child.className.includes("selected")));
});
