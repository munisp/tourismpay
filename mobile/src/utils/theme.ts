/**
 * TourismPay Mobile Theme — consistent colors, spacing, typography.
 */
export const colors = {
  // Backgrounds
  bg: "#0f0f1a",
  card: "#1a1a2e",
  border: "#2d2d44",

  // Primary
  primary: "#6c63ff",
  primaryLight: "#6c63ff20",

  // Text
  text: "#fff",
  textSecondary: "#ccc",
  textMuted: "#888",
  textDim: "#666",

  // Status
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",

  // Misc
  live: "#22c55e",
  offline: "#64748b",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const typography = {
  h1: { fontSize: 26, fontWeight: "700" as const },
  h2: { fontSize: 22, fontWeight: "700" as const },
  h3: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 14 },
  caption: { fontSize: 12 },
  small: { fontSize: 10 },
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  full: 999,
};
