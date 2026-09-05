import { writableSettings } from "@/lib/settingsWrite";
import { fireTaskEvents, type TaskEvent } from "@/lib/addons/runner";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";
import { forgetBlobs } from "./blobs";
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
/*
 * Neither the bytes nor where they are kept. A browser fetches a file through
 * this app's own route, which checks the workspace first, so a blob URL it
 * never receives is one it cannot leak.
 */
type FileRow = Omit<typeof t.files.$inferSelect, "data" | "blobUrl">;

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
  //
  // Named in the query rather than filtered afterwards. Asking for the whole
  // workspace and dropping most of it meant opening one conversation with one
  // attachment read every file row in the business, and `text_content` is a
  // whole PDF's extracted text, so the cost was the size of the Library rather
  // than the size of the conversation.
  const wanted = [...new Set(kept.flatMap((row) => row.attachmentIds))];
  const filesById = new Map<string, Attachment>();
  if (wanted.length > 0) {
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
      .where(and(eq(t.files.workspaceId, workspaceId), inArray(t.files.id, wanted)));
    for (const file of files) {
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

/** One deliverable's full text, which the snapshot deliberately truncates. */
export async function loadDeliverableBody(
  workspaceId: string,
  id: string,
): Promise<string | null> {
  const [row] = await requireDb()
    .select({ body: t.deliverables.body })
    .from(t.deliverables)
    .where(and(eq(t.deliverables.workspaceId, workspaceId), eq(t.deliverables.id, id)))
    .limit(1);
  return row?.body ?? null;
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
     * How many messages each conversation has, not what they say. Bodies are
     * the largest thing in a workspace and grow forever, so they arrive when a
     * conversation is opened rather than on every page load.
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
    /*
     * The opening of each document, not all of it. A Library card shows about
     * 180 characters, and `left` truncates in the database so the rest never
     * leaves it.
     */
    db
      .select({
        id: t.deliverables.id,
        title: t.deliverables.title,
        body: sql<string>`left(${t.deliverables.body}, 240)`,
        departmentId: t.deliverables.departmentId,
        projectId: t.deliverables.projectId,
        status: t.deliverables.status,
        sourceConversationId: t.deliverables.sourceConversationId,
        createdAt: t.deliverables.createdAt,
        updatedAt: t.deliverables.updatedAt,
        whole: sql<boolean>`length(${t.deliverables.body}) <= 240`,
      })
      .from(t.deliverables)
      .where(eq(t.deliverables.workspaceId, workspaceId))
      .orderBy(desc(t.deliverables.updatedAt)),
    db.select().from(t.memory).where(eq(t.memory.workspaceId, workspaceId)).orderBy(desc(t.memory.occurredAt)),
    db.select().from(t.tasks).where(eq(t.tasks.workspaceId, workspaceId)).orderBy(asc(t.tasks.sortOrder)),
    db.select().from(t.wikiPages).where(eq(t.wikiPages.workspaceId, workspaceId)).orderBy(asc(t.wikiPages.sortOrder)),
    /*
     * Every column except `data`, which is the base64 of the file itself.
     * Nothing built from these rows reads it, and the bytes are served on
     * demand from /api/files/[id]. A bare `select()` would carry a business's
     * whole Library on every page load.
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
     * A bare select() would pull the workspace's credentials into memory here,
     * one careless spread away from going out in the snapshot every member
     * receives. Not fetching them means that edit cannot be written.
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
        webSearch: t.settings.webSearch,
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
      // A short one arrived whole, so nothing needs fetching when it is opened.
      bodyLoaded: row.whole,
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
      // Anything that is not one of the three modes reads as off, so a value
      // written by hand cannot turn spending on.
      webSearch:
        settingsRow[0]?.webSearch === "native" || settingsRow[0]?.webSearch === "perplexity"
          ? settingsRow[0].webSearch
          : "off",
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

  /*
   * Gathered inside the transaction and deleted after it commits. An
   * unreachable store must not roll back a delete somebody asked for: bytes
   * left behind are a smaller problem than a deleted file coming back.
   */
  const orphaned: string[] = [];

  /*
   * Gathered inside the transaction and acted on after it commits, for the same
   * reason as the blobs above and one more: an addon may spend five seconds on
   * an outbound call, and holding a database transaction open for that would
   * make a webhook somebody else runs into a lock on this workspace's writes.
   */
  const taskEvents: TaskEvent[] = [];

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
              /*
               * Chat attachments go with the messages that carried them, since
               * nothing else lists or deletes them. Only chat-origin files: a
               * Library upload can be referenced by a message and still belongs
               * to the Library.
               */
              const carried = await tx
                .select({ ids: t.messages.attachmentIds })
                .from(t.messages)
                .where(
                  and(
                    eq(t.messages.workspaceId, workspaceId),
                    inArray(t.messages.conversationId, op.ids),
                  ),
                );
              const attachmentIds = [...new Set(carried.flatMap((row) => row.ids))];

              await tx
                .delete(t.messages)
                .where(and(eq(t.messages.workspaceId, workspaceId), inArray(t.messages.conversationId, op.ids)));

              if (attachmentIds.length) {
                const where = and(
                  eq(t.files.workspaceId, workspaceId),
                  eq(t.files.origin, "chat"),
                  inArray(t.files.id, attachmentIds),
                );
                // Read where the bytes are before the rows that say so are
                // gone. Deleted after the transaction, so a store that is having
                // a bad day cannot roll back a delete somebody asked for.
                orphaned.push(
                  ...(await tx.select({ url: t.files.blobUrl }).from(t.files).where(where)).map(
                    (row) => row.url,
                  ),
                );
                await tx.delete(t.files).where(where);
              }

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
                  blobUrl: attachment.blobUrl ?? "",
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
          /*
           * What these rows looked like before, so a change can be told from a
           * creation. Read once for the whole batch rather than per row: this
           * runs on every task write in the product, and a query per task would
           * make dragging a card across the board cost a query per card.
           */
          const before = new Map<string, string>();
          if (op.rows.length) {
            const existing = await tx
              .select({ id: t.tasks.id, status: t.tasks.status })
              .from(t.tasks)
              .where(
                and(
                  eq(t.tasks.workspaceId, workspaceId),
                  inArray(
                    t.tasks.id,
                    op.rows.map((row) => row.id),
                  ),
                ),
              );
            for (const row of existing) before.set(row.id, row.status);
          }

          for (const row of op.rows) {
            const previous = before.get(row.id);

            // Created, or completed. Completion is a transition rather than a
            // state, so saving an already-done task again does not fire it and
            // an addon cannot be made to repeat by touching the row.
            if (previous === undefined) {
              taskEvents.push({
                workspaceId,
                trigger: "task.created",
                title: row.title,
                status: row.status,
                departmentId: row.departmentId,
              });
            } else if (previous !== "done" && row.status === "done") {
              taskEvents.push({
                workspaceId,
                trigger: "task.completed",
                title: row.title,
                status: row.status,
                departmentId: row.departmentId,
              });
            }

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
              const where = and(
                eq(t.files.workspaceId, workspaceId),
                inArray(t.files.id, op.ids),
              );
              orphaned.push(
                ...(await tx.select({ url: t.files.blobUrl }).from(t.files).where(where)).map(
                  (row) => row.url,
                ),
              );
              await tx.delete(t.files).where(where);
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
              /*
               * Both write paths have to carry this. The client uploads to the
               * blob store and clears `data`, so a row without it has the bytes
               * in neither place and the file opens as nothing.
               */
              blobUrl: row.blobUrl ?? "",
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
          // The allow list and the clearing rule are in lib/settingsWrite, so
          // they can be tested without a database.
          const sent = writableSettings(op.row as Record<string, unknown>);

          const values = { workspaceId, ...sent, updatedAt: now };

          await tx
            .insert(t.settings)
            .values(values)
            .onConflictDoUpdate({ target: t.settings.workspaceId, set: values });

          // The company name and the business name are the same fact, so
          // renaming the panel renames the business. Only when a name was
          // actually sent: this is the line that turned a theme change into a
          // rename.
          const named = typeof sent.companyName === "string" ? sent.companyName.trim() : "";
          if (named) {
            await tx
              .update(t.workspaces)
              .set({ name: named, updatedAt: now })
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

  // After the rows, and never in a way that can fail the write.
  await forgetBlobs(orphaned);

  // After the commit, so an addon only ever sees a task that is really saved,
  // and never blocks the save itself. fireTaskEvents does not throw.
  await fireTaskEvents(taskEvents);
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
