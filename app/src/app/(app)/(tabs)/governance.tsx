import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DecisionCard } from '@/components/decision-card';
import { ThemedText } from '@/components/themed-text';
import {
  Card,
  Chevron,
  icon,
  IconBadge,
  Screen,
  ScreenHeader,
  SectionTitle,
} from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { isWaitingOnMe, loadDecisions, type DecisionItem } from '@/lib/decisions';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type PendingApplication = { id: string; name: string };

// Kura tab: everything waiting on a decision -- membership votes, loan
// reviews, Jamii payouts and charges -- as cards with each approver's verdict
// (privacy rules in src/lib/decisions.ts). Ticket 18: the mockup's push-style "Vote Notification" becomes this tab --
// no push notifications in V1 (Q per the ticket's Answer). Admin's pre-screen
// queue (pending applications with no Motion yet) and the group's Motions
// (open + past) both live here since a Group Admin is also a voting member.
export default function GovernanceScreen() {
  const router = useRouter();
  const t = useT();
  const { session } = useSession();
  const { group, membership } = useMembership();

  const [pending, setPending] = useState<PendingApplication[]>([]);
  const [open, setOpen] = useState<DecisionItem[]>([]);
  const [recent, setRecent] = useState<DecisionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = membership?.role === 'group_admin';

  useFocusEffect(
    useCallback(() => {
    if (!group || !session) return;
    (async () => {
      setLoading(true);

      if (isAdmin) {
        const { data: pendingMemberships } = await supabase
          .from('memberships')
          .select('id, user_id')
          .eq('group_id', group.id)
          .eq('status', 'pending');

        const { data: motionsForPending } = await supabase
          .from('motions')
          .select('subject_membership_id')
          .in('subject_membership_id', (pendingMemberships ?? []).map((m) => m.id));
        const alreadyRaised = new Set((motionsForPending ?? []).map((m) => m.subject_membership_id));

        const preScreen = (pendingMemberships ?? []).filter((m) => !alreadyRaised.has(m.id));
        const userIds = preScreen.map((m) => m.user_id);
        const { data: profiles } =
          userIds.length > 0
            ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', userIds)
            : { data: [] };
        const nameByUserId = new Map(
          (profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`])
        );
        setPending(preScreen.map((m) => ({ id: m.id, name: nameByUserId.get(m.user_id) ?? 'Applicant' })));
      }

      const decisions = await loadDecisions(group.id, session.user.id, isAdmin);
      setOpen(decisions.open);
      setRecent(decisions.recent);
      setLoading(false);
    })();
  }, [group, session, isAdmin])
  );

  if (!group) return null;

  function openItem(item: DecisionItem) {
    if (item.kind === 'membership') router.push({ pathname: '/(app)/governance/[id]', params: { id: item.id } });
    else if (item.kind === 'loan') router.push({ pathname: '/(app)/loan/[id]', params: { id: item.id } });
    else router.push({ pathname: '/(app)/spending/[id]', params: { id: item.id } });
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('Votes & Approvals')}
          subtitle={t('{count} waiting for you', { count: open.filter(isWaitingOnMe).length })}
          admin={isAdmin}
        />
      }>
      {isAdmin && pending.length > 0 ? (
        <>
          <SectionTitle title={t('Pending Applications')} iconName={icon('person.badge.plus', 'person_add')} />
          {pending.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/(app)/governance/application/[id]', params: { id: p.id } })
              }>
              <Card style={styles.row}>
                <IconBadge name={icon('person', 'person')} size={40} />
                <View style={styles.main}>
                  <ThemedText type="smallBold" style={styles.name}>
                    {p.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="primary">
                    {t('Review →')}
                  </ThemedText>
                </View>
                <Chevron />
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      <SectionTitle title={t('Open requests')} iconName={icon('checkmark.square', 'how_to_vote')} />
      {open.length === 0 && !loading ? (
        <Card>
          <ThemedText type="default" themeColor="textSecondary" style={styles.center}>
            {t('Nothing is waiting for a decision right now.')}
          </ThemedText>
        </Card>
      ) : null}
      {open.map((item) => (
        <DecisionCard key={`${item.kind}-${item.id}`} item={item} currency={group.currency} onPress={() => openItem(item)} />
      ))}

      {recent.length > 0 ? (
        <>
          <SectionTitle title={t('Decided in the last 30 days')} iconName={icon('clock', 'history')} />
          {recent.map((item) => (
            <DecisionCard key={`${item.kind}-${item.id}`} item={item} currency={group.currency} onPress={() => openItem(item)} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  main: { flex: 1, gap: Spacing.half },
  name: { fontSize: 16 },
  center: { textAlign: 'center' },
});
