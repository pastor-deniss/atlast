import { Stack } from 'expo-router';

import { MaxContentWidth } from '@/constants/theme';
import { useCenteredColumnStyle } from '@/hooks/use-is-wide-screen';
import { MembershipProvider } from '@/lib/membership-context';

// Full tab navigation (Home/Members/Money/Governance/More) lands once
// Governance/Reporting (tickets 18-19) exist. For now this is a plain stack.
export default function AppLayout() {
  const contentStyle = useCenteredColumnStyle(MaxContentWidth);

  return (
    <MembershipProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle }}>
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
        <Stack.Screen name="contribute" options={{ headerShown: true, title: 'Make Contribution' }} />
        <Stack.Screen name="contribution-receipt" />
        <Stack.Screen
          name="contributions"
          options={{ headerShown: true, title: 'Contributions' }}
        />
        <Stack.Screen name="loan/index" options={{ headerShown: true, title: 'My Loan' }} />
        <Stack.Screen name="loan/apply" options={{ headerShown: true, title: 'Loan Application' }} />
        <Stack.Screen name="loan/[id]" options={{ headerShown: true, title: 'Loan' }} />
        <Stack.Screen name="governance/index" options={{ headerShown: true, title: 'Governance' }} />
        <Stack.Screen name="governance/[id]" options={{ headerShown: true, title: 'Vote' }} />
        <Stack.Screen
          name="governance/application/[id]"
          options={{ headerShown: true, title: 'Membership Review' }}
        />
        <Stack.Screen name="admin/index" options={{ headerShown: true, title: 'Admin Control Centre' }} />
        <Stack.Screen
          name="admin/financial-dashboard"
          options={{ headerShown: true, title: 'Financial Dashboard' }}
        />
        <Stack.Screen name="admin/transactions" options={{ headerShown: true, title: 'Transactions' }} />
        <Stack.Screen name="admin/transaction/[id]" options={{ headerShown: true, title: 'Transaction' }} />
        <Stack.Screen
          name="admin/reconciliation-case/[id]"
          options={{ headerShown: true, title: 'Reconciliation Case' }}
        />
        <Stack.Screen name="admin/reports" options={{ headerShown: true, title: 'Reports' }} />
        <Stack.Screen name="admin/audit-log" options={{ headerShown: true, title: 'Audit Log' }} />
        <Stack.Screen name="coming-soon/[feature]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="settings/index" options={{ headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="settings/profile" options={{ headerShown: true, title: 'Profile' }} />
        <Stack.Screen name="settings/security" options={{ headerShown: true, title: 'Security' }} />
      </Stack>
    </MembershipProvider>
  );
}
