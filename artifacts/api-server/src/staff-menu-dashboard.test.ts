import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const dashboardHtml = readFileSync(
  resolve("src/templates/staff-dashboard.html"),
  "utf8",
);

test("dashboard 18+ and colour controls send safe presentation payloads", async (t) => {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      // Replit's lean image exposes a system Chromium without the optional
      // Playwright shell dependencies; CI can continue using Playwright's
      // managed browser by leaving this unset.
      executablePath: process.env.CHROMIUM_PATH || undefined,
    });
  } catch (error) {
    // The repository's other browser-backed dashboard checks use the same
    // optional Playwright runtime. Keep this focused check runnable in lean
    // API containers while still exercising the real DOM whenever Chromium
    // is available in CI/development.
    t.skip(`Chromium unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const page = await browser.newPage();

  try {
    await page.addInitScript(() => {
      const presentationRequests: Array<{ url: string; method: string; body: string }> = [];
      const menuItem = {
        variationId: "variation-quoted",
        itemId: "item-quoted",
        name: 'He said "18+"',
        variationName: "Single",
        price: 850,
        soldOut: false,
        hidden: false,
        kioskHidden: false,
        is18Plus: false,
        cardBackgroundColor: null,
      };
      const menu = [{
        id: "cat-quoted",
        name: "Drinks",
        hidden: false,
        kioskHidden: false,
        items: [menuItem],
      }];
      const browserWindow = globalThis as unknown as {
        __presentationRequests: typeof presentationRequests;
        fetch: unknown;
      };
      browserWindow.__presentationRequests = presentationRequests;

      const response = (body: unknown) => new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

      localStorage.setItem("staffToken147", "dashboard-regression-token");
      browserWindow.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
        const url = String(input);
        if (url.endsWith("/api/staff/verify")) {
          return response({ role: "manager", username: "manager", displayName: "Manager" });
        }
        if (url.startsWith("/api/staff/menu") && !url.includes("/items/")) {
          return response(menu);
        }
        if (url.includes("/api/staff/menu/items/") && url.endsWith("/presentation")) {
          presentationRequests.push({
            url,
            method: init?.method ?? "GET",
            body: String(init?.body ?? ""),
          });
          return response({ ok: true });
        }
        return response({});
      });
    });

    await page.route("http://dashboard.test/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: dashboardHtml,
      });
    });
    await page.goto("http://dashboard.test/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      typeof (globalThis as unknown as { switchMenuTab?: unknown }).switchMenuTab === "function",
    );
    await page.locator("#navMenu").click();
    await page.evaluate(() =>
      (globalThis as unknown as { switchMenuTab: (tab: string) => void }).switchMenuTab("items"),
    );
    await page.evaluate(() =>
      (globalThis as unknown as { loadMenuManagement: (forceRefresh?: boolean) => Promise<void> })
        .loadMenuManagement(false),
    );
    await page.waitForFunction(() =>
      Boolean((globalThis as unknown as { document: { querySelector: (selector: string) => unknown } }).document.querySelector("#menuCategoriesList .menu-item-row")),
    );

    const rowName = await page.locator(".menu-item-row").getAttribute("data-item-name");
    assert.equal(rowName, 'He said "18+"');

    await page.locator(".menu-cat-header").click();
    await page.locator(".menu-item-age").check();
    await page.waitForFunction(() =>
      ((globalThis as unknown as { __presentationRequests: unknown[] }).__presentationRequests).length >= 1,
    );

    await page.locator(".menu-card-colour").selectOption("#DBEAFE");
    await page.waitForFunction(() =>
      ((globalThis as unknown as { __presentationRequests: unknown[] }).__presentationRequests).length >= 2,
    );

    const requests = await page.evaluate(() =>
      (globalThis as unknown as { __presentationRequests: Array<{ url: string; method: string; body: string }> })
        .__presentationRequests
        .map((request) => ({ ...request, body: JSON.parse(request.body) })),
    );
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map((request) => request.method), ["PUT", "PUT"]);
    assert.deepEqual(requests.map((request) => request.body), [
      {
        is18Plus: true,
        cardBackgroundColor: null,
        itemId: "item-quoted",
        name: 'He said "18+"',
      },
      {
        is18Plus: true,
        cardBackgroundColor: "#DBEAFE",
        itemId: "item-quoted",
        name: 'He said "18+"',
      },
    ]);
  } finally {
    await browser.close();
  }
});