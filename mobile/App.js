import React, { useEffect } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';

import { SidebarProvider } from './src/context/SidebarContext';
import { GenerationProvider } from './src/context/GenerationContext';
import { AuthProvider } from './src/context/AuthContext';
import { GameProvider } from './src/context/GameContext';
import Navigation from './src/navigation';
import VoidIntro from './src/components/VoidIntro';

SplashScreen.preventAutoHideAsync();

/**
 * Inject global CSS for crisp retro font rendering on web.
 *
 * Browsers anti-alias fonts by default. For the pixel/terminal aesthetic,
 * we disable smoothing on monospace text (SpaceMono) so edges stay hard and
 * blocky. Sans-serif body text (DM Sans) keeps standard antialiasing
 * for readability. Called once at app startup — idempotent.
 */
function injectWebHead() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('voidtv-head')) return;

  // Mark as injected
  var marker = document.createElement('meta');
  marker.id = 'voidtv-head';
  document.head.appendChild(marker);

  // ── Theme color — prevents white flash on Chrome/Android ──
  var tc = document.createElement('meta');
  tc.name = 'theme-color';
  tc.content = '#0c0c0f';
  document.head.appendChild(tc);

  // ── Page title ──
  document.title = 'VOIDtv';

  // ── Preconnect to external domains for faster first-request ──
  ['https://archive.org', 'https://api.voidtv.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'].forEach(function (href) {
    var link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    if (href.includes('gstatic')) link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });

  // ── DNS prefetch for archive thumbnail CDN ──
  var dns = document.createElement('link');
  dns.rel = 'dns-prefetch';
  dns.href = 'https://ia800100.us.archive.org';
  document.head.appendChild(dns);
}

function injectRetroCss() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  var id = 'voidtv-retro-css';
  if (document.getElementById(id)) return;
  var s = document.createElement('style');
  s.id = id;
  s.textContent = [
    '/* ═══ VOIDtv — Crisp Retro Font & Icon Rendering ═══ */',
    '',
    '/* ── 1. Global baseline: geometric precision for all text ── */',
    '*, *::before, *::after {',
    '  text-rendering: geometricPrecision;',
    '  -webkit-tap-highlight-color: transparent;',
    '}',
    '',
    '/* ── Kill horizontal scroll + iOS sideways rubberbanding ── */',
    'html, body {',
    '  overflow-x: hidden !important;',
    '  max-width: 100vw !important;',
    '  overscroll-behavior: none !important;',
    '}',
    '#root, #root > div { max-width: 100vw; overflow-x: hidden; }',
    '',
    '/* ── 2. Pixel-crisp monospace: disable anti-aliasing ── */',
    '/* SpaceMono = all labels, titles, chips, metadata. */',
    '/* RN Web inlines font-family, so attribute selectors work. */',
    '[style*="SpaceMono"], [style*="monospace"] {',
    '  -webkit-font-smoothing: none !important;',
    '  -moz-osx-font-smoothing: unset !important;',
    '  font-smooth: never !important;',
    '  text-rendering: geometricPrecision !important;',
    '}',
    '',
    '/* ── 3. Sans-serif body: keep antialiased for readability ── */',
    '[style*="DMSans"], [style*="DM Sans"], [style*="system-ui"] {',
    '  -webkit-font-smoothing: antialiased !important;',
    '  -moz-osx-font-smoothing: grayscale !important;',
    '  text-rendering: optimizeLegibility !important;',
    '}',
    '',
    '/* ── 4. Font display: swap prevents FOIT (flash of invisible text) ── */',
    '@font-face { font-family: SpaceMono_400Regular; font-display: swap; }',
    '@font-face { font-family: SpaceMono_700Bold;    font-display: swap; }',
    '@font-face { font-family: DMSans_400Regular;    font-display: swap; }',
    '@font-face { font-family: DMSans_500Medium;     font-display: swap; }',
    '@font-face { font-family: DMSans_600SemiBold;   font-display: swap; }',
    '',
    '/* ── 5. Archive thumbnails: crisp nearest-neighbor scaling ── */',
    '/* Gives low-res archive thumbnails a retro pixel-art feel. */',
    'img[src*="archive.org"] {',
    '  image-rendering: -webkit-optimize-contrast;',
    '  image-rendering: crisp-edges;',
    '}',
    '',
    '/* ── 6. Icon consistency: vector icons inherit text color ── */',
    '/* Ionicons are already SVG — this ensures they flex-align. */',
    'svg { vertical-align: middle; }',
    '',
    '/* ── 7. Selection color matches brand ── */',
    '::selection { background: rgba(92, 184, 255, 0.3); color: #e4e2dc; }',
    '',
    '/* ── 8. Scrollbar — minimal dark track ── */',
    '::-webkit-scrollbar { width: 6px; height: 6px; }',
    '::-webkit-scrollbar-track { background: transparent; }',
    '::-webkit-scrollbar-thumb { background: #26262e; border-radius: 3px; }',
    '::-webkit-scrollbar-thumb:hover { background: #36363e; }',
    '',
    '/* ── 9. Focus outline — neon ring for keyboard nav ── */',
    ':focus-visible { outline: 2px solid #5cb8ff; outline-offset: 2px; }',
  ].join('\n');
  document.head.appendChild(s);
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });

  // Inject web head tags and retro CSS as early as possible
  useEffect(() => { injectWebHead(); injectRetroCss(); }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SidebarProvider>
          <GenerationProvider>
            <AuthProvider>
              <GameProvider>
                <StatusBar style="light" />
                <Navigation />
                <VoidIntro />
              </GameProvider>
            </AuthProvider>
          </GenerationProvider>
        </SidebarProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
