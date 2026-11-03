import { mock } from "node:test";
import { getUpcomingFixtures } from "./sports-fixtures.ts";

// Advance only timer delays, leaving fixture-date assertions on their own clock.
export async function loadFixturesWithTestClock(limit: number | null = 5) {
  mock.timers.enable({ apis: ["setTimeout"] });
  let done = false;
  const result = getUpcomingFixtures(limit).finally(() => { done = true; });
  try {
    while (!done) {
      mock.timers.tick(10_000);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    return await result;
  } finally {
    mock.timers.reset();
  }
}
