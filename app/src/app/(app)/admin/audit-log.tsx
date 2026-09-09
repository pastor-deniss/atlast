import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type AuditEvent = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  reason: string | null;
  created_at: string;
  actor_name: string | null;
};

const ENTITY_FILTERS = ['all', 'membership', 'loan', 'transaction', 'reconciliation_case'] as const;
const PAGE_SIZE = 25;

function humanize(value: string) {
  const s = value.replace(/[._]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Ticket 19: `audit_events` is already narrow-scoped (ticket 13, Q3) --
// discretionary/corrective actions only -- so this screen just paginates and
// filters by entity_type, no further filtering design needed.
export default function AuditLogScreen() {
  const theme = useTheme();
  const { group, membership } = useMembership();
  const [filter, setFilter] = useState<(typeof ENTITY_FILTERS)[number]>('all');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);

  const isAdmin = membership?.role === 'group_admin';

  const load = useCallback(
    async (pageToLoad: number, replace: boolean) => {
      if (!group || !isAdmin) return;
      setLoading(true);

      let query = supabase
        .from('audit_events')
        .select('id, actor_id, action, entity_type, reason, created_at')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false })
        .range(pageToLoad * PAGE_SIZE, pageToLoad * PAGE_SIZE + PAGE_SIZE - 1);
      if (filter !== 'all') query = query.eq('entity_type', filter);

      const { data: rows } = await query;
      const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter((id): id is string => !!id))];
      const { data: profiles } =
        actorIds.length > 0
          ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', actorIds)
          : { data: [] };
      const nameById = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

      const enriched = (rows ?? []).map((r) => ({
        ...r,
        actor_name: r.actor_id ? (nameById.get(r.actor_id) ?? 'Member') : 'System',
      }));

      setEvents((prev) => (replace ? enriched : [...prev, ...enriched]));
      setHasMore((rows ?? []).length === PAGE_SIZE);
      setLoading(false);
    },
    [group, isAdmin, filter]
  );

  useEffect(() => {
    setPage(0);
    load(0, true);
  }, [load]);

  if (!group || !membership) return null;
  if (!isAdmin) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <View style={styles.content}>
            <ThemedText type="default" themeColor="textSecondary">
              This area is for Group Admins only.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          refreshing={loading && page === 0}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.filters}>
              {ENTITY_FILTERS.map((f) => (
                <Button
                  key={f}
                  title={humanize(f)}
                  variant={filter === f ? 'primary' : 'secondary'}
                  onPress={() => setFilter(f)}
                />
              ))}
            </View>
          }
          ListEmptyComponent={
            !loading ? (
              <ThemedText type="default" themeColor="textSecondary">
                No audit events yet.
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="default">{humanize(item.action)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.actor_name} · {new Date(item.created_at).toLocaleString()}
              </ThemedText>
              {item.reason ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {item.reason}
                </ThemedText>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            hasMore ? (
              <Button
                title="Load More"
                variant="secondary"
                loading={loading}
                onPress={() => {
                  const next = page + 1;
                  setPage(next);
                  load(next, false);
                }}
              />
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  list: { padding: Spacing.four, gap: Spacing.two },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  row: { gap: Spacing.one, padding: Spacing.three, borderRadius: 10, marginBottom: Spacing.two },
});
