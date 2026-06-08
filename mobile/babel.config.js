module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Reanimated v4 moved its worklet plugin to react-native-worklets
    plugins: ["react-native-worklets/plugin"],
  };
};
