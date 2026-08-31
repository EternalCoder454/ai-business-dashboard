import type {
  AllHandsRun,
  CompanyProfile,
  Conversation,
  Deliverable,
  Department,
  LibraryFile,
  Settings,
  Skill,
} from "./types";

/** Settings as they are stored per account. The API key is server side only. */
export type StoredSettings = Omit<Settings, "id" | "apiKey">;

/**
 * One account's entire workspace.
 *
 * Shared by the server repository and the client store, so a snapshot read on
 * one side and an optimistic update on the other can never drift apart.
 */
export interface Workspace {
  departments: Department[];
  conversations: Conversation[];
  skills: Skill[];
  deliverables: Deliverable[];
  files: LibraryFile[];
  allHandsRuns: AllHandsRun[];
  profile: CompanyProfile;
  settings: StoredSettings;
}

export type MutationOp =
  | { table: "departments"; action: "upsert"; rows: Department[] }
  | { table: "departments"; action: "delete"; ids: string[] }
  | { table: "conversations"; action: "upsert"; rows: Conversation[] }
  | { table: "conversations"; action: "delete"; ids: string[] }
  | { table: "skills"; action: "upsert"; rows: Skill[] }
  | { table: "skills"; action: "delete"; ids: string[] }
  | { table: "deliverables"; action: "upsert"; rows: Deliverable[] }
  | { table: "deliverables"; action: "delete"; ids: string[] }
  | { table: "files"; action: "upsert"; rows: LibraryFile[] }
  | { table: "files"; action: "delete"; ids: string[] }
  | { table: "allHands"; action: "upsert"; rows: AllHandsRun[] }
  | { table: "allHands"; action: "delete"; ids: string[] }
  | { table: "profile"; action: "upsert"; row: CompanyProfile }
  | { table: "settings"; action: "upsert"; row: Partial<StoredSettings> };

export function emptyWorkspace(settings: StoredSettings, profile: CompanyProfile): Workspace {
  return {
    departments: [],
    conversations: [],
    skills: [],
    deliverables: [],
    files: [],
    allHandsRuns: [],
    profile,
    settings,
  };
}

/** Replaces matching rows by id and appends the rest, preserving order. */
function upsertBy<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()];
}

/**
 * Applies one mutation to a snapshot.
 *
 * The client runs this immediately so the interface responds at once, and the
 * server runs the same operation against Postgres. Sharing the definition is
 * what keeps an optimistic update honest: if the two disagreed, the screen
 * would show something the database never accepted.
 */
export function applyOp(workspace: Workspace, op: MutationOp): Workspace {
  switch (op.table) {
    case "departments":
      return {
        ...workspace,
        departments:
          op.action === "upsert"
            ? upsertBy(workspace.departments, op.rows).sort((a, b) => a.order - b.order)
            : workspace.departments.filter((row) => !op.ids.includes(row.id)),
        // Deleting a head takes its conversations with it, matching the server.
        conversations:
          op.action === "delete"
            ? workspace.conversations.filter((row) => !op.ids.includes(row.departmentId))
            : workspace.conversations,
      };

    case "conversations":
      return {
        ...workspace,
        conversations:
          op.action === "upsert"
            ? upsertBy(workspace.conversations, op.rows).sort(
                (a, b) => b.updatedAt - a.updatedAt,
              )
            : workspace.conversations.filter((row) => !op.ids.includes(row.id)),
      };

    case "skills":
      return {
        ...workspace,
        skills:
          op.action === "upsert"
            ? upsertBy(workspace.skills, op.rows).sort((a, b) => b.updatedAt - a.updatedAt)
            : workspace.skills.filter((row) => !op.ids.includes(row.id)),
      };

    case "deliverables":
      return {
        ...workspace,
        deliverables:
          op.action === "upsert"
            ? upsertBy(workspace.deliverables, op.rows).sort(
                (a, b) => b.updatedAt - a.updatedAt,
              )
            : workspace.deliverables.filter((row) => !op.ids.includes(row.id)),
      };

    case "files":
      return {
        ...workspace,
        files:
          op.action === "upsert"
            ? upsertBy(workspace.files, op.rows).sort((a, b) => b.updatedAt - a.updatedAt)
            : workspace.files.filter((row) => !op.ids.includes(row.id)),
      };

    case "allHands":
      return {
        ...workspace,
        allHandsRuns:
          op.action === "upsert"
            ? upsertBy(workspace.allHandsRuns, op.rows).sort(
                (a, b) => b.updatedAt - a.updatedAt,
              )
            : workspace.allHandsRuns.filter((row) => !op.ids.includes(row.id)),
      };

    case "profile":
      return { ...workspace, profile: { ...workspace.profile, ...op.row } };

    case "settings":
      return { ...workspace, settings: { ...workspace.settings, ...op.row } };
  }
}

/** Where this browser is reading and writing from. */
export type StorageMode = "resolving" | "local" | "hosted";

export interface WorkspaceStatus {
  hosted: boolean;
  signedIn: boolean;
  email?: string;
  /** Null when unknown, true when the account has never been written to. */
  empty: boolean | null;
}
