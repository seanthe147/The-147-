const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// On EAS cloud builds Metro needs to watch the workspace root so it can
// traverse pnpm virtual-store symlinks (node_modules/.pnpm/...).
// Locally, watching the workspace root triggers ENOSPC (inotify limit)
// when the main Expo app is also running, so we restrict to the kiosk dir.
config.watchFolders = process.env.EAS_BUILD
  ? [workspaceRoot]
  : [projectRoot];

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ],
};

module.exports = config;
