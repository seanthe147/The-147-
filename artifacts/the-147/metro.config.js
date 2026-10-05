const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

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
    // Exclude migration backup
    new RegExp(path.resolve(workspaceRoot, ".migration-backup") + "/.*"),
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
