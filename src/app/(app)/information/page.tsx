"use client";

import { PageHeader } from "@/components/PageHeader";
import { SpendCard } from "@/components/SpendCard";
import { ContextCard } from "@/components/ContextCard";
import { StorageCard } from "@/components/StorageCard";
import { EmptyState } from "@/components/ui";
import { useStore } from "@/lib/store";

/**
 * What the panel costs and what it is holding.
 *
 * This screen was folded into the dashboard as its System band, and the band is
 * still there and still the default. It exists again because the arrangement is
 * a choice now: somebody on the legacy layout gets these three cards on a page
 * of their own, under Reference, which is where they were.
 *
 * The cards themselves are the same components the dashboard renders, so there
 * is one implementation of each and no second version to drift.
 *
 * Behind the same permission the band is behind. An administrator who decided
 * somebody should not see what the business spends has not had that decision
 * undone by a layout preference.
 */
export default function InformationPage() {
  const { can } = useStore();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader eyebrow="Reference" title="Information" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        {can("information") ? (
          <div className="measure-wide grid grid-cols-1 items-start gap-4 medium:grid-cols-2 large:grid-cols-3">
            <SpendCard />
            <ContextCard />
            <StorageCard />
          </div>
        ) : (
          <EmptyState
            icon="🔒"
            title="Not available to you"
            description="An administrator decides who can see what the business spends."
          />
        )}
      </div>
    </div>
  );
}
