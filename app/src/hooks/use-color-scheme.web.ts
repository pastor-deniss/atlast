import { useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useThemePreference } from '@/lib/theme-preference';

/**
 * The scheme to draw with: the user's Light/Dark choice, or the browser's setting.
 * To support static rendering, this is re-calculated on the client after hydration.
 */
export function useColorScheme(): 'light' | 'dark' {
  const [hasHydrated, setHasHydrated] = useState(false);
  const { preference } = useThemePreference();
  const system = useSystemColorScheme();

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  if (!hasHydrated) return 'light';
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}
