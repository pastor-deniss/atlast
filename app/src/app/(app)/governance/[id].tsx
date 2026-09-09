import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { supabase } from '@/lib/supabase';

type Motion = {
  id: string;
  status: string;
  closes_at: string;
  subject_membership_id: string;
};

type Applicant = { name: string; application_note: string | null };

function daysRemaining(closesAt: string) {
  const ms = new Date(closesAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// Ticket 18: one screen adapting to the Motion's status and whether this
// member has already voted -- Cast Vote / Vote Submitted / Vote Results all
// live at the same URL, the same pattern as ticket 17's loan detail screen.
// The fail-fast-vs-closes_at race (Q5) is resolved purely by re-reading
// motion.status server-side: a member opening this after fail-fast already
// fired sees the outcome directly, never a stale vote prompt.
export default function MotionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();

  const [motion, setMotion] = useState<Motion | null>(null);
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [myVote, setMyVote] = useState<'approve' | 'decline' | null>(null);
  const [tally, setTally] = useState<{ approve_count: number; decline_count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !session) return;
    setLoading(true);

    const { data: motionRow } = await supabase.from('motions').select('*').eq('id', id).single();
    setMotion(motionRow);
    if (!motionRow) {
      setLoading(false);
      return;
    }

    const { data: membershipRow } = await supabase
      .from('memberships')
      .select('user_id, application_note')
      .eq('id', motionRow.subject_membership_id)
      .single();

    const { data: profile } = await supabase
      .from('profiles_public')
      .select('first_name, last_name')
      .eq('id', membershipRow!.user_id)
      .single();
    setApplicant({
      name: `${profile!.first_name} ${profile!.last_name}`,
      application_note: membershipRow!.application_note,
    });

    const { data: voteRow } = await supabase
      .from('votes')
      .select('choice')
      .eq('motion_id', id)
      .eq('voter_id', session.user.id)
      .maybeSingle();
    setMyVote((voteRow?.choice as 'approve' | 'decline' | undefined) ?? null);

    // Never queried while status='open' (Q per ticket 18's Answer) -- shown
    // only once the Motion has actually resolved.
    if (motionRow.status !== 'open') {
      const { data: tallyRow } = await supabase
        .from('motion_tallies')
        .select('approve_count, decline_count')
        .eq('motion_id', id)
        .maybeSingle();
      setTally(tallyRow ?? { approve_count: 0, decline_count: 0 });
    }

    setLoading(false);
  }, [id, session]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !motion || !applicant) return null;

  async function castVote(choice: 'approve' | 'decline') {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('cast-vote', {
      body: { motion_id: id, choice },
    });
    setBusy(false);
    const errorMessage = (data as { error?: string })?.error ?? fnError?.message;
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    await load();
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.content}>
          <ThemedText type="title">{applicant.name}</ThemedText>
          {applicant.application_note ? (
            <ThemedText type="default" themeColor="textSecondary">
              "{applicant.application_note}"
            </ThemedText>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}

          {motion.status === 'open' && !myVote ? (
            <View style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary">
                {daysRemaining(motion.closes_at)} days left to vote. Your ballot is secret -- not even
                the Group Admin can see how you voted.
              </ThemedText>
              <View style={styles.row}>
                <Button title="Approve" onPress={() => castVote('approve')} loading={busy} />
                <Button title="Decline" variant="danger" onPress={() => castVote('decline')} loading={busy} />
              </View>
            </View>
          ) : null}

          {motion.status === 'open' && myVote ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">Vote Submitted</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                Your vote has been recorded. Results will be shown once voting closes.
              </ThemedText>
            </View>
          ) : null}

          {motion.status !== 'open' && tally ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">
                Membership {motion.status === 'approved' ? 'Approved' : 'Declined'}
              </ThemedText>
              <ThemedText type="default">
                Approve {tally.approve_count} / Decline {tally.decline_count}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  section: { gap: Spacing.two, marginTop: Spacing.three, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: Spacing.two },
});
