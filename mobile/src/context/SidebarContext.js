/**
 * SidebarContext — shared collapsed/expanded state for the desktop sidebar.
 *
 * Consumed by DesktopSidebar (owns the toggle), navigation/index (marginLeft),
 * HomeScreen (content width), and PlayerScreen (video sizing).
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

var EXPANDED_W = 150;
var COLLAPSED_W = 28;    // just enough for a chevron arrow
var CONTENT_GAP = 6;     // gap between sidebar right edge and content left edge

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
  // Content layout reserves the EXPANDED width ALWAYS — so opening/closing the sidebar never reflows
  // the player / search bar / wall (Bryan: "have the player start where it flexes to; the search bar
  // just needs to not be flexible"). The sidebar itself still collapses visually — DesktopSidebar
  // self-sizes from `collapsed`, not from this value, so nothing here breaks its toggle.
  var sidebarWidth = EXPANDED_W;

  return (
    <SidebarContext.Provider value={{ collapsed, sidebarWidth, toggleSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

export { EXPANDED_W, COLLAPSED_W, CONTENT_GAP };
