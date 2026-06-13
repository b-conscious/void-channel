// JOB_19: the version handshake + install affordance (web only).
//
// THE HANDSHAKE is the cure for the stale-bundle phantom that has haunted this project: an
// old tab keeps running old JS against new APIs and throws ghost errors. We poll the backend's
// /api/version; when it changes from what we loaded with, we show a "new version, tap to
// refresh" banner. One tap reloads onto the fresh bundle. The class of bug dies.
//
// INSTALL: when the browser fires beforeinstallprompt (captured in App.injectWebHead), we offer
// a one-time "install" banner; installed PWAs open with sound and skip the intro gate.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { BASE_URL } from '../api/client';

const POLL_MS = 5 * 60 * 1000;

export default function VersionWatch() {
  if (Platform.OS !== 'web') return null;

  const [updateReady, setUpdateReady] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const baseVersion = useRef(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      fetch(`${BASE_URL}/api/version`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d || !d.version) return;
          if (baseVersion.current == null) baseVersion.current = d.version;     // first load: remember it
          else if (d.version !== baseVersion.current) setUpdateReady(true);     // changed: a deploy happened
        })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, POLL_MS);

    const onInstallable = () => { if (window.__voidInstallPrompt) setInstallable(true); };
    if (window.__voidInstallPrompt) setInstallable(true);
    window.addEventListener('void-installable', onInstallable);
    return () => { alive = false; clearInterval(t); window.removeEventListener('void-installable', onInstallable); };
  }, []);

  const doInstall = async () => {
    const p = window.__voidInstallPrompt;
    if (!p) return;
    setInstallable(false);
    try { p.prompt(); await p.userChoice; } catch (e) {}
    window.__voidInstallPrompt = null;
  };

  if (updateReady) {
    return (
      <View style={styles.bar} pointerEvents="box-none">
        <TouchableOpacity style={[styles.pill, styles.update]} activeOpacity={0.85} onPress={() => window.location.reload()}>
          <Text style={styles.pillText}>NEW VERSION READY — TAP TO REFRESH</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (installable && !dismissed) {
    return (
      <View style={styles.bar} pointerEvents="box-none">
        <TouchableOpacity style={[styles.pill, styles.install]} activeOpacity={0.85} onPress={doInstall}>
          <Text style={styles.pillText}>▸ INSTALL VOIDtv</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.x} hitSlop={10} onPress={() => setDismissed(true)}>
          <Text style={styles.xText}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: 14, zIndex: 9999, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  update: { backgroundColor: '#5cb8ff', borderColor: '#5cb8ff' },
  install: { backgroundColor: 'rgba(12,12,15,0.92)', borderColor: '#5cb8ff' },
  pillText: { fontFamily: 'SpaceMono_700Bold', fontSize: 11, letterSpacing: 1.2, color: '#08080b' },
  x: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'rgba(12,12,15,0.92)' },
  xText: { color: '#fff', fontSize: 13 },
});
