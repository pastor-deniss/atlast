import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplash } from '@/components/animated-splash';
import { Colors, NarrowContentWidth } from '@/constants/theme';
// Hydration-safe on web (see use-color-scheme.web.ts); react-native's own
// hook would leave the statically pre-rendered light theme in place.
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCenteredColumnStyle } from '@/hooks/use-is-wide-screen';
import { AppLockProvider, useAppLock } from '@/lib/auth/app-lock-context';
import { SessionProvider, useSession } from '@/lib/auth/session-context';
import { LanguageProvider } from '@/lib/i18n';
import { ThemePreferenceProvider } from '@/lib/theme-preference';

SplashScreen.preventAutoHideAsync();

// The plain green native splash stays up only until the animated splash is
// drawn; that one plays its dots-then-word sequence and stays until we know: is there
// a session, does a local PIN exist on this device, and is the app locked.
// Only then do we know which route group to land the user in (ticket 14).
function SplashScreenController() {
  const { isLoading: sessionLoading } = useSession();
  const { isLoading: lockLoading } = useAppLock();
  return <AnimatedSplash ready={!sessionLoading && !lockLoading} />;
}

// The routing rule from ticket 14: no session -> (auth); session but no
// local PIN on this device yet -> create-pin (covers both a brand-new
// account right after Verify Phone, and an existing account signing in on a
// device that's never set a PIN here); session + PIN + locked -> unlock;
// otherwise -> the main app.
function RootNavigator() {
  const { session, isLoading: sessionLoading } = useSession();
  const { pinExists, isLocked, isLoading: lockLoading } = useAppLock();
  const narrowColumn = { contentStyle: useCenteredColumnStyle(NarrowContentWidth) };

  // Don't mount the navigator until we know the session and lock state. On
  // web there's no native splash to hide behind: mounting early briefly
  // evaluates the guards with "no session", which redirects a reloaded deep
  // link (e.g. /loan/123) to the welcome screen and then on to Home.
  if (sessionLoading || lockLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && !pinExists}>
        <Stack.Screen name="create-pin" options={narrowColumn} />
      </Stack.Protected>

      <Stack.Protected guard={!!session && pinExists && isLocked}>
        <Stack.Screen name="unlock" options={narrowColumn} />
        <Stack.Screen name="forgot-pin" options={narrowColumn} />
      </Stack.Protected>

      <Stack.Protected guard={!!session && pinExists && !isLocked}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

// Navigation theme whose background matches the app's own, so the space
// beside a centred column on wide screens blends in instead of showing the
// navigation library's default grey.
function navigationTheme(scheme: 'light' | 'dark') {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      background: c.background,
      card: c.background,
      text: c.text,
      primary: c.primary,
      border: c.backgroundSelected,
    },
  };
}

function ThemedRoot() {
  const colorScheme = useColorScheme();

  return (
    <SessionProvider>
      <AppLockProvider>
        <ThemeProvider value={navigationTheme(colorScheme)}>
          <RootNavigator />
          <SplashScreenController />
        </ThemeProvider>
      </AppLockProvider>
    </SessionProvider>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <ThemePreferenceProvider>
        <ThemedRoot />
      </ThemePreferenceProvider>
    </LanguageProvider>
  );
}
