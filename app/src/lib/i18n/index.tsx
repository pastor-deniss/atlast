import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { sw } from './sw';

/**
 * English / Kiswahili. The English text itself is the key: `t('Sign In')`.
 * A phrase missing from the Swahili table falls back to English, so a new
 * screen still works before it is translated.
 */
export type Language = 'en' | 'sw';

const STORAGE_KEY = 'atlast.language';

type Vars = Record<string, string | number>;

function interpolate(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export function translate(language: Language, text: string, vars?: Vars) {
  const translated = language === 'sw' ? (sw[text] ?? text) : text;
  return interpolate(translated, vars);
}

function deviceLanguage(): Language {
  try {
    return getLocales()[0]?.languageCode === 'sw' ? 'sw' : 'en';
  } catch {
    return 'en';
  }
}

type LanguageValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageValue>({ language: 'en', setLanguage: () => {} });

export function LanguageProvider({ children }: PropsWithChildren) {
  // Start in English so the statically rendered web page matches the first
  // client render; the stored or device language is applied right after.
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      setLanguageState(stored === 'en' || stored === 'sw' ? stored : deviceLanguage());
    });
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

/** `const t = useT(); t('Hello {name}', { name })` */
export function useT() {
  const { language } = useContext(LanguageContext);
  return useCallback((text: string, vars?: Vars) => translate(language, text, vars), [language]);
}
