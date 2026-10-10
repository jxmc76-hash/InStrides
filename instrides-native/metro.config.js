const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// .cjs extension support for Firebase packages
config.resolver.sourceExts.push('cjs');

// Force @firebase/component to always use its single CJS build.
// Without this, Expo's package-exports resolver can load the ESM build
// for some import paths, producing two component registries and causing
// "Component auth has not been registered yet" at runtime.
const firebaseComponentCjs = path.resolve(
  __dirname,
  'node_modules/@firebase/component/dist/index.cjs.js'
);
const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@firebase/component') {
    return { filePath: firebaseComponentCjs, type: 'sourceFile' };
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
