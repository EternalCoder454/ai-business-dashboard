"use client";

import { useState } from "react";
import { Button, Card, Chip, TextInput } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { WebSearchMode } from "@/lib/types";

/**
 * Whether the heads may look things up.
 *
 * Off by default, and that is a decision rather than an oversight: a search is
 * charged to the business's own key, and a feature that quietly starts spending
 * somebody's money is not one they asked for.
 *
 * Native means the head's own provider does the searching. Anthropic, OpenAI
 * and Gemini all do it now, billed on the key already in Settings, so there is
 * nothing else to sign up for. That is why it is the recommended one rather
 * than Perplexity, which is better at this and costs a second paid account.
 */
const CHOICES: { id: WebSearchMode; label: string; what: string }[] = [
  { id: "off", label: "Off", what: "The heads answer from what they already know." },
  {
    id: "native",
    label: "Native",
    what: "The head's own provider searches, on the key you already have.",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    what: "One search behaviour for every head, whatever model it runs on. Needs its own key.",
  },
];

export function WebSearchCard() {
  const { settings, updateSettings, workspaceRole, workspaceKeys, setWorkspaceKey } = useStore();
  const mode: WebSearchMode = settings.webSearch ?? "off";
  const admin = workspaceRole === "admin";

  const held = workspaceKeys.perplexity;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Starts empty, always. The stored key is never sent to a browser, so there
   * is nothing to prefill with, and a masked value in the box would only
   * suggest there is.
   */
  const save = async (value: string) => {
    setBusy(true);
    setError(null);
    const failed = await setWorkspaceKey("perplexity", value);
    setBusy(false);
    if (failed) {
      setError(failed);
      return;
    }
    setDraft("");
    setOpen(false);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="md-title">Web search</h3>
        {mode === "off" ? null : <Chip tone="success">On</Chip>}
      </div>

      <p className="md-body mt-1 text-on-variant">
        {CHOICES.find((choice) => choice.id === mode)?.what}
      </p>

      {admin ? (
        <div className="filter-row mt-3">
          {CHOICES.map((choice) => (
            <Chip
              key={choice.id}
              selected={choice.id === mode}
              onClick={() => void updateSettings({ webSearch: choice.id })}
              title={choice.what}
            >
              {choice.label}
            </Chip>
          ))}
        </div>
      ) : null}

      {mode === "perplexity" ? (
        <div className="mt-4 border-t border-outline-variant pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="md-label flex-1">Perplexity key</span>
            <Chip tone={held?.set ? "success" : "warning"}>
              {held?.set ? `Set, ending ${held.tail}` : "Not set"}
            </Chip>
            {admin ? (
              <Button
                size="sm"
                variant="text"
                aria-label={`${open ? "Close" : held?.set ? "Change" : "Add"} the Perplexity key`}
                onClick={() => {
                  setOpen((was) => !was);
                  setDraft("");
                  setError(null);
                }}
              >
                {open ? "Close" : held?.set ? "Change" : "Add key"}
              </Button>
            ) : null}
          </div>

          {open ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TextInput
                autoFocus
                type="password"
                value={draft}
                placeholder="pplx-..."
                aria-label="Perplexity key"
                className="min-w-0 flex-1 font-mono text-[0.8125rem]"
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button size="sm" disabled={busy || !draft.trim()} onClick={() => void save(draft)}>
                {busy ? "Saving…" : "Save"}
              </Button>
              {held?.set ? (
                <Button
                  size="sm"
                  variant="text"
                  disabled={busy}
                  // An empty value clears it, the same as every other key here.
                  onClick={() => void save("")}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="md-label mt-2 text-error">{error}</p> : null}

          {!held?.set ? (
            <p className="md-label-sm mt-2 text-on-variant/75">
              Perplexity has no free tier, so this needs a paid key of its own.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
