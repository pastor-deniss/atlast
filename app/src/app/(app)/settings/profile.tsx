import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { supabase } from '@/lib/supabase';

export default function ProfileSettingsScreen() {
  const { session } = useSession();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setFirstName(data?.first_name ?? '');
        setLastName(data?.last_name ?? '');
        setLoading(false);
      });
  }, [session]);

  async function handleSave() {
    if (!session) return;
    setMessage(null);
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq('id', session.user.id);
    setSaving(false);
    setMessage(error ? error.message : 'Saved.');
  }

  if (loading) return null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField label="First Name" value={firstName} onChangeText={setFirstName} />
          <TextField label="Last Name" value={lastName} onChangeText={setLastName} />

          {/* Photo upload (ticket 14, Q4: Settings-only, optional) needs a
              Supabase Storage bucket + policies not yet designed in the spec
              — left as a visible placeholder rather than a half-built
              upload flow. */}
          <ThemedText type="small" themeColor="textSecondary">
            Profile photo upload isn't wired up yet — needs a Storage bucket
            and policies the spec hasn't designed.
          </ThemedText>

          {message ? <ThemedText type="small">{message}</ThemedText> : null}

          <Button title="Save" onPress={handleSave} loading={saving} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
