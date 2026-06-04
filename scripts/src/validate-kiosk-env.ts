const REQUIRED: Array<{ name: string; validate: (v: string) => boolean; hint: string }> = [
  {
    name: "EXPO_PUBLIC_API_BASE_URL",
    validate: (v) => {
      try {
        return new URL(v).protocol === "https:";
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
    console.error(`[validate-kiosk-env] MISSING: ${name} — ${hint}`);
    failed = true;
  } else if (!validate(value)) {
    console.error(`[validate-kiosk-env] INVALID: ${name}="${value}" — ${hint}`);
    failed = true;
  } else {
    console.log(`[validate-kiosk-env] OK: ${name}=${value}`);
  }
}

if (failed) {
  console.error(
    "\n[validate-kiosk-env] Pre-build validation failed. Set the missing variables in EAS before retrying.\n" +
      "See artifacts/the-147-kiosk/BUILD.md for instructions.",
  );
  process.exit(1);
}

console.log("[validate-kiosk-env] All required environment variables are present.");
