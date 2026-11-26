import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Ticket 15: Home is a personal snapshot + action center once active in a
// group (Q1). Before that, it renders whichever state the membership is
// actually in -- no group yet, pending review, or declined -- rather than a
// single fixed dashboard.
export default function HomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { membership, group, loading } = useMembership();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [totals, setTotals] = useState<{ total_contributed: number; total_shares: number } | null>(
    null
  );

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('first_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setFirstName(data?.first_name ?? null));
  }, [session]);

  useEffect(() => {
    if (!session || !group || membership?.status !== 'active') {
      setTotals(null);
      return;
    }
    supabase
      .from('member_contribution_totals')
      .select('total_contributed, total_shares')
      .eq('group_id', group.id)
      .eq('member_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setTotals(data ?? { total_contributed: 0, total_shares: 0 }));
  }, [session, group, membership?.status]);

  // Shown once, the first time this membership is seen as active (ticket 15).
  useEffect(() => {
    if (!membership || membership.status !== 'active') return;
    const flagKey = `thrive_welcomed_${membership.id}`;
    AsyncStorage.getItem(flagKey).then((seen) => {
      if (!seen) router.replace({ pathname: '/(app)/welcome-to-group', params: { flagKey } });
    });
  }, [membership, router]);

  if (loading) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!membership || membership.status === 'exited' ? (
            <>
              <ThemedText type="title">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                You're not in a group yet.
              </ThemedText>
              <Button title="Find a Group" onPress={() => router.push('/(app)/join-group')} />
            </>
          ) : membership.status === 'pending' ? (
            <>
              <ThemedText type="title">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                Your application to {group?.name} is being reviewed. You'll see it here once
                there's a decision.
              </ThemedText>
            </>
          ) : membership.status === 'declined' ? (
            <>
              <ThemedText type="title">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                Your application to {group?.name} wasn't approved.
              </ThemedText>
              <Button title="Find another Group" onPress={() => router.push('/(app)/join-group')} />
            </>
          ) : (
            <>
              <ThemedText type="title">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </ThemedText>
              <ThemedText type="subtitle">{group?.name}</ThemedText>

              <Pressable onPress={() => router.push('/(app)/contributions')} style={styles.statsRow}>
                <View>
                  <ThemedText type="small" themeColor="textSecondary">
                    Your Contributions
                  </ThemedText>
                  <ThemedText type="title">
                    {group?.currency} {(totals?.total_contributed ?? 0).toLocaleString()}
                  </ThemedText>
                </View>
                <View>
                  <ThemedText type="small" themeColor="textSecondary">
                    Shares
                  </ThemedText>
                  <ThemedText type="title">{totals?.total_shares ?? 0}</ThemedText>
                </View>
              </Pressable>

              <Pressable onPress={() => router.push('/(app)/group-dashboard')}>
                <ThemedText type="link" themeColor="primary">
                  View details →
                </ThemedText>
              </Pressable>

              {/* Each shortcut grows to share the row evenly (and wraps to
                  two per row on narrow phones) instead of shrinking to its
                  label's width. */}
              <View style={styles.shortcuts}>
                <View style={styles.shortcut}>
                  <Button title="Contribute" onPress={() => router.push('/(app)/contribute')} />
                </View>
                <View style={styles.shortcut}>
                  <Button
                    title="Loan"
                    variant="secondary"
                    onPress={() => router.push('/(app)/loan')}
                  />
                </View>
                <View style={styles.shortcut}>
                  <Button
                    title="Vote"
                    variant="secondary"
                    onPress={() => router.push('/(app)/governance')}
                  />
                </View>
                {membership.role === 'group_admin' ? (
                  <View style={styles.shortcut}>
                    <Button
                      title="Admin"
                      variant="secondary"
                      onPress={() => router.push('/(app)/admin')}
                    />
                  </View>
                ) : null}
              </View>
            </>
          )}

          <View style={styles.spacer} />
          <Button title="Settings" variant="secondary" onPress={() => router.push('/(app)/settings')} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
  statsRow: { flexDirection: 'row', gap: Spacing.five, marginTop: Spacing.two },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  shortcut: { flexGrow: 1, flexBasis: 140 },
  spacer: { flex: 1 },
});
