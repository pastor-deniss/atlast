import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AtlastLogo } from '@/components/atlast-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

export type IconName = SymbolViewProps['name'];

/** Shorthand for an icon: SF Symbol name on iOS, Material Symbol name on Android and web. */
export function icon(ios: string, material: string): IconName {
  return { ios, android: material, web: material } as unknown as IconName;
}

export const OnGreen = Brand.cream;
export const OnGreenMuted = 'rgba(246, 243, 236, 0.75)';

export function useHeaderColor() {
  return useColorScheme() === 'dark' ? '#134634' : Brand.green;
}

/** The green rounded header card at the top of every main screen. */
export function ScreenHeader({
  title,
  subtitle,
  admin,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string | null; admin?: boolean }>) {
  const t = useT();
  const headerColor = useHeaderColor();
  return (
    <View style={[styles.header, { backgroundColor: headerColor }]}>
      <SafeAreaView edges={['top']}>
        <View style={styles.headerInner}>
          <AtlastLogo width={104} variant="reversed" />
          <ThemedText type="subtitle" style={[styles.onGreen, styles.headerTitle]}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="default" style={styles.onGreenMuted}>
              {subtitle}
            </ThemedText>
          ) : null}
          {admin ? (
            <View style={styles.adminBadge}>
              <SymbolView
                name={icon('checkmark.shield', 'verified_user')}
                size={16}
                tintColor={Brand.gold}
              />
              <ThemedText type="smallBold" style={{ color: Brand.gold }}>
                {t('Admin')}
              </ThemedText>
            </View>
          ) : null}
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

/** A tab screen: green header, then scrolling content on the cream page. */
export function Screen({
  header,
  children,
  scrollProps,
}: PropsWithChildren<{ header: ReactNode; scrollProps?: ScrollViewProps }>) {
  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        {...scrollProps}>
        <View style={styles.column}>
          {header}
          <View style={styles.body}>{children}</View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

/** A white (or green in dark mode) rounded card. */
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]}>{children}</View>;
}

/** An icon in a small tinted square, as used on tiles and menu rows. */
export function IconBadge({ name, size = 44 }: { name: IconName; size?: number }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <View
      style={[
        styles.iconBadge,
        {
          width: size,
          height: size,
          backgroundColor: scheme === 'dark' ? theme.backgroundSelected : '#F1ECDF',
        },
      ]}>
      <SymbolView name={name} size={Math.round(size * 0.5)} tintColor={theme.primary} />
    </View>
  );
}

export function Chevron() {
  const theme = useTheme();
  return <SymbolView name={icon('chevron.right', 'chevron_right')} size={18} tintColor={theme.textSecondary} />;
}

/** A tappable row: icon square, title, optional subtitle, chevron. */
export function MenuRow({
  iconName,
  title,
  subtitle,
  onPress,
  separate,
}: {
  iconName: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  /** Draw as its own card instead of a row inside a shared card. */
  separate?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        separate && [styles.card, { backgroundColor: theme.backgroundElement }],
        { opacity: pressed ? 0.75 : 1 },
      ]}>
      <IconBadge name={iconName} />
      <View style={styles.menuText}>
        <ThemedText type="smallBold" style={styles.menuTitle}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <Chevron />
    </Pressable>
  );
}

/** A thin divider between rows inside a card. */
export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />;
}

/** A small rounded status label, e.g. "Active". */
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const theme = useTheme();
  const colors = {
    neutral: { bg: theme.backgroundSelected, fg: theme.text },
    good: { bg: 'rgba(34, 197, 94, 0.15)', fg: theme.primary },
    warn: { bg: 'rgba(245, 158, 11, 0.18)', fg: '#B45309' },
    bad: { bg: 'rgba(220, 38, 38, 0.12)', fg: Brand.danger },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <ThemedText type="small" style={{ color: colors.fg }}>
        {label}
      </ThemedText>
    </View>
  );
}

/** A thin progress bar. `value` is 0..1. */
export function ProgressBar({ value }: { value: number }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
      <View
        style={[
          styles.barFill,
          {
            width: `${Math.min(100, Math.max(0, value * 100))}%`,
            backgroundColor: scheme === 'dark' ? Brand.gold : Brand.green,
          },
        ]}
      />
    </View>
  );
}

/** Section heading with an optional icon. */
export function SectionTitle({ title, iconName }: { title: string; iconName?: IconName }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionTitle}>
      {iconName ? <SymbolView name={iconName} size={20} tintColor={theme.text} /> : null}
      <ThemedText type="smallBold" style={styles.sectionTitleText}>
        {title}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: Spacing.five },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerInner: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.one,
  },
  headerTitle: { marginTop: Spacing.two },
  onGreen: { color: OnGreen },
  onGreenMuted: { color: OnGreenMuted },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.one },
  body: { padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: 20, gap: Spacing.two },
  iconBadge: { borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  menuText: { flex: 1, gap: Spacing.half },
  menuTitle: { fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  pill: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  sectionTitleText: { fontSize: 16 },
});
