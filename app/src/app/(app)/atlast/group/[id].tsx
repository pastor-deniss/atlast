import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GroupRulesView } from '@/components/group-rules-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Divider } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth/session-context';
import { formatDateTime } from '@/lib/datetime';
import { fetchIsAtlastAdmin, loadGroupAudit, type AuditRow } from '@/lib/group-rules';
import { useT } from '@/lib/i18n';
import { fetchNames } from '@/lib/spending';
import { supabase } from '@/lib/supabase';

type Tab = 'rules' | 'audit';

// One group in the AtLast console: its rules (same view members see, with
// the AtLast controls) and its audit log, read-only.
export default function AtlastGroupScreen() {
  const t = useT();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [group, setGroup] = useState<{ name: string; currency: string } | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('rules');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!session || !id) return;
    const ok = await fetchIsAtlastAdmin(session.user.id);
    setAllowed(ok);
    if (!ok) return;
    const { data } = await supabase.from('groups').select('name, currency').eq('id', id).maybeSingle();
    setGroup(data ?? null);
    const rows = await loadGroupAudit(id);
    setAudit(rows);
    setNames(await fetchNames(rows.map((r) => r.actor_id ?? '')));
  }, [session, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (allowed === false) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText type="default" themeColor="textSecondary">
          {t('This area is for the AtLast admin only.')}
        </ThemedText>
      </ThemedView>
    );
  }
  if (!group || !id) return <ThemedView style={styles.flex} />;

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.tabs, styles.column]}>
        <ThemedText type="subtitle" style={styles.title}>
          {group.name}
        </ThemedText>
        <View style={styles.tabRow}>
          {(['rules', 'audit'] as const).map((k) => {
            const on = tab === k;
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setTab(k)}
                style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundSelected }]}>
                <ThemedText type="small" style={{ color: on ? theme.onPrimary : theme.text }}>
                  {k === 'rules' ? t('Group Rules') : t('Audit Log')}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
      {tab === 'rules' ? (
        <GroupRulesView groupId={id} currency={group.currency} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.column}>
            <Card>
              {audit.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('No entries yet.')}
                </ThemedText>
              ) : (
                audit.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.auditRow}>
                      <ThemedText type="smallBold">{a.action}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {a.actor_id ? names.get(a.actor_id) || t('Member') : t('System')} · {formatDateTime(a.created_at)}
                      </ThemedText>
                      {a.reason ? <ThemedText type="small">“{a.reason}”</ThemedText> : null}
                    </View>
                  </View>
                ))
              )}
            </Card>
          </View>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  content: { flexGrow: 1, padding: Spacing.four, paddingBottom: Spacing.five },
  tabs: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  title: { fontSize: 20, lineHeight: 26 },
  tabRow: { flexDirection: 'row', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: 999 },
  auditRow: { gap: 2, paddingVertical: Spacing.two },
});
