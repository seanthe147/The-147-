import assert from "node:assert/strict";
import test from "node:test";
import { getFixtureFeedStatus, getUpcomingFixtures, invalidateFixturesCache } from "./sports-fixtures.ts";

const originalFetch = globalThis.fetch;

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
    idHomeTeam: "home-id",
    idAwayTeam: "away-id",
    strHomeTeamBadge: "https://example.com/home.png",
    strAwayTeamBadge: "https://example.com/away.png",
    ...overrides,
  };
}

function response(events: Record<string, unknown>[]): Response {
  return new Response(JSON.stringify({ events }), {
    headers: { "content-type": "application/json" },
  });
}

test("prioritizes confirmed Bradford and Leeds TV fixtures and deduplicates league copies", async () => {
  invalidateFixturesCache();
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
      return response([
        ...Array.from({ length: 5 }, (_, index) => providerEvent({
          idEvent: `general-${index + 1}`,
          dateEvent: `2099-01-0${index + 1}`,
        })),
        providerEvent({
          idEvent: "leeds-tv",
          dateEvent: "2099-01-11",
          strHomeTeam: "Brighton and Hove Albion",
          strAwayTeam: "Leeds United",
          idHomeTeam: "133619",
          idAwayTeam: "133635",
        }),
      ]);
    }
    return response([]);
  }) as typeof fetch;

  try {
    const fixtures = await getUpcomingFixtures(3);
    assert.deepEqual(fixtures.map((fixture) => fixture.id), [
      "general-1",
      "bradford-tv",
      "leeds-tv",
    ]);
    assert.equal(fixtures[1].channel, "TNT Sports");
    assert.equal(fixtures[2].channel, "Sky Sports");
    assert.equal(fixtures[0].homeLogo, "https://example.com/home.png");
  } finally {
    globalThis.fetch = originalFetch;
    invalidateFixturesCache();
  }
});

test("uses the documented public key and retains both Friday and Sunday fixtures", async () => {
  invalidateFixturesCache();
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-10-28T12:00:00Z");
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.endsWith("eventsday.php?d=2026-10-30&l=4329")) {
      return response([providerEvent({
        idEvent: "friday-sheffield-wrexham",
        idLeague: "4329",
        dateEvent: "2026-10-30",
        strTime: "20:00:00",
        strHomeTeam: "Sheffield United",
        strAwayTeam: "Wrexham",
      })]);
    }
    if (url.endsWith("eventsday.php?d=2026-11-01&l=4328")) {
      return response([providerEvent({
        idEvent: "sunday-liverpool-arsenal",
        idLeague: "4328",
        dateEvent: "2026-11-01",
        strTime: "16:30:00",
        strHomeTeam: "Liverpool",
        strAwayTeam: "Arsenal",
      })]);
    }
    return response([]);
  }) as typeof fetch;

  try {
    const fixtures = await getUpcomingFixtures(5);
    assert.deepEqual(
      fixtures.map((fixture) => fixture.id),
      ["friday-sheffield-wrexham", "sunday-liverpool-arsenal"],
    );
    assert(requestedUrls.length <= 25, "public API calls should leave headroom under its per-minute limit");
    assert(requestedUrls.every((url) => url.includes("/json/123/")), "must use the current public key");
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    invalidateFixturesCache();
  }
});

test("does not promote unconfirmed or malformed team events", async () => {
  invalidateFixturesCache();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("eventsnext.php?id=134189")) {
      return response([
        providerEvent({
          idEvent: "bradford-not-confirmed",
          idLeague: "4396",
          strHomeTeam: "Bradford City",
          idHomeTeam: "134189",
          strTVStation: null,
        }),
        providerEvent({
          idEvent: "bradford-malformed",
          idLeague: "4396",
          dateEvent: "not-a-date",
          strHomeTeam: "Bradford City",
          idHomeTeam: "134189",
          strTVStation: "TNT Sports",
        }),
      ]);
    }
    return response([]);
  }) as typeof fetch;

  try {
    assert.deepEqual(await getUpcomingFixtures(5), []);
  } finally {
    globalThis.fetch = originalFetch;
    invalidateFixturesCache();
  }
});

test("keeps general fixtures available when a team provider request fails", async () => {
  invalidateFixturesCache();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("eventsnext.php?id=134189")) {
      throw new Error("temporary provider outage");
    }
    if (url.includes("eventsday.php?") && url.includes("&l=4328")) {
      return response([providerEvent({ idEvent: "general-after-failure" })]);
    }
    return response([]);
  }) as typeof fetch;

  try {
    const fixtures = await getUpcomingFixtures(5);
    assert.deepEqual(fixtures.map((fixture) => fixture.id), ["general-after-failure"]);
    assert.equal(getFixtureFeedStatus().isDegraded, true);
    assert(getFixtureFeedStatus().failedRequestCount > 0);
  } finally {
    globalThis.fetch = originalFetch;
    invalidateFixturesCache();
  }
});


test("reports feed failures with the last complete refresh and clears them after recovery", async () => {
  invalidateFixturesCache();
  const originalNow = Date.now;
  let now = Date.parse("2026-10-28T12:00:00Z");
  Date.now = () => now;
  let shouldFail = false;
  globalThis.fetch = (async () => {
    if (shouldFail) throw new Error("temporary provider outage");
    return response([]);
  }) as typeof fetch;

  try {
    await getUpcomingFixtures(5);
    const successfulStatus = getFixtureFeedStatus();
    assert.equal(successfulStatus.isDegraded, false);
    assert.equal(successfulStatus.failedRequestCount, 0);
    assert.equal(successfulStatus.lastSuccessfulRefreshAt, new Date(now).toISOString());

    now += 5 * 60_001;
    shouldFail = true;
    await getUpcomingFixtures(5);
    const failedStatus = getFixtureFeedStatus();
    assert.equal(failedStatus.isDegraded, true);
    assert(failedStatus.failedRequestCount > 0);
    assert.equal(failedStatus.lastSuccessfulRefreshAt, successfulStatus.lastSuccessfulRefreshAt);

    now += 5 * 60_001;
    shouldFail = false;
    await getUpcomingFixtures(5);
    const recoveredStatus = getFixtureFeedStatus();
    assert.equal(recoveredStatus.isDegraded, false);
    assert.equal(recoveredStatus.failedRequestCount, 0);
    assert.equal(recoveredStatus.lastSuccessfulRefreshAt, new Date(now).toISOString());
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    invalidateFixturesCache();
  }
});