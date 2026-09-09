import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

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
  const theme = useTheme();
  const { session } = useSession();
  const { group, membership } = useMembership();

  const [pending, setPending] = useState<PendingApplication[]>([]);
  const [openMotions, setOpenMotions] = useState<Motion[]>([]);
  const [pastMotions, setPastMotions] = useState<Motion[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = membership?.role === 'group_admin';

  useEffect(() => {
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
  }, [group, session, isAdmin]);

  if (!group) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <FlatList
          data={openMotions}
          keyExtractor={(m) => m.id}
          refreshing={loading}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              {isAdmin && pending.length > 0 ? (
                <View style={styles.section}>
                  <ThemedText type="subtitle">Pending Applications</ThemedText>
                  {pending.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() =>
                        router.push({ pathname: '/(app)/governance/application/[id]', params: { id: p.id } })
                      }
                      style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                      <ThemedText type="default">{p.name}</ThemedText>
                      <ThemedText type="small" themeColor="primary">
                        Review →
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Open Votes
              </ThemedText>
              {openMotions.length === 0 && !loading ? (
                <ThemedText type="default" themeColor="textSecondary">
                  No open votes right now.
                </ThemedText>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/governance/[id]', params: { id: item.id } })}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="default">{item.applicant_name}</ThemedText>
              <View style={styles.row}>
                <ThemedText type="small" themeColor={item.my_vote ? 'primary' : 'textSecondary'}>
                  {item.my_vote ? 'Your vote: Cast' : 'Your vote: Not yet cast'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {daysRemaining(item.closes_at)}d left
                </ThemedText>
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            pastMotions.length > 0 ? (
              <View>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Past Motions
                </ThemedText>
                {pastMotions.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => router.push({ pathname: '/(app)/governance/[id]', params: { id: m.id } })}
                    style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="default">{m.applicant_name}</ThemedText>
                    <ThemedText type="small" themeColor={m.status === 'approved' ? 'primary' : 'danger'}>
                      {m.status === 'approved' ? 'Approved' : 'Declined'}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.two },
  header: { gap: Spacing.two },
  section: { gap: Spacing.two },
  sectionTitle: { marginTop: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { gap: Spacing.one, padding: Spacing.three, borderRadius: 10 },
});
