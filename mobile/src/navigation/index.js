import React, { Suspense, useState, useMemo } from 'react';
import { NavigationContainer, useNavigationContainerRef, getPathFromState as defaultGetPathFromState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Platform, View, Text, ActivityIndicator, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import DrawerMenu from '../components/DrawerMenu';

var IS_DESKTOP = Platform.OS === 'web' && Dimensions.get('window').width > 900;

// HomeScreen loads eagerly — it's the first thing the user sees
import HomeScreen from '../screens/HomeScreen';

// Everything else lazy-loads — only parsed when navigated to
const SearchScreen = React.lazy(() => import('../screens/SearchScreen'));
const SignalScreen = React.lazy(() => import('../screens/SignalScreen'));
const WatchlistScreen = React.lazy(() => import('../screens/WatchlistScreen'));
const PlayerScreen = React.lazy(() => import('../screens/PlayerScreen'));
const AuthScreen = React.lazy(() => import('../screens/AuthScreen'));
const PlaylistScreen = React.lazy(() => import('../screens/PlaylistScreen'));
const PlaylistsListScreen = React.lazy(() => import('../screens/PlaylistsListScreen'));
const AdminScreen = React.lazy(() => import('../screens/AdminScreen'));

import { useGeneration } from '../context/GenerationContext';
import { useKids } from '../context/KidsContext';
import { colors, fonts } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Search is no longer a tab — it lives in the persistent TopBar (input) + a Stack results screen.
const TAB_CONFIG = {
  Browse:  { default: 'tv-outline',       focused: 'tv' },
  Signal:  { default: 'compass-outline',  focused: 'compass' },
  'My Void':{ default: 'bookmark-outline', focused: 'bookmark' },
};

// Each tab glows in its own unique color —
// desaturated when idle, bright + glow when selected.
var TAB_COLORS = {
  Browse:    '#5cb8ff',   // brand blue — home base
  Signal:    '#4ade80',   // emerald — radar / signal
  'My Void': '#f5a623',   // amber gold — personal vault
};

// Minimal loading fallback — just the background color
function ScreenFallback() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.textMuted} size="small" />
    </View>
  );
}

// Wrap lazy components for React Navigation compatibility
function LazySearch(props) { return <Suspense fallback={<ScreenFallback />}><SearchScreen {...props} /></Suspense>; }
function LazySignal(props) { return <Suspense fallback={<ScreenFallback />}><SignalScreen {...props} /></Suspense>; }
function LazyWatchlist(props) { return <Suspense fallback={<ScreenFallback />}><WatchlistScreen {...props} /></Suspense>; }
function LazyPlayer(props) { return <Suspense fallback={<ScreenFallback />}><PlayerScreen {...props} /></Suspense>; }
function LazyAuth(props) { return <Suspense fallback={<ScreenFallback />}><AuthScreen {...props} /></Suspense>; }
function LazyPlaylist(props) { return <Suspense fallback={<ScreenFallback />}><PlaylistScreen {...props} /></Suspense>; }
function LazyPlaylists(props) { return <Suspense fallback={<ScreenFallback />}><PlaylistsListScreen {...props} /></Suspense>; }
function LazyAdmin(props) { return <Suspense fallback={<ScreenFallback />}><AdminScreen {...props} /></Suspense>; }

function TabBackground() {
  if (Platform.OS === 'ios') {
    return <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />;
}

function TabNavigator() {
  // VOIDtv KIDS: Browse is the only world. Signal (community) and My Void (history that may
  // predate the toggle) do not exist as tabs in kids mode.
  var { kidsMode } = useKids();
  // On desktop the bottom tab bar is hidden — nav lives in the persistent TopBar + drawer.
  var desktopProps = IS_DESKTOP ? {
    tabBar: function () { return null; },
  } : {};

  return (
    <Tab.Navigator
      {...desktopProps}
      screenOptions={({ route }) => {
        var tabColor = TAB_COLORS[route.name] || colors.amber;
        var cfg = TAB_CONFIG[route.name] || { default: 'ellipse-outline', focused: 'ellipse' };

        return {
          headerShown: false,
          header: () => null,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bg,
            borderTopColor: colors.surface,
            borderTopWidth: StyleSheet.hairlineWidth,
            elevation: 0,
            height: Platform.OS === 'ios' ? 84 : 64,
            paddingBottom: Platform.OS === 'ios' ? 22 : 6,
            paddingTop: 6,
          },
          tabBarBackground: () => <TabBackground />,
          tabBarIcon: ({ focused }) => {
            var iconName = focused ? cfg.focused : cfg.default;
            var iconColor = focused ? tabColor : tabColor + '55';
            var glowStyle = focused ? {
              textShadowColor: tabColor,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: Platform.OS === 'web' ? 14 : 8,
            } : {};
            return (
              <Ionicons
                name={iconName}
                size={26}
                color={iconColor}
                style={glowStyle}
              />
            );
          },
          tabBarLabel: ({ focused }) => {
            var labelColor = focused ? tabColor : tabColor + '55';
            var glowStyle = focused ? {
              textShadowColor: tabColor,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: Platform.OS === 'web' ? 10 : 5,
            } : {};
            return (
              <Text style={[{
                fontFamily: fonts.mono,
                fontSize: 10,
                letterSpacing: 1.2,
                color: labelColor,
                marginBottom: Platform.OS === 'android' ? 4 : 0,
              }, glowStyle]}>
                {route.name.toUpperCase()}
              </Text>
            );
          },
        };
      }}
    >
      <Tab.Screen name="Browse"   component={HomeScreen} />
      {!kidsMode && <Tab.Screen name="Signal"   component={LazySignal} />}
      {!kidsMode && <Tab.Screen name="My Void"  component={LazyWatchlist} />}
    </Tab.Navigator>
  );
}

// ── Synthesizes a navigation object for the persistent chrome (TopBar + DrawerMenu).
// They render OUTSIDE the Stack so they have no screen `navigation` prop; this bridges
// to navigationRef. (Mirrors the old PersistentSidebar bridge, now with param
// pass-through so the drawer can send Browse a `chip` param.)
var TAB_NAMES = ['Browse', 'Signal', 'My Void'];

function makeNav(navigationRef) {
  return {
    navigate: function (name, params) {
      if (!navigationRef || !navigationRef.isReady()) return;
      if (TAB_NAMES.indexOf(name) >= 0) {
        navigationRef.navigate('Main', { screen: name, params: params });
      } else {
        navigationRef.navigate(name, params);
      }
    },
    getParent: function () {
      return {
        navigate: function (screen, params) {
          if (navigationRef && navigationRef.isReady()) navigationRef.navigate(screen, params);
        },
      };
    },
  };
}

export default function Navigation() {
  const { gen } = useGeneration();
  const accent = gen?.accentColor || colors.amber;
  const navigationRef = useNavigationContainerRef();
  const [activeRoute, setActiveRoute] = useState('Main');
  const nav = useMemo(function () { return makeNav(navigationRef); }, [navigationRef]);

  const theme = {
    dark: true,
    colors: {
      primary: accent,
      background: colors.bg,
      card: colors.bg,
      text: colors.textPrimary,
      border: colors.border,
      notification: accent,
    },
    fonts: {
      regular: { fontFamily: fonts.sans,           fontWeight: "400" },
      medium:  { fontFamily: fonts.sansMedium,     fontWeight: "500" },
      bold:    { fontFamily: fonts.sansSemiBold,   fontWeight: "600" },
      heavy:   { fontFamily: fonts.sansSemiBold,   fontWeight: "700" },
    },
  };

  // Web URL routing
  const linking = Platform.OS === 'web' ? {
    prefixes: [
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081',
    ],
    config: {
      screens: {
        Main: {
          path: '',
          screens: {
            Browse:    '',
            Signal:    'signal',
            'My Void': 'watchlist',
          },
        },
        Search:    'search',
        Player:    'watch/:id',
        Auth:      'auth',
        Playlists: 'playlists',
        Playlist:  'playlist/:playlistId',
        Admin:     'admin',
      },
    },
    // The Player carries the full item object (and queue, etc.) as STATE-only params for instant
    // render — never serialize them into the URL. Default behavior turned them into
    // `?item=[object Object]`, which made reload/share of a /watch link redirect home. Keep watch
    // URLs clean (/watch/:id) so they reload + share correctly (PlayerScreen falls back to the id).
    getPathFromState(state, options) {
      var path = defaultGetPathFromState(state, options);
      return typeof path === 'string' ? path.replace(/(watch\/[^/?#]+)\?[^#]*/, '$1') : path;
    },
  } : undefined;

  const onStateChange = function (state) {
    var route = state && state.routes ? state.routes[state.index] : null;
    if (!route) return;
    setActiveRoute(route.name);   // drives hiding the chrome on the Player
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    // Release focus on every navigation. The element that was clicked to navigate (a card,
    // a button) otherwise keeps focus inside the now display:none + aria-hidden old screen,
    // which Chrome blocks and logs, and which traps assistive-tech users in a hidden tree.
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
    var titles = { Main: 'VOIDtv', Search: 'Search — VOIDtv', Auth: 'Sign In — VOIDtv', Playlists: 'Playlists — VOIDtv', Admin: 'Admin — VOIDtv' };
    if (route.name === 'Player') {
      var name = (route.params && route.params.item && route.params.item.title) || (route.params && route.params.id) || 'Watch';
      document.title = name + ' — VOIDtv';
    } else if (route.name === 'Main') {
      var tab = route.state && route.state.routes ? route.state.routes[route.state.index] : null;
      var tabTitles = { Browse: 'VOIDtv', Signal: 'Signal — VOIDtv', 'My Void': 'My Void — VOIDtv' };
      document.title = (tab ? tabTitles[tab.name] : null) || 'VOIDtv';
    } else {
      document.title = titles[route.name] || 'VOIDtv';
    }
  };

  // onStateChange never fires for the INITIAL route — a deep link / refresh straight onto
  // /watch/:id left activeRoute at 'Main', so the TopBar rendered over the Player. Sync once ready.
  const onReady = function () {
    var n = navigationRef.getCurrentRoute && navigationRef.getCurrentRoute();
    if (n && n.name) setActiveRoute(n.name === 'Player' ? 'Player' : 'Main');
  };

  return (
    <NavigationContainer ref={navigationRef} theme={theme} linking={linking} onReady={onReady} onStateChange={onStateChange}>
      <Stack.Navigator screenOptions={{ headerShown: false, header: () => null }}>
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="Search" component={LazySearch}
          options={{ animation: Platform.OS === 'web' ? 'none' : 'slide_from_right' }} />
        <Stack.Screen name="Player" component={LazyPlayer}
          options={{ presentation: Platform.OS === 'web' ? 'card' : 'fullScreenModal', animation: Platform.OS === 'web' ? 'none' : 'slide_from_bottom' }} />
        <Stack.Screen name="Auth" component={LazyAuth}
          options={{ presentation: Platform.OS === 'web' ? 'card' : 'modal', animation: Platform.OS === 'web' ? 'none' : 'slide_from_bottom' }} />
        <Stack.Screen name="Playlists" component={LazyPlaylists}
          options={{ animation: Platform.OS === 'web' ? 'none' : 'slide_from_right' }} />
        <Stack.Screen name="Playlist" component={LazyPlaylist}
          options={{ animation: Platform.OS === 'web' ? 'none' : 'slide_from_right' }} />
        <Stack.Screen name="Admin" component={LazyAdmin}
          options={{ animation: Platform.OS === 'web' ? 'none' : 'slide_from_right' }} />
      </Stack.Navigator>

      {/* Persistent chrome — top bar + hamburger drawer on every screen except the
          immersive Player. Rendered after the Stack so it overlays content. */}
      {activeRoute !== 'Player' && (
        <>
          <TopBar nav={nav} />
          <DrawerMenu nav={nav} />
        </>
      )}
    </NavigationContainer>
  );
}
