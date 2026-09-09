import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.brand}>
            <ThemedText type="title">Thrive</ThemedText>
            <ThemedText type="subtitle" themeColor="primary">
              Grow Together.
            </ThemedText>
          </View>

          <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
            Build together. Save together. Grow together.
          </ThemedText>

          <View style={styles.actions}>
            <Button title="Create Account" onPress={() => router.push('/(auth)/create-account')} />
            <Button
              title="Sign In"
              variant="secondary"
              onPress={() => router.push('/(auth)/sign-in')}
            />
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.five,
  },
  brand: { gap: Spacing.one },
  tagline: { maxWidth: 280 },
  actions: { gap: Spacing.two },
});
