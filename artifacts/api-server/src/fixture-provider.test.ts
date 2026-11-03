import assert from "node:assert/strict";
import test from "node:test";
import { createFixtureProvider } from "./fixture-provider.ts";

test("serializes calls and spaces request starts", async () => {
  let now = 0;
  const starts: number[] = [];
  const provider = createFixtureProvider({
    now: () => now, sleep: async ms => { now += ms; },
    fetch: (async () => { starts.push(now); return Response.json({ events: [] }); }) as typeof fetch,
  });
  await Promise.all(["a", "b", "c"].map(url => provider.get(url)));
  assert.deepEqual(starts, [0, 2500, 5000]);
});

for (const header of ["120", new Date(120_000).toUTCString()]) {
  test(`honors Retry-After ${header} without hitting provider for queued calls`, async () => {
    let now = 0;
    let calls = 0;
    const provider = createFixtureProvider({
      now: () => now, sleep: async ms => { now += ms; },
      fetch: (async () => {
        calls++;
        return calls === 1
          ? new Response("", { status: 429, headers: { "Retry-After": header } })
          : Response.json({ events: [] });
      }) as typeof fetch,
    });
    await Promise.allSettled(["a", "b", "c"].map(url => provider.get(url)));
    assert.equal(calls, 1);
    now = 119_999;
    await assert.rejects(provider.get("d"), /cooldown/);
    now = 120_000;
    assert.equal((await provider.get("a")).stale, false);
    assert.equal(calls, 2);
  });
}

test("retains per-source data on failure, replaces it on recovery, expires after 24 hours", async () => {
  let now = 0;
  let fail = false;
  let events: unknown[] = [{ idEvent: "saved" }];
  const provider = createFixtureProvider({
    now: () => now, sleep: async ms => { now += ms; },
    fetch: (async () => {
      if (fail) throw new Error("offline");
      return Response.json({ events });
    }) as typeof fetch,
  });
  await provider.get("a");
  fail = true;
  assert.deepEqual(await provider.get("a"), { json: { events }, stale: true });
  await assert.rejects(provider.get("b"), /offline/);
  fail = false;
  events = [];
  assert.deepEqual(await provider.get("a"), { json: { events: [] }, stale: false });
  fail = true;
  now += 24 * 60 * 60_000;
  await assert.rejects(provider.get("a"), /offline/);
});
