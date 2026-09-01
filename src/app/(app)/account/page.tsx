"use client";

import { AccountCard } from "@/components/AccountCard";
import { PageHeader } from "@/components/PageHeader";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Field,
  Select,
  TextArea,
  TextInput,
  cx,
} from "@/components/ui";
import { ACCEPTED_IMAGE_TYPES, fileToAvatar } from "@/lib/images";
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
  const [pictureError, setPictureError] = useState<string | null>(null);
  const pictureInput = useRef<HTMLInputElement | null>(null);
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
        expertise: local.expertise,
        preferences: local.preferences,
        currentFocus: local.currentFocus,
        notes: local.notes,
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
        actions={saved ? <Chip tone="success">Saved</Chip> : null}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        <div className="measure-read flex flex-col gap-5">
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

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outlined" onClick={() => pictureInput.current?.click()}>
                {account.avatarUrl ? "Change picture" : "Upload picture"}
              </Button>
              {account.avatarUrl ? (
                <Button
                  size="sm"
                  variant="text"
                  onClick={() => void updateAccount({ avatarUrl: undefined })}
                >
                  Remove
                </Button>
              ) : null}
              <input
                ref={pictureInput}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    // Downsized and re-encoded before storing, so a phone photo
                    // does not become a megabyte in every workspace payload.
                    await updateAccount({ avatarUrl: await fileToAvatar(file) });
                    setPictureError(null);
                  } catch (error) {
                    setPictureError(
                      error instanceof Error ? error.message : "That image could not be read.",
                    );
                  }
                }}
              />
            </div>
            {pictureError ? (
              <p className="md-label mt-2 text-error">{pictureError}</p>
            ) : null}
          </Card>

          <AccountCard />

          {/* ------------------------------------------------ how you are addressed */}
          <Card>
            <h2 className="md-title-lg mb-1">How you are addressed</h2>
            <p className="md-body mb-5 text-on-variant">
              Sent with every conversation.
            </p>

            <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
              <Field label="Name">
                <TextInput
                  value={local.displayName}
                  placeholder="Zachary"
                  onChange={(event) => set({ displayName: event.target.value })}
                />
              </Field>

              <Field label="Your role">
                <TextInput
                  value={local.roleTitle}
                  placeholder="Founder"
                  onChange={(event) => set({ roleTitle: event.target.value })}
                />
              </Field>

              <Field
                label="Pronouns"
              >
                <TextInput
                  value={local.pronouns}
                  placeholder="he/him"
                  onChange={(event) => set({ pronouns: event.target.value })}
                />
              </Field>

              <Field
                label="Timezone"
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

          {/* ------------------------------------------------ how you work */}
          <Card>
            <h2 className="md-title-lg mb-1">How you work</h2>
            <p className="md-body mb-5 text-on-variant">
              Optional, and the difference between a generic answer and one pitched
              at you. Every field here goes into every conversation, so keep them
              short.
            </p>

            <div className="flex flex-col gap-4">
              <Field
                label="What you know"
              >
                <TextArea
                  rows={2}
                  value={local.expertise}
                  placeholder="Strong on Minecraft modding and UE5. Newer to accounting, contracts, and hiring."
                  onChange={(event) => set({ expertise: event.target.value })}
                />
              </Field>

              <Field
                label="How you like answers"
              >
                <TextArea
                  rows={2}
                  value={local.preferences}
                  placeholder="Short. Give me the call first. Show numbers as a table. Do not pad."
                  onChange={(event) => set({ preferences: event.target.value })}
                />
              </Field>

              <Field
                label="What you are working on"
              >
                <TextArea
                  rows={2}
                  value={local.currentFocus}
                  placeholder="Shipping Vandrix 1.21.1 and two client sites before the end of the month."
                  onChange={(event) => set({ currentFocus: event.target.value })}
                />
              </Field>

              <Field label="Anything else">
                <TextArea
                  rows={2}
                  value={local.notes}
                  placeholder="Two people, no employees. Everything has to be maintainable by one person."
                  onChange={(event) => set({ notes: event.target.value })}
                />
              </Field>
            </div>
          </Card>

          {/* ------------------------------------------------ oversight */}
          {storage === "hosted" ? (
            <div className="rounded-2xl border border-error/40 bg-error-container/20 p-4">
              <h2 className="md-label-sm mb-2 text-error">Disclaimer</h2>
              <p className="md-body text-on-surface">
                All conversations and internal messaging are recorded, for your safety
                and the company&apos;s.
              </p>
            </div>
          ) : null}

          {/* ------------------------------------------------ what gets sent */}
          <Card elevated={false}>
            <h2 className="md-label-sm mb-2 text-on-variant">User prompt</h2>
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
                Nothing set.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
