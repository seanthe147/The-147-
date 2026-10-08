function valueAt(object, field) {
  return field.split(".").reduce((value, key) => value?.[key], object);
}

function checkBuildToolchain({ config, eas, packageJson, pnpmVersion }) {
  const errors = [];
  const profiles = [
    ["eas.json production", eas.build?.production],
    ["embedded production", config.extra?.easConfig?.build?.production],
  ];
  const expoVersion =
    packageJson.dependencies?.expo ?? packageJson.devDependencies?.expo ?? "";
  const sdk = Number(expoVersion.match(/\d+/)?.[0]);
  if (!Number.isInteger(sdk)) errors.push("Cannot determine the declared Expo SDK.");

  for (const [name, profile] of profiles) {
    if (!profile) {
      errors.push(`${name}: build profile is missing.`);
      continue;
    }
    for (const field of ["node", "pnpm", "ios.image", "android.image"]) {
      if (!valueAt(profile, field)) errors.push(`${name}: explicitly select ${field}.`);
    }
    const image = profile.android?.image ?? "";
    const jdk = Number(image.match(/-jdk-(\d+)-/)?.[1]);
    if (!Number.isInteger(jdk) || jdk < 17) {
      errors.push(`${name}: Android image must explicitly provide JDK 17 or newer.`);
    }
    if (sdk >= 57 && !image.endsWith(`-sdk-${sdk}`)) {
      errors.push(`${name}: Android image must target the declared Expo SDK ${sdk}.`);
    }
    if (profile.pnpm !== pnpmVersion) {
      errors.push(`${name}: pnpm must match the verified local version ${pnpmVersion}.`);
    }
    if (profile.environment !== "production") {
      errors.push(`${name}: use the production environment.`);
    }
    if (profile.android?.buildType !== "app-bundle") {
      errors.push(`${name}: Android store builds must produce an app-bundle.`);
    }
  }
  if (profiles.every(([, profile]) => profile)) {
    for (const field of ["node", "pnpm", "ios.image", "android.image"]) {
      if (valueAt(profiles[0][1], field) !== valueAt(profiles[1][1], field)) {
        errors.push(`Production build routes disagree on ${field}.`);
      }
    }
  }
  return errors;
}

module.exports = { checkBuildToolchain };
