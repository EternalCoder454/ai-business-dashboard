import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth, authEnabled } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { loadViewerBranding } from "@/lib/branding";
import { MessagesProvider } from "@/lib/messages";
import { StoreProvider } from "@/lib/store";

/**
 * Everything behind the sign-in page.
 *
 * Keeping the store here rather than in the root layout is what stops the
 * sign-in page pulling in the workspace and the whole navigation shell. This
 * group holds only routes that need all of it.
 *
 * Async, which makes these routes server-rendered rather than a prerendered
 * shell. That is the cost of knowing whose business this is before the first
 * paint: the shell used to go out with "Your Company" written into it and swap
 * to the real name once /api/workspace answered, which was plainly visible on
 * every refresh. Every route in this group sits behind auth and is entirely
 * personalised, so a shared static shell was never doing much for anyone.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  /*
   * The session, properly, rather than trusting that the proxy sent everybody
   * here for a good reason.
   *
   * The proxy asks the cheap question: does this request carry a session cookie
   * at all. It cannot ask a better one, because it runs on every request and
   * reaching Postgres from there would put a round trip in front of the whole
   * app. So a cookie that is expired, forged, or signed by a deployment that no
   * longer exists gets past it.
   *
   * Which used to mean the shell rendered signed out: the navigation, the
   * account page, every field empty, and "Not signed in" at the top. Nothing
   * leaked, because no session means no workspace and every route refuses
   * separately, but it is a screen nobody should ever reach, and moving this
   * app to a new server made it the first thing anybody with an old cookie saw.
   */
  if (authEnabled) {
    const session = await auth();
    if (!session?.user?.email) redirect("/signin");
  }

  const branding = await loadViewerBranding();

  return (
    <StoreProvider
      initialBranding={branding ? { name: branding.name, mark: branding.mark } : null}
    >
      {/* Inside the store, and inside the group, so the sign-in page never
          starts a poll for messages nobody is signed in to read. */}
      <MessagesProvider>
        <AppShell>{children}</AppShell>
      </MessagesProvider>
    </StoreProvider>
  );
}
