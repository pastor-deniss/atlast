import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

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
        <meta name="apple-mobile-web-app-title" content="Atlast" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />

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
