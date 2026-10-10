const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');

// Force all Firebase packages to their CJS builds.
// expo-router 57 sets unstable_enablePackageExports:true, which resolves
// @firebase/component and @firebase/app to their ESM builds for some import
// paths. Two separate ESM+CJS instances of the same package break Firebase's
// global component registry, causing "Component auth has not been registered yet".
const firebaseCjsMap = {
  '@firebase/app': path.resolve(__dirname, 'node_modules/@firebase/app/dist/index.cjs.js'),
  '@firebase/auth': path.resolve(__dirname, 'node_modules/@firebase/auth/dist/rn/index.js'),
  '@firebase/firestore': path.resolve(__dirname, 'node_modules/@firebase/firestore/dist/index.rn.js'),
  '@firebase/component': path.resolve(__dirname, 'node_modules/@firebase/component/dist/index.cjs.js'),
  '@firebase/logger': path.resolve(__dirname, 'node_modules/@firebase/logger/dist/index.cjs.js'),
  '@firebase/util': path.resolve(__dirname, 'node_modules/@firebase/util/dist/index.cjs.js'),
};

const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (firebaseCjsMap[moduleName]) {
    const filePath = firebaseCjsMap[moduleName];
    // Only redirect if the file actually exists (avoids errors on version mismatches)
    try {
      require('fs').statSync(filePath);
      return { filePath, type: 'sourceFile' };
    } catch {
      // fall through to normal resolution
    }
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
