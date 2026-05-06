/**
 * Design tokens — luxury fintech dark theme.
 * Single source of truth for color, typography, spacing, radii.
 */

export const palette = {
  /** Near-black background, like deep velvet */
  bg: "#0A0A0B",
  /** Card / surface — one shade lighter than bg */
  surface: "#131316",
  /** Slightly elevated surface for active/focused state */
  surfaceElevated: "#1B1B1F",
  /** Subtle dividers, default border */
  border: "#26262C",
  /** Hairline border for inactive elements */
  borderSubtle: "#1C1C20",
  /** Strong border on focus/highlight */
  borderStrong: "#3A3A42",

  /** Primary text — pure white feels harsh, slight cream is warmer */
  textPrimary: "#F4F2EE",
  /** Secondary / muted text */
  textSecondary: "#8C8C92",
  /** Tertiary — placeholders, subtlest */
  textTertiary: "#5A5A60",

  /** Accent — muted gold, never crypto-yellow */
  accent: "#C9A961",
  /** Accent on press / hover */
  accentDark: "#A8893E",
  /** Foreground colour to use on top of accent (high contrast) */
  accentOn: "#0A0A0B",

  success: "#5BAA82",
  successBg: "#11221C",
  error: "#D86464",
  errorBg: "#241313",
  warning: "#D4A954",
  warningBg: "#1F1A0F",
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Inter is loaded via `@expo-google-fonts/inter`. Numeric weights
 * map to specific font files — never just use `fontWeight` because
 * Android won't pick up the right cut.
 */
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  mono: "Menlo",
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: -0.4, lineHeight: 34 },
  h1: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.2, lineHeight: 28 },
  h2: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 0.1, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: fonts.regular, fontSize: 12, letterSpacing: 0.2, lineHeight: 16 },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  monoSmall: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14 },
  /** ALL-CAPS section eyebrow */
  eyebrow: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    lineHeight: 14,
    textTransform: "uppercase" as const,
  },
  button: { fontFamily: fonts.semibold, fontSize: 14, letterSpacing: 0.3, lineHeight: 18 },
} as const;
