import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type ProfileDetail = {
  first_name: string;
  last_name: string;
  role: 'member' | 'group_admin';
  joinDate: string;
};

// Ticket 15, Q3: name/photo/role/join date only — no phone, no financial
// detail about this member. Join date falls back to applied_at for
// bootstrap admins/seed members, who never went through a vote and so have
// no decided_at.
export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { group } = useMembership();
  const t = useT();
  const [detail, setDetail] = useState<ProfileDetail | null>(null);

  useEffect(() => {
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
        joinDate: new Date(membership.decided_at ?? membership.applied_at).toLocaleDateString(),
      });
    })();
  }, [group, id]);

  if (!detail) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">
            {detail.first_name} {detail.last_name}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            {detail.role === 'group_admin' ? t('Group Admin') : t('Member')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Joined {date}', { date: detail.joinDate })}
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
});
