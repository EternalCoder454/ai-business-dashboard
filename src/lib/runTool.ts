"use client";

import { excerptOf, findDocument, libraryFor } from "./library";
import { deliverablesFor, excerptOfDeliverable, findDeliverable } from "./deliverables";
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

    case "fetch_url": {
      /*
       * Straight to the server, because the guards are there: the address is
       * resolved and checked against the private ranges, and the socket is
       * pinned to the address that was checked. A browser fetch would answer to
       * the page's CORS policy rather than to ours, and would tell us nothing
       * about where the name actually pointed.
       */
      const response = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: text("url") }),
      });

      const page = (await response.json().catch(() => null)) as {
        url?: string;
        title?: string;
        text?: string;
        truncated?: boolean;
        error?: string;
      } | null;

      if (!response.ok) {
        // Thrown so the model sees a failed call and can say so or try the
        // address it was redirected to, rather than treating the refusal as
        // the contents of the page.
        throw new Error(page?.error ?? "That page could not be opened.");
      }

      /*
       * Title, address, then the prose. The address is on its own line so a
       * head citing the page has it to hand rather than reconstructing it.
       */
      const parts = [page?.title ?? '', page?.url ?? '', '', page?.text ?? ''];
      if (page?.truncated) {
        parts.push('', '[The page continues past what was read.]');
      }
      return parts.join("\n");
    }

    case "read_department": {
      const asked = text("department").toLowerCase();
      if (!asked) return "Name the department to read.";

      /*
       * Only heads this person could open themselves.
       *
       * Two exclusions, for two different reasons. A personal head is theirs
       * alone and sits outside the org chart by design, so it is never
       * readable from here whoever is asking. And a member whose permissions
       * deny a department must not reach it through the orchestrator either:
       * the tool runs on their behalf, so it gets their access and not more.
       */
      const readable = store.allDepartments.filter(
        (department) =>
          !department.personal &&
          !department.isOrchestrator &&
          store.canOpenHead(department.id),
      );

      const found =
        readable.find((department) => department.id.toLowerCase() === asked) ??
        readable.find((department) => department.name.toLowerCase() === asked) ??
        readable.find((department) => (department.personaName ?? "").toLowerCase() === asked) ??
        readable.find((department) => department.name.toLowerCase().includes(asked));

      if (!found) {
        return `No department called "${text("department")}" that you can read. There is ${
          readable.map((department) => department.name).join(", ") || "nothing"
        }.`;
      }

      const threads = store
        .conversationsFor(found.id)
        .filter((conversation) => conversation.messageCount > 0)
        .slice(0, 3);

      if (threads.length === 0) return `${found.name} has had no conversations yet.`;

      /*
       * The last few exchanges of each, not the whole history. This lands in a
       * prompt that is already carrying the profile, the memory and the tasks,
       * and a year of somebody else's chat would push out the question being
       * asked. Three threads, eight messages each, trimmed.
       */
      const parts: string[] = [];
      for (const conversation of threads) {
        const messages = await store.openConversation(conversation.id);
        const recent = messages.slice(-8);
        if (recent.length === 0) continue;
        parts.push(
          `--- ${found.name}: ${conversation.title} ---\n` +
            recent
              .map((message) => {
                const who = message.role === "user" ? "Owner" : found.personaName || found.name;
                const body = message.content.trim().replace(/\s+/g, " ");
                return `${who}: ${body.length > 700 ? `${body.slice(0, 700)}…` : body}`;
              })
              .join("\n"),
        );
      }

      return parts.length
        ? parts.join("\n\n")
        : `${found.name} has had no conversations yet.`;
    }

    case "read_deliverable": {
      const wanted = text("title");
      const found = findDeliverable(store.deliverables, departmentId, wanted);
      if (!found) {
        const available = deliverablesFor(store.deliverables, departmentId)
          .slice(0, 20)
          .map((item) => item.title);
        // Thrown so the model treats it as a failed call and picks a real
        // title, rather than revising something it invented.
        throw new Error(
          available.length
            ? `Nothing called "${wanted}". You have: ${available.join(", ")}.`
            : `You have not produced anything yet.`,
        );
      }

      // The snapshot carries an opening, not the whole thing, so this fetches.
      // Revising from a preview would silently truncate the document.
      const body = await store.openDeliverable(found.id);
      return `${found.title}

${excerptOfDeliverable(body)}`;
    }

    case "update_deliverable": {
      const wanted = text("title");
      const found = findDeliverable(store.deliverables, departmentId, wanted);
      if (!found) {
        throw new Error(
          `Nothing called "${wanted}" to update. Save it as new work, or use the exact title.`,
        );
      }

      const body = text("body");
      // An update that empties a document is a mistake rather than an edit, and
      // there is no earlier version to put back.
      if (!body.trim()) throw new Error("An update needs the whole document, not an empty one.");

      await store.updateDeliverable(found.id, { body, bodyLoaded: true });
      return `Updated “${found.title}”.`;
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

    case "read_document": {
      /*
       * Straight from the store, because the documents are already there: the
       * workspace snapshot carries each file's extracted text, so a read costs
       * nothing and reaches nothing outside the panel.
       *
       * findDocument applies the same scoping the catalogue did. A head cannot
       * read a document belonging to another department, or a private one, by
       * naming it: being told a title is what makes it readable, and it was
       * never told these.
       */
      const wanted = text("title");
      const found = findDocument(store.files, departmentId, wanted);

      if (!found) {
        const available = libraryFor(store.files, departmentId)
          .slice(0, 20)
          .map((file) => file.name);
        // Thrown so the model treats it as a failed call and picks a real
        // title, rather than reading an apology as the document's contents.
        throw new Error(
          available.length
            ? `No document called "${wanted}". Available: ${available.join(", ")}.`
            : `There are no documents you can read.`,
        );
      }

      return `${found.name}

${excerptOf(found)}`;
    }

    case "web_search": {
      /*
       * Straight to the server, because the Perplexity key lives there and is
       * never sent to a browser.
       *
       * Ranked results rather than a written answer. This used to come back as
       * prose from a second model, which the head then pasted into a reply the
       * house writing rules were meant to govern, so the voice in the middle of
       * the answer was not the head's. Results are raw material, and writing
       * them up is the thing the head is for.
       */
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text("query") }),
      });

      const found = (await response.json().catch(() => null)) as {
        results?: { title: string; url: string; snippet: string; date?: string }[];
        error?: string;
      } | null;

      if (!response.ok) {
        // Thrown so the model sees a failed call and can answer without it,
        // rather than quietly treating an error string as a search result.
        throw new Error(found?.error ?? "That search could not be run.");
      }

      const results = found?.results ?? [];
      if (results.length === 0) throw new Error("That search found nothing.");

      /*
       * Numbered, with the address on its own line under each one. The head is
       * being asked to cite what it uses, and a link it has to reconstruct out
       * of the middle of a sentence is a link it gets wrong.
       */
      return results
        .map(
          (result, index) =>
            `${index + 1}. ${result.title}${result.date ? ` (${result.date})` : ""}
${result.url}
${result.snippet}`,
        )
        .join("\n\n");
    }

    default:
      // A registered tool with no branch here is a mistake worth surfacing
      // rather than silently doing nothing and reporting success.
      throw new Error(`"${call.name}" is registered but has nothing to run.`);
  }
}
