import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, icon, IconBadge, Pill, ProgressBar } from '@/components/ui/screen';
import { Brand, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { DecisionItem, Verdict } from '@/lib/decisions';
import { useT } from '@/lib/i18n';

const KIND_LABEL: Record<DecisionItem['kind'], string> = {
  membership: 'Membership approval',
  loan: 'Loan approval',
  jamii: 'Jamii approval',
  expense: 'Charge approval',
};

const KIND_ICON: Record<DecisionItem['kind'], [string, string]> = {
  membership: ['person.badge.plus', 'person_add'],
  loan: ['building.columns', 'account_balance'],
  jamii: ['heart.fill', 'volunteer_activism'],
  expense: ['banknote', 'payments'],
};

const VERDICT_ICON: Record<Verdict, [string, string]> = {
  approve: ['checkmark', 'check'],
  decline: ['xmark', 'close'],
  pending: ['checkmark.shield', 'verified_user'],
};

// One person's verdict in a tile: icon + name + the decision in words
// (Amekubali / Amekataa / Anasubiri), so colour is never the only signal.
function Tile({ name, verdict, label }: { name: string; verdict: Verdict; label: string }) {
  const theme = useTheme();
  const [ios, material] = VERDICT_ICON[verdict];
  const tint = verdict === 'approve' ? theme.primary : verdict === 'decline' ? theme.danger : theme.textSecondary;
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: verdict === 'pending' ? theme.backgroundSelected : theme.background,
          borderColor: verdict === 'decline' ? theme.danger : theme.backgroundSelected,
        },
      ]}
      accessible
      accessibilityLabel={`${name}: ${label}`}>
      <SymbolView name={icon(ios, material)} size={18} tintColor={tint} />
      <ThemedText type="smallBold" numberOfLines={1} style={styles.center}>
        {name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.tileLabel]}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Mapitio card: who is asking, why, the approvers and where it stands. */
export function DecisionCard({
  item,
  currency,
  onPress,
}: {
  item: DecisionItem;
  currency: string;
  onPress: () => void;
}) {
  const t = useT();
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const [ios, material] = KIND_ICON[item.kind];
  const verdictWord = (v: Verdict) => t(v === 'approve' ? 'Has approved' : v === 'decline' ? 'Has declined' : 'Is waiting');

  // Progress: approvals so far out of what is needed.
  const approvals = item.approvers
    ? item.approvers.filter((a) => a.verdict === 'approve').length
    : (item.counts?.approve ?? 0);
  const total = item.approvers ? item.approvers.length : null;

  const waitingOnMe = item.status === 'open' && item.myRole === 'decider' && item.myVerdict === 'pending';

  let footer: string;
  if (item.status !== 'open') {
    footer = item.status === 'approved' ? t('Approved') : t('Declined');
  } else if (item.myRole === 'decider' && item.myVerdict === 'approve') {
    footer = item.kind === 'membership' ? t('✓ You have voted') : t('✓ You reviewed and approved this request');
  } else if (item.myRole === 'decider' && item.myVerdict === 'decline') {
    footer = item.kind === 'membership' ? t('✓ You have voted') : t('✓ You reviewed and declined this request');
  } else if (item.myRole === 'applicant') {
    footer = t('Your request is waiting for the approvers');
  } else if (waitingOnMe) {
    footer = '';
  } else {
    footer = t('Waiting for the approvers');
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card>
        <View style={styles.kindRow}>
          <IconBadge name={icon(ios, material)} size={36} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {t(KIND_LABEL[item.kind])}
          </ThemedText>
          {item.status !== 'open' ? (
            <Pill label={item.status === 'approved' ? t('Approved') : t('Declined')} tone={item.status === 'approved' ? 'good' : 'bad'} />
          ) : null}
        </View>

        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <ThemedText type="subtitle" style={styles.title}>
              {item.title ? t(item.title) : t('Member')}
            </ThemedText>
            {item.description ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {item.description}
              </ThemedText>
            ) : null}
          </View>
          {item.amount !== null ? (
            <ThemedText type="subtitle" style={[styles.amount, { color: theme.primary }]}>
              {currency} {Math.round(item.amount).toLocaleString()}
            </ThemedText>
          ) : null}
        </View>

        {item.approvers ? (
          <>
            <View style={styles.progressHead}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Approvers’ decisions')}
              </ThemedText>
              <ThemedText type="smallBold">
                {approvals}/{total}
              </ThemedText>
            </View>
            <ProgressBar value={total ? approvals / total : 0} />
            <View style={styles.tiles}>
              {item.approvers.map((a, i) => (
                <Tile
                  key={a.key}
                  name={a.isMe ? t('You') : a.name || t('Reviewer {n}', { n: i + 1 })}
                  verdict={a.verdict}
                  label={verdictWord(a.verdict)}
                />
              ))}
            </View>
          </>
        ) : item.counts ? (
          <>
            <View style={styles.tiles}>
              <Tile name={String(item.counts.approve)} verdict="approve" label={t('Have approved')} />
              <Tile name={String(item.counts.decline)} verdict="decline" label={t('Have declined')} />
              {item.status === 'open' ? (
                <Tile name={String(item.counts.pending)} verdict="pending" label={t('Still to vote')} />
              ) : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {t('Secret ballot: only the totals are shown.')}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {t('The Group Admin decides this one.')}
          </ThemedText>
        )}

        {waitingOnMe ? (
          <View style={[styles.voteButton, { backgroundColor: dark ? Brand.gold : Brand.green }]}>
            <ThemedText type="smallBold" style={{ color: dark ? Brand.green : Brand.cream }}>
              {item.kind === 'membership' ? t('Vote now') : t('Review now')}
            </ThemedText>
          </View>
        ) : footer ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {footer}
          </ThemedText>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  title: { fontSize: 18, lineHeight: 24 },
  amount: { fontSize: 18, lineHeight: 24 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between' },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: 12,
    borderWidth: 1,
  },
  tileLabel: { fontSize: 12 },
  voteButton: {
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: Spacing.two + 2,
  },
});
