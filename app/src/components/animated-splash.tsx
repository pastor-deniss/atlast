import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

// Same colour as the native splash in app.json (which shows no image), so the
// hand-over from the native splash to this one is invisible.
const SPLASH_GREEN = '#0F3D2E';
const CREAM = '#F6F3EC';
const GOLD = '#F2B33D';

const RING_SIZE = 200;
const WORD_WIDTH = 170;
const WORD_ASPECT = 709 / 199; // width / height of wordmark-reversed.png

// Timing: one dot every DOT_STEP_MS round the ring, the gold one last, then
// the word, then the app opens at the same steady pace.
const DOT_STEP_MS = 180;
const DOT_POP_MS = 260;
const WORD_DELAY_MS = 150;
const WORD_FADE_MS = 500;
const HOLD_MS = 450;
const FADE_OUT_MS = 350;

const useNative = Platform.OS !== 'web';

// The eight dots of the AtLast mark, measured from splash-icon.png (456 px
// square), in ring order: clockwise from the smallest dot, ending on gold.
const SRC = 456;
const DOTS = [
  { x: 391, y: 227.5, r: 16.5 },
  { x: 343.5, y: 343, r: 21 },
  { x: 227.5, y: 391.5, r: 25 },
  { x: 112, y: 343, r: 29.5 },
  { x: 63.5, y: 227.5, r: 34 },
  { x: 112, y: 112, r: 38.5 },
  { x: 227.5, y: 64, r: 43 },
  { x: 343, y: 111.5, r: 49.5, gold: true },
].map((d) => {
  const k = RING_SIZE / SRC;
  return { left: (d.x - d.r) * k, top: (d.y - d.r) * k, size: d.r * 2 * k, gold: !!d.gold };
});

/**
 * The opening screen: the AtLast dots appear one by one round the ring, the
 * gold one last, then the word "atlast" fades in. It stays until the sequence
 * has played and the app is `ready`, then fades out.
 */
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish?: () => void }) {
  const [dots] = useState(() => DOTS.map(() => new Animated.Value(0)));
  const [word] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(1));
  const [sequenceDone, setSequenceDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      // People who ask their phone to reduce motion get the whole logo at once.
      if (reduce) {
        dots.forEach((d) => d.setValue(1));
        word.setValue(1);
        timer = setTimeout(() => setSequenceDone(true), 1200);
        return;
      }
      anim = Animated.sequence([
        Animated.stagger(
          DOT_STEP_MS,
          dots.map((d) =>
            Animated.timing(d, {
              toValue: 1,
              duration: DOT_POP_MS,
              easing: Easing.out(Easing.back(1.8)),
              useNativeDriver: useNative,
            })
          )
        ),
        Animated.delay(WORD_DELAY_MS),
        Animated.timing(word, {
          toValue: 1,
          duration: WORD_FADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: useNative,
        }),
        Animated.delay(HOLD_MS),
      ]);
      anim.start(({ finished }) => finished && setSequenceDone(true));
    });
    return () => {
      anim?.stop();
      if (timer) clearTimeout(timer);
    };
  }, [dots, word]);

  useEffect(() => {
    if (!ready || !sequenceDone) return;
    Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: useNative }).start(() => {
      setGone(true);
      onFinish?.();
    });
  }, [ready, sequenceDone, opacity, onFinish]);

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={ready && sequenceDone ? 'none' : 'auto'}
      style={[styles.cover, { opacity }]}
      accessibilityLabel="AtLast"
      // Once this screen is drawn, the plain native splash can go.
      onLayout={() => SplashScreen.hideAsync()}>
      <View style={styles.ring}>
        {DOTS.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: d.left,
              top: d.top,
              width: d.size,
              height: d.size,
              borderRadius: d.size / 2,
              backgroundColor: d.gold ? GOLD : CREAM,
              opacity: dots[i],
              transform: [{ scale: dots[i] }],
            }}
          />
        ))}
      </View>
      <Animated.Image
        source={require('@/assets/images/wordmark-reversed.png')}
        style={[
          styles.word,
          {
            opacity: word,
            transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SPLASH_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  ring: { width: RING_SIZE, height: RING_SIZE },
  word: { width: WORD_WIDTH, height: WORD_WIDTH / WORD_ASPECT, marginTop: 28 },
});
