import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Card,
  Chevron,
  Divider,
  icon,
  IconBadge,
  Pill,
  Screen,
  ScreenHeader,
  SectionTitle,
} from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type PendingApplication = { id: string; name: string };

type Motion = {
  id: string;
  status: string;
  closes_at: string;
  applicant_name: string;
  my_vote: 'approve' | 'decline' | null;
};

function daysRemaining(closesAt: string) {
  const ms = new Date(closesAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// Ticket 18: the mockup's push-style "Vote Notification" becomes this tab --
// no push notifications in V1 (Q per the ticket's Answer). Admin's pre-screen
// queue (pending applications with no Motion yet) and the group's Motions
// (open + past) both live here since a Group Admin is also a voting member.
export default function GovernanceScreen() {
  const router = useRouter();
  const t = useT();
  const { session } = useSession();
  const { group, membership } = useMembership();

  const [pending, setPending] = useState<PendingApplication[]>([]);
  const [openMotions, setOpenMotions] = useState<Motion[]>([]);
  const [pastMotions, setPastMotions] = useState<Motion[]>([]);
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

      const { data: motions } = await supabase
        .from('motions')
        .select('id, status, closes_at, subject_membership_id')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false });

      const membershipIds = (motions ?? []).map((m) => m.subject_membership_id);
      const { data: subjectMemberships } =
        membershipIds.length > 0
          ? await supabase.from('memberships').select('id, user_id').in('id', membershipIds)
          : { data: [] };
      const userIdByMembershipId = new Map((subjectMemberships ?? []).map((m) => [m.id, m.user_id]));
      const subjectUserIds = [...new Set((subjectMemberships ?? []).map((m) => m.user_id))];
      const { data: profiles } =
        subjectUserIds.length > 0
          ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', subjectUserIds)
          : { data: [] };
      const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

      const { data: myVotes } = await supabase
        .from('votes')
        .select('motion_id, choice')
        .eq('voter_id', session.user.id);
      const myVoteByMotionId = new Map((myVotes ?? []).map((v) => [v.motion_id, v.choice]));

      const enriched: Motion[] = (motions ?? []).map((m) => {
        const userId = userIdByMembershipId.get(m.subject_membership_id);
        return {
          id: m.id,
          status: m.status,
          closes_at: m.closes_at,
          applicant_name: nameByUserId.get(userId ?? '') ?? 'Applicant',
          my_vote: (myVoteByMotionId.get(m.id) as 'approve' | 'decline' | undefined) ?? null,
        };
      });

      setOpenMotions(enriched.filter((m) => m.status === 'open'));
      setPastMotions(enriched.filter((m) => m.status !== 'open'));
      setLoading(false);
    })();
  }, [group, session, isAdmin])
  );

  if (!group) return null;

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('Governance')}
          subtitle={t('Membership decisions by the whole group')}
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

      <SectionTitle title={t('Open Votes')} iconName={icon('checkmark.square', 'how_to_vote')} />
      {openMotions.length === 0 && !loading ? (
        <Card>
          <ThemedText type="default" themeColor="textSecondary" style={styles.center}>
            {t('No open votes right now.')}
          </ThemedText>
        </Card>
      ) : null}
      {openMotions.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/(app)/governance/[id]', params: { id: item.id } })}>
          <Card style={styles.row}>
            <IconBadge name={icon('person.badge.plus', 'person_add')} size={40} />
            <View style={styles.main}>
              <ThemedText type="smallBold" style={styles.name}>
                {item.applicant_name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Membership application')} · {t('{days}d left', { days: daysRemaining(item.closes_at) })}
              </ThemedText>
            </View>
            <Pill
              label={item.my_vote ? t('Voted') : t('Vote now')}
              tone={item.my_vote ? 'good' : 'warn'}
            />
          </Card>
        </Pressable>
      ))}

      {pastMotions.length > 0 ? (
        <>
          <SectionTitle title={t('Past Motions')} iconName={icon('clock', 'history')} />
          <Card>
            {pastMotions.map((m, i) => (
              <View key={m.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(app)/governance/[id]', params: { id: m.id } })}
                  style={styles.pastRow}>
                  <ThemedText type="default" style={styles.main}>
                    {m.applicant_name}
                  </ThemedText>
                  <Pill
                    label={m.status === 'approved' ? t('Approved') : t('Declined')}
                    tone={m.status === 'approved' ? 'good' : 'bad'}
                  />
                </Pressable>
              </View>
            ))}
          </Card>
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
  pastRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two, gap: Spacing.two },
});
