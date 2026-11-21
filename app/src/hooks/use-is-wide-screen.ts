import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

const WIDE_BREAKPOINT = 768;

/**
 * True on tablet/desktop-width windows. On web the page is statically
 * pre-rendered at an unknown width and React keeps that markup when it
 * hydrates, so — like use-color-scheme.web.ts — report "not wide" until
 * after the first client render, then the real value.
 */
export function useIsWideScreen() {
  const { width } = useWindowDimensions();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated && width >= WIDE_BREAKPOINT;
}
