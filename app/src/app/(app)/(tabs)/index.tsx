import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnouncementCard } from '@/components/announcement-card';
import { AtlastLogo } from '@/components/atlast-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Brand, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { fetchAnnouncements, type Announcement } from '@/lib/announcements';
import { useSession } from '@/lib/auth/session-context';
import { useT } from '@/lib/i18n';
import { useMembership } from '@/lib/membership-context';
import { supabase } from '@/lib/supabase';

type IconName = SymbolViewProps['name'];

type Leader = { memberId: string; name: string; total: number };

const LEADERBOARD_SIZE = 5;
// Home shows the newest announcement only while it is recent.
const ANNOUNCEMENT_FRESH_DAYS = 14;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatMoney(currency: string | undefined, amount: number) {
  return `${currency ?? ''} ${amount.toLocaleString()}`.trim();
}

// Rank badge colours: gold, silver, bronze, then plain.
const RANK_COLORS = [Brand.gold, '#D1D5DB', '#C98A5A'];

// Ticket 15: Home is a personal snapshot + action center once active in a
// group. Before that, it renders whichever state the membership is actually
// in -- no group yet, pending review, or declined.
export default function HomeScreen() {
  const router = useRouter();
  const t = useT();
  const theme = useTheme();
  const scheme = useColorScheme();
  const { session } = useSession();
  const { membership, group, loading } = useMembership();

  const [firstName, setFirstName] = useState<string | null>(null);
  const [totals, setTotals] = useState({ contributed: 0, shares: 0 });
  const [votesWaiting, setVotesWaiting] = useState(0);
  const [reviewsWaiting, setReviewsWaiting] = useState(0);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [groupFund, setGroupFund] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);

  const isActive = membership?.status === 'active';

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('first_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setFirstName(data?.first_name ?? null));
  }, [session]);

  // Shown once, the first time this membership is seen as active (ticket 15).
  useEffect(() => {
    if (!membership || membership.status !== 'active') return;
    const flagKey = `thrive_welcomed_${membership.id}`;
    AsyncStorage.getItem(flagKey).then((seen) => {
      if (!seen) router.replace({ pathname: '/(app)/welcome-to-group', params: { flagKey } });
    });
  }, [membership, router]);

  const load = useCallback(async () => {
    if (!session || !group || !isActive) return;
    const userId = session.user.id;

    // Every member can read the whole group's ledger (financial transparency,
    // ticket 12), so the leaderboard is just the group's contribution totals.
    const { data: totalRows } = await supabase
      .from('member_contribution_totals')
      .select('member_id, total_contributed, total_shares')
      .eq('group_id', group.id)
      .order('total_contributed', { ascending: false });
    const rows = totalRows ?? [];
    const mine = rows.find((r) => r.member_id === userId);
    setTotals({ contributed: mine?.total_contributed ?? 0, shares: mine?.total_shares ?? 0 });

    const top = rows.filter((r) => r.total_contributed > 0).slice(0, LEADERBOARD_SIZE);
    const ids = top.map((r) => r.member_id);
    const { data: profiles } =
      ids.length > 0
        ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', ids)
        : { data: [] };
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name ? `${p.last_name[0]}.` : ''}`.trim()])
    );
    setLeaders(
      top.map((r) => ({ memberId: r.member_id, name: nameById.get(r.member_id) ?? '—', total: r.total_contributed }))
    );

    const { data: balance } = await supabase
      .from('group_balances')
      .select('balance')
      .eq('group_id', group.id)
      .maybeSingle();
    setGroupFund(balance?.balance ?? 0);

    const { count } = await supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', group.id)
      .eq('status', 'active');
    setMemberCount(count ?? 0);

    const [newest] = await fetchAnnouncements(group.id, 1);
    const freshSince = Date.now() - ANNOUNCEMENT_FRESH_DAYS * 24 * 60 * 60 * 1000;
    setLatestAnnouncement(newest && new Date(newest.created_at).getTime() >= freshSince ? newest : null);

    // Open votes this member hasn't cast yet, and loan reviews assigned to them.
    const { data: openMotions } = await supabase
      .from('motions')
      .select('id')
      .eq('group_id', group.id)
      .eq('status', 'open');
    const motionIds = (openMotions ?? []).map((m) => m.id);
    const { data: myVotes } =
      motionIds.length > 0
        ? await supabase.from('votes').select('motion_id').eq('voter_id', userId).in('motion_id', motionIds)
        : { data: [] };
    setVotesWaiting(motionIds.length - (myVotes ?? []).length);

    const { count: reviewCount } = await supabase
      .from('loan_reviewers')
      .select('*', { count: 'exact', head: true })
      .eq('reviewer_id', userId)
      .eq('decision', 'pending');
    setReviewsWaiting(reviewCount ?? 0);
  }, [session, group, isActive]);

  // Refresh whenever Home comes back into view (e.g. after contributing).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return null;

  const hello = `${t(greeting())}${firstName ? `, ${firstName}` : ''}`;

  if (!membership || membership.status !== 'active') {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex}>
          <ScrollView contentContainerStyle={styles.simpleContent}>
            <ThemedText type="title">{hello}</ThemedText>
            {!membership || membership.status === 'exited' ? (
              <>
                <ThemedText type="default" themeColor="textSecondary">
                  {t("You're not in a group yet.")}
                </ThemedText>
                <Button title={t('Find a Group')} onPress={() => router.push('/(app)/join-group')} />
              </>
            ) : membership.status === 'pending' ? (
              <ThemedText type="default" themeColor="textSecondary">
                {t(
                  "Your application to {group} is being reviewed. You'll see it here once there's a decision.",
                  { group: group?.name ?? '' }
                )}
              </ThemedText>
            ) : (
              <>
                <ThemedText type="default" themeColor="textSecondary">
                  {t("Your application to {group} wasn't approved.", { group: group?.name ?? '' })}
                </ThemedText>
                <Button
                  title={t('Find another Group')}
                  onPress={() => router.push('/(app)/join-group')}
                />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const headerColor = scheme === 'dark' ? '#134634' : Brand.green;
  const actionsWaiting = votesWaiting + reviewsWaiting;
  const topTotal = leaders[0]?.total ?? 0;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Green header card */}
        <View style={[styles.header, { backgroundColor: headerColor }]}>
          <SafeAreaView edges={['top']}>
            <View style={styles.headerInner}>
              <AtlastLogo width={110} variant="reversed" />
              <ThemedText type="subtitle" style={styles.onGreen}>
                {hello}
              </ThemedText>
              <ThemedText type="default" style={styles.onGreenMuted}>
                {group?.name}
              </ThemedText>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/contributions')}
                style={styles.savingsCard}>
                <View style={styles.savingsRow}>
                  <View style={styles.flexShrink}>
                    <ThemedText type="small" style={styles.onGreenMuted}>
                      {t('Your Savings')}
                    </ThemedText>
                    <ThemedText type="title" style={[styles.onGreen, styles.savingsAmount]}>
                      {formatMoney(group?.currency, totals.contributed)}
                    </ThemedText>
                  </View>
                  <View style={styles.sharesBlock}>
                    <ThemedText type="small" style={styles.onGreenMuted}>
                      {t('Shares')}
                    </ThemedText>
                    <View style={styles.sharesValue}>
                      <SymbolView
                        name={{ ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' }}
                        size={18}
                        tintColor={Brand.cream}
                      />
                      <ThemedText type="subtitle" style={styles.onGreen}>
                        {totals.shares}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          {/* Things waiting on this member */}
          {actionsWaiting > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(votesWaiting > 0 ? '/governance' : '/(app)/loan')}
              style={[
                styles.alert,
                scheme === 'dark' ? styles.alertDark : styles.alertLight,
              ]}>
              <SymbolView
                name={{ ios: 'checkmark.square', android: 'how_to_vote', web: 'how_to_vote' }}
                size={22}
                tintColor={scheme === 'dark' ? Brand.gold : '#9A5B00'}
              />
              <View style={styles.flexShrink}>
                <ThemedText type="smallBold" style={{ color: scheme === 'dark' ? Brand.gold : '#9A5B00' }}>
                  {votesWaiting > 0
                    ? votesWaiting === 1
                      ? t('1 vote needs your decision')
                      : t('{count} votes need your decision', { count: votesWaiting })
                    : reviewsWaiting === 1
                      ? t('1 loan needs your review')
                      : t('{count} loans need your review', { count: reviewsWaiting })}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {votesWaiting > 0 ? t('Tap to vote') : t('Tap to review')}
                </ThemedText>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={18}
                tintColor={theme.textSecondary}
              />
            </Pressable>
          ) : null}

          {latestAnnouncement ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/announcements')}>
              <AnnouncementCard announcement={latestAnnouncement} />
            </Pressable>
          ) : null}

          {/* Quick actions */}
          <View style={styles.tiles}>
            <ActionTile
              label={t('Contribute')}
              icon={{ ios: 'banknote', android: 'payments', web: 'payments' }}
              onPress={() => router.push('/(app)/contribute')}
            />
            <ActionTile
              label={t('Loan')}
              icon={{ ios: 'building.columns', android: 'account_balance', web: 'account_balance' }}
              onPress={() => router.push('/(app)/loan')}
            />
            <ActionTile
              label={t('Vote')}
              icon={{ ios: 'checkmark.square', android: 'how_to_vote', web: 'how_to_vote' }}
              onPress={() => router.push('/governance')}
            />
            <ActionTile
              label={t('Info')}
              icon={{ ios: 'doc.text', android: 'description', web: 'description' }}
              onPress={() => router.push('/(app)/group-dashboard')}
            />
          </View>

          {membership.role === 'group_admin' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/admin')}
              style={[styles.card, styles.adminRow, { backgroundColor: theme.backgroundElement }]}>
              <SymbolView
                name={{ ios: 'shield', android: 'admin_panel_settings', web: 'admin_panel_settings' }}
                size={22}
                tintColor={theme.primary}
              />
              <ThemedText type="smallBold" style={styles.flexShrink}>
                {t('Admin Control Centre')}
              </ThemedText>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={18}
                tintColor={theme.textSecondary}
              />
            </Pressable>
          ) : null}

          {/* Top contributors */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.cardTitleRow}>
              <SymbolView
                name={{ ios: 'trophy', android: 'trophy', web: 'trophy' }}
                size={20}
                tintColor={theme.text}
              />
              <ThemedText type="subtitle" style={[styles.cardTitle, styles.flexShrink]}>
                {t('Top Contributors')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Total contributed')}
              </ThemedText>
            </View>

            {leaders.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('No contributions yet.')}
              </ThemedText>
            ) : (
              leaders.map((leader, i) => {
                const isMe = leader.memberId === session?.user.id;
                const rankColor = RANK_COLORS[i];
                return (
                  <View
                    key={leader.memberId}
                    style={[styles.leaderRow, isMe && { backgroundColor: theme.backgroundSelected }]}>
                    <View
                      style={[
                        styles.rank,
                        { backgroundColor: rankColor ?? theme.backgroundSelected },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: rankColor ? (i === 0 ? Brand.green : '#1F2937') : theme.text }}>
                        {i + 1}
                      </ThemedText>
                    </View>
                    <View style={styles.leaderMain}>
                      <View style={styles.leaderTop}>
                        <ThemedText type="smallBold" style={styles.flexShrink}>
                          {leader.name}
                          {isMe ? ` (${t('You')})` : ''}
                        </ThemedText>
                        <ThemedText type="smallBold">{leader.total.toLocaleString()}</ThemedText>
                      </View>
                      <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              backgroundColor: scheme === 'dark' ? Brand.gold : Brand.green,
                              width: `${topTotal > 0 ? Math.max(4, (leader.total / topTotal) * 100) : 0}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Group info */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Group Info')}
            </ThemedText>
            <View style={styles.statsRow}>
              <Stat value={formatMoney(group?.currency, groupFund ?? 0)} label={t('Total Fund')} />
              <Stat
                value={formatMoney(group?.currency, group?.share_value ?? 0)}
                label={t('Share value')}
              />
              <Stat value={String(memberCount ?? '—')} label={t('Members')} />
            </View>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function ActionTile({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 },
      ]}>
      <View
        style={[
          styles.tileIcon,
          { backgroundColor: scheme === 'dark' ? theme.backgroundSelected : '#F1ECDF' },
        ]}>
        <SymbolView name={icon} size={24} tintColor={theme.primary} />
      </View>
      <ThemedText type="smallBold" style={styles.tileLabel} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="smallBold" themeColor="primary" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flex: 1, flexShrink: 1 },
  simpleContent: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
  content: { paddingBottom: Spacing.five },
  header: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerInner: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.one,
  },
  onGreen: { color: Brand.cream },
  onGreenMuted: { color: 'rgba(246, 243, 236, 0.75)' },
  savingsCard: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  savingsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  savingsAmount: { fontSize: 32, lineHeight: 40 },
  sharesBlock: { alignItems: 'flex-end' },
  sharesValue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  body: { padding: Spacing.four, gap: Spacing.three },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
  },
  alertLight: { backgroundColor: '#FFF6DB', borderColor: '#F2D27A' },
  alertDark: { backgroundColor: 'rgba(242, 179, 61, 0.12)', borderColor: 'rgba(242, 179, 61, 0.4)' },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    borderRadius: 18,
  },
  tileIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { textAlign: 'center' },
  card: { padding: Spacing.three, borderRadius: 20, gap: Spacing.two },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  cardTitle: { fontSize: 18, lineHeight: 24 },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: 12,
  },
  rank: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  leaderMain: { flex: 1, gap: Spacing.one },
  leaderTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.half },
  statValue: { fontSize: 16, textAlign: 'center' },
  statLabel: { textAlign: 'center' },
});
