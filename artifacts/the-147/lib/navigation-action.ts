/**
 * Navigation is essential; haptics are optional. Never let a missing native
 * feedback module or a rejected feedback promise prevent a route change.
 */
export function runNavigationAction(
  navigate: () => void,
  feedback: () => void | Promise<unknown>,
): void {
  navigate();
  try {
    void Promise.resolve(feedback()).catch(() => {
      // Feedback failure must not affect navigation.
    });
  } catch {
    // Some native modules throw synchronously when unavailable.
  }
}
