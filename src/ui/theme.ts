import { Platform, useColorScheme } from 'react-native';

/**
 * A warm, paper-and-ink palette — a cookbook on the kitchen counter rather than
 * a productivity app. Every colour is defined for both schemes so the app
 * follows the system setting.
 */

const light = {
  background: '#FFFBF5',
  surface: '#FFFFFF',
  surfaceMuted: '#F6EFE5',
  border: '#E8DDCC',
  text: '#241D16',
  textMuted: '#6F6355',
  textFaint: '#9A8C7B',
  accent: '#B6462A',
  accentSoft: '#FBE9E2',
  onAccent: '#FFFFFF',
  success: '#3F6F4B',
  successSoft: '#E4F0E6',
  warning: '#9A6B12',
  warningSoft: '#FBF0DA',
  danger: '#A6342C',
  overlay: 'rgba(36, 29, 22, 0.45)',
};

const dark: typeof light = {
  background: '#161310',
  surface: '#211C17',
  surfaceMuted: '#2B241D',
  border: '#3A322A',
  text: '#F4EDE4',
  textMuted: '#B5A796',
  textFaint: '#8A7C6C',
  accent: '#E8785A',
  accentSoft: '#3A241D',
  onAccent: '#1A120E',
  success: '#7FB98C',
  successSoft: '#22301F',
  warning: '#D9A44A',
  warningSoft: '#332813',
  danger: '#E2796E',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const typography = {
  // A serif for recipe titles reads like a cookbook; the body stays system.
  display: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia, "Times New Roman", serif',
  }),
} as const;

export type Theme = typeof light & { isDark: boolean };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { ...(isDark ? dark : light), isDark };
}

/** Widest a content column gets before it stops growing on a desktop browser. */
export const MAX_CONTENT_WIDTH = 720;
