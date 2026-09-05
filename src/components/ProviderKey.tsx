"use client";

import { useEffect, useState } from "react";
import { Button, Chip, TextInput, cx } from "./ui";
import { WorkspacePicker } from "./WorkspacePicker";
import type { ProviderInfo } from "@/lib/providers";
import { useStore } from "@/lib/store";

/**
 * One provider's key, and whose it is.
 *
 * Three cases, in the order the chat route resolves them. A key in the
 * deployment's environment wins outright, so the field is hidden rather than
 * shown as an empty box that would do nothing. Otherwise the business's own
 * key is the one that pays, set once by an administrator and used by everyone
 * they invited, which is why a member sees it and cannot change it. The
 * browser field is what is left for a local checkout with no workspace.
 */
export function ProviderKey({ provider }: { provider: ProviderInfo }) {
  const {
    settings,
    serverKeys,
    workspaceKeys,
    workspaceRole,
    storage,
    setWorkspaceKey,
    updateSettings,
  } = useStore();

  const settingKey =
    provider.id === "anthropic"
      ? ("apiKey" as const)
      : provider.id === "openai"
        ? ("openaiKey" as const)
        : ("googleKey" as const);

  const stored = settings[settingKey] ?? "";
  const onServer = serverKeys[provider.id];

  const hosted = storage === "hosted";
  const ours = workspaceKeys[provider.id];
  const canEdit = !hosted || workspaceRole === "admin";
  const [error, setError] = useState<string | null>(null);

  /*
   * Empty on a hosted workspace, always.
   *
   * The field there is for a key being added, not a copy of one that exists:
   * the workspace's key is written by its own route and never read back, so
   * there is nothing to prefill it with. What it used to prefill was this
   * browser's own credential, which on a hosted deployment is not even the key
   * that pays. Opening "Add key" and finding a masked value already in the box
   * reads as the stored key being shown, which is the one thing this screen
   * promises does not happen.
   *
   * A local checkout is the other case. There the browser credential is the
   * key, so showing it is the point.
   */
  const [draft, setDraft] = useState(hosted ? "" : stored);
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  // Adopt the stored value until the field is edited, so a late load fills in.
  useEffect(() => {
    if (!touched && !hosted) setDraft(stored);
  }, [stored, touched, hosted]);

  /**
   * Closes the panel and forgets whatever was in it.
   *
   * Somebody who pasted a key, thought better of it and closed the box should
   * not find it waiting when they open it again. Done here rather than in an
   * effect watching `open`, because state set from an effect costs a second
   * render of the whole screen on every toggle and the compiler objects to it.
   */
  const close = () => {
    setOpen(false);
    setDraft(hosted ? "" : stored);
    setTouched(false);
    setVisible(false);
    setError(null);
  };

  const configured = onServer || (hosted ? ours.set : Boolean(stored.trim()));

  const where = onServer
    ? "On the server"
    : hosted
      ? ours.set
        ? `Workspace ····${ours.tail}`
        : "No key"
      : stored.trim()
        ? "This browser"
        : "No key";

  return (
    <li className="rounded-2xl border border-outline-variant p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="md-label flex-1">{provider.label}</span>
        <Chip tone={configured ? "success" : "neutral"}>{where}</Chip>
        {onServer || !canEdit ? null : (
          <Button
            size="sm"
            variant="text"
            // The provider is in the row but not in the button, so a list of
            // four reads as "Add key" four times over.
            aria-label={`${open ? "Close" : configured ? "Change" : "Add"} the ${provider.label} key`}
            onClick={() => (open ? close() : setOpen(true))}
          >
            {open ? "Close" : configured ? "Change" : "Add key"}
          </Button>
        )}
      </div>

      {/* Said once, to the people it applies to. An employee finding no way to
          add a key should know it is on purpose and who to ask. */}
      {hosted && !onServer && !canEdit ? (
        <p className="md-label-sm mt-1.5 text-on-variant/75">
          {ours.set
            ? "Set by an administrator of this workspace, and used by everyone in it."
            : "An administrator has not added one yet."}
        </p>
      ) : null}

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
                setError(null);
                if (hosted) {
                  // Straight to the workspace, never through the snapshot: the
                  // key is written by its own route and never read back.
                  const failed = await setWorkspaceKey(provider.id, draft.trim());
                  if (failed) {
                    setError(failed);
                    return;
                  }
                } else {
                  await updateSettings({ [settingKey]: draft.trim() });
                }
                close();
              }}
            >
              Save
            </Button>
          </div>

          {error ? <p className="md-label-sm mt-2 text-error">{error}</p> : null}

          {hosted ? (
            <p className="md-label-sm mt-2 text-on-variant/75">
              Used by everyone in this workspace. It is never shown again after
              saving, so keep your own copy.
            </p>
          ) : null}

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
