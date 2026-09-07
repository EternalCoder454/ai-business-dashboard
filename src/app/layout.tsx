import { loadBranding } from "@/lib/branding";
import type { Metadata, Viewport } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { siteUrl } from "@/lib/site";
import "./globals.css";

/*
 * Self-hosted by next/font, so there is no third-party round trip on the
 * critical path and no shift when the face swaps in.
 *
 * Roboto rather than Inter. Inter is the correct answer often enough that it
 * has stopped being an answer: it is the face of every dashboard shipped in the
 * last five years, and a panel wearing it looks like the others by default
 * rather than by decision. Roboto is also the typeface Material Design is drawn
 * for, and the whole of this interface is Material 3 tokens, so the metrics
 * this was measured against are the ones it is now set in.
 */
const roboto = Roboto({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto",
});

/**
 * The face numbers are set in, and the one that was never actually here.
 *
 * The stack asked for JetBrains Mono and nothing ever loaded it, so every
 * monospaced surface in the panel fell through to whatever the machine
 * happened to own: Consolas on Windows, Menlo on a Mac, something else again on
 * Linux. Measured rather than assumed, by comparing the width of a string in
 * the stack against the width of the same string in a family that does not
 * exist. They were identical.
 *
 * Roboto Mono because it is Roboto's own companion and shares its metrics, so a
 * figure sitting in a label and the same figure in a table are the same size
 * and the same colour on the page.
 */
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto-mono",
});

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await loadBranding();
  return {
  metadataBase: new URL(siteUrl()),
  title: name,
  description: "AI department heads for a small business.",
  applicationName: name,
  // Internal tool. It should never appear in a search index.
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: name,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false, address: false, email: false },

  /**
   * What a pasted link shows in Discord, Slack, or Messages.
   *
   * A crawler is never signed in, so it follows the redirect to the sign-in
   * page and reads this. It names the site and stops there: the description of
   * a private workspace should not be a description of what is in it.
   */
  openGraph: {
    type: "website",
    siteName: name,
    title: name,
    description: "AI department heads for a small business. Sign in required.",
    url: siteUrl(),
  },
  twitter: {
    card: "summary_large_image",
    title: name,
    description: "AI department heads for a small business. Sign in required.",
  },
  };
}

export const viewport: Viewport = {
  // cover paints under the notch and home indicator; the safe-area utilities
  // keep content clear of them.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // Without this the on-screen keyboard overlays the layout instead of
  // resizing it, so the composer ends up underneath it.
  interactiveWidget: "resizes-content",
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
      className={`${roboto.variable} ${robotoMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        {children}
        {/* Vercel's own beacon, served from this origin in production, so the
            content policy's script-src and connect-src of 'self' cover it. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
