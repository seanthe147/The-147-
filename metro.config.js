/**
 * Workspace-root metro.config.js
 *
 * EAS cloud builds invoke `pnpm expo export:embed` from the workspace root
 * rather than from artifacts/the-147-kiosk/, so Metro never finds the
 * kiosk's own metro.config.js.  Delegating here ensures Metro always gets
 * the correct projectRoot (__dirname inside the kiosk config resolves to
 * artifacts/the-147-kiosk/ regardless of where Metro was invoked from).
 *
 * Local dev: each app runs Metro from its own package directory and picks
 * up its own metro.config.js first — this file is never loaded locally.
 */
module.exports = require("./artifacts/the-147-kiosk/metro.config.js");
