/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Atlast brand palette (from the Atlast brand identity sheet), plus status colours.
export const Brand = {
  green: '#0F3D2E', // Atlast Green — primary
  greenLight: '#2F7A5C', // lighter Atlast Green, for dark mode where #0F3D2E is unreadable
  gold: '#F2B33D', // Atlast Gold — accent
  cream: '#F6F3EC', // Cream
  success: '#22C55E',
  warning: '#F59E0B',
  alert: '#F97316',
  danger: '#DC2626',
  blue: '#2563EB',
  grey: '#9CA3AF',
  lightGrey: '#F3F4F6',
} as const;

export const Colors = {
  // Atlast brand look: cream page, white cards, near-black green-tinted text.
  light: {
    text: '#13201B',
    background: Brand.cream,
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E7E1D3',
    textSecondary: '#5B635F',
    primary: Brand.green,
    onPrimary: '#FFFFFF', // text/icons drawn on a `primary` background
    danger: Brand.danger,
    warning: Brand.warning,
  },
  // Atlast reversed look: deep green page, lighter green cards, cream text, gold accent.
  dark: {
    text: Brand.cream,
    background: '#0B2E22',
    backgroundElement: '#134634',
    backgroundSelected: '#1D5A45',
    textSecondary: '#B5C7BD',
    primary: Brand.gold,
    onPrimary: Brand.green,
    danger: Brand.danger,
    warning: Brand.warning,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
/** Column width for single-purpose screens (welcome, sign-in, PIN) on wide screens. */
export const NarrowContentWidth = 440;
