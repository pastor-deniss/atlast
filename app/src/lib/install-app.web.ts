import { useCallback, useEffect, useState } from 'react';

/**
 * How this browser can install Atlast as an app:
 * - 'prompt': Chrome, Edge or Android. One tap opens the browser's own
 *   install confirmation (browsers always ask once; a site can't skip it).
 * - 'ios': iPhone/iPad Safari. Apple lets no site install itself, so we show
 *   how: Share, then Add to Home Screen.
 * - 'none': already installed, or a browser that can't install apps.
 */
export type InstallMode = 'prompt' | 'ios' | 'none';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallWindow = Window & {
  __atlastInstallPrompt?: InstallPromptEvent | null;
  __atlastInstalled?: boolean;
};

function isInstalled() {
  const w = window as InstallWindow;
  return (
    !!w.__atlastInstalled ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosBrowser() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but with a touch screen.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function currentMode(): InstallMode {
  if (typeof window === 'undefined' || isInstalled()) return 'none';
  if ((window as InstallWindow).__atlastInstallPrompt) return 'prompt';
  if (isIosBrowser()) return 'ios';
  return 'none';
}

export function useInstallApp() {
  // Starts at 'none' so the static HTML and the first render agree.
  const [mode, setMode] = useState<InstallMode>('none');

  useEffect(() => {
    const update = () => setMode(currentMode());
    update();
    window.addEventListener('atlast-install-change', update);
    return () => window.removeEventListener('atlast-install-change', update);
  }, []);

  const install = useCallback(async () => {
    const w = window as InstallWindow;
    const event = w.__atlastInstallPrompt;
    if (!event) return;
    // A prompt can be used only once, whatever the person chooses.
    w.__atlastInstallPrompt = null;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') w.__atlastInstalled = true;
    } catch {
      // The browser refused; nothing more we can do from here.
    }
    setMode(currentMode());
  }, []);

  return { mode, install };
}
