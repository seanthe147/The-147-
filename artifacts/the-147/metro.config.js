const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Include the whole workspace root so Metro can traverse node_modules
// across workspace packages. .local and .migration-backup are excluded
// via the watcher ignore function so Metro never tries to watch their
// deleted/stale subdirectories (which caused the ENOENT crash).
config.watchFolders = [workspaceRoot];

const localDir = path.resolve(workspaceRoot, ".local") + path.sep;
const backupDir = path.resolve(workspaceRoot, ".migration-backup") + path.sep;

config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts || [],
  ignore: (filePath) =>
    filePath.startsWith(localDir) || filePath.startsWith(backupDir),
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
