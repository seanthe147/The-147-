// @ts-check
"use strict";

const REQUIRED = [
  {
    name: "EXPO_PUBLIC_API_BASE_URL",
    validate(value) {
      try {
        const url = new URL(value);
        return url.protocol === "https:";
      } catch {
        return false;
      }
    },
    hint: "must be a valid HTTPS URL (e.g. https://the-147.replit.app/api)",
  },
];

let failed = false;

for (const { name, validate, hint } of REQUIRED) {
  const value = process.env[name];
  if (!value) {
    console.error(`[validate-env] MISSING: ${name} — ${hint}`);
    failed = true;
  } else if (!validate(value)) {
    console.error(`[validate-env] INVALID: ${name}="${value}" — ${hint}`);
    failed = true;
  } else {
    console.log(`[validate-env] OK: ${name}=${value}`);
  }
}

if (failed) {
  console.error(
    "\n[validate-env] Pre-build validation failed. Set the missing variables in EAS before retrying.\n" +
      "See BUILD.md for instructions.",
  );
  process.exit(1);
}

console.log("[validate-env] All required environment variables are present.");
