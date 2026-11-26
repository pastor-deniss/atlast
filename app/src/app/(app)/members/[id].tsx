import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { formatDateTime } from '@/lib/datetime';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { treasuryAction } from '@/lib/treasury';

type ProfileDetail = {
  first_name: string;
  last_name: string;
  role: 'member' | 'group_admin' | 'treasurer';
  joinDate: string;
};

// Ticket 15, Q3: name/photo/role/join date only — no phone, no financial
// detail about this member. Join date falls back to applied_at for
// bootstrap admins/seed members, who never went through a vote and so have
// no decided_at.
export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { group, membership: mine } = useMembership();
  const t = useT();
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iAmAdmin = mine?.role === 'group_admin' && mine.status === 'active';

  const load = useCallback(() => {
    if (!group || !id) return;
    (async () => {
      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase.from('profiles_public').select('first_name, last_name').eq('id', id).single(),
        supabase
          .from('memberships')
          .select('role, applied_at, decided_at')
          .eq('group_id', group.id)
          .eq('user_id', id)
          .single(),
      ]);
      if (!profile || !membership) return;
      setDetail({
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: membership.role,
        joinDate: formatDateTime(membership.decided_at ?? membership.applied_at),
      });
    })();
  }, [group, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setRole(role: 'treasurer' | 'member') {
    setError(null);
    setBusy(true);
    const { error: message } = await treasuryAction({ action: 'set_role', group_id: group!.id, member_id: id, role });
    setBusy(false);
    if (message) setError(message);
    else load();
  }

  if (!detail) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">
            {detail.first_name} {detail.last_name}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            {detail.role === 'group_admin' ? t('Group Admin') : detail.role === 'treasurer' ? t('Treasurer') : t('Member')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Joined {date}', { date: detail.joinDate })}
          </ThemedText>
          {iAmAdmin && detail.role !== 'group_admin' ? (
            <View style={styles.action}>
              {detail.role === 'treasurer' ? (
                <Button title={t('Remove as Treasurer')} variant="secondary" loading={busy} onPress={() => setRole('member')} />
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('The Treasurer handles payouts, reconciliation and the year-end share-out. Any current Treasurer goes back to being a member.')}
                  </ThemedText>
                  <Button title={t('Make Treasurer')} loading={busy} onPress={() => setRole('treasurer')} />
                </>
              )}
              {error ? (
                <ThemedText type="small" themeColor="danger">
                  {t(error)}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  action: { gap: Spacing.two, marginTop: Spacing.four },
});
