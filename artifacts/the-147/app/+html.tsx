import { type PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

/**
 * Web HTML shell for the Expo Router web target.
 *
 * This file is only used for web rendering (Metro web dev server and any
 * future static/server export). It is NOT loaded on iOS or Android.
 *
 * Per-route <title> and <meta name="description"> overrides are handled at the
 * screen level via <Head> components from `expo-router/head`.  The tags here
 * are site-wide defaults and ensure crawlers always receive a meaningful shell
 * even for routes that have not yet added a per-screen <Head>.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <title>The 147 Bradford — Snooker, Pool & Dining</title>
        <meta
          name="description"
          content="Book snooker and pool tables, order food and drinks, join our membership, and earn loyalty rewards at The 147 Bradford."
        />

        <meta name="theme-color" content="#0A1628" />
        <meta name="application-name" content="The 147 Bradford" />

        <meta property="og:site_name" content="The 147 Bradford" />
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="The 147 Bradford — Snooker, Pool & Dining"
        />
        <meta
          property="og:description"
          content="Book snooker and pool tables, order food and drinks, join our membership, and earn loyalty rewards at The 147 Bradford."
        />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:site" content="@the147bradford" />
        <meta
          name="twitter:title"
          content="The 147 Bradford — Snooker, Pool & Dining"
        />
        <meta
          name="twitter:description"
          content="Book snooker and pool tables, order food and drinks, join our membership, and earn loyalty rewards at The 147 Bradford."
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SportsActivityLocation",
              name: "The 147 Bradford",
              description:
                "Snooker, pool, and dining venue in Bradford, UK.",
              url: "https://the147bradford.com",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Bradford",
                addressRegion: "West Yorkshire",
                addressCountry: "GB",
              },
            }),
          }}
        />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
