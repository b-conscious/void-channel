/**
 * Chrome context — shared state for the persistent top bar + hamburger drawer.
 *
 * (Formerly SidebarContext, for the now-removed desktop sidebar. The file +
 * SidebarProvider + useSidebar names are kept so App.js and screen imports are
 * stable — only the value shape changed.)
 *
 * Provides:
 *  - drawerOpen / openDrawer() / closeDrawer() — the hamburger nav drawer,
 *    rendered once at the Navigation level and openable from the TopBar.
 *  - headerH — content height the persistent TopBar occupies. Each screen pads
 *    its content top by `insets.top + headerH` so nothing hides behind the bar.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

// Content height of the persistent top bar — excludes the safe-area inset,
// which each screen adds itself via useSafeAreaInsets().
var HEADER_H = 52;

var ChromeContext = createContext({
  drawerOpen: false,
  openDrawer: function () {},
  closeDrawer: function () {},
  headerH: HEADER_H,
});

export function SidebarProvider({ children }) {
  var _s = useState(false);
  var drawerOpen = _s[0];
  var setDrawerOpen = _s[1];
  var openDrawer = useCallback(function () { setDrawerOpen(true); }, []);
  var closeDrawer = useCallback(function () { setDrawerOpen(false); }, []);

  return (
    <ChromeContext.Provider value={{ drawerOpen, openDrawer, closeDrawer, headerH: HEADER_H }}>
      {children}
    </ChromeContext.Provider>
  );
}

export function useSidebar() {
  return useContext(ChromeContext);
}

export { HEADER_H };
