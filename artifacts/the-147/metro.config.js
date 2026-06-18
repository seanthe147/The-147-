const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Only watch the directories Metro actually needs. Listing them explicitly
// keeps .local, .migration-backup, and any other hidden/temp dirs out of
// Metro's watch scope entirely, avoiding ENOENT crashes on stale paths.
config.watchFolders = [
  path.resolve(workspaceRoot, "lib"),
  path.resolve(workspaceRoot, "artifacts"),
  path.resolve(workspaceRoot, "scripts"),
  path.resolve(workspaceRoot, "node_modules"),
];

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

// Enable inline requires so module evaluation is deferred until first use.
// This reduces the effective JS weight Googlebot must parse on first load by
// avoiding eager evaluation of modules that are only needed for non-visible
// routes. inlineRequires is already the React Native default; this makes it
// explicit and applies it to the web target too.
config.transformer = {
  ...config.transformer,
  inlineRequires: true,
};

module.exports = config;
