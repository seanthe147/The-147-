import assert from "node:assert/strict";
import test from "node:test";
import { runNavigationAction } from "./navigation-action.ts";

test("navigates exactly once before optional feedback", () => {
  const calls: string[] = [];
  runNavigationAction(
    () => calls.push("navigate"),
    () => { calls.push("feedback"); },
  );
  assert.deepEqual(calls, ["navigate", "feedback"]);
});

test("still navigates if the native feedback module throws", () => {
  let navigations = 0;
  assert.doesNotThrow(() => runNavigationAction(
    () => { navigations += 1; },
    () => { throw new Error("Native feedback unavailable"); },
  ));
  assert.equal(navigations, 1);
});

test("handles rejected feedback without an unhandled rejection", async () => {
  let navigations = 0;
  runNavigationAction(
    () => { navigations += 1; },
    () => Promise.reject(new Error("Feedback failed")),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(navigations, 1);
});
