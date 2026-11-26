import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type Applicant = { name: string; application_note: string | null; status: string };

// Ticket 18: Group Admin's pre-screen -- the "easy no" (Reject, no Motion) vs
// "hard yes" (Initiate Vote, escalates to the whole group) asymmetric gate
// from ticket 11. Same deliberately-thin applicant fields as the voter-facing
// Motion Detail screen -- no contribution-history/community-involvement
// figures, since an applicant isn't a member yet at all.
export default function AdminMembershipReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();

  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: membershipRow } = await supabase
      .from('memberships')
      .select('user_id, application_note, status')
      .eq('id', id)
      .single();
    if (!membershipRow) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles_public')
      .select('first_name, last_name')
      .eq('id', membershipRow.user_id)
      .single();

    setApplicant({
      name: `${profile!.first_name} ${profile!.last_name}`,
      application_note: membershipRow.application_note,
      status: membershipRow.status,
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !applicant) return null;

  async function decide(action: 'reject-membership-application' | 'initiate-membership-vote') {
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke(action, {
      body: { membership_id: id },
    });
    setBusy(false);
    const errorMessage = (data as { error?: string })?.error ?? fnError?.message;
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    if (action === 'initiate-membership-vote') {
      const motion = (data as { motion: { id: string } }).motion;
      router.replace({ pathname: '/(app)/governance/[id]', params: { id: motion.id } });
    } else {
      router.replace('/(app)/governance');
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{applicant.name}</ThemedText>
          {applicant.application_note ? (
            <ThemedText type="default" themeColor="textSecondary">
              "{applicant.application_note}"
            </ThemedText>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="danger">
              {t(error)}
            </ThemedText>
          ) : null}

          {applicant.status === 'pending' ? (
            <View style={styles.row}>
              <Button
                title={t('Reject')}
                variant="danger"
                onPress={() => decide('reject-membership-application')}
                loading={busy}
              />
              <Button title={t('Initiate Vote')} onPress={() => decide('initiate-membership-vote')} loading={busy} />
            </View>
          ) : (
            <ThemedText type="default" themeColor="textSecondary">
              {t('This application has already been decided.')}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
});
