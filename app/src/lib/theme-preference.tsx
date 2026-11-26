import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Appearance, Platform } from 'react-native';

/** Light, Dark, or follow the phone's own setting. Stored per device. */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'atlast.themePreference';

type ThemePreferenceValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceValue>({
  preference: 'system',
  setPreference: () => {},
});

function applyToNative(preference: ThemePreference) {
  // On iOS/Android this also makes system UI (alerts, keyboard) match.
  // react-native-web has no override, so web relies on the context alone.
  if (Platform.OS !== 'web') {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }
}

export function ThemePreferenceProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
        applyToNative(stored);
      }
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyToNative(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <ThemePreferenceContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemePreferenceContext);
}
