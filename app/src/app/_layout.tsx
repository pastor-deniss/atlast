import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, NarrowContentWidth } from '@/constants/theme';
import { useCenteredColumnStyle } from '@/hooks/use-is-wide-screen';
import { AppLockProvider, useAppLock } from '@/lib/auth/app-lock-context';
import { SessionProvider, useSession } from '@/lib/auth/session-context';

SplashScreen.preventAutoHideAsync();

// Keeps the native splash screen up until we know: is there a session, does
// a local PIN exist on this device, and is the app currently locked. Only
// then do we know which route group to land the user in (ticket 14).
function SplashScreenController() {
  const { isLoading: sessionLoading } = useSession();
  const { isLoading: lockLoading } = useAppLock();

  useEffect(() => {
    if (!sessionLoading && !lockLoading) {
      SplashScreen.hideAsync();
    }
  }, [sessionLoading, lockLoading]);

  return null;
}

// The routing rule from ticket 14: no session -> (auth); session but no
// local PIN on this device yet -> create-pin (covers both a brand-new
// account right after Verify Phone, and an existing account signing in on a
// device that's never set a PIN here); session + PIN + locked -> unlock;
// otherwise -> the main app.
function RootNavigator() {
  const { session } = useSession();
  const { pinExists, isLocked } = useAppLock();
  const narrowColumn = { contentStyle: useCenteredColumnStyle(NarrowContentWidth) };

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
  return { ...base, colors: { ...base.colors, background: Colors[scheme].background } };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SessionProvider>
      <AppLockProvider>
        <ThemeProvider value={navigationTheme(colorScheme === 'dark' ? 'dark' : 'light')}>
          <SplashScreenController />
          <RootNavigator />
        </ThemeProvider>
      </AppLockProvider>
    </SessionProvider>
  );
}
