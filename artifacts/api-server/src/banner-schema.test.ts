import assert from "node:assert/strict";
import test from "node:test";
import { insertBannerImageSchema } from "../../../lib/db/src/schema/schema";

test("new banner validation accepts both Events spellings and emits the canonical destination", () => {
  for (const linkType of ["event", "events"]) {
    const banner = insertBannerImageSchema.parse({ imageUrl: "https://example.com/banner.jpg", linkType });
    assert.equal(banner.linkType, "events");
  }
});

test("banner validation preserves Order, safe external URLs, and no destination", () => {
  for (const linkType of ["order", "url", null, undefined] as const) {
    const banner = insertBannerImageSchema.parse({
      imageUrl: "https://example.com/banner.jpg",
      linkType,
      linkValue: linkType === "url" ? "https://example.com/offers" : null,
    });
    assert.equal(banner.linkType, linkType);
  }
});

test("banner validation continues rejecting dangerous external URL schemes", () => {
  for (const linkValue of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "vbscript:msgbox(1)", "blob:https://example.com/id", "//example.com"]) {
    const result = insertBannerImageSchema.safeParse({
      imageUrl: "https://example.com/banner.jpg", linkType: "url", linkValue,
    });
    assert.equal(result.success, false, linkValue);
  }
});

test("unknown banner destination choices are rejected", () => {
  assert.equal(insertBannerImageSchema.safeParse({
    imageUrl: "https://example.com/banner.jpg", linkType: "individual-event",
  }).success, false);
});
