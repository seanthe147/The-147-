// State lives on globalThis so all importers share the same store even
// if Node loads multiple instances of this module under different URLs
// (e.g. via tsconfig paths vs. a register() resolve hook).
const STATE_KEY = Symbol.for("__test_expo_secure_store__");
if (!globalThis[STATE_KEY]) {
  globalThis[STATE_KEY] = { store: new Map() };
}
const state = globalThis[STATE_KEY];

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = "WHEN_UNLOCKED_THIS_DEVICE_ONLY";

export async function getItemAsync(key) {
  return state.store.has(key) ? state.store.get(key) : null;
}

export async function setItemAsync(key, value) {
  state.store.set(key, value);
}

export async function deleteItemAsync(key) {
  state.store.delete(key);
}

export function __reset() {
  state.store.clear();
}

export default {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
};
