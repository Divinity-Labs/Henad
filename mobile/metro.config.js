const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

/**
 * Metro, taught about the pnpm workspace.
 *
 * Two things break without this. Metro only watches the app directory by default, so
 * edits to `packages/core` would not rebuild and, worse, would not resolve at all. And
 * pnpm does not flatten `node_modules`, so a dependency hoisted to the workspace root is
 * invisible from `mobile/node_modules` unless the root is on the resolver path.
 *
 * `@henad/core` is published as TypeScript source rather than built output, which Metro
 * compiles happily — the same arrangement `transpilePackages` handles on the web side.
 */
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')]
// pnpm's store is a tree of symlinks; following them is how a linked workspace package
// resolves its own dependencies rather than the app's.
config.resolver.unstable_enableSymlinks = true

// Hierarchical lookup stays ON, which is the opposite of the usual monorepo advice. That
// advice is written for npm and yarn, where a flat node_modules makes walking up the tree
// wasteful. pnpm is the reverse: every package keeps its own nested node_modules of
// symlinks, and turning the walk off means a package in the store cannot resolve its own
// dependencies. Disabling it here breaks expo-crypto's import of expo-modules-core.
config.resolver.disableHierarchicalLookup = false

module.exports = config
