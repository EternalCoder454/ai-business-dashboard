import { loadBranding } from "@/lib/branding";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { siteUrl } from "@/lib/site";
import "./globals.css";

/*
 * Self-hosted by next/font, so there is no third-party round trip on the
 * critical path and no shift when the face swaps in.
 *
 * Not Inter, and no longer Roboto. Inter is the correct answer often enough
 * that it has stopped being an answer: it is the face of every dashboard
 * shipped in the last five years. Roboto was the argument against it, being the
 * face Material is drawn for, and that turned out to be the problem rather than
 * the point. Roboto is Android's typeface. Set an interface in it, give every
 * control a fully round edge, and it reads as a phone app whatever it is
 * actually for, which is not what a business wants its panel to look like.
 *
 * IBM Plex Sans is the same job done by somebody else: a grotesque built for
 * dense technical interfaces, with more in the letterforms than Roboto has and
 * none of the association. Weights are named rather than left to the variable
 * default, so the 500 the labels ask for is a real weight and not a synthesised
 * one.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans-face",
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
 * IBM Plex Mono because it is Plex Sans's own companion and is drawn on the
 * same skeleton, so a figure sitting in a label and the same figure in a code
 * block are the same size and the same colour on the page.
 */
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono-face",
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
const THEME_SCRIPT =
  `try{var d=document.documentElement,t=localStorage.getItem("eterneon-theme");` +
  `if(t==="light"||t==="dark")d.dataset.theme=t;` +
  `var b=localStorage.getItem("eterneon-brand");` +
  `if(b&&/^[a-z]{3,10}$/.test(b))d.dataset.brand=b}catch(e){}`;

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
      data-brand="amber"
      className={`${sans.variable} ${mono.variable}`}
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
