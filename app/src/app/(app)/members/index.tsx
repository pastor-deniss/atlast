import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type DirectoryEntry = {
  id: string;
  first_name: string;
  last_name: string;
  role: 'member' | 'group_admin';
};

// Ticket 15, Q3: active members only, name/photo/role — no phone, no
// financial detail. Two queries + client-side merge rather than a
// PostgREST embed, since profiles_public is a view (no reliable FK for
// embedding) — see ticket 12.
export default function MemberDirectoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const { group } = useMembership();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!group) return;
    (async () => {
      setLoading(true);
      const { data: memberships } = await supabase
        .from('memberships')
        .select('user_id, role')
        .eq('group_id', group.id)
        .eq('status', 'active');

      const userIds = (memberships ?? []).map((m) => m.user_id);
      if (userIds.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles_public')
        .select('id, first_name, last_name')
        .in('id', userIds);

      const roleByUserId = new Map((memberships ?? []).map((m) => [m.user_id, m.role]));
      const merged = (profiles ?? [])
        .map((p) => ({ ...p, role: roleByUserId.get(p.id) ?? 'member' }) as DirectoryEntry)
        .sort((a, b) => a.first_name.localeCompare(b.first_name));

      setEntries(merged);
      setLoading(false);
    })();
  }, [group]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          refreshing={loading}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/members/[id]', params: { id: item.id } })}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="default">
                {item.first_name} {item.last_name}
              </ThemedText>
              {item.role === 'group_admin' ? (
                <ThemedText type="small" themeColor="primary">
                  {t('Group Admin')}
                </ThemedText>
              ) : null}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 10,
  },
});
