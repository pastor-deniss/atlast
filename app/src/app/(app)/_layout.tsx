import { Stack } from 'expo-router';

import { MembershipProvider } from '@/lib/membership-context';

// Full tab navigation (Home/Members/Money/Governance/More) lands once
// Contributions/Loans/Governance/Reporting (tickets 16-19) exist. For now
// this is a plain stack.
export default function AppLayout() {
  return (
    <MembershipProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="join-group" options={{ headerShown: true, title: 'Join a Group' }} />
        <Stack.Screen name="application-received" />
        <Stack.Screen name="welcome-to-group" />
        <Stack.Screen
          name="group-dashboard"
          options={{ headerShown: true, title: 'Group Dashboard' }}
        />
        <Stack.Screen
          name="members/index"
          options={{ headerShown: true, title: 'Member Directory' }}
        />
        <Stack.Screen name="members/[id]" options={{ headerShown: true, title: 'Member' }} />
        <Stack.Screen name="coming-soon/[feature]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="settings/index" options={{ headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="settings/profile" options={{ headerShown: true, title: 'Profile' }} />
        <Stack.Screen name="settings/security" options={{ headerShown: true, title: 'Security' }} />
      </Stack>
    </MembershipProvider>
  );
}
