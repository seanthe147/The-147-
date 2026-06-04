// Resolve hook (registered by loader.mjs) that redirects a few RN-only
// modules to local in-memory stubs so lib/biometric.ts can be loaded
// inside plain Node.
import { pathToFileURL } from "node:url";
import { resolve as pathResolve } from "node:path";

const here = pathResolve(process.cwd(), "tests", "biometric-stubs");

const map = {
  "expo-secure-store": pathToFileURL(pathResolve(here, "expo-secure-store.mjs")).href,
  "expo-local-authentication": pathToFileURL(pathResolve(here, "expo-local-authentication.mjs")).href,
  "react-native": pathToFileURL(pathResolve(here, "react-native.mjs")).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(map, specifier)) {
    return { url: map[specifier], shortCircuit: true, format: "module" };
  }
  return nextResolve(specifier, context);
}
