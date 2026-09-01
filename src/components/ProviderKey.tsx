"use client";

import { useEffect, useState } from "react";
import { Button, Chip, TextInput, cx } from "./ui";
import { WorkspacePicker } from "./WorkspacePicker";
import type { ProviderInfo } from "@/lib/providers";
import { useStore } from "@/lib/store";

/**
 * One provider's key, and whether it is needed at all.
 *
 * A key on the server wins outright and the browser field is ignored, so when
 * one is set this shows that it is connected rather than an empty box that
 * would do nothing.
 */
export function ProviderKey({ provider }: { provider: ProviderInfo }) {
  const { settings, serverKeys, updateSettings } = useStore();

  const settingKey =
    provider.id === "anthropic"
      ? ("apiKey" as const)
      : provider.id === "openai"
        ? ("openaiKey" as const)
        : ("googleKey" as const);

  const stored = settings[settingKey] ?? "";
  const onServer = serverKeys[provider.id];

  const [draft, setDraft] = useState(stored);
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  // Adopt the stored value until the field is edited, so a late load fills in.
  useEffect(() => {
    if (!touched) setDraft(stored);
  }, [stored, touched]);

  const configured = onServer || Boolean(stored.trim());

  return (
    <li className="rounded-2xl border border-outline-variant p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="md-label flex-1">{provider.label}</span>
        <Chip tone={configured ? "success" : "neutral"}>
          {onServer ? "On the server" : stored.trim() ? "This browser" : "No key"}
        </Chip>
        {onServer ? null : (
          <Button size="sm" variant="text" onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : stored.trim() ? "Change" : "Add key"}
          </Button>
        )}
      </div>

      {open && !onServer ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-end gap-2">
            <TextInput
              type={visible ? "text" : "password"}
              value={draft}
              autoComplete="off"
              spellCheck={false}
              placeholder={`${provider.keyPrefix}…`}
              className="min-w-0 flex-1"
              onChange={(event) => {
                setDraft(event.target.value);
                setTouched(true);
              }}
            />
            <Button variant="outlined" onClick={() => setVisible((value) => !value)}>
              {visible ? "Hide" : "Show"}
            </Button>
            <Button
              disabled={!touched}
              onClick={async () => {
                await updateSettings({ [settingKey]: draft.trim() });
                setTouched(false);
              }}
            >
              Save
            </Button>
          </div>

          <a
            href={provider.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className={cx("md-label-sm mt-2 inline-block text-primary underline")}
          >
            Get a key
          </a>

          {/* Only Anthropic has one, and only when the key is identity-linked. */}
          {provider.id === "anthropic" ? <WorkspacePicker /> : null}
        </div>
      ) : null}
    </li>
  );
}
