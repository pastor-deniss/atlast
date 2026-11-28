import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { useInstallApp } from '@/lib/install-app';

const GOLD = '#F2B33D';
const CREAM = '#F6F3EC';
const VISIBLE_MS = 6000; // left alone, it slides away after this
const HELP_VISIBLE_MS = 12000; // longer once the iPhone steps are showing
const SLIDE_MS = 350;
const useNative = Platform.OS !== 'web';

/**
 * A light "Install the app" banner that slides down from the top once, just
 * after the opening animation, for people using Atlast in a browser. It goes
 * away by itself after a few seconds if they don't tap it. Shown only where
 * the browser can install the app and it isn't installed yet.
 */
export function InstallBanner() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { mode, install } = useInstallApp();
  const [slide] = useState(() => new Animated.Value(0));
  const [phase, setPhase] = useState<'waiting' | 'shown' | 'done'>('waiting');
  const [showIosHelp, setShowIosHelp] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(slide, { toValue: 0, duration: SLIDE_MS, useNativeDriver: useNative }).start(() =>
      setPhase('done')
    );
  };
  const hideLater = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(hide, ms);
  };

  // Appear once, as soon as the browser says the app can be installed.
  useEffect(() => {
    if (phase !== 'waiting' || mode === 'none') return;
    setPhase('shown');
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) slide.setValue(1);
      else Animated.timing(slide, { toValue: 1, duration: SLIDE_MS, useNativeDriver: useNative }).start();
    });
    timer.current = setTimeout(hide, VISIBLE_MS);
    // hide only touches refs and stable values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, slide]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (phase !== 'shown') return null;

  const onPress = () => {
    if (mode === 'prompt') {
      hide();
      install();
    } else {
      setShowIosHelp(true);
      hideLater(HELP_VISIBLE_MS);
    }
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.holder,
        {
          top: insets.top + Spacing.two,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }],
        },
      ]}>
      <View style={styles.banner}>
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.main}>
          <View style={styles.dot} />
          <View style={styles.texts}>
            <Text style={styles.title}>{t('Install the app')}</Text>
            <Text style={styles.sub}>
              {showIosHelp
                ? t('Tap the Share button, then "Add to Home Screen".')
                : t('Open Atlast from your home screen, like any app.')}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} hitSlop={10} onPress={hide}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  holder: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 900, paddingHorizontal: Spacing.three },
  banner: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(15, 61, 46, 0.92)',
    borderColor: 'rgba(246, 243, 236, 0.18)',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: GOLD },
  texts: { flex: 1 },
  title: { color: CREAM, fontWeight: '600', fontSize: 15 },
  sub: { color: CREAM, opacity: 0.75, fontSize: 13, marginTop: 1 },
  close: { color: CREAM, opacity: 0.7, fontSize: 22, lineHeight: 22, paddingHorizontal: 4 },
});
