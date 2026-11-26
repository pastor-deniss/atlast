import { Stack } from 'expo-router';

import { NarrowContentWidth } from '@/constants/theme';
import { useCenteredColumnStyle } from '@/hooks/use-is-wide-screen';
import { useT } from '@/lib/i18n';

export default function AuthLayout() {
  const contentStyle = useCenteredColumnStyle(NarrowContentWidth);
  const t = useT();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-account" options={{ headerShown: true, title: t('Create Your Account') }} />
      <Stack.Screen name="sign-in" options={{ headerShown: true, title: t('Sign In') }} />
      <Stack.Screen name="verify-phone" options={{ headerShown: true, title: t('Verify Your Phone') }} />
    </Stack>
  );
}
