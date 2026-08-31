import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";
import type { MutationOp, Workspace } from "@/lib/workspace";
import type {
  AllHandsRun,
  Attachment,
  Department,
  Deliverable,
  Message,
  Project,
  Settings,
  UserAccount,
} from "@/lib/types";

export type { MutationOp, Workspace };

const ms = (value: Date) => value.getTime();

function toAttachment(row: typeof t.files.$inferSelect): Attachment {
  return {
    id: row.id,
    kind: row.kind as Attachment["kind"],
    mediaType: row.mediaType,
    name: row.name,
    data: row.data,
    text: row.textContent ?? undefined,
    width: row.width,
    height: row.height,
    size: row.size,
  };
}

export async function loadWorkspace(userEmail: string): Promise<Workspace> {
  const db = requireDb();

  const [
    departmentRows,
    projectRows,
    conversationRows,
    messageRows,
    skillRows,
    deliverableRows,
    fileRows,
    runRows,
    roundRows,
    accountRow,
    profileRow,
    settingsRow,
  ] = await Promise.all([
    db.select().from(t.departments).where(eq(t.departments.userEmail, userEmail)).orderBy(asc(t.departments.sortOrder)),
    db.select().from(t.projects).where(eq(t.projects.userEmail, userEmail)).orderBy(desc(t.projects.updatedAt)),
    db.select().from(t.conversations).where(eq(t.conversations.userEmail, userEmail)).orderBy(desc(t.conversations.updatedAt)),
    db.select().from(t.messages).where(eq(t.messages.userEmail, userEmail)).orderBy(asc(t.messages.sentAt)),
    db.select().from(t.skills).where(eq(t.skills.userEmail, userEmail)).orderBy(desc(t.skills.updatedAt)),
    db.select().from(t.deliverables).where(eq(t.deliverables.userEmail, userEmail)).orderBy(desc(t.deliverables.updatedAt)),
    db.select().from(t.files).where(eq(t.files.userEmail, userEmail)).orderBy(desc(t.files.updatedAt)),
    db.select().from(t.allHandsRuns).where(eq(t.allHandsRuns.userEmail, userEmail)).orderBy(desc(t.allHandsRuns.updatedAt)),
    db.select().from(t.allHandsRounds).where(eq(t.allHandsRounds.userEmail, userEmail)).orderBy(asc(t.allHandsRounds.sortOrder)),
    db.select().from(t.accounts).where(eq(t.accounts.userEmail, userEmail)).limit(1),
    db.select().from(t.profiles).where(eq(t.profiles.userEmail, userEmail)).limit(1),
    db.select().from(t.settings).where(eq(t.settings.userEmail, userEmail)).limit(1),
  ]);

  const filesById = new Map(fileRows.map((row) => [row.id, toAttachment(row)]));

  const messagesByConversation = new Map<string, Message[]>();
  for (const row of messageRows) {
    const list = messagesByConversation.get(row.conversationId) ?? [];
    list.push({
      id: row.id,
      role: row.role as Message["role"],
      content: row.content,
      thinking: row.thinking ?? undefined,
      error: row.isError || undefined,
      timestamp: row.sentAt,
      attachments: row.attachmentIds.length
        ? row.attachmentIds
            .map((id) => filesById.get(id))
            .filter((file): file is Attachment => Boolean(file))
        : undefined,
    });
    messagesByConversation.set(row.conversationId, list);
  }

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
      emoji: row.emoji,
      personaName: row.personaName,
      roleTitle: row.roleTitle,
      persona: row.persona,
      systemPrompt: row.systemPrompt,
      status: row.status as Department["status"],
      order: row.sortOrder,
      isCeo: row.isCeo || undefined,
    })),

    projects: projectRows.map((row) => ({
      id: row.id,
      name: row.name,
      summary: row.summary,
      status: row.status as Project["status"],
      accent: row.accent,
      dueOn: row.dueOn,
      createdAt: ms(row.createdAt),
      updatedAt: ms(row.updatedAt),
    })),

    conversations: conversationRows.map((row) => ({
      id: row.id,
      departmentId: row.departmentId,
      projectId: row.projectId ?? undefined,
      title: row.title,
      messages: messagesByConversation.get(row.id) ?? [],
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
      avatarUrl: accountRow[0]?.avatarUrl ?? undefined,
      email: userEmail,
      updatedAt: accountRow[0]?.updatedAt ? ms(accountRow[0].updatedAt) : 0,
    },

    profile: {
      mission: profileRow[0]?.mission ?? "",
      audience: profileRow[0]?.audience ?? "",
      brandVoice: profileRow[0]?.brandVoice ?? "",
      keyFacts: profileRow[0]?.keyFacts ?? "",
    },

    settings: {
      model: settingsRow[0]?.model ?? "claude-sonnet-5",
      effort: (settingsRow[0]?.effort ?? "medium") as Settings["effort"],
      theme: (settingsRow[0]?.theme ?? "dark") as Settings["theme"],
      companyName: settingsRow[0]?.companyName ?? "Eterneon",
      companySubtitle: settingsRow[0]?.companySubtitle ?? "",
      writingRules: settingsRow[0]?.writingRules ?? "",
      roomBrevity: (settingsRow[0]?.roomBrevity ?? "tight") as Settings["roomBrevity"],
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
export async function applyMutations(userEmail: string, ops: MutationOp[]): Promise<void> {
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
                    eq(t.conversations.userEmail, userEmail),
                    inArray(t.conversations.departmentId, op.ids),
                  ),
                );
              const orphanIds = orphans.map((row) => row.id);

              if (orphanIds.length) {
                await tx
                  .delete(t.messages)
                  .where(
                    and(
                      eq(t.messages.userEmail, userEmail),
                      inArray(t.messages.conversationId, orphanIds),
                    ),
                  );
                await tx
                  .delete(t.conversations)
                  .where(
                    and(
                      eq(t.conversations.userEmail, userEmail),
                      inArray(t.conversations.id, orphanIds),
                    ),
                  );
              }

              await tx
                .delete(t.departments)
                .where(and(eq(t.departments.userEmail, userEmail), inArray(t.departments.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              userEmail,
              name: row.name,
              emoji: row.emoji,
              personaName: row.personaName ?? "",
              roleTitle: row.roleTitle,
              persona: row.persona ?? "",
              systemPrompt: row.systemPrompt,
              status: row.status,
              sortOrder: row.order,
              isCeo: Boolean(row.isCeo),
              updatedAt: now,
            };
            await tx
              .insert(t.departments)
              .values(values)
              .onConflictDoUpdate({
                target: [t.departments.userEmail, t.departments.id],
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
                eq(t.conversations.userEmail, userEmail),
                inArray(t.conversations.projectId, op.ids),
              );
              await tx.update(t.conversations).set({ projectId: null }).where(owned);
              await tx
                .update(t.deliverables)
                .set({ projectId: null })
                .where(
                  and(
                    eq(t.deliverables.userEmail, userEmail),
                    inArray(t.deliverables.projectId, op.ids),
                  ),
                );
              await tx
                .update(t.files)
                .set({ projectId: null })
                .where(
                  and(eq(t.files.userEmail, userEmail), inArray(t.files.projectId, op.ids)),
                );
              await tx
                .delete(t.projects)
                .where(and(eq(t.projects.userEmail, userEmail), inArray(t.projects.id, op.ids)));
            }
            break;
          }

          for (const row of op.rows) {
            const values = {
              id: row.id,
              userEmail,
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
                target: [t.projects.userEmail, t.projects.id],
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
                .where(and(eq(t.messages.userEmail, userEmail), inArray(t.messages.conversationId, op.ids)));
              await tx
                .delete(t.conversations)
                .where(and(eq(t.conversations.userEmail, userEmail), inArray(t.conversations.id, op.ids)));
            }
            break;
          }

          for (const row of op.rows) {
            const values = {
              id: row.id,
              userEmail,
              departmentId: row.departmentId,
              projectId: row.projectId ?? null,
              title: row.title,
              updatedAt: now,
            };
            await tx
              .insert(t.conversations)
              .values(values)
              .onConflictDoUpdate({
                target: [t.conversations.userEmail, t.conversations.id],
                set: values,
              });

            // Attachments are files first, so a message only ever stores ids.
            for (const message of row.messages) {
              for (const attachment of message.attachments ?? []) {
                const fileValues = {
                  id: attachment.id,
                  userEmail,
                  kind: attachment.kind,
                  mediaType: attachment.mediaType,
                  name: attachment.name,
                  data: attachment.data,
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
                  .onConflictDoNothing({ target: [t.files.userEmail, t.files.id] });
              }

              const messageValues = {
                id: message.id,
                userEmail,
                conversationId: row.id,
                role: message.role,
                content: message.content,
                thinking: message.thinking ?? null,
                isError: Boolean(message.error),
                attachmentIds: (message.attachments ?? []).map((a) => a.id),
                sentAt: message.timestamp,
              };
              await tx
                .insert(t.messages)
                .values(messageValues)
                .onConflictDoUpdate({
                  target: [t.messages.userEmail, t.messages.id],
                  set: messageValues,
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
                .where(and(eq(t.skills.userEmail, userEmail), inArray(t.skills.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              userEmail,
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
              .onConflictDoUpdate({ target: [t.skills.userEmail, t.skills.id], set: values });
          }
          break;
        }

        case "deliverables": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.deliverables)
                .where(and(eq(t.deliverables.userEmail, userEmail), inArray(t.deliverables.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              userEmail,
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
                target: [t.deliverables.userEmail, t.deliverables.id],
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
                .where(and(eq(t.files.userEmail, userEmail), inArray(t.files.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              userEmail,
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
              .onConflictDoUpdate({ target: [t.files.userEmail, t.files.id], set: values });
          }
          break;
        }

        case "allHands": {
          if (op.action === "delete") {
            if (op.ids.length) {
              await tx
                .delete(t.allHandsRounds)
                .where(and(eq(t.allHandsRounds.userEmail, userEmail), inArray(t.allHandsRounds.runId, op.ids)));
              await tx
                .delete(t.allHandsRuns)
                .where(and(eq(t.allHandsRuns.userEmail, userEmail), inArray(t.allHandsRuns.id, op.ids)));
            }
            break;
          }
          for (const row of op.rows) {
            const values = {
              id: row.id,
              userEmail,
              title: row.title,
              status: row.status,
              updatedAt: now,
            };
            await tx
              .insert(t.allHandsRuns)
              .values(values)
              .onConflictDoUpdate({
                target: [t.allHandsRuns.userEmail, t.allHandsRuns.id],
                set: values,
              });

            for (const [index, round] of row.rounds.entries()) {
              const roundValues = {
                id: round.id,
                userEmail,
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
                  target: [t.allHandsRounds.userEmail, t.allHandsRounds.id],
                  set: roundValues,
                });
            }
          }
          break;
        }

        case "profile": {
          const values = { userEmail, ...op.row, updatedAt: now };
          await tx
            .insert(t.profiles)
            .values(values)
            .onConflictDoUpdate({ target: t.profiles.userEmail, set: values });
          break;
        }

        case "settings": {
          const values = { userEmail, ...op.row, updatedAt: now };
          await tx
            .insert(t.settings)
            .values(values)
            .onConflictDoUpdate({ target: t.settings.userEmail, set: values });
          break;
        }

        case "account": {
          // email and updatedAt are derived, never taken from the client.
          const { email: _email, updatedAt: _updated, ...editable } = op.row;
          const values = { userEmail, ...editable, updatedAt: now };
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
export async function isEmpty(userEmail: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db
    .select({ id: t.departments.id })
    .from(t.departments)
    .where(eq(t.departments.userEmail, userEmail))
    .limit(1);
  return rows.length === 0;
}
