import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-account" options={{ headerShown: true, title: 'Create Your Account' }} />
      <Stack.Screen name="sign-in" options={{ headerShown: true, title: 'Sign In' }} />
      <Stack.Screen name="verify-phone" options={{ headerShown: true, title: 'Verify Your Phone' }} />
    </Stack>
  );
}
