"use client";

import { Card, Chip } from "@/components/ui";
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
  const { settings, updateSettings, workspaceRole } = useStore();
  const mode: WebSearchMode = settings.webSearch ?? "off";
  const admin = workspaceRole === "admin";

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
        <p className="md-label-sm mt-3 text-on-variant/75">
          Perplexity has no free tier, so this needs a paid key of its own.
        </p>
      ) : null}
    </Card>
  );
}
