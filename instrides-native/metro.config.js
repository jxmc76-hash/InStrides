const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// .cjs extension support for Firebase packages
config.resolver.sourceExts.push('cjs');

module.exports = config;
