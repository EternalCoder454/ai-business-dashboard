import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";
import type { MutationOp, Workspace } from "@/lib/workspace";
import type {
  AllHandsRun,
  Attachment,
  Department,
  Conversation,
  Deliverable,
  MemoryEntry,
  Message,
  Task,
  Project,
  Settings,
  UserAccount,
  WikiPage,
} from "@/lib/types";

export type { MutationOp, Workspace };

const ms = (value: Date) => value.getTime();

/**
 * A file as the snapshot carries it: everything except the bytes.
 *
 * The bytes are the whole weight of a workspace and are needed only when
 * something is opened or sent, so they are fetched from /api/files/[id] then.
 * Extracted text is kept: it is small, and a document with no text has nothing
 * to show at all.
 */
/** Everything about a file except its bytes, which are fetched when opened. */
type FileRow = Omit<typeof t.files.$inferSelect, "data">;

function toAttachment(row: FileRow): Attachment {
  return {
    id: row.id,
    kind: row.kind as Attachment["kind"],
    mediaType: row.mediaType,
    name: row.name,
    text: row.textContent ?? undefined,
    width: row.width,
    height: row.height,
    size: row.size,
  };
}

/**
 * One stored row as the shape the interface uses.
 *
 * Exported because the endpoint that loads a conversation on demand needs the
 * identical mapping. It was written out twice for a while, which is how the two
 * come to disagree about a field nobody is looking at.
 */
export function toMessage(
  row: typeof t.messages.$inferSelect,
  filesById: Map<string, Attachment>,
): Message {
  return {
    id: row.id,
    role: row.role as Message["role"],
    content: row.content,
    thinking: row.thinking ?? undefined,
    error: row.isError || undefined,
    timestamp: row.sentAt,
    authorEmail: row.authorEmail ?? undefined,
    toolCalls: row.toolCalls ?? undefined,
    model: row.model ?? undefined,
    usage:
      row.inputTokens || row.outputTokens || row.cacheReadTokens || row.cacheWriteTokens
        ? {
            input: row.inputTokens,
            output: row.outputTokens,
            cacheRead: row.cacheReadTokens,
            cacheWrite: row.cacheWriteTokens,
          }
        : undefined,
    attachments: row.attachmentIds.length
      ? row.attachmentIds
          .map((id) => filesById.get(id))
          .filter((file): file is Attachment => Boolean(file))
      : undefined,
  };
}

/**
 * One conversation's messages, which the snapshot deliberately does not carry.
 *
 * Lives here rather than in the route that serves it so that the repository is
 * still the one place that knows how a stored row becomes a message, and so
 * that a test can exercise it without standing up an HTTP server.
 *
 * `since` is the polling form: everything after a moment, in order. Without it
 * this is the opening form, the newest window of the thread, and `hasMore` says
 * whether anything sits above it.
 */
export async function loadConversationMessages(
  workspaceId: string,
  conversationId: string,
  options: { since?: number; window?: number } = {},
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const db = requireDb();
  const window = options.window ?? 200;
  const since = options.since;

  const where = and(
    eq(t.messages.workspaceId, workspaceId),
    eq(t.messages.conversationId, conversationId),
    since !== undefined ? gt(t.messages.sentAt, since) : undefined,
  );

  // Newest first when opening, so the end of a long thread costs the same as
  // the end of a short one; oldest first when polling, which is already in
  // order. One more than asked for answers "is there more above this" without
  // a second count.
  const rows =
    since === undefined
      ? (
          await db
            .select()
            .from(t.messages)
            .where(where)
            .orderBy(desc(t.messages.sentAt))
            .limit(window + 1)
        ).reverse()
      : await db
          .select()
          .from(t.messages)
          .where(where)
          .orderBy(asc(t.messages.sentAt))
          .limit(window);

  const hasMore = since === undefined && rows.length > window;
  const kept = hasMore ? rows.slice(rows.length - window) : rows;

  // Only the files these messages point at, and never their bytes.
  const wanted = new Set(kept.flatMap((row) => row.attachmentIds));
  const filesById = new Map<string, Attachment>();
  if (wanted.size > 0) {
    const files = await db
      .select({
        id: t.files.id,
        kind: t.files.kind,
        mediaType: t.files.mediaType,
        name: t.files.name,
        textContent: t.files.textContent,
        width: t.files.width,
        height: t.files.height,
        size: t.files.size,
      })
      .from(t.files)
      .where(eq(t.files.workspaceId, workspaceId));
    for (const file of files) {
      if (!wanted.has(file.id)) continue;
      filesById.set(file.id, {
        id: file.id,
        kind: file.kind as Attachment["kind"],
        mediaType: file.mediaType,
        name: file.name,
        text: file.textContent ?? undefined,
        width: file.width,
        height: file.height,
        size: file.size,
      });
    }
  }

  return { messages: kept.map((row) => toMessage(row, filesById)), hasMore };
}

export async function loadWorkspace(workspaceId: string, email: string): Promise<Workspace> {
  const db = requireDb();

  const [
    departmentRows,
    projectRows,
    conversationRows,
    messageCountRows,
    skillRows,
    deliverableRows,
    memoryRows,
    taskRows,
    wikiRows,
    fileRows,
    runRows,
    roundRows,
    accountRow,
    profileRow,
    settingsRow,
  ] = await Promise.all([
    db.select().from(t.departments).where(eq(t.departments.workspaceId, workspaceId)).orderBy(asc(t.departments.sortOrder)),
    db.select().from(t.projects).where(eq(t.projects.workspaceId, workspaceId)).orderBy(desc(t.projects.updatedAt)),
    db.select().from(t.conversations).where(eq(t.conversations.workspaceId, workspaceId)).orderBy(desc(t.conversations.updatedAt)),
    /*
     * How many messages each conversation has, not what they say.
     *
     * This used to be every message body in the business, on every page load,
     * for every page. Measured against the real database with 1,200 messages
     * across 40 conversations it was 438 ms of a 557 ms load, and it grew with
     * the history rather than staying flat, so it got worse the longer somebody
     * used the product. The bodies arrive when a conversation is opened.
     */
    db
      .select({
        conversationId: t.messages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(t.messages)
      .where(eq(t.messages.workspaceId, workspaceId))
      .groupBy(t.messages.conversationId),
    db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId)).orderBy(desc(t.skills.updatedAt)),
    db.select().from(t.deliverables).where(eq(t.deliverables.workspaceId, workspaceId)).orderBy(desc(t.deliverables.updatedAt)),
    db.select().from(t.memory).where(eq(t.memory.workspaceId, workspaceId)).orderBy(desc(t.memory.occurredAt)),
    db.select().from(t.tasks).where(eq(t.tasks.workspaceId, workspaceId)).orderBy(asc(t.tasks.sortOrder)),
    db.select().from(t.wikiPages).where(eq(t.wikiPages.workspaceId, workspaceId)).orderBy(asc(t.wikiPages.sortOrder)),
    /*
     * Every column except `data`.
     *
     * `data` is the base64 of the image or PDF itself, and nothing built from
     * these rows reads it: `toAttachment` never touches it, and the bytes are
     * served on demand from /api/files/[id]. `select()` with no argument took
     * it anyway, so a business with fifty megabytes in its Library pulled fifty
     * megabytes out of Postgres, through the server, and dropped it on the
     * floor on every single page load.
     */
    db
      .select({
        id: t.files.id,
        workspaceId: t.files.workspaceId,
        kind: t.files.kind,
        mediaType: t.files.mediaType,
        name: t.files.name,
        textContent: t.files.textContent,
        width: t.files.width,
        height: t.files.height,
        size: t.files.size,
        departmentId: t.files.departmentId,
        projectId: t.files.projectId,
        note: t.files.note,
        origin: t.files.origin,
        createdAt: t.files.createdAt,
        updatedAt: t.files.updatedAt,
      })
      .from(t.files)
      .where(eq(t.files.workspaceId, workspaceId))
      .orderBy(desc(t.files.updatedAt)),
    db.select().from(t.allHandsRuns).where(eq(t.allHandsRuns.workspaceId, workspaceId)).orderBy(desc(t.allHandsRuns.updatedAt)),
    db.select().from(t.allHandsRounds).where(eq(t.allHandsRounds.workspaceId, workspaceId)).orderBy(asc(t.allHandsRounds.sortOrder)),
    // The account is who you are, not where you work: still keyed by address,
    // so moving between workspaces does not change your name or your notes.
    db.select().from(t.accounts).where(eq(t.accounts.userEmail, email)).limit(1),
    db.select().from(t.profiles).where(eq(t.profiles.workspaceId, workspaceId)).limit(1),
    /*
     * Named columns, and deliberately not the three key ones.
     *
     * The mapping below already field-lists what it returns, so nothing leaked.
     * But a bare select() pulls the keys into this function's memory and leaves
     * one edit away from a leak: somebody spreads the row instead of naming
     * fields, and the workspace's credentials go out in the snapshot every
     * member of the business receives. Not fetching them at all means that edit
     * cannot be written.
     */
    db
      .select({
        model: t.settings.model,
        effort: t.settings.effort,
        theme: t.settings.theme,
        companyName: t.settings.companyName,
        companySubtitle: t.settings.companySubtitle,
        writingRules: t.settings.writingRules,
        roomBrevity: t.settings.roomBrevity,
        companyMark: t.settings.companyMark,
        companyLogoUrl: t.settings.companyLogoUrl,
        sidebarSide: t.settings.sidebarSide,
        searchShortcut: t.settings.searchShortcut,
        wikiTitle: t.settings.wikiTitle,
        wikiSubtitle: t.settings.wikiSubtitle,
      })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId))
      .limit(1),
  ]);

  const filesById = new Map(fileRows.map((row) => [row.id, toAttachment(row)]));

  const countByConversation = new Map(
    messageCountRows.map((row) => [row.conversationId, Number(row.count)]),
  );

  const roundsByRun = new Map<string, AllHandsRun["rounds"]>();
  for (const row of roundRows) {
    const list = roundsByRun.get(row.runId) ?? [];
    list.push({
      id: row.id,
      question: row.question,
      responses: row.responses,
      synthesis: row.synthesis ?? undefined,
      synthesisError: row.synthesisError || undefined,
      createdAt: ms(row.createdAt),
    });
    roundsByRun.set(row.runId, list);
  }

  return {
    departments: departmentRows.map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl ?? undefined,
      personal: row.personal || undefined,
      personaName: row.personaName,
      roleTitle: row.roleTitle,
      persona: row.persona,
      systemPrompt: row.systemPrompt,
      model: row.model ?? undefined,
      status: row.status as Department["status"],
      order: row.sortOrder,
      isCeo: row.isCeo || undefined,
    })),

    projects: projectRows.map((row): Project => ({
      id: row.id,
      name: row.name,
      summary: row.summary,
      status: row.status as Project["status"],
      accent: row.accent,
      dueOn: row.dueOn,
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    conversations: conversationRows.map((row): Conversation => ({
      id: row.id,
      departmentId: row.departmentId,
      projectId: row.projectId ?? undefined,
      title: row.title,
      messages: [],
      messageCount: countByConversation.get(row.id) ?? 0,
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    skills: skillRows.map((row) => ({
      id: row.id,
      departmentId: row.departmentId,
      name: row.name,
      description: row.description,
      content: row.content,
      enabled: row.enabled,
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    deliverables: deliverableRows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      departmentId: row.departmentId,
      projectId: row.projectId ?? undefined,
      status: row.status as Deliverable["status"],
      sourceConversationId: row.sourceConversationId ?? undefined,
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    wikiPages: wikiRows.map((row) => ({
      id: row.id,
      title: row.title,
      blurb: row.blurb,
      body: row.body,
      blocks: row.blocks ?? [],
      order: row.sortOrder,
      enabled: row.enabled,
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    tasks: taskRows.map((row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      status: row.status as Task["status"],
      departmentId: row.departmentId,
      projectId: row.projectId ?? undefined,
      dueAt: row.dueAt ?? undefined,
      order: row.sortOrder,
      sourceConversationId: row.sourceConversationId ?? undefined,
      completedAt: row.completedAt ?? undefined,
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    memory: memoryRows.map((row) => ({
      id: row.id,
      kind: row.kind as MemoryEntry["kind"],
      label: row.label,
      value: row.value,
      detail: row.detail,
      revisitWhen: row.revisitWhen,
      departmentId: row.departmentId,
      projectId: row.projectId ?? undefined,
      occurredAt: row.occurredAt,
      archived: row.archived,
      sourceConversationId: row.sourceConversationId ?? undefined,
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    files: fileRows
      .filter((row) => row.origin === "upload")
      .map((row) => ({
        ...toAttachment(row),
        departmentId: row.departmentId ?? undefined,
        projectId: row.projectId ?? undefined,
        note: row.note ?? undefined,
        createdAt: ms(row.createdAt),
        updatedAt: ms(row.updatedAt),
      })),

    allHandsRuns: runRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status as AllHandsRun["status"],
      rounds: roundsByRun.get(row.id) ?? [],
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    account: {
      displayName: accountRow[0]?.displayName ?? "",
      roleTitle: accountRow[0]?.roleTitle ?? "Founder",
      pronouns: accountRow[0]?.pronouns ?? "",
      timezone: accountRow[0]?.timezone ?? "",
      expertise: accountRow[0]?.expertise ?? "",
      preferences: accountRow[0]?.preferences ?? "",
      currentFocus: accountRow[0]?.currentFocus ?? "",
      notes: accountRow[0]?.notes ?? "",
      avatarUrl: accountRow[0]?.avatarUrl ?? undefined,
      presence: accountRow[0]?.presence === "dnd" ? "dnd" : "auto",
      email: email,
      updatedAt: accountRow[0]?.updatedAt ? ms(accountRow[0].updatedAt) : 0,
    },

    profile: {
      mission: profileRow[0]?.mission ?? "",
      audience: profileRow[0]?.audience ?? "",
      brandVoice: profileRow[0]?.brandVoice ?? "",
      keyFacts: profileRow[0]?.keyFacts ?? "",
      products: profileRow[0]?.products ?? "",
      stage: profileRow[0]?.stage ?? "",
      competitors: profileRow[0]?.competitors ?? "",
      constraints: profileRow[0]?.constraints ?? "",
      goals: profileRow[0]?.goals ?? "",
    },

    settings: {
      model: settingsRow[0]?.model ?? "claude-sonnet-5",
      effort: (settingsRow[0]?.effort ?? "medium") as Settings["effort"],
      theme: (settingsRow[0]?.theme ?? "dark") as Settings["theme"],
      companyName: settingsRow[0]?.companyName ?? "Your Company",
      companySubtitle: settingsRow[0]?.companySubtitle ?? "",
      writingRules: settingsRow[0]?.writingRules ?? "",
      roomBrevity: (settingsRow[0]?.roomBrevity ?? "tight") as Settings["roomBrevity"],
      companyMark: settingsRow[0]?.companyMark ?? "HQ",
      companyLogoUrl: settingsRow[0]?.companyLogoUrl ?? undefined,
      sidebarSide: (settingsRow[0]?.sidebarSide ?? "left") as Settings["sidebarSide"],
      searchShortcut: (settingsRow[0]?.searchShortcut ?? "slash") as Settings["searchShortcut"],
      wikiTitle: settingsRow[0]?.wikiTitle ?? "Internal Wiki",
      wikiSubtitle: settingsRow[0]?.wikiSubtitle ?? "2 minute read",
    },
  };
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

/**
 * Applies a batch in one transaction, so a half-written conversation cannot
 * survive a failure partway through.
 */
export async function applyMutations(
  workspaceId: string,
  email: string,
  ops: MutationOp[],
): Promise<void> {
  const db = requireDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const op of ops) {
      switch (op.table) {
        case "departments": {
          if (op.action === "delete") {
            if (op.ids.length) {
              // Removing a head takes its conversations and their messages with
              // it. Postgres has no foreign key doing this for us, and leaving
              // them would strand threads pointing at a head that is gone.
              const orphans = await tx
                .select({ id: t.conversations.id })
                .from(t.conversations)
                .where(
                  and(
                    eq(t.conversations.workspaceId, workspaceId),
                    inArray(t.conversations.departmentId, op.ids),
                  ),
                );
              const orphanIds = orphans.map((row) => row.id);

              if (orphanIds.length) {
                await tx
                  .delete(t.messages)
                  .where(
                    and(
                      eq(t.messages.workspaceId, workspaceId),
                      inArray(t.messages.conversationId, orphanIds),
                    ),
                  );
                await tx
                  .delete(t.conversations)
                  .where(
                    and(
                      eq(t.conversations.workspaceId, workspaceId),
                      inArray(t.conversations.id, orphanIds),
                    ),
                  );
              }

              await tx
                .delete(t.departments)
                .where(and(eq(t.departments.workspaceId, workspaceId), inArray(t.departments.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              name: row.name,
              avatarUrl: row.avatarUrl ?? null,
              personal: Boolean(row.personal),
              personaName: row.personaName ?? "",
              roleTitle: row.roleTitle,
              persona: row.persona ?? "",
              systemPrompt: row.systemPrompt,
              model: row.model ?? null,
              status: row.status,
              sortOrder: row.order,
              isCeo: Boolean(row.isCeo),
              updatedAt: now,
            };
            await tx
              .insert(t.departments)
              .values(values)
              .onConflictDoUpdate({
                target: [t.departments.workspaceId, t.departments.id],
                set: values,
              });
          }
          break;
        }

        case "projects": {
          if (op.action === "delete") {
            if (op.ids.length) {
              // Unlink before deleting, in the same transaction. The client
              // reducer does exactly this, and a project vanishing must never
              // take a conversation with it.
              const owned = and(
                eq(t.conversations.workspaceId, workspaceId),
                inArray(t.conversations.projectId, op.ids),
              );
              await tx.update(t.conversations).set({ projectId: null }).where(owned);
              await tx
                .update(t.deliverables)
                .set({ projectId: null })
                .where(
                  and(
                    eq(t.deliverables.workspaceId, workspaceId),
                    inArray(t.deliverables.projectId, op.ids),
                  ),
                );
              await tx
                .update(t.files)
                .set({ projectId: null })
                .where(
                  and(eq(t.files.workspaceId, workspaceId), inArray(t.files.projectId, op.ids)),
                );
              await tx
                .update(t.memory)
                .set({ projectId: null })
                .where(
                  and(eq(t.memory.workspaceId, workspaceId), inArray(t.memory.projectId, op.ids)),
                );
              await tx
                .update(t.tasks)
                .set({ projectId: null })
                .where(
                  and(eq(t.tasks.workspaceId, workspaceId), inArray(t.tasks.projectId, op.ids)),
                );
              await tx
                .delete(t.projects)
                .where(and(eq(t.projects.workspaceId, workspaceId), inArray(t.projects.id, op.ids)));
            }
            break;
          }

          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              name: row.name,
              summary: row.summary,
              status: row.status,
              accent: row.accent,
              dueOn: row.dueOn,
              updatedAt: now,
            };
            await tx
              .insert(t.projects)
              .values(values)
              .onConflictDoUpdate({
                target: [t.projects.workspaceId, t.projects.id],
                set: values,
              });
          }
          break;
        }

        case "conversations": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.messages)
                .where(and(eq(t.messages.workspaceId, workspaceId), inArray(t.messages.conversationId, op.ids)));
              await tx
                .delete(t.conversations)
                .where(and(eq(t.conversations.workspaceId, workspaceId), inArray(t.conversations.id, op.ids)));
            }
            break;
          }

          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              departmentId: row.departmentId,
              projectId: row.projectId ?? null,
              title: row.title,
              updatedAt: now,
            };
            await tx
              .insert(t.conversations)
              .values(values)
              .onConflictDoUpdate({
                target: [t.conversations.workspaceId, t.conversations.id],
                set: values,
              });

            // Attachments are files first, so a message only ever stores ids.
            for (const message of row.messages) {
              for (const attachment of message.attachments ?? []) {
                const fileValues = {
                  id: attachment.id,
                  workspaceId,
                  kind: attachment.kind,
                  mediaType: attachment.mediaType,
                  name: attachment.name,
                  // Empty only when the client never had the bytes, which means
                  // the row already exists; the insert below leaves it alone.
                  data: attachment.data ?? "",
                  textContent: attachment.text ?? null,
                  width: attachment.width,
                  height: attachment.height,
                  size: attachment.size ?? 0,
                  origin: "chat",
                  updatedAt: now,
                };
                await tx
                  .insert(t.files)
                  .values(fileValues)
                  // Already stored means already uploaded; do not rewrite the bytes.
                  .onConflictDoNothing({ target: [t.files.workspaceId, t.files.id] });
              }

              const messageValues = {
                id: message.id,
                workspaceId,
                // Who wrote it, always. It used to be stored only when it
                // differed from the owner, which made sense when a workspace
                // was one person. A workspace is a company now, so an
                // unattributed message is one nobody can be asked about.
                authorEmail: message.authorEmail ?? email,
                conversationId: row.id,
                role: message.role,
                content: message.content,
                thinking: message.thinking ?? null,
                isError: Boolean(message.error),
                toolCalls: message.toolCalls ?? null,
                attachmentIds: (message.attachments ?? []).map((a) => a.id),
                model: message.model ?? null,
                inputTokens: message.usage?.input ?? 0,
                outputTokens: message.usage?.output ?? 0,
                cacheReadTokens: message.usage?.cacheRead ?? 0,
                cacheWriteTokens: message.usage?.cacheWrite ?? 0,
                sentAt: message.timestamp,
              };
              await tx
                .insert(t.messages)
                .values(messageValues)
                .onConflictDoUpdate({
                  target: [t.messages.workspaceId, t.messages.id],
                  // Authorship is set once, on insert. Saving a shared thread
                  // re-sends every message in it, so updating this too would
                  // stamp whoever saved last onto everyone else's messages.
                  set: { ...messageValues, authorEmail: undefined },
                });
            }
          }
          break;
        }

        case "skills": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.skills)
                .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              departmentId: row.departmentId,
              name: row.name,
              description: row.description,
              content: row.content,
              enabled: row.enabled,
              updatedAt: now,
            };
            await tx
              .insert(t.skills)
              .values(values)
              .onConflictDoUpdate({ target: [t.skills.workspaceId, t.skills.id], set: values });
          }
          break;
        }

        case "deliverables": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.deliverables)
                .where(and(eq(t.deliverables.workspaceId, workspaceId), inArray(t.deliverables.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              title: row.title,
              body: row.body,
              departmentId: row.departmentId,
              projectId: row.projectId ?? null,
              status: row.status,
              sourceConversationId: row.sourceConversationId ?? null,
              updatedAt: now,
            };
            await tx
              .insert(t.deliverables)
              .values(values)
              .onConflictDoUpdate({
                target: [t.deliverables.workspaceId, t.deliverables.id],
                set: values,
              });
          }
          break;
        }

        case "wikiPages": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.wikiPages)
                .where(and(eq(t.wikiPages.workspaceId, workspaceId), inArray(t.wikiPages.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              title: row.title,
              blurb: row.blurb,
              body: row.body,
              blocks: row.blocks ?? [],
              sortOrder: row.order,
              enabled: row.enabled,
              updatedAt: now,
            };
            await tx
              .insert(t.wikiPages)
              .values(values)
              .onConflictDoUpdate({
                target: [t.wikiPages.workspaceId, t.wikiPages.id],
                set: values,
              });
          }
          break;
        }

        case "tasks": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.tasks)
                .where(and(eq(t.tasks.workspaceId, workspaceId), inArray(t.tasks.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              title: row.title,
              notes: row.notes,
              status: row.status,
              departmentId: row.departmentId,
              projectId: row.projectId ?? null,
              dueAt: row.dueAt ?? null,
              sortOrder: row.order,
              sourceConversationId: row.sourceConversationId ?? null,
              completedAt: row.completedAt ?? null,
              updatedAt: now,
            };
            await tx
              .insert(t.tasks)
              .values(values)
              .onConflictDoUpdate({
                target: [t.tasks.workspaceId, t.tasks.id],
                set: values,
              });
          }
          break;
        }

        case "memory": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.memory)
                .where(and(eq(t.memory.workspaceId, workspaceId), inArray(t.memory.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              kind: row.kind,
              label: row.label,
              value: row.value,
              detail: row.detail,
              revisitWhen: row.revisitWhen,
              departmentId: row.departmentId,
              projectId: row.projectId ?? null,
              occurredAt: row.occurredAt,
              archived: row.archived,
              sourceConversationId: row.sourceConversationId ?? null,
              updatedAt: now,
            };
            await tx
              .insert(t.memory)
              .values(values)
              .onConflictDoUpdate({
                target: [t.memory.workspaceId, t.memory.id],
                set: values,
              });
          }
          break;
        }

        case "files": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.files)
                .where(and(eq(t.files.workspaceId, workspaceId), inArray(t.files.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              kind: row.kind,
              mediaType: row.mediaType,
              name: row.name,
              data: row.data,
              textContent: row.text ?? null,
              width: row.width,
              height: row.height,
              size: row.size ?? 0,
              departmentId: row.departmentId ?? null,
              projectId: row.projectId ?? null,
              note: row.note ?? null,
              origin: "upload",
              updatedAt: now,
            };
            await tx
              .insert(t.files)
              .values(values)
              .onConflictDoUpdate({ target: [t.files.workspaceId, t.files.id], set: values });
          }
          break;
        }

        case "allHands": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.allHandsRounds)
                .where(and(eq(t.allHandsRounds.workspaceId, workspaceId), inArray(t.allHandsRounds.runId, op.ids)));
              await tx
                .delete(t.allHandsRuns)
                .where(and(eq(t.allHandsRuns.workspaceId, workspaceId), inArray(t.allHandsRuns.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              workspaceId,
              title: row.title,
              status: row.status,
              updatedAt: now,
            };
            await tx
              .insert(t.allHandsRuns)
              .values(values)
              .onConflictDoUpdate({
                target: [t.allHandsRuns.workspaceId, t.allHandsRuns.id],
                set: values,
              });

            for (const [index, round] of row.rounds.entries()) {
              const roundValues = {
                id: round.id,
                workspaceId,
                runId: row.id,
                question: round.question,
                responses: round.responses,
                synthesis: round.synthesis ?? null,
                synthesisError: Boolean(round.synthesisError),
                sortOrder: index,
              };
              await tx
                .insert(t.allHandsRounds)
                .values(roundValues)
                .onConflictDoUpdate({
                  target: [t.allHandsRounds.workspaceId, t.allHandsRounds.id],
                  set: roundValues,
                });
            }
          }
          break;
        }

        case "profile": {
          // Named one by one, like every other table here. Spreading the
          // client's row over the scope key let the row choose its own
          // workspace, which is the one thing a tenant must never pick.
          const row = op.row;
          const values = {
            workspaceId,
            mission: row.mission ?? "",
            audience: row.audience ?? "",
            brandVoice: row.brandVoice ?? "",
            keyFacts: row.keyFacts ?? "",
            products: row.products ?? "",
            stage: row.stage ?? "",
            competitors: row.competitors ?? "",
            constraints: row.constraints ?? "",
            goals: row.goals ?? "",
            updatedAt: now,
          };
          await tx
            .insert(t.profiles)
            .values(values)
            .onConflictDoUpdate({ target: t.profiles.workspaceId, set: values });
          break;
        }

        case "settings": {
          /*
           * Named one by one, for two reasons.
           *
           * The scope key is the server's. `{ workspaceId, ...op.row }` let a
           * client send its own `workspaceId` and land the write in somebody
           * else's business: that is how a workspace got renamed by the first
           * person to open it, and the same shape would have let any signed-in
           * account write into any other company's settings.
           *
           * And the three model keys are columns on this table but are not
           * settings. They are written only by /api/workspace/keys, which never
           * reads them back. Leaving them out here means a settings save can
           * neither overwrite a workspace's credentials nor carry one in.
           */
          const row = op.row;
          const text = (value: unknown, fallback = "") =>
            typeof value === "string" ? value : fallback;
          const values = {
            workspaceId,
            model: text(row.model, "claude-sonnet-5"),
            effort: text(row.effort, "medium"),
            theme: text(row.theme, "dark"),
            companyName: text(row.companyName, "Your Company"),
            companySubtitle: text(row.companySubtitle),
            writingRules: text(row.writingRules),
            roomBrevity: text(row.roomBrevity, "tight"),
            companyMark: text(row.companyMark, "HQ"),
            companyLogoUrl: typeof row.companyLogoUrl === "string" ? row.companyLogoUrl : null,
            sidebarSide: text(row.sidebarSide, "left"),
            searchShortcut: text(row.searchShortcut, "slash"),
            wikiTitle: text(row.wikiTitle, "Internal Wiki"),
            wikiSubtitle: text(row.wikiSubtitle, "2 minute read"),
            updatedAt: now,
          };
          await tx
            .insert(t.settings)
            .values(values)
            .onConflictDoUpdate({ target: t.settings.workspaceId, set: values });

          // The company name and the business name are the same fact. Renaming
          // the panel renames the business, so the operator's list never shows
          // a name the customer stopped using months ago.
          if (values.companyName.trim()) {
            await tx
              .update(t.workspaces)
              .set({ name: values.companyName.trim(), updatedAt: now })
              .where(eq(t.workspaces.id, workspaceId));
          }
          break;
        }

        case "account": {
          // email and updatedAt are derived, never taken from the client.
          const { email: _email, updatedAt: _updated, ...editable } = op.row;
          const values = { userEmail: email, ...editable, updatedAt: now };
          await tx
            .insert(t.accounts)
            .values(values)
            .onConflictDoUpdate({ target: t.accounts.userEmail, set: values });
          break;
        }
      }
    }
  });
}

/** True when the account has never been written to, so it needs seeding or an import. */
export async function isEmpty(workspaceId: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db
    .select({ id: t.departments.id })
    .from(t.departments)
    .where(eq(t.departments.workspaceId, workspaceId))
    .limit(1);
  return rows.length === 0;
}
