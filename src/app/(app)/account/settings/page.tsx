"use client";

import { AccountTabs } from "@/components/AccountTabs";
import { PageHeader } from "@/components/PageHeader";
import { TOUR_KEY } from "@/components/Setup";
import { Button, Card, Field, Select } from "@/components/ui";
import {
  setSearchShortcutChoice,
  setSidebarSideChoice,
  useSearchShortcutChoice,
  useSidebarSideChoice,
} from "@/lib/deskChoice";
import { useStore } from "@/lib/store";
import type { SearchShortcut, SidebarSide } from "@/lib/types";

/**
 * How this browser is arranged.
 *
 * Both of these were on the Settings page under Appearance, stored as workspace
 * columns anybody could write, which meant a left-hander moving the navigation
 * moved it for the whole company and somebody who types a lot of slashes
 * turning the search key off took it away from everyone. Neither is a decision
 * a business has any reason to make, so there is no company default to fall
 * back to: the shipped values are the defaults and this is where they change.
 *
 * They sit beside the theme, the density and the layout, which are already
 * held per browser for the same reason. Those are in the account menu because
 * they are one tap each; these are a page because they are a choice rather than
 * a toggle.
 */
export default function AccountSettingsPage() {
  const { settings } = useStore();
  const side = useSidebarSideChoice();
  const search = useSearchShortcutChoice();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader eyebrow="You" title="Settings" />
      <AccountTabs />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        <div className="measure flex flex-col gap-5">
          <Card>
            <h2 className="md-title-lg mb-4">This browser</h2>

            <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
              <Field label="Navigation side">
                <Select
                  value={side ?? settings.sidebarSide}
                  onChange={(event) =>
                    setSidebarSideChoice(event.target.value as SidebarSide)
                  }
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </Select>
              </Field>

              <Field label="Search key">
                <Select
                  value={search ?? settings.searchShortcut}
                  onChange={(event) =>
                    setSearchShortcutChoice(event.target.value as SearchShortcut)
                  }
                >
                  <option value="slash">Slash</option>
                  <option value="k">K</option>
                  <option value="none">Off</option>
                </Select>
              </Field>
            </div>
          </Card>

          {/*
            * A way back to the tour.
            *
            * It is nine slides shown once and then never again, and the only
            * way to see it a second time was to know the localStorage key and
            * clear it by hand. Somebody who skipped it on their first morning
            * had no way to ask for it back.
            */}
          <Card>
            <h2 className="md-title-lg mb-1">The tour</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                variant="outlined"
                size="sm"
                onClick={() => {
                  try {
                    window.localStorage.removeItem(TOUR_KEY);
                  } catch {
                    // Blocked storage means it was never marked done, so it is
                    // about to be shown anyway.
                  }
                  // A full load rather than a route change: the tour reads the
                  // key once when it mounts, and it is already mounted.
                  window.location.assign("/");
                }}
              >
                Show it again
              </Button>
              <span className="md-body-sm text-on-variant/75">
                Nine slides on what is where. Opens the dashboard.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
