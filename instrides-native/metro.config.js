const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = true;

// Firebase v10 loads @firebase/component as both ESM (via browser field) and
// CJS (from within the RN auth build), creating two separate module instances
// with split component registries. Force a single CJS instance for all requires.
const firebaseComponentCjs = require.resolve('@firebase/component');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@firebase/component') {
    return { filePath: firebaseComponentCjs, type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
