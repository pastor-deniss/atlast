import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DecisionCard } from '@/components/decision-card';
import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { loadDecisions, type DecisionItem } from '@/lib/decisions';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';

type Filter = 'all' | 'approved' | 'declined';
const HISTORY_DAYS = 365;

// Past results, read-only, for every member: decided membership votes, loan
// reviews, Jamii payouts and charges from the last 12 months, with the same
// privacy rules as the Votes tab (membership votes show totals only).
export default function PastResultsScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { group, membership } = useMembership();
  const [items, setItems] = useState<DecisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const isAdmin = membership?.role === 'group_admin';

  useFocusEffect(
    useCallback(() => {
      if (!group || !session) return;
      loadDecisions(group.id, session.user.id, isAdmin, HISTORY_DAYS).then((d) => {
        setItems(d.recent);
        setLoading(false);
      });
    }, [group, session, isAdmin])
  );

  if (!group) return null;

  const shown = filter === 'all' ? items : items.filter((i) => i.status === filter);

  function openItem(item: DecisionItem) {
    if (item.kind === 'membership') router.push({ pathname: '/(app)/governance/[id]', params: { id: item.id } });
    else if (item.kind === 'loan') router.push({ pathname: '/(app)/loan/[id]', params: { id: item.id } });
    else router.push({ pathname: '/(app)/spending/[id]', params: { id: item.id } });
  }

  const label: Record<Filter, string> = { all: t('All'), approved: t('Approved'), declined: t('Declined') };

  return (
    <Screen header={null}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('Decisions from the last 12 months. Read only: these can no longer be changed.')}
      </ThemedText>
      <View style={styles.chips}>
        {(['all', 'approved', 'declined'] as const).map((f) => {
          const on = filter === f;
          return (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f)}
              style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundSelected }]}>
              <ThemedText type="small" style={{ color: on ? theme.onPrimary : theme.text }}>
                {label[f]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {shown.length === 0 && !loading ? (
        <Card>
          <ThemedText type="default" themeColor="textSecondary" style={styles.center}>
            {t('No decided votes yet.')}
          </ThemedText>
        </Card>
      ) : null}
      {shown.map((item) => (
        <DecisionCard key={`${item.kind}-${item.id}`} item={item} currency={group.currency} onPress={() => openItem(item)} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: 999 },
});
