import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { StoreProvider } from "@/lib/store";

/**
 * Everything behind the sign-in page.
 *
 * Keeping the store here rather than in the root layout is what stops the
 * sign-in page pulling in the workspace, its IndexedDB driver, and the whole
 * navigation shell. This group holds only routes that need all of it.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
}
