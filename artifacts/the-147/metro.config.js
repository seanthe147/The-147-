const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Include all workspace packages in Metro's watch list
config.watchFolders = [workspaceRoot];

config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts || [],
};

config.resolver = {
  ...config.resolver,
  blockList: [
    ...(Array.isArray(config.resolver?.blockList)
      ? config.resolver.blockList
      : config.resolver?.blockList
        ? [config.resolver.blockList]
        : []),
    // Exclude the entire .local directory (skills temp files, workflow logs, etc.)
    new RegExp(path.resolve(__dirname, ".local") + "/.*"),
    // Exclude migration backup
    new RegExp(path.resolve(workspaceRoot, ".migration-backup") + "/.*"),
  ],
  // Map @workspace/* packages to their source in the monorepo
  extraNodeModules: {
    "@workspace/db": path.resolve(workspaceRoot, "lib/db/src"),
    "@workspace/api-client-react": path.resolve(workspaceRoot, "lib/api-client-react/src"),
  },
  // Also search workspace node_modules
  nodeModulesPaths: [
    path.resolve(workspaceRoot, "node_modules"),
    path.resolve(projectRoot, "node_modules"),
  ],
};

module.exports = config;
