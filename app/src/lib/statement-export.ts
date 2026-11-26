import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Native: render the statement HTML to a real PDF file, then open the share
// sheet so the member can save it, or send it on WhatsApp or email.
export async function exportStatementPdf({ css, body }: { css: string; body: string }, title: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${body}</body></html>`;
  // A4 at 72 PPI, with margins so the table never touches the paper edge.
  const { uri } = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins: { left: 28, right: 28, top: 32, bottom: 32 },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  }
}
