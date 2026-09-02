import type { ReactNode } from "react";
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
 * personalised, so a shared static shell was never doing much for anyone, and
 * the proxy already resolves the session on the same request.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
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
