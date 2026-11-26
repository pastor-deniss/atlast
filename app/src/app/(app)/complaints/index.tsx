import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, Chevron, icon, IconBadge, Pill } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/datetime';
import { useSession } from '@/lib/auth/session-context';
import {
  CATEGORY_LABELS,
  COMPLAINT_COLUMNS,
  STATUS_LABELS,
  STATUS_TONES,
  type Complaint,
} from '@/lib/complaints';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type Filter = 'active' | 'closed';

// Members see only their own complaints; Group Admins see the whole group's
// (enforced by RLS on member_complaints, not just by this screen).
export default function ComplaintsScreen() {
  const router = useRouter();
  const t = useT();
  const theme = useTheme();
  const { session } = useSession();
  const { group, membership } = useMembership();
  const isAdmin = membership?.role === 'group_admin' && membership.status === 'active';

  const [items, setItems] = useState<(Complaint & { member_name: string })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');

  const load = useCallback(async () => {
    if (!group || !session) return;
    const { data } = await supabase
      .from('member_complaints')
      .select(COMPLAINT_COLUMNS)
      .eq('group_id', group.id)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as Complaint[];

    const memberIds = [...new Set(rows.map((r) => r.member_id))];
    const { data: profiles } =
      isAdmin && memberIds.length > 0
        ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', memberIds)
        : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
    setItems(rows.map((r) => ({ ...r, member_name: nameById.get(r.member_id) ?? '' })));
    setLoaded(true);
  }, [group, session, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const shown = items.filter((c) =>
    filter === 'active' ? c.status === 'open' || c.status === 'in_review' : c.status === 'resolved' || c.status === 'rejected'
  );

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <ThemedText type="default" themeColor="textSecondary">
            {isAdmin
              ? t('Complaints from members of your group. Only you and other Group Admins can see them.')
              : t('Something wrong with your records? Tell your Group Admin here. Only you and the Group Admins can see your complaints.')}
          </ThemedText>

          <Button title={`+  ${t('File a Complaint')}`} onPress={() => router.push('/(app)/complaints/new')} />

          <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
            {(['active', 'closed'] as const).map((f) => {
              const selected = f === filter;
              return (
                <Pressable
                  key={f}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(f)}
                  style={[styles.segment, selected && { backgroundColor: theme.primary }]}>
                  <ThemedText type="smallBold" style={selected ? { color: theme.onPrimary } : undefined}>
                    {f === 'active' ? t('Active') : t('Closed')}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {loaded && shown.length === 0 ? (
            <ThemedText type="default" themeColor="textSecondary" style={styles.center}>
              {filter === 'active' ? t('No active complaints.') : t('No closed complaints.')}
            </ThemedText>
          ) : null}

          {shown.map((c) => {
            const mine = c.member_id === session?.user.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/(app)/complaints/[id]', params: { id: c.id } })}>
                <Card style={styles.row}>
                  <IconBadge name={icon('exclamationmark.bubble', 'report')} size={40} />
                  <View style={styles.main}>
                    <ThemedText type="smallBold" style={styles.subject} numberOfLines={2}>
                      {c.subject}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {isAdmin ? `${mine ? t('You') : c.member_name} • ` : ''}
                      {t(CATEGORY_LABELS[c.category])} • {formatDateTime(c.created_at)}
                    </ThemedText>
                    <Pill label={t(STATUS_LABELS[c.status])} tone={STATUS_TONES[c.status]} />
                  </View>
                  <Chevron />
                </Card>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: Spacing.half, gap: Spacing.half },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 10 },
  center: { textAlign: 'center', marginTop: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  main: { flex: 1, gap: Spacing.one },
  subject: { fontSize: 16 },
});
