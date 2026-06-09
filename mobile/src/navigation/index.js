import React, { Suspense } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Platform, View, Text, ActivityIndicator, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import DesktopSidebar, { SIDEBAR_NAV_W } from '../components/DesktopSidebar';

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
import { colors, fonts } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_CONFIG = {
  Browse:  { default: 'tv-outline',       focused: 'tv' },
  Search:  { default: 'search-outline',   focused: 'search' },
  Signal:  { default: 'compass-outline',  focused: 'compass' },
  'My Void':{ default: 'bookmark-outline', focused: 'bookmark' },
};

// Each tab glows in its own unique color —
// desaturated when idle, bright + glow when selected.
var TAB_COLORS = {
  Browse:    '#5cb8ff',   // brand blue — home base
  Search:    '#b566ff',   // violet — discovery
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
  // On desktop: replace bottom tabs with DesktopSidebar, shift screen content right
  var desktopProps = IS_DESKTOP ? {
    tabBar: function (props) { return <DesktopSidebar {...props} />; },
    sceneContainerStyle: { marginLeft: SIDEBAR_NAV_W },
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
      <Tab.Screen name="Search"   component={LazySearch} />
      <Tab.Screen name="Signal"   component={LazySignal} />
      <Tab.Screen name="My Void"  component={LazyWatchlist} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { gen } = useGeneration();
  const accent = gen?.accentColor || colors.amber;

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
            Search:    'search',
            Signal:    'signal',
            'My Void': 'watchlist',
          },
        },
        Player:    'watch/:id',
        Auth:      'auth',
        Playlists: 'playlists',
        Playlist:  'playlist/:playlistId',
        Admin:     'admin',
      },
    },
  } : undefined;

  const onStateChange = Platform.OS === 'web' ? function (state) {
    var route = state && state.routes ? state.routes[state.index] : null;
    if (!route) return;
    var titles = { Main: 'VOIDtv', Auth: 'Sign In — VOIDtv', Playlists: 'Playlists — VOIDtv', Admin: 'Admin — VOIDtv' };
    if (route.name === 'Player') {
      var name = (route.params && route.params.item && route.params.item.title) || (route.params && route.params.id) || 'Watch';
      document.title = name + ' — VOIDtv';
    } else if (route.name === 'Main') {
      var tab = route.state && route.state.routes ? route.state.routes[route.state.index] : null;
      var tabTitles = { Browse: 'VOIDtv', Search: 'Search — VOIDtv', Signal: 'Signal — VOIDtv', 'My Void': 'My Void — VOIDtv' };
      document.title = (tab ? tabTitles[tab.name] : null) || 'VOIDtv';
    } else {
      document.title = titles[route.name] || 'VOIDtv';
    }
  } : undefined;

  return (
    <NavigationContainer theme={theme} linking={linking} onStateChange={onStateChange}>
      <Stack.Navigator screenOptions={{ headerShown: false, header: () => null }}>
        <Stack.Screen name="Main" component={TabNavigator} />
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
    </NavigationContainer>
  );
}
