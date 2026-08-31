"use client";

import { useLiveQuery } from "dexie-react-hooks";
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
import { db, ensureSeeded, newId } from "./db";
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
  COACH_ID,
  DEFAULT_SETTINGS,
  leadershipCoach,
  PROJECT_ACCENTS,
  seedDepartments,
} from "./seed";
import { seedSkills } from "./seedSkills";
import type {
  AllHandsRun,
  CompanyProfile,
  Conversation,
  Deliverable,
  DeliverableStatus,
  Department,
  LibraryFile,
  Message,
  Project,
  Settings,
  Skill,
  UserAccount,
} from "./types";

interface StoreValue {
  ready: boolean;
  /** Where this browser is reading and writing: the account, or this device. */
  storage: StorageMode;
  /** The signed-in address when the workspace is hosted. */
  accountEmail?: string;
  /**
   * True when the server holds the Anthropic key. A key entered in this browser
   * is ignored while this is true, so the field is pointless rather than empty.
   */
  serverKey: boolean;
  /** Whether this account may review other people's conversations. */
  isAdmin: boolean;
  /** Pushes everything in this browser into the signed-in account. */
  uploadLocalWorkspace: () => Promise<{ pushed: number }>;
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

export function StoreProvider({ children }: { children: ReactNode }) {
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
  const [isAdmin, setIsAdmin] = useState(false);
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
        setIsAdmin(Boolean(status?.isAdmin));
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

  const hosted = mode === "hosted";

  // The hosted snapshot is read once; every later change is applied to it
  // locally and sent to the server, so no request is needed to re-render.
  useEffect(() => {
    if (!hosted) return;
    let cancelled = false;

    const load = async () => {
      const snapshot = await fetch("/api/workspace").then((r) =>
        r.ok ? (r.json() as Promise<Workspace>) : null,
      );
      if (cancelled || !snapshot) return snapshot;

      // A brand new account has no departments at all. Seed it with the same
      // eight heads and shipped skills a fresh browser would get, so signing in
      // on a second device never lands on an empty org chart.
      if (snapshot.departments.length === 0) {
        const { id: _id, apiKey: _key, ...defaultSettings } = DEFAULT_SETTINGS;
        const ops: MutationOp[] = [
          { table: "departments", action: "upsert", rows: seedDepartments() },
          { table: "skills", action: "upsert", rows: seedSkills() },
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
       * The coach arrives even in a workspace that was seeded before it
       * existed, and only in the owner's. Checked on every load rather than
       * once, because there is no migration step that runs in a browser.
       */
      if (isOwner && !snapshot.departments.some((d) => d.id === COACH_ID)) {
        const order = snapshot.departments.reduce((max, d) => Math.max(max, d.order), 0) + 1;
        await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ops: [
              { table: "departments", action: "upsert", rows: [leadershipCoach(order)] },
            ],
          }),
        });
        return fetch("/api/workspace").then((r) =>
          r.ok ? (r.json() as Promise<Workspace>) : snapshot,
        );
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

  useEffect(() => {
    // Seeding writes to IndexedDB, which a hosted browser never reads.
    if (mode === "resolving" || hosted) return;
    let cancelled = false;
    ensureSeeded()
      .then(() => {
        if (!cancelled) setSeeded(true);
      })
      .catch((error) => {
        console.error("Failed to initialise local database", error);
        if (!cancelled) setSeeded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, hosted]);

  const allDepartments = useLiveQuery(
    async () => (!db || hosted ? [] : db.departments.orderBy("order").toArray()),
    [seeded, hosted],
    undefined,
  );

  const conversations = useLiveQuery(
    async () =>
      !db || hosted ? [] : db.conversations.orderBy("updatedAt").reverse().toArray(),
    [seeded, hosted],
    undefined,
  );

  const projects = useLiveQuery(
    async () => (!db || hosted ? [] : db.projects.orderBy("updatedAt").reverse().toArray()),
    [seeded, hosted],
    undefined,
  );

  const deliverables = useLiveQuery(
    async () =>
      !db || hosted ? [] : db.deliverables.orderBy("updatedAt").reverse().toArray(),
    [seeded, hosted],
    undefined,
  );

  const skills = useLiveQuery(
    async () => (!db || hosted ? [] : db.skills.orderBy("updatedAt").reverse().toArray()),
    [seeded, hosted],
    undefined,
  );

  const files = useLiveQuery(
    async () => (!db || hosted ? [] : db.files.orderBy("updatedAt").reverse().toArray()),
    [seeded, hosted],
    undefined,
  );

  const allHandsRuns = useLiveQuery(
    async () => (!db || hosted ? [] : db.allHands.orderBy("updatedAt").reverse().toArray()),
    [seeded, hosted],
    undefined,
  );

  const storedAccount = useLiveQuery(
    async () => (!db || hosted ? undefined : db.account.get("me")),
    [seeded, hosted],
    undefined,
  );

  const storedProfile = useLiveQuery(
    async () => (!db || hosted ? undefined : db.profile.get("profile")),
    [seeded, hosted],
    undefined,
  );

  const storedSettings = useLiveQuery(
    async () => (!db || hosted ? undefined : db.settings.get("app")),
    [seeded, hosted],
    undefined,
  );

  /**
   * Picks the credentials up on load, and rescues one saved into Dexie before
   * this browser had its own store, so the key does not have to be retyped.
   * Runs once: after this, localStorage is the only home.
   */
  useEffect(() => {
    if (credentialsReady) return;

    const stored = readCredentials();
    if (stored) {
      setCredentials(stored);
      setCredentialsReady(true);
      return;
    }

    // Nothing saved here yet. In hosted mode there is nothing to inherit,
    // since the server never held a key in the first place.
    if (mode === "resolving") return;
    if (hosted) {
      setCredentialsReady(true);
      return;
    }
    if (storedSettings === undefined) return; // Dexie has not answered yet

    setCredentials(
      writeCredentials({
        apiKey: storedSettings.apiKey ?? "",
        workspaceId: storedSettings.workspaceId ?? "",
      }),
    );
    setCredentialsReady(true);
  }, [credentialsReady, hosted, mode, storedSettings]);

  /**
   * Reads come from whichever storage is in use. Hosted keeps its snapshot in
   * state; local keeps the live Dexie queries. Everything below this line is
   * written against these names and never has to know which one it got.
   */
  const settings: Settings = useMemo(() => {
    const base = hosted
      ? { ...DEFAULT_SETTINGS, ...(remote?.settings ?? {}) }
      : { ...DEFAULT_SETTINGS, ...(storedSettings ?? {}) };
    // Neither storage holds the credentials, so they are laid over the top from
    // this browser once read. Overlaying unconditionally is what lets an empty
    // key mean cleared rather than merely absent.
    return credentialsReady ? { ...base, ...credentials } : base;
  }, [hosted, remote?.settings, storedSettings, credentials, credentialsReady]);

  /**
   * Google supplies the name, avatar, and address on every sign in, so those
   * always win. Everything the person set themselves survives underneath.
   */
  const account: UserAccount = useMemo(() => {
    const stored = hosted
      ? (remote?.account ?? DEFAULT_ACCOUNT)
      : storedAccount
        ? { ...DEFAULT_ACCOUNT, ...storedAccount }
        : DEFAULT_ACCOUNT;
    return {
      ...stored,
      email: googleIdentity?.email ?? stored.email,
      avatarUrl: googleIdentity?.image ?? stored.avatarUrl,
      displayName: stored.displayName || googleIdentity?.givenName || "",
    };
  }, [hosted, remote?.account, storedAccount, googleIdentity]);

  const profile: CompanyProfile = useMemo(() => {
    if (hosted) return remote?.profile ?? DEFAULT_PROFILE;
    if (!storedProfile) return DEFAULT_PROFILE;
    const { id: _id, ...rest } = storedProfile;
    return { ...DEFAULT_PROFILE, ...rest };
  }, [hosted, remote?.profile, storedProfile]);

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
  const departmentList = hosted ? (remote?.departments ?? NONE) : (allDepartments ?? NONE);
  const conversationList = hosted ? (remote?.conversations ?? NONE) : (conversations ?? NONE);
  const deliverableList = hosted ? (remote?.deliverables ?? NONE) : (deliverables ?? NONE);
  const projectList = hosted ? (remote?.projects ?? NONE) : (projects ?? NONE);
  const skillList = hosted ? (remote?.skills ?? NONE) : (skills ?? NONE);
  const fileList = hosted ? (remote?.files ?? NONE) : (files ?? NONE);
  const runList = hosted ? (remote?.allHandsRuns ?? NONE) : (allHandsRuns ?? NONE);

  /**
   * Sends one change to the account and applies it locally at once, so the
   * interface never waits on a round trip. A failed write refetches rather than
   * leaving the screen showing something the database refused.
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
        if (!response.ok) throw new Error(String(response.status));
      } catch (error) {
        console.error("[workspace] write failed, reloading", error);
        const fresh = await fetch("/api/workspace")
          .then((r) => (r.ok ? (r.json() as Promise<Workspace>) : null))
          .catch(() => null);
        if (fresh) commitRemote(fresh);
      }
    },
    [commitRemote],
  );

  const value = useMemo<StoreValue>(() => {
    const requireDb = () => {
      if (!db) throw new Error("Database is only available in the browser.");
      return db;
    };

    return {
      ready: hosted ? remote !== null : seeded && allDepartments !== undefined,
      storage: mode,
      accountEmail: signedInEmail,
      serverKey,
      isAdmin,
      allDepartments: departmentList,
      departments: departmentList.filter((d) => !d.isCeo && !d.personal),
      personalDepartments: departmentList.filter((d) => d.personal),
      ceo: departmentList.find((d) => d.isCeo) ?? departmentList.find((d) => d.id === CEO_ID),
      conversations: conversationList,
      deliverables: deliverableList,
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
       * the server upserts; local mode can keep using Dexie's partial update.
       * ---------------------------------------------------------------- */

      updateSettings: async (patch) => {
        // The credentials branch off here in both modes. They are the only
        // settings that belong to the browser rather than to the workspace.
        const { apiKey, workspaceId, ...rest } = { ...patch } as Partial<Settings>;

        if (apiKey !== undefined || workspaceId !== undefined) {
          setCredentials(
            writeCredentials({
              ...(apiKey !== undefined ? { apiKey } : {}),
              ...(workspaceId !== undefined ? { workspaceId } : {}),
            }),
          );
          setCredentialsReady(true);
        }

        if (Object.keys(rest).length === 0) return;

        if (hosted) {
          await push({ table: "settings", action: "upsert", row: rest });
          return;
        }
        await requireDb().settings.put({ ...settings, ...rest, id: "app" });
      },

      updateProfile: async (patch) => {
        const next = { ...profile, ...patch };
        if (hosted) {
          await push({ table: "profile", action: "upsert", row: next });
          return;
        }
        await requireDb().profile.put({ id: "profile", ...next });
      },

      updateAccount: async (patch) => {
        const next = { ...account, ...patch, updatedAt: Date.now() };
        if (hosted) {
          await push({ table: "account", action: "upsert", row: patch });
          return;
        }
        await requireDb().account.put({ id: "me", ...next });
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
        if (hosted) await push({ table: "departments", action: "upsert", rows: [department] });
        else await requireDb().departments.put(department);
        return department;
      },

      updateDepartment: async (id, patch) => {
        if (hosted) {
          const current = remoteRef.current?.departments.find((d) => d.id === id);
          if (!current) {
            console.error("[workspace] nothing to update with id", id, "- write dropped");
            return;
          }
          await push({ table: "departments", action: "upsert", rows: [{ ...current, ...patch }] });
          return;
        }
        await requireDb().departments.update(id, patch);
      },

      deleteDepartment: async (id) => {
        if (hosted) {
          await push({ table: "departments", action: "delete", ids: [id] });
          return;
        }
        const database = requireDb();
        await database.transaction("rw", database.departments, database.conversations, async () => {
          await database.departments.delete(id);
          await database.conversations.where("departmentId").equals(id).delete();
        });
      },

      createConversation: async (departmentId, title) => {
        const now = Date.now();
        const conversation: Conversation = {
          id: newId("conv"),
          departmentId,
          title: title ?? "New conversation",
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        if (hosted) await push({ table: "conversations", action: "upsert", rows: [conversation] });
        else await requireDb().conversations.put(conversation);
        return conversation;
      },

      updateConversation: async (id, patch) => {
        if (hosted) {
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
          return;
        }
        await requireDb().conversations.update(id, { ...patch, updatedAt: Date.now() });
      },

      setMessages: async (id, messages) => {
        if (hosted) {
          const current = remoteRef.current?.conversations.find((c) => c.id === id);
          if (!current) {
            console.error("[workspace] nothing to update with id", id, "- write dropped");
            return;
          }
          await push({
            table: "conversations",
            action: "upsert",
            rows: [{ ...current, messages, updatedAt: Date.now() }],
          });
          return;
        }
        await requireDb().conversations.update(id, { messages, updatedAt: Date.now() });
      },

      deleteConversation: async (id) => {
        if (hosted) await push({ table: "conversations", action: "delete", ids: [id] });
        else await requireDb().conversations.delete(id);
      },

      saveAllHandsRun: async (run) => {
        if (hosted) await push({ table: "allHands", action: "upsert", rows: [run] });
        else await requireDb().allHands.put(run);
      },

      deleteAllHandsRun: async (id) => {
        if (hosted) await push({ table: "allHands", action: "delete", ids: [id] });
        else await requireDb().allHands.delete(id);
      },

      addFile: async (file) => {
        if (hosted) await push({ table: "files", action: "upsert", rows: [file] });
        else await requireDb().files.put(file);
      },

      updateFile: async (id, patch) => {
        if (hosted) {
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
          return;
        }
        await requireDb().files.update(id, { ...patch, updatedAt: Date.now() });
      },

      deleteFile: async (id) => {
        if (hosted) await push({ table: "files", action: "delete", ids: [id] });
        else await requireDb().files.delete(id);
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
        if (hosted) await push({ table: "skills", action: "upsert", rows: [skill] });
        else await requireDb().skills.put(skill);
        return skill;
      },

      updateSkill: async (id, patch) => {
        if (hosted) {
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
          return;
        }
        await requireDb().skills.update(id, { ...patch, updatedAt: Date.now() });
      },

      deleteSkill: async (id) => {
        if (hosted) await push({ table: "skills", action: "delete", ids: [id] });
        else await requireDb().skills.delete(id);
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
        if (hosted) await push({ table: "projects", action: "upsert", rows: [project] });
        else await requireDb().projects.put(project);
        return project;
      },

      updateProject: async (id, patch) => {
        if (hosted) {
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
          return;
        }
        await requireDb().projects.update(id, { ...patch, updatedAt: Date.now() });
      },

      deleteProject: async (id) => {
        if (hosted) {
          await push({ table: "projects", action: "delete", ids: [id] });
          return;
        }
        // Local mode has no server to mirror, so the unlinking that applyOp
        // does for a hosted workspace has to be written out by hand here.
        const database = requireDb();
        await database.transaction(
          "rw",
          database.projects,
          database.conversations,
          database.deliverables,
          database.files,
          async () => {
            await database.projects.delete(id);

            // Written out per table rather than looped: Dexie types each table
            // separately, and a loop over all three collapses bulkPut into a
            // union with no callable signature.
            const release = async <T extends { projectId?: string }>(
              rows: T[],
              put: (next: T[]) => Promise<unknown>,
            ) => {
              if (rows.length) await put(rows.map((row) => ({ ...row, projectId: undefined })));
            };

            await release(
              await database.conversations.where("projectId").equals(id).toArray(),
              (rows) => database.conversations.bulkPut(rows),
            );
            await release(
              await database.deliverables.where("projectId").equals(id).toArray(),
              (rows) => database.deliverables.bulkPut(rows),
            );
            await release(
              await database.files.where("projectId").equals(id).toArray(),
              (rows) => database.files.bulkPut(rows),
            );
          },
        );
      },

      getProject: (id) => projectList.find((row) => row.id === id),

      projectContents: (id) => ({
        conversations: conversationList.filter((row) => row.projectId === id),
        deliverables: deliverableList.filter((row) => row.projectId === id),
        files: fileList.filter((row) => row.projectId === id),
      }),

      setConversationProject: async (conversationId, projectId) => {
        if (hosted) {
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
          return;
        }
        await requireDb().conversations.update(conversationId, {
          projectId,
          updatedAt: Date.now(),
        });
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
        if (hosted) await push({ table: "deliverables", action: "upsert", rows: [deliverable] });
        else await requireDb().deliverables.put(deliverable);
        return deliverable;
      },

      updateDeliverable: async (id, patch) => {
        if (hosted) {
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
          return;
        }
        await requireDb().deliverables.update(id, { ...patch, updatedAt: Date.now() });
      },

      deleteDeliverable: async (id) => {
        if (hosted) await push({ table: "deliverables", action: "delete", ids: [id] });
        else await requireDb().deliverables.delete(id);
      },

      /**
       * Moves everything in this browser into the signed-in account, in one
       * batch. Existing rows with the same id are overwritten, so running it
       * twice is safe and the second run is a no-op.
       */
      uploadLocalWorkspace: async () => {
        if (!hosted || !db) return { pushed: 0 };

        const [depts, convs, skls, dels, projs, fls, runs, prof, sets] = await Promise.all([
          db.departments.toArray(),
          db.conversations.toArray(),
          db.skills.toArray(),
          db.deliverables.toArray(),
          db.projects.toArray(),
          db.files.toArray(),
          db.allHands.toArray(),
          db.profile.get("profile"),
          db.settings.get("app"),
        ]);

        const ops: MutationOp[] = [];
        if (depts.length) ops.push({ table: "departments", action: "upsert", rows: depts });
        // Projects go before the work that references them, so a half applied
        // batch never leaves a conversation pointing at a project that is not
        // there yet.
        if (projs.length) ops.push({ table: "projects", action: "upsert", rows: projs });
        if (skls.length) ops.push({ table: "skills", action: "upsert", rows: skls });
        if (dels.length) ops.push({ table: "deliverables", action: "upsert", rows: dels });
        if (fls.length) ops.push({ table: "files", action: "upsert", rows: fls });
        if (runs.length) ops.push({ table: "allHands", action: "upsert", rows: runs });
        // Conversations carry their messages and attachments, so they go last
        // and in their own operation to keep any single request manageable.
        if (convs.length) ops.push({ table: "conversations", action: "upsert", rows: convs });
        if (prof) {
          const { id: _id, ...rest } = prof;
          ops.push({ table: "profile", action: "upsert", row: rest });
        }
        if (sets) {
          const { id: _id, apiKey: _key, ...rest } = sets;
          ops.push({ table: "settings", action: "upsert", row: rest });
        }

        if (ops.length === 0) return { pushed: 0 };

        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops }),
        });
        if (!response.ok) throw new Error("The upload was refused.");

        const fresh = await fetch("/api/workspace").then((r) => r.json() as Promise<Workspace>);
        commitRemote(fresh);

        return {
          pushed:
            depts.length + convs.length + skls.length + dels.length + fls.length + runs.length,
        };
      },
    };
  }, [
    hosted,
    commitRemote,
    mode,
    signedInEmail,
    serverKey,
    isAdmin,
    remote,
    push,
    seeded,
    allDepartments,
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
