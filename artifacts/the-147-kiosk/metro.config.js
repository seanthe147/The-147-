const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;

// The kiosk contains its own copies of all shared code, so it only
// needs to watch its own directory — not the entire workspace root.
// This avoids hitting the inotify file-watcher limit (ENOSPC) when
// the main Expo app is also running.
const config = getDefaultConfig(projectRoot);

// Do NOT add workspaceRoot to watchFolders — that's what triggers ENOSPC.
config.watchFolders = [projectRoot];

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, "node_modules"),
    // Fall back to root node_modules for any shared tooling
    path.resolve(__dirname, "../../node_modules"),
  ],
};

module.exports = config;
