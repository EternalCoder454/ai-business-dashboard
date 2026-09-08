"use client";

import { AccountTabs } from "@/components/AccountTabs";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { Button, Card, Field, Select, cx } from "@/components/ui";
import {
  setSearchShortcutChoice,
  setSidebarSideChoice,
  useSearchShortcutChoice,
  useSidebarSideChoice,
} from "@/lib/deskChoice";
import {
  setClock,
  setDateOrder,
  useClock,
  useDateOrder,
} from "@/lib/dateChoice";
import { NOTICES, type NoticeId } from "@/lib/notifications";
import { setNoticeShown, useMutedNotices } from "@/lib/notificationChoice";
import { formatExactTime } from "@/lib/routes";
import { useStore } from "@/lib/store";
import { TOUR_KEY } from "@/lib/tour";
import type { Clock, DateOrder } from "@/lib/routes";
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
/**
 * The notices a member never sees, so the switches match what is on offer.
 *
 * The same three useNotifications withholds from them: each leads to a page
 * that answers "an administrator looks after this", and a switch for a notice
 * that cannot appear is worse than no switch.
 */
const ADMIN_NOTICES = new Set<NoticeId>(["no-key", "no-profile", "bare-departments"]);

export default function AccountSettingsPage() {
  const { settings, workspaceRole, updateAccount } = useStore();
  const side = useSidebarSideChoice();
  const search = useSearchShortcutChoice();
  const muted = useMutedNotices();
  const order = useDateOrder();
  const clock = useClock();

  // A real moment rather than a made up one, so the sample reads as the thing
  // it is about to change rather than as an illustration.
  const [sample] = useState(() => Date.now());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader eyebrow="You" title="Settings" />
      <AccountTabs />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        <div className="measure flex flex-col gap-5">
          <Card>
            <h2 className="md-title-lg mb-4">Layout</h2>

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
            * Which way round a date reads, which was silently one answer.
            *
            * 09/07 is the ninth of July to most of the world and the seventh of
            * September in the United States, and the panel wrote the second
            * without ever saying so.
            */}
          <Card>
            <h2 className="md-title-lg mb-4">Dates and times</h2>

            <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
              <Field label="Date order">
                <Select
                  value={order}
                  onChange={(event) => setDateOrder(event.target.value as DateOrder)}
                >
                  <option value="mdy">Month first</option>
                  <option value="dmy">Day first</option>
                  <option value="ymd">Year first</option>
                </Select>
              </Field>

              <Field label="Clock">
                <Select
                  value={clock}
                  onChange={(event) => setClock(event.target.value as Clock)}
                >
                  <option value="24">24 hour</option>
                  <option value="12">12 hour</option>
                </Select>
              </Field>
            </div>

            <p className="md-body mt-4 tabular-nums text-on-variant">
              {formatExactTime(sample)}
            </p>
          </Card>

          {/*
            * The standing notices, and whether to keep being told.
            *
            * Some of these are unfinished on purpose. A business that keeps its
            * decisions somewhere else is told about it every time it opens the
            * account menu and can do nothing but read it again.
            */}
          <Card>
            <h2 className="md-title-lg mb-4">Notifications</h2>
            <ul className="flex flex-col gap-1.5">
              {(Object.keys(NOTICES) as NoticeId[])
                .filter((id) => workspaceRole === "admin" || !ADMIN_NOTICES.has(id))
                .map((id) => {
                  const shown = !muted.includes(id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={shown}
                        aria-label={NOTICES[id]}
                        onClick={() => setNoticeShown(id, !shown)}
                        className={cx(
                          "md-state md-target flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                          shown ? "text-on-surface" : "text-on-variant/60",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cx(
                            "h-3.5 w-3.5 flex-none rounded-sm border",
                            shown ? "border-primary bg-primary" : "border-outline-variant",
                          )}
                        />
                        <span className="md-body truncate">{NOTICES[id]}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
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
            <h2 className="md-title-lg mb-4">Introduction</h2>
            <div>
              <Button
                variant="outlined"
                size="sm"
                onClick={async () => {
                  // Both: the account is where it lives now, and the old
                  // browser key is still honoured on the way in, so clearing
                  // one without the other would leave the tour still dismissed.
                  await updateAccount({ tourSeen: "" });
                  try {
                    window.localStorage.removeItem(TOUR_KEY);
                  } catch {
                    // Blocked storage means it was never marked done there.
                  }
                  // A full load rather than a route change: the tour reads this
                  // once when it mounts, and it is already mounted.
                  window.location.assign("/");
                }}
              >
                Show it again
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
