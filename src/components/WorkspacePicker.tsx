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
        value={settings.workspaceId}
        autoComplete="off"
        spellCheck={false}
        placeholder="wrkspc_… (leave blank for an ordinary key)"
        onChange={(event) => void updateSettings({ workspaceId: event.target.value.trim() })}
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
