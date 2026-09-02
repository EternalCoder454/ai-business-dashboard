import type {
  AllHandsRun,
  CompanyProfile,
  Conversation,
  Deliverable,
  Department,
  LibraryFile,
  MemoryEntry,
  Project,
  Task,
  WikiPage,
  Settings,
  Skill,
  UserAccount,
} from "./types";

/** Settings as they are stored per account. The API key is server side only. */
/**
 * Settings as they are stored per account.
 *
 * Every API key is left out deliberately. A hosted workspace syncs between
 * machines, and a credential that follows you between machines is a credential
 * sitting in a database waiting to leak, so they live in the browser instead.
 */
export type StoredSettings = Omit<
  Settings,
  "id" | "apiKey" | "workspaceId" | "openaiKey" | "googleKey"
>;

/**
 * One account's entire workspace.
 *
 * Shared by the server repository and the client store, so a snapshot read on
 * one side and an optimistic update on the other can never drift apart.
 */
export interface Workspace {
  departments: Department[];
  projects: Project[];
  conversations: Conversation[];
  skills: Skill[];
  deliverables: Deliverable[];
  files: LibraryFile[];
  memory: MemoryEntry[];
  tasks: Task[];
  wikiPages: WikiPage[];
  allHandsRuns: AllHandsRun[];
  profile: CompanyProfile;
  settings: StoredSettings;
  account: UserAccount;
}

export type MutationOp =
  | { table: "departments"; action: "upsert"; rows: Department[] }
  | { table: "departments"; action: "delete"; ids: string[] }
  | { table: "projects"; action: "upsert"; rows: Project[] }
  | { table: "projects"; action: "delete"; ids: string[] }
  | { table: "conversations"; action: "upsert"; rows: Conversation[] }
  | { table: "conversations"; action: "delete"; ids: string[] }
  | { table: "skills"; action: "upsert"; rows: Skill[] }
  | { table: "skills"; action: "delete"; ids: string[] }
  | { table: "wikiPages"; action: "upsert"; rows: WikiPage[] }
  | { table: "wikiPages"; action: "delete"; ids: string[] }
  | { table: "tasks"; action: "upsert"; rows: Task[] }
  | { table: "tasks"; action: "delete"; ids: string[] }
  | { table: "memory"; action: "upsert"; rows: MemoryEntry[] }
  | { table: "memory"; action: "delete"; ids: string[] }
  | { table: "deliverables"; action: "upsert"; rows: Deliverable[] }
  | { table: "deliverables"; action: "delete"; ids: string[] }
  | { table: "files"; action: "upsert"; rows: LibraryFile[] }
  | { table: "files"; action: "delete"; ids: string[] }
  | { table: "allHands"; action: "upsert"; rows: AllHandsRun[] }
  | { table: "allHands"; action: "delete"; ids: string[] }
  | { table: "profile"; action: "upsert"; row: CompanyProfile }
  | { table: "settings"; action: "upsert"; row: Partial<StoredSettings> }
  | { table: "account"; action: "upsert"; row: Partial<UserAccount> };

/**
 * Every table a mutation is allowed to name.
 *
 * A record rather than a set, because a record is checked: adding a table to
 * MutationOp without adding it here is a type error. The API used to keep its
 * own hand-written list, that list fell behind, and for as long as it did,
 * recording a decision, moving a task, and editing the wiki were all rejected
 * with a 400 that the client turned into a silent revert.
 */
const WRITABLE: Record<MutationOp["table"], true> = {
  departments: true,
  projects: true,
  conversations: true,
  skills: true,
  wikiPages: true,
  tasks: true,
  memory: true,
  deliverables: true,
  files: true,
  allHands: true,
  profile: true,
  settings: true,
  account: true,
};

export const WRITABLE_TABLES: ReadonlySet<string> = new Set(Object.keys(WRITABLE));

/** The largest write request the API will read. */
export const MAX_WRITE_BYTES = 20_000_000;

/**
 * The largest raw file that still fits in one of those requests.
 *
 * Base64 adds a third, so the two numbers have to be derived from each other
 * rather than picked separately. They were picked separately: PDFs were
 * accepted up to 15MB, which encodes to 21MB, which the API rejected with a
 * 413 that nothing surfaced. The slack covers the rest of the JSON.
 */
export const MAX_UPLOAD_BYTES = Math.floor((MAX_WRITE_BYTES / 4) * 3) - 100_000;

export function emptyWorkspace(
  settings: StoredSettings,
  profile: CompanyProfile,
  account: UserAccount,
): Workspace {
  return {
    departments: [],
    projects: [],
    conversations: [],
    skills: [],
    deliverables: [],
    files: [],
    memory: [],
    tasks: [],
    wikiPages: [],
    allHandsRuns: [],
    profile,
    settings,
    account,
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

    case "projects": {
      if (op.action === "upsert") {
        return {
          ...workspace,
          projects: upsertBy(workspace.projects, op.rows).sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        };
      }
      // Deleting a project releases its work rather than destroying it. A
      // conversation is worth more than the folder it was filed in.
      const gone = new Set(op.ids);
      const unlink = <T extends { projectId?: string }>(row: T): T =>
        row.projectId && gone.has(row.projectId) ? { ...row, projectId: undefined } : row;
      return {
        ...workspace,
        projects: workspace.projects.filter((row) => !gone.has(row.id)),
        conversations: workspace.conversations.map(unlink),
        deliverables: workspace.deliverables.map(unlink),
        files: workspace.files.map(unlink),
        memory: workspace.memory.map(unlink),
        tasks: workspace.tasks.map(unlink),
      };
    }

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

    case "wikiPages":
      return {
        ...workspace,
        wikiPages:
          op.action === "upsert"
            ? upsertBy(workspace.wikiPages, op.rows).sort((a, b) => a.order - b.order)
            : workspace.wikiPages.filter((row) => !op.ids.includes(row.id)),
      };

    case "tasks":
      return {
        ...workspace,
        tasks:
          op.action === "upsert"
            ? upsertBy(workspace.tasks, op.rows).sort(
                (a, b) => a.order - b.order || b.updatedAt - a.updatedAt,
              )
            : workspace.tasks.filter((row) => !op.ids.includes(row.id)),
      };

    case "memory":
      return {
        ...workspace,
        memory:
          op.action === "upsert"
            ? upsertBy(workspace.memory, op.rows).sort((a, b) => b.occurredAt - a.occurredAt)
            : workspace.memory.filter((row) => !op.ids.includes(row.id)),
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

    case "account":
      return { ...workspace, account: { ...workspace.account, ...op.row } };
  }
}

/** Where this browser is reading and writing from. */
export type StorageMode = "resolving" | "local" | "hosted";

export interface WorkspaceStatus {
  hosted: boolean;
  signedIn: boolean;
  /**
   * True when the server holds its own Anthropic key. Never the key itself.
   * The chat route prefers the server key outright, so when this is true a key
   * typed into a browser is ignored and asking for one is misleading.
   */
  serverKey?: boolean;
  /** One flag per provider, so Settings can say which are ready to use. */
  serverKeys?: { anthropic: boolean; openai: boolean; google: boolean };
  /**
   * The business's own keys: whether each is set, and its last four characters.
   * Deliberately never the key. It goes from the settings table to the model
   * and is not returned to a browser, not even to the admin who set it.
   */
  workspaceKeys?: Record<"anthropic" | "openai" | "google", { set: boolean; tail: string }>;
  /** Admin of this workspace, as opposed to of the deployment. */
  workspaceRole?: "member" | "admin" | null;
  /** How many people share it. One means nobody else can write here. */
  workspacePeople?: number;
  /** Whether this account may review other people's conversations. */
  isOperator?: boolean;
  /** The single account the workspace belongs to. */
  isOwner?: boolean;
  email?: string;
  name?: string;
  givenName?: string;
  image?: string;
  /** Null when unknown, true when the account has never been written to. */
  empty: boolean | null;
}
