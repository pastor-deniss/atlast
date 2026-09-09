import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && !pinExists}>
        <Stack.Screen name="create-pin" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && pinExists && isLocked}>
        <Stack.Screen name="unlock" />
        <Stack.Screen name="forgot-pin" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && pinExists && !isLocked}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SessionProvider>
      <AppLockProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <SplashScreenController />
          <RootNavigator />
        </ThemeProvider>
      </AppLockProvider>
    </SessionProvider>
  );
}
