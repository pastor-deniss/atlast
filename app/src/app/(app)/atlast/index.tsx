import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Chevron, icon, Pill } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { fetchIsAtlastAdmin, loadConsoleGroups, type ConsoleGroup } from '@/lib/group-rules';
import { useT } from '@/lib/i18n';

// Atlast console: every group, for the Atlast admin, with no membership
// needed. Shows each group's lock status and any rule change waiting on
// Atlast (to open the vote, or to decide once a third of members said yes).
export default function AtlastConsoleScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [groups, setGroups] = useState<ConsoleGroup[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    const ok = await fetchIsAtlastAdmin(session.user.id);
    setAllowed(ok);
    if (ok) setGroups(await loadConsoleGroups());
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (allowed === null) return <ThemedView style={styles.flex} />;
  if (!allowed) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText type="default" themeColor="textSecondary">
          {t('This area is for the Atlast admin only.')}
        </ThemedText>
      </ThemedView>
    );
  }

  const waiting = (g: ConsoleGroup) =>
    g.open && (g.open.status === 'proposed' || (g.open.needed !== null && g.open.yes >= g.open.needed));

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('You oversee every group here without being a member. Open a group to enter and lock its rules, run votes on changes and read its audit log.')}
          </ThemedText>
          {groups.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/(app)/atlast/group/[id]', params: { id: g.id } })}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
              <Card>
                <View style={styles.row}>
                  <SymbolView
                    name={g.lockedAt ? icon('lock.fill', 'lock') : icon('lock.open', 'lock_open')}
                    size={20}
                    tintColor={theme.primary}
                  />
                  <View style={styles.flex}>
                    <ThemedText type="smallBold">{g.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('{count} members', { count: g.members })} · {g.lockedAt ? t('Rules locked') : t('Rules not locked')}
                    </ThemedText>
                  </View>
                  <Chevron />
                </View>
                {g.open ? (
                  <View style={styles.row}>
                    <Pill
                      label={
                        g.open.status === 'proposed'
                          ? t('Change proposed — open the vote')
                          : waiting(g)
                            ? t('A third voted yes — your decision')
                            : t('Vote in progress: {yes}/{needed} yes', { yes: g.open.yes, needed: g.open.needed ?? 0 })
                      }
                      tone={waiting(g) ? 'warn' : 'neutral'}
                    />
                  </View>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
