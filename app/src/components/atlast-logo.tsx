import { Image } from 'expo-image';

import { useColorScheme } from '@/hooks/use-color-scheme';

const LOGO_ASPECT = 1200 / 402; // width / height of the trimmed logo PNGs

/** The Atlast wordmark + dot mark; green on light backgrounds, white in dark mode. */
export function AtlastLogo({ width = 200 }: { width?: number }) {
  const scheme = useColorScheme();
  const source =
    scheme === 'dark'
      ? require('@/assets/images/logo-white.png')
      : require('@/assets/images/logo-primary.png');

  return (
    <Image
      source={source}
      style={{ width, height: width / LOGO_ASPECT }}
      contentFit="contain"
      accessibilityLabel="Atlast"
    />
  );
}
