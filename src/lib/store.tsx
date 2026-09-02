"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  EMPTY_CREDENTIALS,
  readCredentials,
  writeCredentials,
  type Credentials,
} from "./credentials";
import { newId } from "./ids";
import type { PromptCalendarEvent } from "./prompts";
import {
  applyOp,
  type MutationOp,
  type StorageMode,
  type Workspace,
  type WorkspaceStatus,
} from "./workspace";
import {
  CEO_ID,
  COMPANY_ID,
  DEFAULT_ACCOUNT,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  PROJECT_ACCENTS,
  seedDepartments,
} from "./seed";
import { memoryFor as liveMemoryFor } from "./memory";
import { skillReconciliation } from "./shippedSkills";
import { seedSkills } from "./seedSkills";
import { seedWikiPages } from "./seedWiki";
import type {
  AllHandsRun,
  CompanyProfile,
  Conversation,
  Deliverable,
  DeliverableStatus,
  Department,
  LibraryFile,
  MemoryEntry,
  MemoryKind,
  Task,
  TaskStatus,
  WikiPage,
  Message,
  Project,
  Settings,
  Skill,
  UserAccount,
} from "./types";

export interface StoreValue {
  ready: boolean;
  /**
   * Why the last write to the account failed, if it did.
   *
   * A hosted write is optimistic: the change appears at once, then the server
   * either takes it or the snapshot is refetched and the change disappears
   * again. That refetch used to happen in silence, so a rejected save looked
   * exactly like a save that worked and then forgot. Whatever went wrong is
   * said out loud instead.
   */
  writeError: string | null;
  dismissWriteError: () => void;
  /** Where this browser is reading and writing: the account, or this device. */
  storage: StorageMode;
  /** The signed-in address when the workspace is hosted. */
  accountEmail?: string;
  /**
   * True when the server holds the Anthropic key. A key entered in this browser
   * is ignored while this is true, so the field is pointless rather than empty.
   */
  serverKey: boolean;
  /** One flag per provider, for the API card in Settings. */
  serverKeys: { anthropic: boolean; openai: boolean; google: boolean };
  /**
   * Whether the business holds a key for each provider, and its last four
   * characters. Never the key itself: nothing returns that to a browser.
   */
  workspaceKeys: Record<"anthropic" | "openai" | "google", { set: boolean; tail: string }>;
  /** Admin of this workspace, which is what lets someone change its keys. */
  workspaceRole: "member" | "admin" | null;
  /** How many people share this workspace, including you. */
  workspacePeople: number;
  /** Sets or clears the business's key. Administrators only, enforced server side. */
  setWorkspaceKey: (
    provider: "anthropic" | "openai" | "google",
    key: string,
  ) => Promise<string | null>;
  /** Whether this account may review other people's conversations. */
  isOperator: boolean;
  /** Department heads only. The CEO is excluded. */
  departments: Department[];
  /** Yours alone: outside the org chart and out of All Hands. */
  personalDepartments: Department[];
  /** Every department including the CEO, for lookups. */
  allDepartments: Department[];
  ceo: Department | undefined;
  conversations: Conversation[];
  deliverables: Deliverable[];
  projects: Project[];
  allHandsRuns: AllHandsRun[];
  skills: Skill[];
  files: LibraryFile[];
  /** The studio's own record: decisions that stand, and figures. */
  memory: MemoryEntry[];
  /** Things to do, as opposed to deliverables, which are things produced. */
  tasks: Task[];
  /** The internal wiki, in order. Editable by an administrator. */
  wikiPages: WikiPage[];
  saveWikiPage: (input: Partial<WikiPage> & { title: string }) => Promise<WikiPage>;
  updateWikiPage: (id: string, patch: Partial<WikiPage>) => Promise<void>;
  deleteWikiPage: (id: string) => Promise<void>;
  createTask: (input: Partial<Task> & { title: string }) => Promise<Task>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  /** One head's slice of it, plus everything company-wide. Live entries only. */
  memoryFor: (departmentId: string) => MemoryEntry[];
  saveMemory: (input: Partial<MemoryEntry> & { kind: MemoryKind; label: string }) => Promise<MemoryEntry>;
  updateMemory: (id: string, patch: Partial<MemoryEntry>) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  profile: CompanyProfile;
  settings: Settings;
  account: UserAccount;

  getDepartment: (id: string) => Department | undefined;
  /**
   * Every skill a head follows: their own, plus the company wide ones. Sorted
   * so company skills come first, since they set the ground rules.
   */
  skillsFor: (departmentId: string) => Skill[];
  /** Only the skills owned by that department, for counts and the Skills page. */
  ownSkillsFor: (departmentId: string) => Skill[];

  addFile: (file: LibraryFile) => Promise<void>;
  updateFile: (id: string, patch: Partial<LibraryFile>) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;

  createSkill: (input: Partial<Skill> & { departmentId: string }) => Promise<Skill>;
  updateSkill: (id: string, patch: Partial<Skill>) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  conversationsFor: (departmentId: string) => Conversation[];

  updateSettings: (patch: Partial<Omit<Settings, "id">>) => Promise<void>;
  updateProfile: (patch: Partial<CompanyProfile>) => Promise<void>;
  updateAccount: (patch: Partial<UserAccount>) => Promise<void>;

  createDepartment: (input: Partial<Department>) => Promise<Department>;
  updateDepartment: (id: string, patch: Partial<Department>) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;

  createConversation: (departmentId: string, title?: string) => Promise<Conversation>;
  updateConversation: (id: string, patch: Partial<Conversation>) => Promise<void>;
  setMessages: (id: string, messages: Message[]) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  saveAllHandsRun: (run: AllHandsRun) => Promise<void>;
  deleteAllHandsRun: (id: string) => Promise<void>;

  createProject: (input: Partial<Project>) => Promise<Project>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  /** Deletes the project and releases its work rather than deleting it too. */
  deleteProject: (id: string) => Promise<void>;
  getProject: (id: string) => Project | undefined;
  /** Everything filed under a project, gathered from across the org chart. */
  projectContents: (id: string) => {
    conversations: Conversation[];
    deliverables: Deliverable[];
    files: LibraryFile[];
  };
  /** Files a conversation under a project, or clears it when given undefined. */
  setConversationProject: (conversationId: string, projectId?: string) => Promise<void>;
  /**
   * Pulls anything written to a shared conversation by someone else and merges
   * it in. Returns how many arrived, so a caller can decide whether to scroll.
   */
  /**
   * The signed-in person's next few days, when they have connected a calendar.
   *
   * Read once per session and held, because it goes into the system prompt on
   * every message and refetching it per keystroke would be a request to Google
   * for every question asked.
   */
  calendar: PromptCalendarEvent[];
  /**
   * Loads one conversation's messages.
   *
   * The workspace snapshot carries counts rather than bodies, so a thread is
   * empty until this is called. Calling it twice is free.
   */
  openConversation: (conversationId: string) => Promise<Message[]>;
  pullShared: (conversationId: string) => Promise<number>;

  createDeliverable: (input: Partial<Deliverable>) => Promise<Deliverable>;
  updateDeliverable: (id: string, patch: Partial<Deliverable>) => Promise<void>;
  deleteDeliverable: (id: string) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * The empty result every storage read falls back to. Frozen so a caller cannot
 * push into it by accident, and shared so its identity never changes.
 */
const NONE: never[] = Object.freeze([]) as never[];

/** The scope wording that made every head close by listing what it does not do. */
const OLD_SCOPE_PREFIX = "Out of scope: ";
const NEW_SCOPE_PREFIX =
  "Route these away only if they are asked for, in one line, then drop it. Never bring them up otherwise: ";

/**
 * What the server already knew about the business when it rendered the page.
 *
 * Only the identity, and only to stop the shell drawing the wrong one. The
 * store still fetches the whole workspace a moment later and this is replaced
 * by it; the point is that the first paint is not a lie.
 */
export interface InitialBranding {
  name: string;
  mark: string;
}

export function StoreProvider({
  children,
  initialBranding,
}: {
  children: ReactNode;
  initialBranding?: InitialBranding | null;
}) {
  const [seeded, setSeeded] = useState(false);
  const [mode, setMode] = useState<StorageMode>("resolving");

  // Read from this browser rather than from either storage. Until the read has
  // happened, `ready` is false and the stored settings stand, so the first
  // render never blanks a key that is actually there.
  const [credentials, setCredentials] = useState<Credentials>(EMPTY_CREDENTIALS);
  const [credentialsReady, setCredentialsReady] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | undefined>();
  // Whether the server has its own Anthropic key, so Settings can stop asking
  // for one that would be ignored anyway.
  const [serverKey, setServerKey] = useState(false);
  const [workspaceKeys, setWorkspaceKeys] = useState({
    anthropic: { set: false, tail: "" },
    openai: { set: false, tail: "" },
    google: { set: false, tail: "" },
  });
  const [workspaceRole, setWorkspaceRole] = useState<"member" | "admin" | null>(null);
  const [workspacePeople, setWorkspacePeople] = useState(1);
  const [serverKeys, setServerKeys] = useState({
    anthropic: false,
    openai: false,
    google: false,
  });
  const [calendar, setCalendar] = useState<PromptCalendarEvent[]>([]);
  const [isOperator, setIsOperator] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [remote, setRemote] = useState<Workspace | null>(null);

  /**
   * The same workspace as `remote`, kept in a ref.
   *
   * `remote` is state, so it only becomes visible on the next render, and every
   * function on the context value closes over the render it was built in. That
   * made writes that follow a create silently disappear: send() created a
   * conversation and immediately called setMessages, whose captured list did not
   * contain it yet, so the lookup missed and the message was dropped without a
   * word. Reads that happen during a write go through this instead.
   */
  const remoteRef = useRef<Workspace | null>(null);

  /** The only way remote changes, so the ref can never fall behind the state. */
  const commitRemote = useCallback((next: Workspace | null) => {
    remoteRef.current = next;
    setRemote(next);
  }, []);
  const [googleIdentity, setGoogleIdentity] = useState<{
    email?: string;
    name?: string;
    givenName?: string;
    image?: string;
  } | null>(null);

  /**
   * Ask the server which storage this browser is on before touching either.
   * A local checkout with no database answers hosted:false and everything
   * carries on in IndexedDB exactly as before.
   */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/status")
      .then((response) => (response.ok ? (response.json() as Promise<WorkspaceStatus>) : null))
      .then((status) => {
        if (cancelled) return;
        if (status?.signedIn) {
          setSignedInEmail(status.email);
          setGoogleIdentity({
            email: status.email,
            name: status.name,
            givenName: status.givenName,
            image: status.image,
          });
        }
        setServerKey(Boolean(status?.serverKey));
        if (status?.serverKeys) setServerKeys(status.serverKeys);
        if (status?.workspaceKeys) setWorkspaceKeys(status.workspaceKeys);
        setWorkspaceRole(status?.workspaceRole ?? null);
        setWorkspacePeople(status?.workspacePeople ?? 1);
        setIsOperator(Boolean(status?.isOperator));
        setIsOwner(Boolean(status?.isOwner));
        setMode(status?.hosted && status.signedIn ? "hosted" : "local");
      })
      .catch(() => {
        if (!cancelled) setMode("local");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * The calendar, once, if there is one.
   *
   * Silent about every failure. Nobody has connected one, Google is having a
   * day, the deployment has no OAuth client: in all three cases the right
   * behaviour is a prompt without a calendar block in it, not an error on a
   * screen about a feature the person may never have switched on.
   */
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/calendar?days=7")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { events?: PromptCalendarEvent[] } | null) => {
        if (!cancelled && body?.events?.length) setCalendar(body.events);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * "local" no longer means a workspace in this browser. It means the server
   * could not give us one: not signed in, or not configured. There is nothing
   * to fall back to, so the app waits rather than inventing a workspace.
   */
  const hosted = mode === "hosted";

  // The hosted snapshot is read once; every later change is applied to it
  // locally and sent to the server, so no request is needed to re-render.
  useEffect(() => {
    if (!hosted) return;
    let cancelled = false;

    const load = async () => {
      const initial = await fetch("/api/workspace").then((r) =>
        r.ok ? (r.json() as Promise<Workspace>) : null,
      );
      if (cancelled || !initial) return initial;

      // Reassigned by the reconciliation steps below, which refetch after
      // writing, so it is narrowed once here rather than at every use.
      let snapshot: Workspace = initial;

      // A brand new account has no departments at all. Seed it with the same
      // eight heads and shipped skills a fresh browser would get, so signing in
      // on a second device never lands on an empty org chart.
      if (snapshot.departments.length === 0) {
        /*
         * Everything except who the business is.
         *
         * The settings row already exists by this point, written when the
         * workspace was created, and it carries the name the operator typed.
         * Seeding used to send the whole of DEFAULT_SETTINGS, so the first
         * person to open a new workspace overwrote that with "Your Company" and
         * "HQ", and because a settings write also renames the workspace row,
         * the operator's list changed too. Defaults are for the fields nobody
         * has chosen yet; a name somebody chose is not one of them.
         */
        const {
          id: _id,
          apiKey: _key,
          companyName: _name,
          companyMark: _mark,
          companySubtitle: _subtitle,
          ...defaultSettings
        } = DEFAULT_SETTINGS;
        const ops: MutationOp[] = [
          { table: "departments", action: "upsert", rows: seedDepartments() },
          { table: "skills", action: "upsert", rows: seedSkills() },
          { table: "wikiPages", action: "upsert", rows: seedWikiPages() },
          { table: "profile", action: "upsert", row: DEFAULT_PROFILE },
          { table: "settings", action: "upsert", row: defaultSettings },
        ];
        await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops }),
        });
        return fetch("/api/workspace").then((r) =>
          r.ok ? (r.json() as Promise<Workspace>) : snapshot,
        );
      }

      /**
       * Reconcile the shipped skill library against what the workspace has.
       *
       * Runs on every load rather than only into an empty workspace, because
       * there is no migration step in a browser and the workspace exists
       * already. The rules are in `skillReconciliation`, which is where they
       * can be tested.
       */
      {
        // Nothing is offered as an addition. The studio handbook that used
        // to be pushed here was written around one company's own work and has
        // no business appearing in anyone else's workspace; a workspace that
        // already has it keeps it, because it is not retired, only unshipped.
        const ops = skillReconciliation(snapshot.skills, seedSkills(), []);

        // A workspace from before the wiki was data has no pages, and an empty
        // wiki reads as broken rather than as unwritten. Only when there are
        // none at all, so a page someone deleted stays deleted.
        if (snapshot.wikiPages.length === 0) {
          ops.push({ table: "wikiPages", action: "upsert", rows: seedWikiPages() });
        }
        if (ops.length) {
          await fetch("/api/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ops }),
          });
          snapshot = await fetch("/api/workspace").then((r) =>
            r.ok ? (r.json() as Promise<Workspace>) : snapshot,
          );
        }
      }



      return snapshot;
    };

    load()
      .then((snapshot) => {
        if (!cancelled && snapshot) commitRemote(snapshot);
      })
      .catch(() => {
        // Leaving remote null keeps the app in its loading state rather
        // than showing an empty workspace that is not really empty.
      });
    return () => {
      cancelled = true;
    };
  }, [hosted, isOwner, commitRemote]);


  /**
   * The key this browser holds, if any.
   *
   * Only reached when the workspace has none of its own, which is the local
   * development case. A business sets its key once and every member uses it
   * without ever holding one; see the settings table.
   */
  useEffect(() => {
    if (credentialsReady) return;
    setCredentials(readCredentials() ?? EMPTY_CREDENTIALS);
    setCredentialsReady(true);
  }, [credentialsReady]);

  /**
   * Reads come from the hosted snapshot held in state. There was a second
   * source once, a workspace in the browser's own IndexedDB, and everything
   * below this line was written to not know which one it got. Only one is left,
   * but the indirection stays useful: it is still the single place where "what
   * the screen shows" is assembled from "what the server said".
   */
  const settings: Settings = useMemo(() => {
    // The server's answer sits between the shipped defaults and the workspace
    // proper, so the name on screen is right from the first frame instead of
    // reading "Your Company" until the fetch lands.
    const base = {
      ...DEFAULT_SETTINGS,
      ...(initialBranding
        ? { companyName: initialBranding.name, companyMark: initialBranding.mark }
        : {}),
      ...(remote?.settings ?? {}),
    };
    // Neither storage holds the credentials, so they are laid over the top from
    // this browser once read. Overlaying unconditionally is what lets an empty
    // key mean cleared rather than merely absent.
    return credentialsReady ? { ...base, ...credentials } : base;
  }, [remote?.settings, credentials, credentialsReady, initialBranding]);

  /**
   * Google supplies the name, avatar, and address on every sign in, so those
   * always win. Everything the person set themselves survives underneath.
   */
  const account: UserAccount = useMemo(() => {
    const stored = remote?.account ?? DEFAULT_ACCOUNT;
    return {
      ...stored,
      email: googleIdentity?.email ?? stored.email,
      avatarUrl: googleIdentity?.image ?? stored.avatarUrl,
      displayName: stored.displayName || googleIdentity?.givenName || "",
    };
  }, [remote?.account, googleIdentity]);

  const profile: CompanyProfile = useMemo(
    () => remote?.profile ?? DEFAULT_PROFILE,
    [remote?.profile],
  );

  /**
   * The theme lives on <html>. It is also mirrored into localStorage, because
   * the real theme is in IndexedDB, which resolves long after the first paint.
   * The inline script in the root layout reads that mirror before anything is
   * drawn, so a light-theme user never sees a frame of dark.
   */
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    try {
      window.localStorage.setItem("eterneon-theme", settings.theme);
    } catch {
      // Private mode or blocked storage. The theme still applies this session.
    }
  }, [settings.theme]);

  /**
   * One shared empty array, rather than a fresh `[]` per fallback per render.
   *
   * These seven values are dependencies of the context memo below. Written as
   * `?? []`, each one produced a new array identity on every render while its
   * source was still undefined, which changed the memo's dependencies every
   * time and rebuilt the context value on every render. Every component reading
   * the store then re-rendered along with it, so the memo was doing nothing but
   * costing a comparison. A stable reference is the whole fix.
   */
  const departmentList = remote?.departments ?? NONE;
  const conversationList = remote?.conversations ?? NONE;
  const deliverableList = remote?.deliverables ?? NONE;
  const memoryList = remote?.memory ?? NONE;
  const taskList = remote?.tasks ?? NONE;
  const wikiList = remote?.wikiPages ?? NONE;
  const projectList = remote?.projects ?? NONE;
  const skillList = remote?.skills ?? NONE;
  const fileList = remote?.files ?? NONE;
  const runList = remote?.allHandsRuns ?? NONE;

  const [writeError, setWriteError] = useState<string | null>(null);

  /**
   * Sends one change to the account and applies it locally at once, so the
   * interface never waits on a round trip. A failed write refetches rather than
   * leaving the screen showing something the database refused, and says so.
   */
  const push = useCallback(
    async (op: MutationOp) => {
      // Applied against the ref rather than through a functional update, so a
      // second write in the same tick sees the first one.
      commitRemote(remoteRef.current ? applyOp(remoteRef.current, op) : remoteRef.current);
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: [op] }),
        });
        if (!response.ok) {
          // The server says why. Carrying that through is the difference
          // between "could not save" and "that file is too large to upload".
          const said = await response
            .json()
            .then((body: { error?: string }) => body?.error)
            .catch(() => undefined);
          throw new Error(said || `The server refused the change (${response.status}).`);
        }
        setWriteError(null);
      } catch (error) {
        console.error("[workspace] write failed, reloading", error);
        setWriteError(
          error instanceof Error && error.message
            ? error.message
            : "That change could not be saved.",
        );
        const fresh = await fetch("/api/workspace")
          .then((r) => (r.ok ? (r.json() as Promise<Workspace>) : null))
          .catch(() => null);
        if (fresh) commitRemote(fresh);
      }
    },
    [commitRemote],
  );

  const value = useMemo<StoreValue>(() => {
    return {
      ready: remote !== null,
      writeError,
      dismissWriteError: () => setWriteError(null),
      storage: mode,
      accountEmail: signedInEmail,
      serverKey,
      serverKeys,
      workspaceKeys,
      workspaceRole,
      workspacePeople,
      setWorkspaceKey: async (provider, key) => {
        const response = await fetch("/api/workspace/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, key }),
        });
        const body = (await response.json().catch(() => null)) as
          | { error?: string; keys?: typeof workspaceKeys }
          | null;
        if (!response.ok) return body?.error ?? "Could not save that key.";
        if (body?.keys) setWorkspaceKeys(body.keys);
        return null;
      },
      isOperator,
      calendar,
      allDepartments: departmentList,
      departments: departmentList.filter((d) => !d.isCeo && !d.personal),
      personalDepartments: departmentList.filter((d) => d.personal),
      ceo: departmentList.find((d) => d.isCeo) ?? departmentList.find((d) => d.id === CEO_ID),
      conversations: conversationList,
      deliverables: deliverableList,
      memory: memoryList,
      tasks: taskList,
      wikiPages: wikiList,
      projects: projectList,
      allHandsRuns: runList,
      skills: skillList,
      files: fileList,
      profile,
      settings,
      account,

      getDepartment: (id: string) => departmentList.find((d) => d.id === id),

      skillsFor: (departmentId: string) => [
        ...skillList.filter((skill) => skill.departmentId === COMPANY_ID),
        ...skillList.filter((skill) => skill.departmentId === departmentId),
      ],

      ownSkillsFor: (departmentId: string) =>
        skillList.filter((skill) => skill.departmentId === departmentId),

      conversationsFor: (departmentId: string) =>
        conversationList.filter((c) => c.departmentId === departmentId),

      /* ---------------------------------------------------------------- *
       * Writes
       *
       * Each one builds the finished row, then hands it to whichever storage
       * is in use. Hosted mode needs the whole row rather than a patch, since
       * the server upserts.
       * ---------------------------------------------------------------- */

      updateSettings: async (patch) => {
        // The credentials branch off here in both modes. They are the only
        // settings that belong to the browser rather than to the workspace.
        const { apiKey, workspaceId, openaiKey, googleKey, ...rest } = {
          ...patch,
        } as Partial<Settings>;

        if (
          apiKey !== undefined ||
          workspaceId !== undefined ||
          openaiKey !== undefined ||
          googleKey !== undefined
        ) {
          setCredentials(
            writeCredentials({
              ...(apiKey !== undefined ? { apiKey } : {}),
              ...(workspaceId !== undefined ? { workspaceId } : {}),
              ...(openaiKey !== undefined ? { openaiKey } : {}),
              ...(googleKey !== undefined ? { googleKey } : {}),
            }),
          );
          setCredentialsReady(true);
        }

        if (Object.keys(rest).length === 0) return;

        await push({ table: "settings", action: "upsert", row: rest });
      },

      updateProfile: async (patch) => {
        const next = { ...profile, ...patch };
        await push({ table: "profile", action: "upsert", row: next });
      },

      updateAccount: async (patch) => {
        const next = { ...account, ...patch, updatedAt: Date.now() };
        await push({ table: "account", action: "upsert", row: patch });
      },

      createDepartment: async (input) => {
        const maxOrder = departmentList.reduce((max, d) => Math.max(max, d.order), 0);
        const department: Department = {
          id: input.id ?? newId("dept"),
          name: input.name?.trim() || "New Department",
          avatarUrl: input.avatarUrl,
          personaName: input.personaName?.trim() || "",
          persona: input.persona ?? "",
          roleTitle:
            input.roleTitle?.trim() || `Head of ${input.name?.trim() || "New Department"}`,
          systemPrompt: input.systemPrompt ?? "",
          status: input.status ?? "online",
          order: input.order ?? maxOrder + 1,
        };
        await push({ table: "departments", action: "upsert", rows: [department] });
        return department;
      },

      updateDepartment: async (id, patch) => {
        const current = remoteRef.current?.departments.find((d) => d.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({ table: "departments", action: "upsert", rows: [{ ...current, ...patch }] });
      },

      deleteDepartment: async (id) => {
        // The server takes the department's conversations with it, which is
        // what applyOp does on this side too.
        await push({ table: "departments", action: "delete", ids: [id] });
      },

      createConversation: async (departmentId, title) => {
        const now = Date.now();
        const conversation: Conversation = {
          id: newId("conv"),
          departmentId,
          title: title ?? "New conversation",
          messages: [],
          messageCount: 0,
          // Nothing to fetch, so it counts as fully loaded from the start.
          loaded: true,
          createdAt: now,
          updatedAt: now,
        };
        await push({ table: "conversations", action: "upsert", rows: [conversation] });
        return conversation;
      },

      updateConversation: async (id, patch) => {
        const current = remoteRef.current?.conversations.find((c) => c.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({
          table: "conversations",
          action: "upsert",
          rows: [{ ...current, ...patch, updatedAt: Date.now() }],
        });
      },

      setMessages: async (id, messages) => {
        const current = remoteRef.current?.conversations.find((c) => c.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({
          table: "conversations",
          action: "upsert",
          // The count travels with the messages. It is what every list reads to
          // decide whether a thread has anything in it, so leaving it behind
          // would make a conversation somebody just started look empty in the
          // sidebar until the next reload.
          rows: [
            { ...current, messages, messageCount: messages.length, loaded: true, updatedAt: Date.now() },
          ],
        });
      },

      deleteConversation: async (id) => {
        await push({ table: "conversations", action: "delete", ids: [id] });
      },

      saveAllHandsRun: async (run) => {
        await push({ table: "allHands", action: "upsert", rows: [run] });
      },

      deleteAllHandsRun: async (id) => {
        await push({ table: "allHands", action: "delete", ids: [id] });
      },

      addFile: async (file) => {
        await push({ table: "files", action: "upsert", rows: [file] });
      },

      updateFile: async (id, patch) => {
        const current = remoteRef.current?.files.find((f) => f.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({
          table: "files",
          action: "upsert",
          rows: [{ ...current, ...patch, updatedAt: Date.now() }],
        });
      },

      deleteFile: async (id) => {
        await push({ table: "files", action: "delete", ids: [id] });
      },

      createSkill: async (input) => {
        const now = Date.now();
        const skill: Skill = {
          id: input.id ?? newId("skill"),
          departmentId: input.departmentId,
          name: input.name?.trim() || "Untitled skill",
          description: input.description?.trim() ?? "",
          content: input.content ?? "",
          enabled: input.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        };
        await push({ table: "skills", action: "upsert", rows: [skill] });
        return skill;
      },

      updateSkill: async (id, patch) => {
        const current = remoteRef.current?.skills.find((sk) => sk.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({
          table: "skills",
          action: "upsert",
          rows: [{ ...current, ...patch, updatedAt: Date.now() }],
        });
      },

      deleteSkill: async (id) => {
        await push({ table: "skills", action: "delete", ids: [id] });
      },

      createProject: async (input) => {
        const now = Date.now();
        const project: Project = {
          id: newId("proj"),
          name: input.name?.trim() || "Untitled project",
          summary: input.summary ?? "",
          status: input.status ?? "active",
          accent: input.accent ?? PROJECT_ACCENTS[0].key,
          dueOn: input.dueOn ?? "",
          createdAt: now,
          updatedAt: now,
        };
        await push({ table: "projects", action: "upsert", rows: [project] });
        return project;
      },

      updateProject: async (id, patch) => {
        const current = remoteRef.current?.projects.find((row) => row.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({
          table: "projects",
          action: "upsert",
          rows: [{ ...current, ...patch, updatedAt: Date.now() }],
        });
      },

      deleteProject: async (id) => {
        // The server unlinks the conversations, deliverables, and files that
        // pointed at this project. There used to be a second copy of that
        // unlinking here, written by hand against the browser's own IndexedDB
        // for the days when a workspace could live there. It stayed after the
        // move and ran a whole transaction against an empty database on every
        // delete: no effect, and a round trip to IndexedDB to have none.
        await push({ table: "projects", action: "delete", ids: [id] });
      },

      getProject: (id) => projectList.find((row) => row.id === id),

      projectContents: (id) => ({
        conversations: conversationList.filter((row) => row.projectId === id),
        deliverables: deliverableList.filter((row) => row.projectId === id),
        files: fileList.filter((row) => row.projectId === id),
      }),

      setConversationProject: async (conversationId, projectId) => {
        const current = remoteRef.current?.conversations.find(
          (row) => row.id === conversationId,
        );
        if (!current) {
          console.error("[workspace] no conversation", conversationId, "- write dropped");
          return;
        }
        await push({
          table: "conversations",
          action: "upsert",
          rows: [{ ...current, projectId, updatedAt: Date.now() }],
        });
      },


      /**
       * Everything in a conversation, fetched when it is opened.
       *
       * The snapshot carries no message bodies, so this is what puts them on
       * screen. Cached by the `loaded` flag: reopening a thread in the same
       * session does not ask again, and a thread somebody else is typing in is
       * kept current by `pullShared` rather than by refetching all of it.
       */
      openConversation: async (conversationId) => {
        const current = remoteRef.current?.conversations.find((c) => c.id === conversationId);
        if (!current) return [];
        if (current.loaded) return current.messages;

        const response = await fetch(
          `/api/workspace/conversation?id=${encodeURIComponent(conversationId)}`,
        );
        if (!response.ok) return current.messages;
        const body = (await response.json()) as {
          messages: Message[];
          complete?: boolean;
        };

        const latest = remoteRef.current?.conversations.find((c) => c.id === conversationId);
        if (!latest) return [];

        // Merged by id rather than replaced, so a message sent while this was
        // in flight is not thrown away by the answer to a request that started
        // before it existed.
        const byId = new Map((body.messages ?? []).map((m) => [m.id, m]));
        for (const message of latest.messages) byId.set(message.id, message);
        const merged = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);

        commitRemote(
          applyOp(remoteRef.current!, {
            table: "conversations",
            action: "upsert",
            rows: [
              {
                ...latest,
                messages: merged,
                messageCount: Math.max(latest.messageCount, merged.length),
                loaded: body.complete !== false,
              },
            ],
          }),
        );

        // Returned as well as stored, because the caller that matters most is
        // the send path, and it holds a conversation from before this ran.
        // Reading the store again from a stale closure would give it the empty
        // one it started with.
        return merged;
      },

      pullShared: async (conversationId) => {
        const current = remoteRef.current?.conversations.find((c) => c.id === conversationId);
        if (!current) return 0;

        const since = current.messages.reduce((max, m) => Math.max(max, m.timestamp), 0);
        const response = await fetch(
          `/api/workspace/conversation?id=${encodeURIComponent(conversationId)}&since=${since}`,
        );
        if (!response.ok) return 0;

        const body = (await response.json()) as { messages: Message[] };
        const incoming = body.messages ?? [];
        if (!incoming.length) return 0;

        // Merged by id, so a message this browser already has from its own
        // send is not duplicated by the poll that follows it.
        const byId = new Map(current.messages.map((m) => [m.id, m]));
        let added = 0;
        for (const message of incoming) {
          if (!byId.has(message.id)) added += 1;
          byId.set(message.id, message);
        }
        if (!added) return 0;

        const merged = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
        commitRemote(
          applyOp(remoteRef.current!, {
            table: "conversations",
            action: "upsert",
            rows: [{ ...current, messages: merged }],
          }),
        );
        return added;
      },

      createDeliverable: async (input) => {
        const now = Date.now();
        const deliverable: Deliverable = {
          id: newId("del"),
          title: input.title?.trim() || "Untitled deliverable",
          body: input.body ?? "",
          departmentId: input.departmentId ?? CEO_ID,
          status: input.status ?? "backlog",
          createdAt: now,
          updatedAt: now,
          sourceConversationId: input.sourceConversationId,
        };
        await push({ table: "deliverables", action: "upsert", rows: [deliverable] });
        return deliverable;
      },

      updateDeliverable: async (id, patch) => {
        const current = remoteRef.current?.deliverables.find((d) => d.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({
          table: "deliverables",
          action: "upsert",
          rows: [{ ...current, ...patch, updatedAt: Date.now() }],
        });
      },

      deleteDeliverable: async (id) => {
        await push({ table: "deliverables", action: "delete", ids: [id] });
      },

      memoryFor: (departmentId) => liveMemoryFor(memoryList, departmentId),

      /**
       * New tasks go to the top of their column.
       *
       * Something just written down is the thing most on your mind, and
       * appending it under forty older ones is how a list stops being read.
       */
      saveWikiPage: async (input) => {
        const now = Date.now();
        const lowest = wikiList.reduce((max, page) => Math.max(max, page.order), -1);
        const page: WikiPage = {
          id: input.id ?? newId("wiki"),
          title: input.title.trim() || "Untitled page",
          blurb: input.blurb?.trim() ?? "",
          body: input.body,
          blocks: input.blocks ?? [],
          order: input.order ?? lowest + 1,
          enabled: input.enabled ?? true,
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        };
        await push({ table: "wikiPages", action: "upsert", rows: [page] });
        return page;
      },

      updateWikiPage: async (id, patch) => {
        const current = remoteRef.current?.wikiPages.find((page) => page.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({
          table: "wikiPages",
          action: "upsert",
          rows: [{ ...current, ...patch, updatedAt: Date.now() }],
        });
      },

      deleteWikiPage: async (id) => {
        await push({ table: "wikiPages", action: "delete", ids: [id] });
      },

      createTask: async (input) => {
        const now = Date.now();
        const lowest = taskList.reduce((min, t) => Math.min(min, t.order), 0);
        const task: Task = {
          id: input.id ?? newId("task"),
          title: input.title.trim(),
          notes: input.notes ?? "",
          status: input.status ?? "todo",
          departmentId: input.departmentId ?? COMPANY_ID,
          projectId: input.projectId,
          dueAt: input.dueAt,
          order: input.order ?? lowest - 1,
          sourceConversationId: input.sourceConversationId,
          createdAt: input.createdAt ?? now,
          updatedAt: now,
          completedAt: input.completedAt,
        };
        await push({ table: "tasks", action: "upsert", rows: [task] });
        return task;
      },

      updateTask: async (id, patch) => {
        // Stamped here rather than at each call site, so "when did that get
        // done" is answerable however the task was closed.
        const stamped: Partial<Task> = { ...patch, updatedAt: Date.now() };
        if (patch.status !== undefined) {
          stamped.completedAt = patch.status === "done" ? Date.now() : undefined;
        }
        const current = remoteRef.current?.tasks.find((task) => task.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({ table: "tasks", action: "upsert", rows: [{ ...current, ...stamped }] });
      },

      deleteTask: async (id) => {
        await push({ table: "tasks", action: "delete", ids: [id] });
      },

      /**
       * Writes a decision or a figure.
       *
       * `occurredAt` defaults to now but is meant to be overridden: a reading
       * taken last Friday belongs on last Friday, or the trend the heads read
       * is wrong.
       */
      saveMemory: async (input) => {
        const now = Date.now();
        const entry: MemoryEntry = {
          id: input.id ?? newId("mem"),
          kind: input.kind,
          label: input.label.trim(),
          value: input.value?.trim() ?? "",
          detail: input.detail?.trim() ?? "",
          revisitWhen: input.revisitWhen?.trim() ?? "",
          departmentId: input.departmentId ?? COMPANY_ID,
          projectId: input.projectId,
          occurredAt: input.occurredAt ?? now,
          archived: input.archived ?? false,
          sourceConversationId: input.sourceConversationId,
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        };
        await push({ table: "memory", action: "upsert", rows: [entry] });
        return entry;
      },

      updateMemory: async (id, patch) => {
        const current = remoteRef.current?.memory.find((entry) => entry.id === id);
        if (!current) {
          console.error("[workspace] nothing to update with id", id, "- write dropped");
          return;
        }
        await push({
          table: "memory",
          action: "upsert",
          rows: [{ ...current, ...patch, updatedAt: Date.now() }],
        });
      },

      deleteMemory: async (id) => {
        await push({ table: "memory", action: "delete", ids: [id] });
      },
    };
  }, [
    commitRemote,
    writeError,
    memoryList,
    taskList,
    wikiList,
    serverKeys,
    workspaceKeys,
    workspaceRole,
    workspacePeople,
    mode,
    signedInEmail,
    serverKey,
    isOperator,
    calendar,
    remote,
    push,
    departmentList,
    conversationList,
    deliverableList,
    projectList,
    skillList,
    fileList,
    runList,
    profile,
    settings,
    account,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) {
    throw new Error("useStore must be used inside <StoreProvider>.");
  }
  return value;
}

export const DELIVERABLE_COLUMNS: { id: DeliverableStatus; label: string }[] = [
  { id: "backlog", label: "Captured" },
  { id: "in-progress", label: "In progress" },
  { id: "done", label: "Done" },
];
