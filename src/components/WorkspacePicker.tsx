"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Chip, Field, TextInput, cx } from "./ui";

interface Found {
  id: string;
  name: string;
}

/**
 * Finds the workspace id for an identity-linked key.
 *
 * A key that spans several workspaces refuses every Messages request until one
 * is named, and the id is otherwise buried in the Console. The same key is
 * permitted to call List Workspaces, so this asks Anthropic directly rather
 * than sending the user off to copy a string by hand.
 */
export function WorkspacePicker() {
  const { settings, updateSettings } = useStore();
  const [found, setFound] = useState<Found[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /*
   * What is in the box, which is not the same thing as what is saved.
   *
   * This field wrote to the workspace on every keystroke, so pasting an id
   * saved twenty-eight partial ids on the way to the real one. A half typed
   * workspace id is not a state worth storing, and the value only means
   * anything once somebody has finished entering it.
   *
   * Undefined while untouched so the saved value shows through, including one
   * that arrives from elsewhere, and the moment it is edited the box is the
   * one holding the text.
   */
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const shown = typed ?? settings.workspaceId;

  /** Saves what is in the box, if it says something different. */
  const commit = () => {
    const value = shown.trim();
    setTyped(undefined);
    if (value !== settings.workspaceId) void updateSettings({ workspaceId: value });
  };

  const lookup = async () => {
    setBusy(true);
    setNote(null);
    setFound(null);
    try {
      const response = await fetch("/api/anthropic-workspaces", {
        method: "POST",
        headers: settings.apiKey ? { "x-anthropic-key": settings.apiKey } : {},
      });
      const body = (await response.json()) as { workspaces?: Found[]; error?: string };

      if (body.error) {
        setNote(body.error);
      } else if (!body.workspaces?.length) {
        setNote(
          "No named workspaces came back. Your organisation may only have the Default Workspace, which List Workspaces deliberately omits. Find its id in the Console at platform.claude.com/settings/workspaces.",
        );
      } else {
        setFound(body.workspaces);
      }
    } catch {
      setNote("The lookup failed.");
    }
    setBusy(false);
  };

  return (
    <Field
      label="Workspace ID"
      className="mt-4"
      hint="Only needed for an identity-linked key, which refuses any request that does not name the workspace it acts in. Ordinary keys ignore this."
    >
      <TextInput
        value={shown}
        autoComplete="off"
        spellCheck={false}
        placeholder="wrkspc_… (leave blank for an ordinary key)"
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setTyped(undefined);
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outlined"
          disabled={busy || !settings.apiKey}
          onClick={lookup}
        >
          {busy ? "Asking Anthropic…" : "Find my workspaces"}
        </Button>
        {!settings.apiKey ? (
          <span className="md-label-sm text-on-variant/75">Save an API key first.</span>
        ) : null}
      </div>

      {found?.length ? (
        <div className="mt-3">
          <p className="md-label-sm mb-1.5 text-on-variant">
            Pick the one this app should act in:
          </p>
          <div className="flex flex-wrap gap-2">
            {found.map((workspace) => (
              <Chip
                key={workspace.id}
                selected={settings.workspaceId === workspace.id}
                onClick={() => void updateSettings({ workspaceId: workspace.id })}
              >
                {workspace.name}
              </Chip>
            ))}
          </div>
          <p className="md-label-sm mt-2 text-on-variant/75">
            The Default Workspace never appears here, by design. If none of these is
            right, take its id from the Console.
          </p>
        </div>
      ) : null}

      {note ? (
        <p className={cx("md-label mt-2 text-on-variant")}>{note}</p>
      ) : null}
    </Field>
  );
}
