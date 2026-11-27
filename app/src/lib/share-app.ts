import { Platform, Share } from 'react-native';

export const APP_URL = 'https://atlastapp.app';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Invite someone to Atlast. On a phone this opens the system share sheet
 * (WhatsApp, SMS, email ...). In a browser it uses the Web Share menu where
 * there is one, and otherwise copies the message and link to the clipboard.
 */
export async function shareApp(message: string): Promise<ShareResult> {
  const text = `${message}\n${APP_URL}`;

  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title: 'Atlast', text: message, url: APP_URL });
        return 'shared';
      } catch (error) {
        // The person closed the share menu.
        if ((error as { name?: string })?.name === 'AbortError') return 'cancelled';
      }
    }
    try {
      await nav?.clipboard?.writeText(text);
      return nav?.clipboard ? 'copied' : 'failed';
    } catch {
      return 'failed';
    }
  }

  try {
    // iOS shows `url` as a link preview; Android only reads `message`.
    const result = await Share.share(
      Platform.OS === 'ios' ? { message, url: APP_URL } : { message: text },
      { dialogTitle: 'Atlast' }
    );
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch {
    return 'failed';
  }
}
