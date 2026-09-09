import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  contribution_frequency: string;
  contribution_amount: number;
  share_value: number;
  member_count: number;
};

// Ticket 15: public discovery per ticket 12's groups_select_all policy —
// name/description/contribution settings only, no financial totals, no
// "chosen by N friends" social-proof badge (out of scope).
export default function JoinGroupScreen() {
  const router = useRouter();
  const { refetch } = useMembership();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    let queryBuilder = supabase
      .from('groups')
      .select('id, name, description, currency, contribution_frequency, contribution_amount, share_value')
      .eq('status', 'active');
    if (search.trim()) {
      queryBuilder = queryBuilder.ilike('name', `%${search.trim()}%`);
    }
    const { data } = await queryBuilder;

    const withCounts = await Promise.all(
      (data ?? []).map(async (g) => {
        const { count } = await supabase
          .from('memberships')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', g.id)
          .eq('status', 'active');
        return { ...g, member_count: count ?? 0 };
      })
    );
    setGroups(withCounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApply(groupId: string, groupName: string) {
    setError(null);
    setApplyingTo(groupId);
    const { data, error: fnError } = await supabase.functions.invoke('apply-to-join-group', {
      body: { group_id: groupId },
    });
    setApplyingTo(null);
    if (fnError || (data as { error?: string })?.error) {
      setError((data as { error?: string })?.error ?? fnError!.message);
      return;
    }
    await refetch();
    router.replace({ pathname: '/(app)/application-received', params: { groupName } });
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.searchBar}>
          <TextField
            placeholder="Search groups..."
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              load(t);
            }}
          />
        </View>

        {error ? (
          <ThemedText type="small" themeColor="danger" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={() => load(query)}
          ListEmptyComponent={
            !loading ? (
              <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
                No groups found.
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <ThemedText type="subtitle">{item.name}</ThemedText>
              {item.description ? (
                <ThemedText type="default" themeColor="textSecondary">
                  {item.description}
                </ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {item.member_count} members · {item.contribution_frequency}:{' '}
                {item.currency} {item.contribution_amount.toLocaleString()}
              </ThemedText>
              <Button
                title="Apply to Join"
                onPress={() => handleApply(item.id, item.name)}
                loading={applyingTo === item.id}
              />
            </View>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchBar: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  error: { paddingHorizontal: Spacing.four },
  list: { padding: Spacing.four, gap: Spacing.three },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: { gap: Spacing.two, paddingBottom: Spacing.four, borderBottomWidth: StyleSheet.hairlineWidth },
});
