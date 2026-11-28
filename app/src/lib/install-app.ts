// On a phone the person already has the installed app; only the web build
// (install-app.web.ts) offers to install it.
export type InstallMode = 'prompt' | 'ios' | 'none';

export function useInstallApp(): { mode: InstallMode; install: () => Promise<void> } {
  return { mode: 'none', install: async () => {} };
}
