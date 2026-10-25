import assert from "node:assert/strict";
import test from "node:test";
import { getBannerFrame, getBannerPageOffset } from "./responsive-banner-layout.ts";

test("banner frames follow the current window width", () => {
  assert.deepEqual(getBannerFrame(402, 40), { width: 362, height: 157 });
  assert.deepEqual(getBannerFrame(810, 40), { width: 770, height: 335 });
});

test("carousel page offsets use the resized frame and preserve the active slide", () => {
  const compactFrame = getBannerFrame(402, 40);
  const expandedFrame = getBannerFrame(810, 40);

  assert.equal(getBannerPageOffset(2, compactFrame.width, 12), 748);
  assert.equal(getBannerPageOffset(2, expandedFrame.width, 12), 1564);
});

test("order banners use the full available width without a home-screen inset", () => {
  assert.deepEqual(getBannerFrame(402), { width: 402, height: 175 });
});
