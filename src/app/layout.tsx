import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Self-hosted by next/font, so there is no third-party round trip on the
// critical path and no shift when the face swaps in.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Eterneon",
  description: "A personal AI operating system for running Eterneon Studio.",
  applicationName: "Eterneon",
  // Internal tool. It should never appear in a search index.
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Eterneon",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  // cover lets the app paint under the notch and the home indicator; the
  // safe-area utilities keep content out from under them.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1a1c1e" },
    { media: "(prefers-color-scheme: light)", color: "#f7fafb" },
  ],
};

/**
 * Runs before first paint, so a light-theme user never sees a frame of dark.
 * The store mirrors the stored theme into localStorage precisely so this can
 * run without waiting on IndexedDB, which resolves long after the first paint.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("eterneon-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * Deliberately bare.
 *
 * The store and the app shell used to live here, which meant the sign-in page
 * downloaded the whole application, IndexedDB included, before anyone could
 * press its one button. They now sit in the (app) route group instead, so a
 * page rendered to someone who is not signed in carries nothing they cannot
 * use. Route groups do not appear in the URL, so every path is unchanged.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
