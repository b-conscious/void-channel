module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // Disable the reanimated/worklets babel plugin — it transforms closures
          // into worklets that cause TDZ crash ('Cannot access $e before initialization')
          // in minified production web bundles. react-native-screens ships pre-compiled
          // worklets so the plugin is not needed for navigation transitions.
          reanimated: false,
        },
      ],
    ],
  };
};
