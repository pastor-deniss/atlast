import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/ui/text-field';
import { Card, Screen, ScreenHeader } from '@/components/ui/screen';
import { Brand, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type DirectoryEntry = {
  id: string;
  first_name: string;
  last_name: string;
  role: 'member' | 'group_admin' | 'treasurer';
  total: number;
};

// Ticket 15, Q3: active members only, name/role -- no phone. Each member's
// total contributed is shown because every member can already read the whole
// group ledger (financial transparency, ticket 12).
export default function MemberDirectoryScreen() {
  const router = useRouter();
  const t = useT();
  const scheme = useColorScheme();
  const { group, membership } = useMembership();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!group) return;
    const { data: memberships } = await supabase
      .from('memberships')
      .select('user_id, role')
      .eq('group_id', group.id)
      .eq('status', 'active');

    const userIds = (memberships ?? []).map((m) => m.user_id);
    if (userIds.length === 0) {
      setEntries([]);
      return;
    }

    const [{ data: profiles }, { data: totals }] = await Promise.all([
      supabase.from('profiles_public').select('id, first_name, last_name').in('id', userIds),
      supabase
        .from('member_contribution_totals')
        .select('member_id, total_contributed')
        .eq('group_id', group.id),
    ]);

    const roleByUserId = new Map((memberships ?? []).map((m) => [m.user_id, m.role]));
    const totalByUserId = new Map((totals ?? []).map((r) => [r.member_id, r.total_contributed]));
    setEntries(
      (profiles ?? [])
        .map((p) => ({
          ...p,
          role: (roleByUserId.get(p.id) ?? 'member') as DirectoryEntry['role'],
          total: totalByUserId.get(p.id) ?? 0,
        }))
        .sort((a, b) => a.first_name.localeCompare(b.first_name))
    );
  }, [group]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const search = query.trim().toLowerCase();
  const shown = search
    ? entries.filter((e) => `${e.first_name} ${e.last_name}`.toLowerCase().includes(search))
    : entries;

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('Members')}
          subtitle={t('{count} active members', { count: entries.length })}
          admin={membership?.role === 'group_admin'}
        />
      }>
      <TextField placeholder={t('Search members...')} value={query} onChangeText={setQuery} />

      {shown.length === 0 ? (
        <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
          {t('No members found.')}
        </ThemedText>
      ) : (
        shown.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/(app)/members/[id]', params: { id: item.id } })}>
            <Card style={styles.row}>
              <View
                style={[styles.dot, { backgroundColor: scheme === 'dark' ? Brand.gold : Brand.green }]}
              />
              <View style={styles.main}>
                <ThemedText type="smallBold" style={styles.name}>
                  {item.first_name} {item.last_name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.role === 'group_admin' ? t('Group Admin') : item.role === 'treasurer' ? t('Treasurer') : t('Member')} • {t('Active')}
                </ThemedText>
              </View>
              <ThemedText type="smallBold">
                {group?.currency} {item.total.toLocaleString()}
              </ThemedText>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dot: { width: 12, height: 12, borderRadius: 6 },
  main: { flex: 1, gap: Spacing.half },
  name: { fontSize: 16 },
  empty: { textAlign: 'center', marginTop: Spacing.four },
});
