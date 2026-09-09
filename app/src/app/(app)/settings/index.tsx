import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppLock } from '@/lib/auth/app-lock-context';
import { signOutAndWipeLocalSecrets } from '@/lib/auth/sign-out';

function SettingsRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="default">{label}</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        {'>'}
      </ThemedText>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { refreshPinExists } = useAppLock();

  function confirmSignOut() {
    Alert.alert('Sign Out', 'You will need to verify your phone and set a new PIN next time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOutAndWipeLocalSecrets();
          await refreshPinExists();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.content}>
          <SettingsRow label="Profile" onPress={() => router.push('/(app)/settings/profile')} />
          <SettingsRow label="Security" onPress={() => router.push('/(app)/settings/security')} />

          <View style={styles.spacer} />
          <Button title="Sign Out" variant="danger" onPress={confirmSignOut} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 10,
  },
  spacer: { height: Spacing.four },
});
