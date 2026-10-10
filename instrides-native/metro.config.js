const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = true;

// All @firebase/* packages must share the same CJS module instances so the
// component registry is never split between the auth RN build and @firebase/app.
// require.resolve() uses Node's main-field resolution (no browser field),
// giving consistent CJS paths that Metro deduplicates to single instances.
const _firebaseCache = new Map();
const resolveFirebaseCjs = (pkg) => {
  if (!_firebaseCache.has(pkg)) {
    try { _firebaseCache.set(pkg, require.resolve(pkg)); }
    catch { _firebaseCache.set(pkg, null); }
  }
  return _firebaseCache.get(pkg);
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@firebase/')) {
    const cjs = resolveFirebaseCjs(moduleName);
    if (cjs) return { filePath: cjs, type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
