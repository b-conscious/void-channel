/**
 * Metro configuration for Void Channel.
 *
 * Key customisation: on web builds, `react-native-reanimated` and
 * `react-native-worklets` are replaced with lightweight shims.
 *
 * WHY — react-native-gesture-handler's GestureDetector transitively
 * requires reanimated (via reanimatedWrapper.js). Metro bundles the
 * entire module even though the require sits inside a try/catch.
 * Reanimated v4's initialization code (worklets, native-module
 * registration, closure-heavy setup) produces a TDZ crash
 * (`Cannot access '$e' before initialization`) when the bundle is
 * minified for production web. The shim prevents the module from
 * ever entering the bundle.
 */

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const REANIMATED_SHIM = path.resolve(
  __dirname,
  "src/shims/reanimated-web.js"
);

// A minimal no-op shim for react-native-worklets on web.
// Worklets is only useful on native (JSI); on web it only adds dead code.
const WORKLETS_SHIM = path.resolve(
  __dirname,
  "src/shims/worklets-web.js"
);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Only shim on web — native builds use the real modules.
  if (platform === "web") {
    if (
      moduleName === "react-native-reanimated" ||
      moduleName.startsWith("react-native-reanimated/")
    ) {
      return { type: "sourceFile", filePath: REANIMATED_SHIM };
    }
    if (
      moduleName === "react-native-worklets" ||
      moduleName.startsWith("react-native-worklets/")
    ) {
      return { type: "sourceFile", filePath: WORKLETS_SHIM };
    }
  }

  // Fall back to the default resolver for everything else.
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
