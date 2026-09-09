import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { supabase } from '@/lib/supabase';

// Placeholder Home — the real Home dashboard (contributions/shares/shortcuts)
// is ticket 15's job. This just proves the auth slice (ticket 14) actually
// reaches a signed-in, RLS-protected screen end to end.
export default function HomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('first_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setFirstName(data?.first_name ?? null));
  }, [session]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.content}>
          <ThemedText type="title">
            {firstName ? `Hi, ${firstName}` : 'Welcome to Thrive'}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            The Home dashboard (contributions, shares, group shortcuts) lands with ticket 15.
          </ThemedText>
          <Button title="Settings" variant="secondary" onPress={() => router.push('/(app)/settings')} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
});
