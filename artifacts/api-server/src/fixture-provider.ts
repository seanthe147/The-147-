// One paced queue per server process. A 429 stops the remaining queued calls
// rather than multiplying throttled requests or sleeping inside an HTTP route.
export function createFixtureProvider(options: {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
} = {}) {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let queue = Promise.resolve();
  let nextRequestAt = 0;
  let cooldownUntil = 0;
  const snapshots = new Map<string, { at: number; json: unknown }>();
  return {
    async get(url: string): Promise<{ json: any; stale: boolean }> {
      const request = queue.then(async () => {
        if (now() < cooldownUntil) throw new Error("TheSportsDB rate-limit cooldown");
        await sleep(Math.max(0, nextRequestAt - now()));
        if (now() < cooldownUntil) throw new Error("TheSportsDB rate-limit cooldown");
        nextRequestAt = now() + 2500;
        const response = await (options.fetch ?? globalThis.fetch)(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (response.status === 429) {
          const retry = response.headers.get("retry-after");
          const seconds = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) : NaN;
          const retryAt = Number.isFinite(seconds) ? now() + seconds * 1000 : Date.parse(retry ?? "");
          cooldownUntil = Math.max(now() + 60_000, Number.isFinite(retryAt) ? retryAt : 0);
        }
        if (!response.ok) throw new Error(`TheSportsDB HTTP ${response.status}`);
        const json = await response.json();
        if (!json || typeof json !== "object" || !("events" in json) ||
            (json.events !== null && !Array.isArray(json.events))) {
          throw new Error("TheSportsDB returned an invalid fixture response");
        }
        snapshots.set(url, { at: now(), json });
        return { json, stale: false };
      });
      queue = request.then(() => {}, () => {});
      try {
        return await request;
      } catch (error) {
        console.warn("[FIXTURES]", url, error instanceof Error ? error.message : String(error));
        const saved = snapshots.get(url);
        if (saved && now() - saved.at < 24 * 60 * 60_000) return { json: saved.json, stale: true };
        throw error;
      } finally {
        for (const [key, value] of snapshots) {
          if (now() - value.at >= 24 * 60 * 60_000) snapshots.delete(key);
        }
      }
    },
  };
}
