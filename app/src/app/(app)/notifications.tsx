import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Divider, icon, IconBadge } from '@/components/ui/screen';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import {
  describe,
  destination,
  fetchNotifications,
  iconFor,
  markRead,
  timeAgo,
  type AppNotification,
} from '@/lib/notifications';

export default function NotificationsScreen() {
  const router = useRouter();
  const t = useT();
  const theme = useTheme();
  const scheme = useColorScheme();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setItems(await fetchNotifications());
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);

  async function markAllRead() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await markRead(unreadIds);
  }

  async function open(n: AppNotification) {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      markRead([n.id]);
    }
    const target = destination(n);
    if (target) router.push(target);
  }

  const unreadDot = scheme === 'dark' ? Brand.gold : Brand.green;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          {unreadIds.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={markAllRead} style={styles.markAll}>
              <ThemedText type="smallBold" themeColor="primary">
                {t('Mark all as read')}
              </ThemedText>
            </Pressable>
          ) : null}

          {loaded && items.length === 0 ? (
            <Card style={styles.empty}>
              <IconBadge name={icon('bell', 'notifications')} size={52} />
              <ThemedText type="default" themeColor="textSecondary" style={styles.center}>
                {t("No notifications yet. You'll see votes, loans, announcements and answers to your complaints here.")}
              </ThemedText>
            </Card>
          ) : null}

          {items.length > 0 ? (
            <Card style={styles.list}>
              {items.map((n, i) => {
                const { title, body } = describe(n, t);
                const [ios, material] = iconFor(n.kind);
                const unread = !n.read_at;
                return (
                  <View key={n.id}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => open(n)}
                      style={({ pressed }) => [
                        styles.row,
                        unread && { backgroundColor: theme.backgroundSelected },
                        { opacity: pressed ? 0.75 : 1 },
                      ]}>
                      <IconBadge name={icon(ios, material)} size={40} />
                      <View style={styles.main}>
                        <ThemedText type={unread ? 'smallBold' : 'small'} style={styles.title}>
                          {title}
                        </ThemedText>
                        {body ? (
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                            {body}
                          </ThemedText>
                        ) : null}
                        <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
                          {timeAgo(n.created_at, t)}
                        </ThemedText>
                      </View>
                      {unread ? <View style={[styles.dot, { backgroundColor: unreadDot }]} /> : null}
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  markAll: { alignSelf: 'flex-end', paddingVertical: Spacing.one },
  empty: { alignItems: 'center', paddingVertical: Spacing.five },
  center: { textAlign: 'center' },
  list: { padding: Spacing.one, gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: 14,
  },
  main: { flex: 1, gap: 2 },
  title: { fontSize: 15 },
  time: { fontSize: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: Spacing.two },
});
