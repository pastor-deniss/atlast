import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const INSTALL_CAPTURE = `
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__atlastInstallPrompt = e;
  window.dispatchEvent(new Event('atlast-install-change'));
});
window.addEventListener('appinstalled', function () {
  window.__atlastInstallPrompt = null;
  window.__atlastInstalled = true;
  window.dispatchEvent(new Event('atlast-install-change'));
});`;

// Web-only: the root HTML for every page in the static web build.
// Makes atlastapp.app installable ("Add to Home Screen") as a PWA.
export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F3D2E" />
        <meta name="description" content="Savings and loans for your community group." />

        {/* iOS Safari ignores the manifest icons and display mode, so it needs these. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="AtLast" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />

        {/* Chrome/Edge/Android fire this once, often before the app has loaded:
            keep it so the "Install the app" link can open the install prompt. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE }} />

        {/* Every screen has its own ScrollView, so the body itself must not scroll. */}
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
