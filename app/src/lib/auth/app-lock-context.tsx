import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { hasPin } from '@/lib/auth/pin';

// Ticket 14, Q2: re-lock after the app has been backgrounded more than ~1
// minute. A hardcoded app constant, not a group setting.
const BACKGROUND_LOCK_TIMEOUT_MS = 60_000;

// Ticket 07: the PIN/biometric AppLockGate is native-only — SecureStore has
// no web implementation. Web skips the lock gate entirely rather than
// showing an unlock screen nothing can ever satisfy.
const isNative = Platform.OS !== 'web';

type AppLockContextValue = {
  pinExists: boolean;
  isLocked: boolean;
  isLoading: boolean;
  refreshPinExists: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
  /** Called right after Create PIN succeeds: PIN now exists, but the user
   * just proved themself, so skip the unlock screen this one time. */
  completePinSetup: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: PropsWithChildren) {
  const [pinExists, setPinExists] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const backgroundedAt = useRef<number | null>(null);

  const refreshPinExists = useCallback(async () => {
    if (!isNative) {
      // Web: no lock gate at all — always "unlocked", pinExists true so the
      // create-pin guard never triggers either.
      setPinExists(true);
      setIsLocked(false);
      setIsLoading(false);
      return;
    }
    const exists = await hasPin();
    setPinExists(exists);
    // A PIN existing means this device requires it every cold start (Q2);
    // no PIN yet means there's nothing to unlock — the create-pin guard
    // takes over instead.
    setIsLocked(exists);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshPinExists();
  }, [refreshPinExists]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (nextState === 'active') {
        const backgroundedSince = backgroundedAt.current;
        backgroundedAt.current = null;
        if (
          isNative &&
          pinExists &&
          backgroundedSince !== null &&
          Date.now() - backgroundedSince > BACKGROUND_LOCK_TIMEOUT_MS
        ) {
          setIsLocked(true);
        }
      }
    });

    return () => subscription.remove();
  }, [pinExists]);

  const unlock = useCallback(() => setIsLocked(false), []);
  const lock = useCallback(() => setIsLocked(true), []);
  const completePinSetup = useCallback(() => {
    setPinExists(true);
    setIsLocked(false);
  }, []);

  return (
    <AppLockContext.Provider
      value={{ pinExists, isLocked, isLoading, refreshPinExists, unlock, lock, completePinSetup }}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within an AppLockProvider');
  return ctx;
}
