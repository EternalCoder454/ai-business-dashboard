"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Field,
  PageHeader,
  Select,
  TextInput,
  cx,
} from "@/components/ui";
import { buildUserContext } from "@/lib/prompts";
import { useStore } from "@/lib/store";
import type { UserAccount } from "@/lib/types";

/** A short list beats the full IANA set, with whatever the browser reports added. */
const COMMON_ZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Asia/Tokyo",
  "UTC",
];

export default function AccountPage() {
  const { account, settings, storage, accountEmail, updateAccount } = useStore();

  const [local, setLocal] = useState<UserAccount>(account);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Adopt store values until the first edit, so the initial load fills in.
  useEffect(() => {
    if (!dirty) setLocal(account);
  }, [account, dirty]);

  // Debounced autosave, matching how the Company Profile behaves.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(async () => {
      await updateAccount({
        displayName: local.displayName,
        roleTitle: local.roleTitle,
        pronouns: local.pronouns,
        timezone: local.timezone,
      });
      setSaved(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [local, dirty, updateAccount]);

  const detectedZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "";
    }
  }, []);

  const zones = useMemo(() => {
    const all = new Set(COMMON_ZONES);
    if (detectedZone) all.add(detectedZone);
    if (local.timezone) all.add(local.timezone);
    return [...all].sort();
  }, [detectedZone, local.timezone]);

  const preview = buildUserContext(local, settings.companyName);
  const set = (patch: Partial<UserAccount>) => {
    setDirty(true);
    setSaved(false);
    setLocal((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="You"
        title="Account"
        description="Who the heads are talking to. This is separate from the Company Profile, which describes the business rather than the person running it."
        actions={saved ? <Chip tone="success">Saved</Chip> : null}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {/* ------------------------------------------------ identity */}
          <Card>
            <div className="flex items-center gap-4">
              {account.avatarUrl ? (
                // Google's own CDN, and the file is already sized for this.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.avatarUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 flex-none rounded-full"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-14 w-14 flex-none place-items-center rounded-full bg-primary-container text-xl text-on-primary-container"
                >
                  {(local.displayName || accountEmail || "?").charAt(0).toUpperCase()}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="md-title truncate">
                  {local.displayName || "Tell them your name below"}
                </p>
                <p className="md-label truncate text-on-variant">
                  {accountEmail ?? account.email ?? "Not signed in"}
                </p>
              </div>

              <Chip tone={storage === "hosted" ? "success" : "neutral"}>
                {storage === "hosted" ? "Synced" : "This browser"}
              </Chip>
            </div>

            {storage !== "hosted" ? (
              <p className="md-label-sm mt-4 text-on-variant/75">
                Signing in with Google fills the name, address, and picture in
                automatically, and moves this workspace off this one browser.
              </p>
            ) : null}
          </Card>

          {/* ------------------------------------------------ how you are addressed */}
          <Card>
            <h2 className="md-title-lg mb-1">How the heads address you</h2>
            <p className="md-body mb-5 text-on-variant">
              This goes into every head&apos;s prompt. Without it they have nothing to call
              you and default to writing about &ldquo;the user&rdquo;.
            </p>

            <div className="grid gap-4 medium:grid-cols-2">
              <Field label="Name" hint="What they call you. A first name is usually right.">
                <TextInput
                  value={local.displayName}
                  placeholder="Zachary"
                  onChange={(event) => set({ displayName: event.target.value })}
                />
              </Field>

              <Field label="Your role" hint="So a head knows who is asking.">
                <TextInput
                  value={local.roleTitle}
                  placeholder="Founder"
                  onChange={(event) => set({ roleTitle: event.target.value })}
                />
              </Field>

              <Field
                label="Pronouns"
                hint="Optional, and used exactly as written. Left blank, the heads avoid pronouns rather than guessing."
              >
                <TextInput
                  value={local.pronouns}
                  placeholder="he/him"
                  onChange={(event) => set({ pronouns: event.target.value })}
                />
              </Field>

              <Field
                label="Timezone"
                hint="Gives the heads today's date, so a deadline means something."
              >
                <Select
                  value={local.timezone}
                  onChange={(event) => set({ timezone: event.target.value })}
                >
                  <option value="">Not set, no date awareness</option>
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                      {zone === detectedZone ? " (this device)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {!local.timezone && detectedZone ? (
              <Button
                size="sm"
                variant="outlined"
                className="mt-4"
                onClick={() => set({ timezone: detectedZone })}
              >
                Use {detectedZone}
              </Button>
            ) : null}
          </Card>

          {/* ------------------------------------------------ what gets sent */}
          <Card elevated={false}>
            <h2 className="md-label-sm mb-2 text-on-variant">
              What every head receives about you
            </h2>
            {preview ? (
              <pre
                className={cx(
                  "md-body whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed",
                  "text-on-variant",
                )}
              >
                {preview}
              </pre>
            ) : (
              <p className="md-body text-on-variant">
                Nothing yet. Fill in your name or timezone and the heads stop guessing.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
