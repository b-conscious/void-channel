/**
 * No-op shim for react-native-worklets on web.
 *
 * Worklets depend on JSI (native C++ bridge) which doesn't exist in the
 * browser. This shim satisfies import resolution so the module never
 * gets bundled.
 */

export function makeShareable(value) { return value; }
export function makeShareableCloneRecursive(value) { return value; }
export function makeShareableCloneOnUIRecursive(value) { return value; }
export const shareableMappingCache = new Map();
export function isShareableRef() { return false; }

export function runOnJS(fn) { return fn; }
export function runOnUI(fn) { return fn; }
export function runOnUIAsync(fn) { return Promise.resolve(fn()); }
export function runOnUISync(fn) { return fn; }
export function executeOnUIRuntimeSync(fn) { return fn; }
export function scheduleOnUI() {}
export function scheduleOnRN() {}
export function callMicrotasks() {}

export function createWorkletRuntime() { return null; }
export function runOnRuntime(runtime, fn) { return fn; }

export function isWorkletFunction() { return false; }
export function isSynchronizable() { return false; }

export function createSerializable(value) { return value; }
export function isSerializableRef() { return false; }
export const serializableMappingCache = new Map();
export function createSynchronizable(value) { return { value }; }

export function getStaticFeatureFlag() { return undefined; }
export function setDynamicFeatureFlag() {}

export const RuntimeKind = { ReactNative: 0, Worklet: 1 };
export function getRuntimeKind() { return RuntimeKind.ReactNative; }

export const WorkletsModule = null;
