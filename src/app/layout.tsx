import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { siteUrl } from "@/lib/site";
import { StoreProvider } from "@/lib/store";
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
      <body className="antialiased">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
