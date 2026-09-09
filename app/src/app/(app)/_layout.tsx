import { Stack } from 'expo-router';

// Full tab navigation (Home/Members/Money/Governance/More) lands with
// ticket 15. For now this is a plain stack: Home placeholder + Settings.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings/index" options={{ headerShown: true, title: 'Settings' }} />
      <Stack.Screen name="settings/profile" options={{ headerShown: true, title: 'Profile' }} />
      <Stack.Screen name="settings/security" options={{ headerShown: true, title: 'Security' }} />
    </Stack>
  );
}
