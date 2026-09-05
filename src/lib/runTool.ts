"use client";

import { findTool, parseDay, resolveScope } from "./tools";
import type { StoreValue } from "./store";
import type { ProposedToolCall } from "./types";

/**
 * Runs one approved tool call against the workspace.
 *
 * On the client rather than the server, because the store is the only thing
 * that knows whether this workspace writes to Postgres or to IndexedDB, and
 * duplicating that on the server would mean two implementations of every write
 * drifting apart.
 *
 * Nothing reaches here unapproved. The chat view shows what a call would do and
 * calls this only once someone has said yes.
 */
export async function runTool(
  call: ProposedToolCall,
  departmentId: string,
  store: StoreValue,
): Promise<string> {
  const tool = findTool(call.name);
  if (!tool) throw new Error(`No tool named "${call.name}".`);

  const input = call.input ?? {};
  const text = (key: string): string =>
    typeof input[key] === "string" ? (input[key] as string).trim() : "";

  // A department may file under itself or under the whole company, never under
  // another department, whatever the model asked for.
  const scope = resolveScope(input.departmentId, departmentId);

  switch (call.name) {
    case "create_task": {
      const task = await store.createTask({
        title: text("title") || "Untitled task",
        notes: text("notes"),
        departmentId: scope,
        dueAt: parseDay(input.dueOn),
      });
      return `Added “${task.title}” to the board.`;
    }

    case "record_decision": {
      const entry = await store.saveMemory({
        kind: "decision",
        label: text("label"),
        detail: text("detail"),
        revisitWhen: text("revisitWhen"),
        departmentId: scope,
      });
      return `Recorded “${entry.label}”.`;
    }

    case "record_figure": {
      const entry = await store.saveMemory({
        kind: "figure",
        label: text("label"),
        value: text("value"),
        departmentId: scope,
        occurredAt: parseDay(input.measuredOn),
      });
      return `Recorded ${entry.label} = ${entry.value}.`;
    }

    case "save_deliverable": {
      const deliverable = await store.createDeliverable({
        title: text("title") || "Untitled",
        body: text("body"),
        departmentId,
      });
      return `Saved “${deliverable.title}”.`;
    }

    case "create_project": {
      const project = await store.createProject({
        name: text("name") || "Untitled project",
        summary: text("summary"),
      });
      return `Created “${project.name}”.`;
    }

    case "create_addon": {
      /*
       * The only tool that goes to the server rather than to the store.
       *
       * Addons live in Postgres and nowhere else: an addon runs unattended, and
       * a browser that is closed cannot run anything, so there is no IndexedDB
       * version of this to keep in step. The route also re-checks that whoever
       * is asking is an administrator, which is the check that counts.
       */
      const response = await fetch("/api/workspace/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: text("name"),
          description: text("description"),
          recipe: {
            trigger: input.trigger,
            conditions: input.conditions ?? [],
            steps: input.steps ?? [],
          },
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        error?: string;
        problems?: string[];
        addon?: { name: string };
      } | null;

      if (!response.ok) {
        /*
         * Thrown rather than returned, so the model sees it as a failed call
         * and can correct the recipe. The problems name the field that was
         * wrong, which is the difference between a second attempt that works
         * and one that guesses.
         */
        throw new Error(
          result?.problems?.length
            ? `That addon was refused: ${result.problems.join(" ")}`
            : (result?.error ?? "That addon could not be saved."),
        );
      }

      return (
        `Built “${result?.addon?.name ?? text("name")}”. It is switched off until an ` +
        `administrator approves it under Integrations, where they can see what it does ` +
        `and anywhere it would send to.`
      );
    }

    case "web_search": {
      /*
       * Straight to the server, because the Perplexity key lives there and is
       * never sent to a browser. The answer comes back with its sources so the
       * head can cite rather than assert.
       */
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text("query") }),
      });

      const found = (await response.json().catch(() => null)) as {
        answer?: string;
        sources?: { title: string; url: string }[];
        error?: string;
      } | null;

      if (!response.ok) {
        // Thrown so the model sees a failed call and can answer without it,
        // rather than quietly treating an error string as a search result.
        throw new Error(found?.error ?? "That search could not be run.");
      }

      const sources = (found?.sources ?? [])
        .map((source) => `- [${source.title}](${source.url})`)
        .join("\n");

      return sources ? `${found?.answer ?? ""}\n\nSources:\n${sources}` : (found?.answer ?? "");
    }

    default:
      // A registered tool with no branch here is a mistake worth surfacing
      // rather than silently doing nothing and reporting success.
      throw new Error(`"${call.name}" is registered but has nothing to run.`);
  }
}
