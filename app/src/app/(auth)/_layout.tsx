import { Stack } from 'expo-router';

import { NarrowContentWidth } from '@/constants/theme';
import { useCenteredColumnStyle } from '@/hooks/use-is-wide-screen';

export default function AuthLayout() {
  const contentStyle = useCenteredColumnStyle(NarrowContentWidth);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-account" options={{ headerShown: true, title: 'Create Your Account' }} />
      <Stack.Screen name="sign-in" options={{ headerShown: true, title: 'Sign In' }} />
      <Stack.Screen name="verify-phone" options={{ headerShown: true, title: 'Verify Your Phone' }} />
    </Stack>
  );
}
