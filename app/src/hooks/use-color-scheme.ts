import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useThemePreference } from '@/lib/theme-preference';

/** The scheme to draw with: the user's Light/Dark choice, or the phone's setting. */
export function useColorScheme(): 'light' | 'dark' {
  const { preference } = useThemePreference();
  const system = useSystemColorScheme();

  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}
