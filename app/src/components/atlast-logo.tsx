import { Image } from 'expo-image';

import { useColorScheme } from '@/hooks/use-color-scheme';

const LOGO_ASPECT = 1200 / 402; // width / height of the trimmed logo PNGs

/** The AtLast wordmark + dot mark; green on light backgrounds, cream + gold (reversed) in dark mode. */
export function AtlastLogo({
  width = 200,
  variant,
}: {
  width?: number;
  /** Force a version, e.g. 'reversed' on a green header; default follows the theme. */
  variant?: 'primary' | 'reversed';
}) {
  const scheme = useColorScheme();
  const source =
    (variant ?? (scheme === 'dark' ? 'reversed' : 'primary')) === 'reversed'
      ? require('@/assets/images/logo-reversed.png')
      : require('@/assets/images/logo-primary.png');

  return (
    <Image
      source={source}
      style={{ width, height: width / LOGO_ASPECT }}
      contentFit="contain"
      accessibilityLabel="AtLast"
    />
  );
}
