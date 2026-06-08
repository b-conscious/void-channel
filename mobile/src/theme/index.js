export const colors = {
  bg: "#0c0c0f",
  surface: "#141418",
  card: "#18181e",
  cardHover: "#20202a",

  // Primary amber — the base channel color
  amber: "#f5a623",
  amberLight: "#f7b84b",
  amberDim: "rgba(245, 166, 35, 0.25)",
  amberGlow: "rgba(245, 166, 35, 0.10)",

  // Vibe tag palette
  vibe: {
    cursed:    { bg: "#ff2d78", text: "#fff" },
    baffling:  { bg: "#b2ff3e", text: "#0c0c0f" },
    dated:     { bg: "#00e5ff", text: "#0c0c0f" },
    fever:     { bg: "#b566ff", text: "#fff" },
    wholesome: { bg: "#f5a623", text: "#0c0c0f" },
    propaganda:{ bg: "#ff5722", text: "#fff" },
    seventies: { bg: "#ffb830", text: "#0c0c0f" },
    nobudget:  { bg: "#b2ff3e", text: "#0c0c0f" },
    odd:       { bg: "#00e5ff", text: "#0c0c0f" },
    rare:      { bg: "#ff2d78", text: "#fff" },
  },

  textPrimary: "#e4e2dc",
  textSecondary: "#8a8a92",
  textMuted: "#5a5a62",
  textGhost: "#34343c",

  border: "#26262e",
  borderLight: "#36363e",

  error: "#e55039",
  success: "#27ae60",
};

export const fonts = {
  mono: "SpaceMono_400Regular",
  monoBold: "SpaceMono_700Bold",
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemiBold: "DMSans_600SemiBold",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screenPadding: 18,
};

export const radius = {
  sm: 3,
  md: 6,
  lg: 10,
  xl: 18,
  full: 9999,
};

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
};

// Responsive cards — wider on desktop/web
const _screenW = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 400;
const _isWide = _screenW > 768;

export const cardSize = {
  width: _isWide ? 250 : 198,
  height: _isWide ? 156 : 124,
  gap: _isWide ? 14 : 10,
};

export default { colors, fonts, spacing, radius, shadows, cardSize };
