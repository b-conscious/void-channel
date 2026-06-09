/**
 * Lightweight shim for react-native-reanimated on web.
 *
 * react-native-gesture-handler's GestureDetector transitively imports
 * reanimated via reanimatedWrapper.js. On web, reanimated's initialisation
 * code (worklets, native-module checks) causes a TDZ crash in minified
 * production bundles. This shim replaces the real module so the bundler
 * never includes it.
 *
 * Only the APIs that gesture-handler actually probes are stubbed:
 *   - useSharedValue (used to detect if reanimated is "real")
 *   - setGestureState (patched in by gesture-handler if missing)
 *   - default export (Animated namespace)
 *
 * react-native-screens' reanimated submodule is also satisfied by this shim —
 * it checks for useSharedValue / useEvent / ScreenTransition, gets undefined,
 * and falls back to non-animated code paths.
 */

const NOOP = () => {};
const IDENTITY = (v) => v;
const NOOP_HOOK = (init) => ({ value: init });

// Gesture-handler checks `Reanimated?.useSharedValue` — if falsy it falls back
// to a non-reanimated code path. We intentionally do NOT provide useSharedValue
// so that gesture-handler takes the fallback path.
//
// But if any other consumer needs a bare-minimum stub, uncomment below:
// export function useSharedValue(init) { return { value: init }; }

export function useAnimatedStyle(fn) { return fn(); }
export function useAnimatedProps(fn) { return fn(); }
export function useDerivedValue(fn) { return { value: fn() }; }
export function useAnimatedReaction() {}
export function useAnimatedRef() { return { current: null }; }
export function useAnimatedScrollHandler() { return NOOP; }
export function useEvent() { return NOOP; }
export function useHandler() { return { context: {}, doDependenciesDiffer: false, useWeb: true }; }
export function useFrameCallback() {}
export function useComposedEventHandler() { return NOOP; }
export function useReducedMotion() { return false; }
export function useScrollOffset() { return { value: 0 }; }

export function withTiming(toValue) { return toValue; }
export function withSpring(toValue) { return toValue; }
export function withDecay() { return 0; }
export function withDelay(_, anim) { return anim; }
export function withRepeat(anim) { return anim; }
export function withSequence(...args) { return args[args.length - 1]; }
export function withClamp(config, anim) { return anim; }
export function cancelAnimation() {}
export function defineAnimation() {}

export function runOnJS(fn) { return fn; }
export function runOnUI(fn) { return fn; }
export function makeMutable(init) { return { value: init }; }
export function createAnimatedComponent(Component) { return Component; }

export function interpolate(value) { return value; }
export const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
export const Extrapolate = Extrapolation;
export function interpolateColor(value) { return value; }
export function useInterpolateConfig() { return {}; }
export const ColorSpace = { RGB: 0, HSV: 1 };

export function measure() { return null; }
export function startScreenTransition() {}
export function finishScreenTransition() {}
export function setGestureState() {}

export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' };
export const SensorType = {};
export const IOSReferenceFrame = {};
export const InterfaceOrientation = {};
export const KeyboardState = {};
export const ReanimatedLogLevel = {};

export function configureReanimatedLogger() {}
export function getViewProp() { return Promise.resolve(undefined); }
export function isConfigured() { return false; }
export function isReanimated3() { return true; }
export function enableLayoutAnimations() {}
export function processColor(color) { return color; }
export function isColor() { return false; }
export function convertToRGBA() { return [0, 0, 0, 0]; }
export function getStaticFeatureFlag() { return undefined; }
export function setDynamicFeatureFlag() {}

export const Easing = {
  linear: IDENTITY, ease: IDENTITY,
  quad: IDENTITY, cubic: IDENTITY,
  poly: () => IDENTITY, sin: IDENTITY, circle: IDENTITY,
  exp: IDENTITY, elastic: () => IDENTITY,
  back: () => IDENTITY, bounce: IDENTITY,
  bezier: () => IDENTITY, bezierFn: () => IDENTITY,
  steps: () => IDENTITY,
  in: (fn) => fn, out: (fn) => fn, inOut: (fn) => fn,
};

export class FlatList {
  static displayName = 'ReanimatedFlatList';
}
export class ScrollView {
  static displayName = 'ReanimatedScrollView';
}
export class Image {
  static displayName = 'ReanimatedImage';
}
export class View {
  static displayName = 'ReanimatedView';
}
export class Text {
  static displayName = 'ReanimatedText';
}

// Re-export ScreenTransition as undefined so react-native-screens detects
// that reanimated isn't available and uses its non-animated code path.
export const ScreenTransition = undefined;

export function LayoutAnimationConfig() { return null; }
export function PerformanceMonitor() { return null; }
export function ReducedMotionConfig() { return null; }

const Animated = {
  View, Text, Image, ScrollView, FlatList,
  createAnimatedComponent,
};

export default Animated;
