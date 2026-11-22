import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useMembership } from '@/lib/membership-context';

// Ticket 15: shown once, the first time the app sees this membership as
// active. V1 has no push notifications, so this is how an applicant finds
// out at all -- a local "have I shown this" flag, set here.
export default function WelcomeToGroupScreen() {
  const router = useRouter();
  const { group } = useMembership();
  const { flagKey } = useLocalSearchParams<{ flagKey: string }>();

  async function handleEnter() {
    if (flagKey) await AsyncStorage.setItem(flagKey, 'true');
    router.replace('/(app)');
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">Welcome!</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            You are now an active member of {group?.name}.
          </ThemedText>
          <Button title="Enter My Group" onPress={handleEnter} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
});
