/** Cache by database inputs, not just time, so edits on any server invalidate estimates. */
export function stockLiveCache<T>(ttlMs = 300_000, clock = Date.now) {
  let cached: { key: string; at: number; value: T } | undefined;
  let pending: { key: string; promise: Promise<T> } | undefined;
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    if (cached?.key === key && clock() - cached.at < ttlMs) return cached.value;
    if (pending?.key === key) return pending.promise;
    const request = { key, promise: Promise.resolve().then(load) };
    pending = request;
    try {
      const value = await request.promise;
      // An older in-flight calculation must not replace a newer snapshot.
      if (pending === request) cached = { key, at: clock(), value };
      return value;
    } finally {
      if (pending === request) pending = undefined;
    }
  };
}
