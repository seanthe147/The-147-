import assert from "node:assert/strict";
import test from "node:test";

import {
  isAppearancePreference,
  resolveAppearance,
} from "./appearance.ts";

test("validates persisted appearance preferences", () => {
  assert.equal(isAppearancePreference("system"), true);
  assert.equal(isAppearancePreference("light"), true);
  assert.equal(isAppearancePreference("dark"), true);
  assert.equal(isAppearancePreference("sepia"), false);
  assert.equal(isAppearancePreference(null), false);
});

test("keeps the existing dark appearance while rollout is disabled", () => {
  assert.equal(resolveAppearance("light", "light", false), "dark");
  assert.equal(resolveAppearance("system", "light", false), "dark");
});

test("resolves explicit and system preferences when rollout is enabled", () => {
  assert.equal(resolveAppearance("light", "dark", true), "light");
  assert.equal(resolveAppearance("dark", "light", true), "dark");
  assert.equal(resolveAppearance("system", "light", true), "light");
  assert.equal(resolveAppearance("system", "dark", true), "dark");
  assert.equal(resolveAppearance("system", null, true), "dark");
});