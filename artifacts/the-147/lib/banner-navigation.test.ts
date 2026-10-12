import assert from "node:assert/strict";
import test from "node:test";
import { activateBannerDestination, normalizeBannerLinkType, resolveBannerDestination, type BannerTab } from "../../../lib/db/src/schema/banner-destination.ts";

for (const source of ["home", "events", "order"] as const satisfies readonly BannerTab[]) {
  for (const spelling of ["event", "events", "order"]) {
    test(`${source}: ${spelling} opens the correct tab, except same-tab taps`, () => {
      const calls: string[] = [];
      activateBannerDestination(resolveBannerDestination({ linkType: spelling, linkValue: "javascript:ignored" }), source, {
        navigate: (href) => calls.push(href),
        openURL: () => assert.fail("internal banner must not open a URL"),
      });
      const target = spelling === "order" ? "order" : "events";
      assert.deepEqual(calls, source === target ? [] : [`/(tabs)/${target}`]);
    });
  }
  for (const url of ["https://example.com/offers?q=1#details", "http://example.com", " https://example.com "]) {
    test(`${source}: opens safe external URL ${url}`, () => {
      const calls: string[] = [];
      activateBannerDestination(resolveBannerDestination({ linkType: "url", linkValue: url }), source, {
        navigate: () => assert.fail("URL must not navigate an internal tab"),
        openURL: (href) => calls.push(href),
      });
      assert.deepEqual(calls, [url.trim()]);
    });
  }
}

for (const value of ["javascript:alert(1)", "data:text/html,test", "vbscript:msgbox(1)", "file:///tmp/test", "blob:https://example.com/id", "intent://app", "tel:123", "//example.com", "/events", "", null, undefined]) {
  test(`unsafe or absent URL is non-interactive: ${value}`, () => {
    const destination = resolveBannerDestination({ linkType: "url", linkValue: value });
    assert.equal(destination, null);
    activateBannerDestination(destination, "home", {
      navigate: () => assert.fail("unexpected navigation"),
      openURL: () => assert.fail("unexpected external link"),
    });
  });
}

test("missing and unknown destinations stay non-interactive even with a URL", () => {
  for (const linkType of [undefined, null, "", "unknown"]) {
    assert.equal(resolveBannerDestination({ linkType, linkValue: "https://example.com" }), null);
  }
});

test("editor contract canonicalizes both Events spellings", () => {
  assert.equal(normalizeBannerLinkType("event"), "events");
  assert.equal(normalizeBannerLinkType("events"), "events");
  assert.equal(normalizeBannerLinkType("order"), "order");
  assert.equal(normalizeBannerLinkType("url"), "url");
  assert.equal(normalizeBannerLinkType(""), null);
});

test("activation rechecks external URL safety", () => {
  activateBannerDestination({ type: "url", url: "javascript:alert(1)" }, "home", {
    navigate: () => assert.fail("unexpected navigation"),
    openURL: () => assert.fail("unsafe scheme opened"),
  });
});
