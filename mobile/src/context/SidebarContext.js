/**
 * SidebarContext — shared collapsed/expanded state for the desktop sidebar.
 *
 * Consumed by DesktopSidebar (owns the toggle), navigation/index (marginLeft),
 * HomeScreen (content width), and PlayerScreen (video sizing).
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

var EXPANDED_W = 150;
var COLLAPSED_W = 56;

var SidebarContext = createContext({
  collapsed: false,
  sidebarWidth: EXPANDED_W,
  toggleSidebar: function () {},
});

export function SidebarProvider({ children }) {
  var _s = useState(false);
  var collapsed = _s[0];
  var setCollapsed = _s[1];
  var toggleSidebar = useCallback(function () { setCollapsed(function (p) { return !p; }); }, []);
  var sidebarWidth = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <SidebarContext.Provider value={{ collapsed, sidebarWidth, toggleSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

export { EXPANDED_W, COLLAPSED_W };
