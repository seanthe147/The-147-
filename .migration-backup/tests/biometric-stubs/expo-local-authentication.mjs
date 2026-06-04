// State lives on globalThis so all importers share the same configuration
// and call counters even if Node loads multiple instances of this module
// under different URLs (e.g. tsconfig paths vs. a register() resolve hook).
const STATE_KEY = Symbol.for("__test_expo_local_authentication__");

export const AuthenticationType = {
  FINGERPRINT: 1,
  FACIAL_RECOGNITION: 2,
  IRIS: 3,
};

if (!globalThis[STATE_KEY]) {
  globalThis[STATE_KEY] = {
    hasHardware: true,
    isEnrolled: true,
    supportedTypes: [AuthenticationType.FACIAL_RECOGNITION],
    authResult: { success: true },
    spy: { authenticateCalls: 0, lastPromptMessage: null },
  };
}
const state = globalThis[STATE_KEY];

export const __spy = state.spy;

export async function hasHardwareAsync() {
  return state.hasHardware;
}

export async function isEnrolledAsync() {
  return state.isEnrolled;
}

export async function supportedAuthenticationTypesAsync() {
  return state.supportedTypes;
}

export async function authenticateAsync(opts) {
  state.spy.authenticateCalls++;
  state.spy.lastPromptMessage = opts?.promptMessage ?? null;
  return state.authResult;
}

export function __setHasHardware(v) { state.hasHardware = v; }
export function __setIsEnrolled(v) { state.isEnrolled = v; }
export function __setAuthResult(v) { state.authResult = v; }
export function __reset() {
  state.hasHardware = true;
  state.isEnrolled = true;
  state.supportedTypes = [AuthenticationType.FACIAL_RECOGNITION];
  state.authResult = { success: true };
  state.spy.authenticateCalls = 0;
  state.spy.lastPromptMessage = null;
}

export default {
  AuthenticationType,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
  authenticateAsync,
};
