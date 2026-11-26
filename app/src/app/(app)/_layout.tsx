import { Stack } from 'expo-router';

import { MaxContentWidth } from '@/constants/theme';
import { useCenteredColumnStyle } from '@/hooks/use-is-wide-screen';
import { MembershipProvider } from '@/lib/membership-context';
import { useT } from '@/lib/i18n';

// Keeps Home underneath any screen opened directly by URL (e.g. after a
// browser reload on /loan/123), so the header's back button still works.
export const unstable_settings = { initialRouteName: '(tabs)' };

// The tab bar (Home/Members/Contributions/Votes/More) lives in (tabs);
// everything else opens on this stack, on top of it.
export default function AppLayout() {
  const contentStyle = useCenteredColumnStyle(MaxContentWidth);
  const t = useT();

  return (
    <MembershipProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="join-group" options={{ headerShown: true, title: t('Join a Group') }} />
        <Stack.Screen name="application-received" />
        <Stack.Screen name="welcome-to-group" />
        <Stack.Screen
          name="group-dashboard"
          options={{ headerShown: true, title: t('Group Dashboard') }}
        />
        <Stack.Screen name="members/[id]" options={{ headerShown: true, title: t('Member') }} />
        <Stack.Screen name="contribute" options={{ headerShown: true, title: t('Make Contribution') }} />
        <Stack.Screen name="contribution-receipt" />
        <Stack.Screen name="loan/index" options={{ headerShown: true, title: t('My Loan') }} />
        <Stack.Screen name="loan/apply" options={{ headerShown: true, title: t('Loan Application') }} />
        <Stack.Screen name="loan/[id]" options={{ headerShown: true, title: t('Loan') }} />
        <Stack.Screen name="governance/[id]" options={{ headerShown: true, title: t('Vote') }} />
        <Stack.Screen
          name="governance/application/[id]"
          options={{ headerShown: true, title: t('Membership Review') }}
        />
        <Stack.Screen name="admin/index" options={{ headerShown: true, title: t('Admin Control Centre') }} />
        <Stack.Screen
          name="admin/financial-dashboard"
          options={{ headerShown: true, title: t('Financial Dashboard') }}
        />
        <Stack.Screen name="admin/transactions" options={{ headerShown: true, title: t('Transactions') }} />
        <Stack.Screen name="admin/transaction/[id]" options={{ headerShown: true, title: t('Transaction') }} />
        <Stack.Screen
          name="admin/reconciliation-case/[id]"
          options={{ headerShown: true, title: t('Reconciliation Case') }}
        />
        <Stack.Screen name="admin/reconciliation" options={{ headerShown: true, title: t('Reconciliation') }} />
        <Stack.Screen name="admin/reports" options={{ headerShown: true, title: t('Reports') }} />
        <Stack.Screen name="admin/audit-log" options={{ headerShown: true, title: t('Audit Log') }} />
        <Stack.Screen name="coming-soon/[feature]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="complaints/index" options={{ headerShown: true, title: t('Complaints') }} />
        <Stack.Screen name="complaints/new" options={{ headerShown: true, title: t('File a Complaint') }} />
        <Stack.Screen name="complaints/[id]" options={{ headerShown: true, title: t('Complaint') }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: t('Notifications') }} />
        <Stack.Screen name="statement" options={{ headerShown: true, title: t('Account Statement') }} />
        <Stack.Screen name="announcements" options={{ headerShown: true, title: t('Announcements') }} />
        <Stack.Screen name="settings/profile" options={{ headerShown: true, title: t('Profile') }} />
        <Stack.Screen name="settings/security" options={{ headerShown: true, title: t('Security') }} />
      </Stack>
    </MembershipProvider>
  );
}
