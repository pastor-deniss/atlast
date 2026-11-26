import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AnnouncementCard } from '@/components/announcement-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card, icon, SectionTitle } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  BODY_MAX,
  fetchAnnouncements,
  TITLE_MAX,
  type Announcement,
  type AnnouncementStatus,
  type Priority,
} from '@/lib/announcements';
import { functionErrorMessage } from '@/lib/function-error';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

// Members read active announcements (and the archive). The Group Admin and
// the Treasurer post (now or as a draft), edit, activate and archive; only
// the Group Admin deletes (announcement-lifecycle.sql).
export default function AnnouncementsScreen() {
  const t = useT();
  const theme = useTheme();
  const { group, membership } = useMembership();
  const active = membership?.status === 'active';
  const isAdmin = active && membership?.role === 'group_admin';
  const canManage = active && (membership?.role === 'group_admin' || membership?.role === 'treasurer');

  const [items, setItems] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const load = useCallback(async () => {
    if (!group) return;
    const statuses: AnnouncementStatus[] = canManage ? ['draft', 'active', 'archived'] : ['active', 'archived'];
    setItems(await fetchAnnouncements(group.id, undefined, statuses));
    setLoaded(true);
  }, [group, canManage]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function call(key: string, payload: Record<string, unknown>, done: string) {
    setError(null);
    setNotice(null);
    setBusy(key);
    const { data, error: fnError } = await supabase.functions.invoke('post-announcement', { body: payload });
    setBusy(null);
    const message = (data as { error?: string } | null)?.error ?? (await functionErrorMessage(fnError));
    if (message) {
      setError(message);
      return false;
    }
    setNotice(done);
    await load();
    return true;
  }

  function resetForm() {
    setEditing(null);
    setTitle('');
    setBody('');
    setPriority('normal');
  }

  async function submit(status: 'active' | 'draft') {
    if (!group) return;
    if (!title.trim() || !body.trim()) {
      setError('Enter a title and a message.');
      return;
    }
    const ok = editing
      ? await call('save', { action: 'edit', announcement_id: editing.id, title: title.trim(), body: body.trim(), priority }, 'Changes saved.')
      : await call(
          status,
          { group_id: group.id, title: title.trim(), body: body.trim(), priority, status },
          status === 'draft' ? 'Saved as a draft. Activate it when ready.' : 'Announcement sent to all members.'
        );
    if (ok) resetForm();
  }

  function startEdit(a: Announcement) {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    setPriority(a.priority);
    setError(null);
    setNotice(null);
  }

  const setStatus = (a: Announcement, status: 'active' | 'archived' | 'deleted', done: string) =>
    call(`${status}${a.id}`, { action: 'set_status', announcement_id: a.id, status }, done);

  function actions(a: Announcement) {
    if (!canManage) return null;
    return (
      <View style={styles.actions}>
        <Button title={t('Edit')} variant="secondary" onPress={() => startEdit(a)} />
        {a.status === 'active' ? (
          <Button
            title={t('Archive')}
            variant="secondary"
            loading={busy === `archived${a.id}`}
            onPress={() => setStatus(a, 'archived', 'Archived. Members can still find it in the archive.')}
          />
        ) : (
          <Button
            title={t('Activate')}
            loading={busy === `active${a.id}`}
            onPress={() => setStatus(a, 'active', 'Announcement is live.')}
          />
        )}
        {isAdmin ? (
          confirmDelete === a.id ? (
            <>
              <Button
                title={t('Confirm delete')}
                variant="danger"
                loading={busy === `deleted${a.id}`}
                onPress={() => setStatus(a, 'deleted', 'Announcement deleted.').then(() => setConfirmDelete(null))}
              />
              <Button title={t('Cancel')} variant="secondary" onPress={() => setConfirmDelete(null)} />
            </>
          ) : (
            <Button title={t('Delete')} variant="danger" onPress={() => setConfirmDelete(a.id)} />
          )
        ) : null}
      </View>
    );
  }

  const drafts = items.filter((a) => a.status === 'draft');
  const live = items.filter((a) => a.status === 'active');
  const archived = items.filter((a) => a.status === 'archived');

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {canManage ? (
            <Card>
              <ThemedText type="smallBold" style={styles.cardTitle}>
                {editing ? t('Edit Announcement') : t('New Announcement')}
              </ThemedText>
              <TextField placeholder={t('Announcement title')} value={title} onChangeText={setTitle} maxLength={TITLE_MAX} />
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
                      <ThemedText type="smallBold" style={selected ? { color: theme.onPrimary } : undefined}>
                        {p === 'normal' ? t('Normal') : t('Important')}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {editing ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('Members will see it marked “Edited” with the date and time. They are not notified again.')}
                </ThemedText>
              ) : null}
              {error ? (
                <ThemedText type="small" themeColor="danger">
                  {t(error)}
                </ThemedText>
              ) : null}
              {notice ? (
                <ThemedText type="small" themeColor="primary">
                  {t(notice)}
                </ThemedText>
              ) : null}
              {editing ? (
                <View style={styles.actions}>
                  <Button title={t('Cancel')} variant="secondary" onPress={resetForm} />
                  <Button title={t('Save changes')} loading={busy === 'save'} onPress={() => submit('active')} />
                </View>
              ) : (
                <View style={styles.actions}>
                  <Button title={t('Save as draft')} variant="secondary" loading={busy === 'draft'} onPress={() => submit('draft')} />
                  <Button title={t('Send Announcement')} loading={busy === 'active'} onPress={() => submit('active')} />
                </View>
              )}
            </Card>
          ) : null}

          {canManage && drafts.length > 0 ? (
            <>
              <SectionTitle title={t('Drafts (only you and the Admin/Treasurer see these)')} iconName={icon('pencil', 'edit_note')} />
              {drafts.map((a) => (
                <AnnouncementCard key={a.id} announcement={a}>
                  {actions(a)}
                </AnnouncementCard>
              ))}
            </>
          ) : null}

          <SectionTitle title={t('Announcements')} iconName={icon('megaphone', 'campaign')} />
          {loaded && live.length === 0 ? (
            <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
              {t('No announcements yet.')}
            </ThemedText>
          ) : null}
          {live.map((a) => (
            <AnnouncementCard key={a.id} announcement={a}>
              {actions(a)}
            </AnnouncementCard>
          ))}

          {archived.length > 0 ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => setShowArchive((v) => !v)}>
                <SectionTitle
                  title={`${t('Archive')} (${archived.length}) ${showArchive ? '▾' : '▸'}`}
                  iconName={icon('archivebox', 'inventory_2')}
                />
              </Pressable>
              {showArchive
                ? archived.map((a) => (
                    <AnnouncementCard key={a.id} announcement={a}>
                      {actions(a)}
                    </AnnouncementCard>
                  ))
                : null}
            </>
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
  cardTitle: { fontSize: 16 },
  bodyInput: { minHeight: 110, textAlignVertical: 'top' },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: Spacing.half, gap: Spacing.half },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', marginTop: Spacing.three },
});
