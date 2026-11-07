import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { chromium, type Page } from "playwright";
import { createApp } from "./app.ts";
import { registerStaffFixturesRoute } from "./routes/routes.ts";
import { invalidateFixturesCache } from "./sports-fixtures.ts";
import { loadFixturesWithTestClock } from "./fixture-test-clock.ts";
import { storage } from "./storage.ts";

const ROUTE = "/api/staff/fixtures/upcoming";
const SESSION_TOKEN = "fixture-route-test-session-token-1234567890";
const originalFetch = globalThis.fetch;

const fixtureKeys = [
  "awayLogo",
  "awayScore",
  "awayTeam",
  "channel",
  "homeLogo",
  "homeScore",
  "homeTeam",
  "id",
  "kickoffIso",
  "kickoffMs",
  "leagueName",
  "sport",
  "status",
].sort();

function response(events: Record<string, unknown>[]): Response {
  return new Response(JSON.stringify({ events }), {
    headers: { "content-type": "application/json" },
  });
}

function providerEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idEvent: "general-event",
    idLeague: "4328",
    dateEvent: "2099-01-01",
    strTime: "12:00:00",
    strStatus: "NS",
    strTVStation: null,
    strHomeTeam: "Home team",
    strAwayTeam: "Away team",
    idHomeTeam: "100",
    idAwayTeam: "101",
    strHomeTeamBadge: "https://example.com/home.png",
    strAwayTeamBadge: "https://example.com/away.png",
    intHomeScore: null,
    intAwayScore: null,
    ...overrides,
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

test("staff fixture route rejects unauthenticated requests", async () => {
  const app = createApp();
  registerStaffFixturesRoute(app);
  const server = createServer(app);
  const baseUrl = await listen(server);

  try {
    const result = await originalFetch(`${baseUrl}${ROUTE}`);
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), { message: "Authentication required" });
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
});

test("authenticated fixture response stays bounded, canonical, and dashboard-compatible", async () => {
  invalidateFixturesCache();

  const generalFixtures = Array.from({ length: 6 }, (_, index) =>
    providerEvent({
      idEvent: `general-${index + 1}`,
      dateEvent: `2099-01-${String(index + 1).padStart(2, "0")}`,
    }),
  );

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("eventsnext.php?id=134189")) {
      return response([providerEvent({
        idEvent: "bradford-tv",
        idLeague: "4396",
        dateEvent: "2099-01-10",
        strHomeTeam: "Bradford City",
        strAwayTeam: "Cambridge United",
        idHomeTeam: "134189",
        idAwayTeam: "134586",
        strTVStation: "BT Sport 1",
      })]);
    }
    if (url.endsWith("eventsnext.php?id=133635")) {
      return response([providerEvent({
        idEvent: "leeds-tv",
        dateEvent: "2099-01-11",
        strHomeTeam: "Brighton and Hove Albion",
        strAwayTeam: "Leeds United",
        idHomeTeam: "133619",
        idAwayTeam: "133635",
        strTVStation: "Sky Sports Main Event",
      })]);
    }
    if (url.includes("eventsday.php?") && url.includes("&l=4328")) {
      return response(generalFixtures);
    }
    return response([]);
  }) as typeof fetch;

  const originalValidateStaffSession = storage.validateStaffSession;
  const originalLogStaffAction = storage.logStaffAction;
  (storage as any).validateStaffSession = async (token: string) =>
    token === SESSION_TOKEN
      ? { staffUsername: null, expiresAt: new Date(Date.now() + 60_000), idleExpiresAt: new Date(Date.now() + 900_000) }
      : undefined;
  (storage as any).logStaffAction = async () => undefined;

  const app = createApp();
  registerStaffFixturesRoute(app);
  const server = createServer(app);
  const baseUrl = await listen(server);

  try {
    await loadFixturesWithTestClock();
    const result = await originalFetch(`${baseUrl}${ROUTE}`, {
      headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
    });
    assert.equal(result.status, 200);

    const body = await result.json() as {
      fixtures?: unknown;
      feedStatus?: {
        isDegraded?: boolean;
        failedRequestCount?: number;
        lastSuccessfulRefreshAt?: string | null;
      };
    };
    assert.deepEqual(Object.keys(body).sort(), ["feedStatus", "fixtures"]);
    assert(Array.isArray(body.fixtures));
    assert(body.fixtures.length <= 5);
    assert(body.fixtures.length > 0);
    assert.equal(body.feedStatus?.isDegraded, false);
    assert.equal(body.feedStatus?.failedRequestCount, 0);
    assert.equal(typeof body.feedStatus?.lastSuccessfulRefreshAt, "string");
    const fullResult = await originalFetch(`${baseUrl}${ROUTE}?view=all`, {
      headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
    });
    assert.equal(fullResult.status, 200);
    const fullBody = await fullResult.json() as { fixtures?: unknown };
    assert(Array.isArray(fullBody.fixtures));
    assert(fullBody.fixtures.length > 5);
    assert.equal(fullBody.fixtures.length, 8);

    for (const fixture of body.fixtures) {
      assert.deepEqual(Object.keys(fixture as object).sort(), fixtureKeys);
      const typedFixture = fixture as Record<string, unknown>;
      assert.equal(typeof typedFixture.sport, "string");
      assert.equal(typeof typedFixture.leagueName, "string");
      assert.equal(typeof typedFixture.homeTeam, "string");
      assert.equal(typeof typedFixture.awayTeam, "string");
      assert.equal(typeof typedFixture.kickoffIso, "string");
      assert.equal(typeof typedFixture.channel, "string");
      assert(["upcoming", "live"].includes(String(typedFixture.status)));
    }

    const fixtures = body.fixtures as Array<Record<string, unknown>>;
    assert.equal(fixtures.find((fixture) => fixture.id === "bradford-tv")?.channel, "TNT Sports");
    assert.equal(fixtures.find((fixture) => fixture.id === "leeds-tv")?.channel, "Sky Sports");
    assert.equal(fixtures.filter((fixture) => String(fixture.id).startsWith("general-")).length, 3);

    const dashboard = readFileSync(resolve("src/templates/staff-dashboard.html"), "utf8");
    for (const field of [
      "data.fixtures||[]",
      "f.sport",
      "f.leagueName",
      "f.homeTeam",
      "f.awayTeam",
      "f.kickoffIso",
      "f.channel",
    ]) {
      assert(dashboard.includes(field), `dashboard no longer reads fixture field ${field}`);
    }
  } finally {
    (storage as any).validateStaffSession = originalValidateStaffSession;
    (storage as any).logStaffAction = originalLogStaffAction;
    globalThis.fetch = originalFetch;
    invalidateFixturesCache();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
});

async function startStaffDashboardServer(
  providerFetch: typeof fetch,
): Promise<{ baseUrl: string; server: Server; restore: () => void }> {
  invalidateFixturesCache();
  const originalValidateStaffSession = storage.validateStaffSession;
  const originalLogStaffAction = storage.logStaffAction;
  const originalFetchForDashboard = globalThis.fetch;
  globalThis.fetch = providerFetch;
  await loadFixturesWithTestClock();
  (storage as any).validateStaffSession = async (token: string) =>
    token === SESSION_TOKEN
      ? { staffUsername: null, expiresAt: new Date(Date.now() + 60_000), idleExpiresAt: new Date(Date.now() + 900_000) }
      : undefined;
  (storage as any).logStaffAction = async () => undefined;

  const app = createApp();
  registerStaffFixturesRoute(app);
  app.get("/staff", (_req, res) => {
    const dashboard = readFileSync(resolve("src/templates/staff-dashboard.html"), "utf8");
    res.type("html").send(dashboard);
  });
  app.get("/favicon.ico", (_req, res) => res.sendStatus(204));
  app.get("/assets/logo-147.png", (_req, res) => res.sendStatus(204));
  app.get("/assets/staff-idle.js", (_req, res) => res.type("js").send(readFileSync(resolve("src/templates/assets/staff-idle.js"), "utf8")));
  // The fixture request uses the real staffAuth middleware above. Keep the
  // verify response small and deterministic so the browser test can focus on
  // the dashboard rendering rather than database-backed dashboard panels.
  app.get("/api/staff/verify", (req, res) => {
    if (req.header("authorization") !== `Bearer ${SESSION_TOKEN}`) {
      return res.status(401).json({ message: "Authentication required" });
    }
    return res.json({ role: "staff", username: "fixture-smoke", displayName: "Fixture Smoke" });
  });
  const server = createServer(app);
  const baseUrl = await listen(server);

  return {
    baseUrl,
    server,
    restore: () => {
      (storage as any).validateStaffSession = originalValidateStaffSession;
      (storage as any).logStaffAction = originalLogStaffAction;
      globalThis.fetch = originalFetchForDashboard;
      invalidateFixturesCache();
    },
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

async function assertDashboardHasNoBrowserErrors(
  page: Page,
  browserErrors: string[],
): Promise<void> {
  await page.waitForFunction(`
    (() => {
      const app = document.querySelector("#app");
      const title = document.querySelector("#topbarTitle");
      return app?.style.display === "block" && title?.textContent === "Bookings";
    })()
  `);
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  assert.deepEqual(browserErrors, []);
}

async function openStaffDashboard(
  page: Page,
  baseUrl: string,
): Promise<string[]> {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript({
    content: `window.localStorage.setItem("staffToken147", ${JSON.stringify(SESSION_TOKEN)});window.localStorage.setItem("staffIdle147",JSON.stringify({token:${JSON.stringify(SESSION_TOKEN)},deadline:Date.now()+900000}));`,
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === ROUTE || pathname === "/api/staff/verify") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.goto(`${baseUrl}/staff`);
  return browserErrors;
}

test("browser smoke check renders the authenticated fixture strip", async () => {
  const providerFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("eventsnext.php?id=134189")) {
      return response([providerEvent({
        idEvent: "bradford-smoke",
        idLeague: "4396",
        strLeague: "League One",
        dateEvent: "2099-01-10",
        strTime: "12:34:00",
        strHomeTeam: "Bradford City",
        strAwayTeam: "Cambridge United",
        idHomeTeam: "134189",
        idAwayTeam: "134586",
        strTVStation: "BT Sport 1",
      })]);
    }
    if (url.includes("eventsday.php?") && url.includes("&l=4328")) {
      return response([]);
    }
    return response([]);
  }) as typeof fetch;
  const dashboardServer = await startStaffDashboardServer(providerFetch);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ timezoneId: "UTC" });
  const page = await context.newPage();

  try {
    const browserErrors = await openStaffDashboard(page, dashboardServer.baseUrl);
    await page.waitForFunction(`
      (() => {
        const bar = document.querySelector("#fixturesBar");
        return Boolean(bar && bar.style.display !== "none" && bar.querySelectorAll("div > div").length > 0);
      })()
    `);

    const fixtureBar = page.locator("#fixturesBar");
    const fixtureText = await fixtureBar.innerText();
    assert.match(fixtureText, /League One/);
    assert.match(fixtureText, /Bradford City/);
    assert.match(fixtureText, /Cambridge United/);
    assert.match(fixtureText, /10 Jan/);
    assert.match(fixtureText, /12:34/);
    assert.match(fixtureText, /TNT Sports/);
    assert.equal(await fixtureBar.locator("svg").count() > 0, true);
    const fixtureCards = fixtureBar.getByRole("group");
    assert.equal(await fixtureCards.count(), 1);
    const accessibleName = await fixtureCards.first().getAttribute("aria-label");
    assert(accessibleName);
    assert.match(accessibleName, /League One/);
    assert.match(accessibleName, /Bradford City/);
    assert.match(accessibleName, /Cambridge United/);
    assert.match(accessibleName, /kickoff .*10 Jan.*12:34/);
    assert.match(accessibleName, /broadcaster TNT Sports/);
    assert.equal(await fixtureCards.first().locator("svg[aria-hidden='true']").count(), 1);
    assert.equal(await fixtureCards.first().locator("img[aria-hidden='true']").count(), 3);
    await assertDashboardHasNoBrowserErrors(page, browserErrors);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    dashboardServer.restore();
    await closeServer(dashboardServer.server);
  }
});

test("browser smoke check opens the full fixture list on a small screen", async () => {
  const allFixtures = Array.from({ length: 7 }, (_, index) =>
    providerEvent({
      idEvent: `mobile-fixture-${index + 1}`,
      dateEvent: `2099-01-${String(index + 1).padStart(2, "0")}`,
      strHomeTeam: index === 1
        ? "International Sporting Association of West Yorkshire"
        : `Home ${index + 1}`,
      strAwayTeam: `Away ${index + 1}`,
      strTVStation: index === 0 ? "Sky Sports" : null,
    }),
  );
  const providerFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("eventsday.php?") && url.includes("&l=4328")) {
      return response(allFixtures);
    }
    if (url.includes("eventsday.php?") && url.includes("&l=4396")) {
      return response([providerEvent({
        idEvent: "mobile-no-channel",
        idLeague: "4396",
        dateEvent: "2099-01-08",
        strHomeTeam: "Bradford City",
        strAwayTeam: "Cambridge United",
      })]);
    }
    return response([]);
  }) as typeof fetch;
  const dashboardServer = await startStaffDashboardServer(providerFetch);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ timezoneId: "UTC", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    const browserErrors = await openStaffDashboard(page, dashboardServer.baseUrl);
    const fixtureBar = page.locator("#fixturesBar");
    await page.locator("#fixturesStripCards [role='group']").first().waitFor();
    assert.equal(await fixtureBar.getByRole("group").count(), 5);
    const expandButton = fixtureBar.getByRole("button", { name: "View full schedule" });
    assert.equal(await expandButton.isVisible(), true);
    await expandButton.click();

    const fullPanel = page.locator("#fixturesFullPanel");
    await page.waitForFunction("document.querySelectorAll('#fixturesFullPanel [role=listitem]').length === 8");
    assert.equal(await fullPanel.getByRole("listitem").count(), 8);
    const fullText = await fullPanel.innerText();
    assert.match(fullText, /Home 1 vs Away 1/);
    assert.match(fullText, /International Sporting Association of West Yorkshire/);
    assert.match(fullText, /Premier League/);
    assert.match(fullText, /Sky Sports/);
    assert.match(fullText, /Channel not listed/);
    assert.equal(await expandButton.getAttribute("aria-expanded"), "true");
    assert(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"));
    await assertDashboardHasNoBrowserErrors(page, browserErrors);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    dashboardServer.restore();
    await closeServer(dashboardServer.server);
  }
});

test("browser smoke check politely announces changed fixture data once", async () => {
  const dashboardServer = await startStaffDashboardServer(
    (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("eventsnext.php?id=134189")) {
        return response([providerEvent({
          idEvent: "bradford-announcement",
          idLeague: "4396",
          dateEvent: "2099-01-10",
          strTime: "12:34:00",
          strHomeTeam: "Bradford City",
          strAwayTeam: "Cambridge United",
          idHomeTeam: "134189",
          idAwayTeam: "134586",
          strTVStation: "BT Sport 1",
        })]);
      }
      return response([]);
    }) as typeof fetch,
  );
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ timezoneId: "UTC" });
  const page = await context.newPage();

  try {
    await page.addInitScript({
      content: `
        (() => {
          const pendingFixtureRefreshes = [];
          const originalSetTimeout = window.setTimeout.bind(window);
          window.__pendingFixtureRefreshes = pendingFixtureRefreshes;
          window.setTimeout = (handler, timeout, ...args) => {
            if (typeof handler === "function" && (timeout || 0) >= 60000) {
              pendingFixtureRefreshes.push(handler);
              return 0;
            }
            return originalSetTimeout(handler, timeout, ...args);
          };
        })();
      `,
    });
    const browserErrors = await openStaffDashboard(page, dashboardServer.baseUrl);
    await page.waitForFunction(`
      (() => {
        const bar = document.querySelector("#fixturesBar");
        return Boolean(bar && bar.style.display !== "none" && bar.querySelectorAll("div > div").length > 0);
      })()
    `);
    await page.route(`**${ROUTE}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ fixtures: [] }),
      });
    });

    const announcement = page.locator("#fixturesAnnouncement");
    assert.equal(await announcement.textContent(), "");
    const pendingRefresh = await page.evaluate(
      "window.__pendingFixtureRefreshes && window.__pendingFixtureRefreshes.length > 0",
    );
    assert.equal(pendingRefresh, true);

    await page.evaluate(`
      (() => {
        const refresh = window.__pendingFixtureRefreshes.pop();
        if (!refresh) throw new Error("fixture refresh timer was not captured");
        refresh();
      })()
    `);
    await page.waitForFunction(
      `document.querySelector("#fixturesAnnouncement")?.textContent ===
        "Fixture schedule updated: 1 fixture removed; no upcoming fixtures."`,
    );
    assert.equal(await page.locator("#fixturesBar").evaluate((bar) => bar?.style.display), "none");

    const announcementAfterChange = await announcement.textContent();
    await page.evaluate(`
      (() => {
        const refresh = window.__pendingFixtureRefreshes.pop();
        if (!refresh) throw new Error("fixture refresh timer was not captured");
        refresh();
      })()
    `);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    assert.equal(await announcement.textContent(), announcementAfterChange);
    await assertDashboardHasNoBrowserErrors(page, browserErrors);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    dashboardServer.restore();
    await closeServer(dashboardServer.server);
  }
});

test("browser smoke check stays quiet for an empty schedule and warns on feed failure", async () => {
  const dashboardServer = await startStaffDashboardServer(
    (async () => response([])) as typeof fetch,
  );
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ timezoneId: "UTC" });

  try {
    for (const fixtureFailure of [false, true]) {
      invalidateFixturesCache();
      globalThis.fetch = fixtureFailure
        ? (async () => { throw new Error("fixture provider unavailable"); }) as typeof fetch
        : (async () => response([])) as typeof fetch;
      await loadFixturesWithTestClock();
      const page = await context.newPage();
      try {
        if (fixtureFailure) {
          await page.addInitScript({
            content: `
              (() => {
                const pendingFixtureRefreshes = [];
                const originalSetTimeout = window.setTimeout.bind(window);
                window.__pendingFixtureRefreshes = pendingFixtureRefreshes;
                window.setTimeout = (handler, timeout, ...args) => {
                  if (typeof handler === "function" && (timeout || 0) >= 60000) {
                    pendingFixtureRefreshes.push(handler);
                    return 0;
                  }
                  return originalSetTimeout(handler, timeout, ...args);
                };
              })();
            `,
          });
        }
        const browserErrors = await openStaffDashboard(page, dashboardServer.baseUrl);
        if (fixtureFailure) {
          await page.locator("#fixturesBar [role='alert']").waitFor();
          assert.match(await page.locator("#fixturesBar").innerText(), /Fixture schedule unavailable or incomplete/);
          assert.match(await page.locator("#fixturesBar").innerText(), /No successful refresh recorded yet/);
        } else {
          await page.waitForFunction(`
            (() => {
              const bar = document.querySelector("#fixturesBar");
              return bar?.style.display === "none";
            })()
          `);
          assert.equal(await page.locator("#fixturesBar [role='alert']").count(), 0);
        }
        assert.equal(await page.locator("#topbarTitle").innerText(), "Bookings");
        assert.equal(await page.locator("#pageBookings").isVisible(), true);
        if (fixtureFailure) {
          globalThis.fetch = (async () => response([])) as typeof fetch;
          invalidateFixturesCache();
          await loadFixturesWithTestClock();
          await page.evaluate(`
            (() => {
              const refresh = window.__pendingFixtureRefreshes?.pop();
              if (!refresh) throw new Error("fixture retry timer was not captured");
              refresh();
            })()
          `);
          await page.waitForFunction(
            `document.querySelector("#fixturesBar")?.style.display === "none"`,
          );
          assert.equal(await page.locator("#fixturesBar [role='alert']").count(), 0);
        }
        await assertDashboardHasNoBrowserErrors(page, browserErrors);
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
    dashboardServer.restore();
    await closeServer(dashboardServer.server);
  }
});