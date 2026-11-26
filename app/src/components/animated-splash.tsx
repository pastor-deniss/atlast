import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet } from 'react-native';

// Same colour and image as the native splash in app.json, so the hand-over
// from the still native splash to this one is invisible.
const SPLASH_GREEN = '#0F3D2E';
const LOGO_SIZE = 200;
const MIN_VISIBLE_MS = 2000;
const TURN_MS = 1400;
const FADE_MS = 350;
const useNative = Platform.OS !== 'web';

/**
 * The opening screen with the Atlast ring of dots turning. Shown on top of the
 * app for at least two seconds and until `ready`, then it fades out.
 */
export function AnimatedSplash({ ready }: { ready: boolean }) {
  const [spin] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(1));
  const [minDone, setMinDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    // People who ask their phone to reduce motion get a still logo.
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: useNative })
      );
      loop.start();
    });
    const timer = setTimeout(() => setMinDone(true), MIN_VISIBLE_MS);
    return () => {
      clearTimeout(timer);
      loop?.stop();
    };
  }, [spin]);

  useEffect(() => {
    if (!ready || !minDone) return;
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: useNative }).start(() => setGone(true));
  }, [ready, minDone, opacity]);

  if (gone) return null;

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      pointerEvents={ready && minDone ? 'none' : 'auto'}
      style={[styles.cover, { opacity }]}
      // Once this identical screen is drawn, the still native splash can go.
      onLayout={() => SplashScreen.hideAsync()}>
      <Animated.Image
        source={require('@/assets/images/splash-icon.png')}
        style={[styles.logo, { transform: [{ rotate }] }]}
        accessibilityLabel="Atlast"
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
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
});
