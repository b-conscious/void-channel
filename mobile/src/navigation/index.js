import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Platform, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import SignalScreen from '../screens/SignalScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import PlayerScreen from '../screens/PlayerScreen';
import AuthScreen from '../screens/AuthScreen';
import PlaylistScreen from '../screens/PlaylistScreen';
import PlaylistsListScreen from '../screens/PlaylistsListScreen';
import AdminScreen from '../screens/AdminScreen';

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

function TabBackground() {
  if (Platform.OS === 'ios') {
    return <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />;
}

function TabNavigator() {
  const { gen } = useGeneration();
  const accent = gen?.accentColor || colors.amber;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        header: () => null,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bg,
          borderTopColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarBackground: () => <TabBackground />,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: colors.textGhost,
        tabBarLabelStyle: {
          fontFamily: fonts.mono,
          fontSize: 9,
          letterSpacing: 1,
          marginBottom: Platform.OS === 'android' ? 4 : 0,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const cfg = TAB_CONFIG[route.name] || { default: 'ellipse-outline', focused: 'ellipse' };
          return <Ionicons name={focused ? cfg.focused : cfg.default} size={21} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Browse"   component={HomeScreen} />
      <Tab.Screen name="Search"   component={SearchScreen} />
      <Tab.Screen name="Signal"   component={SignalScreen} />
      <Tab.Screen name="My Void"  component={WatchlistScreen} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { gen } = useGeneration();
  const accent = gen?.accentColor || colors.amber;

  // React Navigation v7 requires a `fonts` block on themes
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

  // ── Web URL routing — real browser URLs, back/forward, shareable links ──
  // Defined inside component to avoid TDZ in production bundles.
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

  // Update browser tab title on screen change (web only)
  const onStateChange = Platform.OS === 'web' ? function (state) {
    var route = state && state.routes ? state.routes[state.index] : null;
    if (!route) return;
    var titles = { Main: 'Void Channel', Auth: 'Sign In — Void Channel', Playlists: 'Playlists — Void Channel', Admin: 'Admin — Void Channel' };
    if (route.name === 'Player') {
      var name = (route.params && route.params.item && route.params.item.title) || (route.params && route.params.id) || 'Watch';
      document.title = name + ' — Void Channel';
    } else if (route.name === 'Main') {
      var tab = route.state && route.state.routes ? route.state.routes[route.state.index] : null;
      var tabTitles = { Browse: 'Void Channel', Search: 'Search — Void Channel', Signal: 'Signal — Void Channel', 'My Void': 'My Void — Void Channel' };
      document.title = (tab ? tabTitles[tab.name] : null) || 'Void Channel';
    } else {
      document.title = titles[route.name] || 'Void Channel';
    }
  } : undefined;

  return (
    <NavigationContainer theme={theme} linking={linking} onStateChange={onStateChange}>
      <Stack.Navigator screenOptions={{ headerShown: false, header: () => null }}>
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{
            headerShown: false,
            header: () => null,
            presentation: Platform.OS === 'web' ? 'card' : 'fullScreenModal',
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{
            headerShown: false,
            header: () => null,
            presentation: Platform.OS === 'web' ? 'card' : 'modal',
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="Playlists"
          component={PlaylistsListScreen}
          options={{
            headerShown: false,
            header: () => null,
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="Playlist"
          component={PlaylistScreen}
          options={{
            headerShown: false,
            header: () => null,
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="Admin"
          component={AdminScreen}
          options={{
            headerShown: false,
            header: () => null,
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
