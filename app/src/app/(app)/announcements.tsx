import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { AnnouncementCard } from '@/components/announcement-card';
import { Card, icon, SectionTitle } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  BODY_MAX,
  fetchAnnouncements,
  TITLE_MAX,
  type Announcement,
  type Priority,
} from '@/lib/announcements';
import { functionErrorMessage } from '@/lib/function-error';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

export default function AnnouncementsScreen() {
  const t = useT();
  const theme = useTheme();
  const { group, membership } = useMembership();
  const isAdmin = membership?.role === 'group_admin' && membership.status === 'active';

  const [items, setItems] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    if (!group) return;
    setItems(await fetchAnnouncements(group.id));
    setLoaded(true);
  }, [group]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function send() {
    if (!group) return;
    setError(null);
    setSent(false);
    if (!title.trim() || !body.trim()) {
      setError('Enter a title and a message.');
      return;
    }
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('post-announcement', {
      body: { group_id: group.id, title: title.trim(), body: body.trim(), priority },
    });
    setBusy(false);
    const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(fnError));
    if (message) {
      setError(message);
      return;
    }
    setTitle('');
    setBody('');
    setPriority('normal');
    setSent(true);
    await load();
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {isAdmin ? (
            <Card>
              <ThemedText type="smallBold" style={styles.cardTitle}>
                {t('New Announcement')}
              </ThemedText>
              <TextField
                placeholder={t('Announcement title')}
                value={title}
                onChangeText={setTitle}
                maxLength={TITLE_MAX}
              />
              <TextField
                placeholder={t('Write your message here...')}
                value={body}
                onChangeText={setBody}
                maxLength={BODY_MAX}
                multiline
                style={styles.bodyInput}
              />
              <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
                {(['normal', 'important'] as const).map((p) => {
                  const selected = priority === p;
                  return (
                    <Pressable
                      key={p}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setPriority(p)}
                      style={[styles.segment, selected && { backgroundColor: theme.primary }]}>
                      <ThemedText
                        type="smallBold"
                        style={selected ? { color: theme.onPrimary } : undefined}>
                        {p === 'normal' ? t('Normal') : t('Important')}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {error ? (
                <ThemedText type="small" themeColor="danger">
                  {t(error)}
                </ThemedText>
              ) : null}
              {sent ? (
                <ThemedText type="small" themeColor="primary">
                  {t('Announcement sent to all members.')}
                </ThemedText>
              ) : null}
              <Button title={t('Send Announcement')} onPress={send} loading={busy} />
            </Card>
          ) : null}

          <SectionTitle
            title={isAdmin ? t('Previous Announcements') : t('Announcements')}
            iconName={icon('megaphone', 'campaign')}
          />

          {loaded && items.length === 0 ? (
            <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
              {t('No announcements yet.')}
            </ThemedText>
          ) : null}

          {items.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  cardTitle: { fontSize: 16 },
  bodyInput: { minHeight: 110, textAlignVertical: 'top' },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: Spacing.half, gap: Spacing.half },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 10 },
  empty: { textAlign: 'center', marginTop: Spacing.three },
});
