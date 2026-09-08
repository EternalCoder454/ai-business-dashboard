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
import {
  allowsArea,
  allowsHead,
  allowsHref,
  parsePermissions,
  type Area,
  type Permissions,
} from "./permissions";
import type { CalendarStatus } from "./prompts";
import type { CalendarEvent } from "./google";
import {
  applyOp,
  type MutationOp,
  type StorageMode,
  type Workspace,
  type WorkspaceStatus,
} from "./workspace";
import { createWriteQueue, type WriteQueue } from "@/lib/writeQueue";
import {
  ORCHESTRATOR_ID,
  COMPANY_ID,
  DEFAULT_ACCOUNT,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  PROJECT_ACCENTS,
  seedDepartments,
  WRITING_RULES,
} from "./seed";
import { memoryFor as liveMemoryFor } from "./memory";
import { skillReconciliation, writingRulesReplaceable } from "./shippedSkills";
import { seedSkills } from "./seedSkills";
import { seedWikiPages } from "./seedWiki";
import { toBlob } from "./blobUpload";
import { report } from "./telemetryClient";
import type {
  CompanyProfile,
  Conversation,
  Deliverable,
  DeliverableStatus,
  Density,
  Department,
  LibraryFile,
  Meeting,
  MemoryEntry,
  MemoryKind,
  Message,
  Project,
  Settings,
  Skill,
  Task,
  TaskComment,
  TaskStatus,
  ThemeMode,
  UserAccount,
  WikiPage,
} from "./types";

import { PROVIDERS, type Provider } from "./providers";
import type { Credential } from "@/db/keys";
import { useDensityChoice } from "./densityChoice";
import { useThemeChoice } from "./themeChoice";

export interface StoreValue {
  ready: boolean;
  /** The workspace could not be read, after three tries. */
  loadFailed: boolean;
  /** Signed in, but nobody has added this address to a business. */
  noWorkspace: boolean;
  /** Try the whole load again, from a button. */
  retryLoad: () => void;
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
  serverKeys: Record<Provider, boolean>;
  /**
   * Whether the business holds a key for each provider, and its last four
   * characters. Never the key itself: nothing returns that to a browser.
   */
  workspaceKeys: Record<Credential, { set: boolean; tail: string }>;
  /** Admin of this workspace, which is what lets someone change its keys. */
  workspaceRole: "member" | "admin" | null;
  /**
   * What this person may open, or null for everything.
   *
   * Read through `can` and `canOpenHead` rather than directly, so the
   * administrator exemption is applied in one place instead of at every screen
   * that asks.
   */
  permissions: Permissions | null;
  /** Whether an area of the panel is open to this person. */
  can: (area: Area) => boolean;
  /** Whether one head is. */
  canOpenHead: (departmentId: string) => boolean;
  /** Whether a screen is, by its path. For filtering the navigation. */
  canOpenPath: (href: string) => boolean;
  /** How many people share this workspace, including you. */
  workspacePeople: number;
  /** Sets or clears the business's key. Administrators only, enforced server side. */
  setWorkspaceKey: (
    provider: Credential,
    key: string,
  ) => Promise<string | null>;
  /** Whether this account may review other people's conversations. */
  isOperator: boolean;
  /** False until the server has said who this is. Gate refusals on it. */
  statusReady: boolean;
  /** Department heads only. The CEO is excluded. */
  departments: Department[];
  /** Yours alone: outside the org chart and out of All Hands. */
  personalDepartments: Department[];
  /** Every department including the CEO, for lookups. */
  allDepartments: Department[];
  orchestrator: Department | undefined;
  conversations: Conversation[];
  deliverables: Deliverable[];
  projects: Project[];
  meetings: Meeting[];
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
  /** Everything anybody has said about a task, oldest first. */
  taskComments: TaskComment[];
  commentOnTask: (taskId: string, body: string) => Promise<void>;
  deleteTaskComment: (id: string) => Promise<void>;
  /** One head's slice of it, plus everything company-wide. Live entries only. */
  memoryFor: (departmentId: string) => MemoryEntry[];
  saveMemory: (input: Partial<MemoryEntry> & { kind: MemoryKind; label: string }) => Promise<MemoryEntry>;
  updateMemory: (id: string, patch: Partial<MemoryEntry>) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  profile: CompanyProfile;
  settings: Settings;
  /**
   * The theme the business opens as, before anybody's own choice.
   *
   * `settings.theme` is what to draw, which is this unless the person reading
   * has said otherwise. Settings needs the difference, because an administrator
   * choosing the company default while personally reading in dark would
   * otherwise see their own preference ticked and set the company to it.
   */
  companyTheme: ThemeMode;
  /** Before the personal override, as companyTheme is. */
  companyDensity: Density;
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
  /**
   * Put the shipped skill library back exactly as it ships.
   *
   * Restores anything edited, disabled or deleted. Skills written in this
   * workspace are left alone: "back to default" is about the ones the panel
   * provided, and a reset that quietly deleted somebody's own playbooks would
   * be a different and much worse button.
   *
   * Nothing is deleted. A shipped skill you had edited is archived as a copy
   * before the shipped version goes back, and a shipped skill the panel has
   * withdrawn is archived where it stands rather than removed. Returns what it
   * restored and what it set aside, so the page can say.
   */
  resetSkills: () => Promise<{ restored: number; archived: number }>;
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

  saveMeeting: (run: Meeting) => Promise<void>;
  deleteMeeting: (id: string) => Promise<void>;

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
  calendar: CalendarEvent[];
  /** Whether there is a calendar at all, which is not whether it has events. */
  calendarStatus: CalendarStatus;
  /**
   * Loads one conversation's messages.
   *
   * The workspace snapshot carries counts rather than bodies, so a thread is
   * empty until this is called. Calling it twice is free.
   */
  openConversation: (conversationId: string) => Promise<Message[]>;
  /**
   * One deliverable's full text.
   *
   * The snapshot carries the opening of each, which is what the card shows.
   * Returns the whole thing and caches it, so opening one twice asks once.
   */
  openDeliverable: (id: string) => Promise<string>;
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
  // Same reason as serverKeys below: derived from the provider list rather
  // than written out, so a new provider starts as "no key" honestly instead of
  // being absent and read as undefined.
  const [workspaceKeys, setWorkspaceKeys] = useState<
    Record<Credential, { set: boolean; tail: string }>
  >(
    () =>
      // Every provider, plus the credentials that are not providers. Derived
      // rather than written out, so a new one starts as "no key" honestly.
      Object.fromEntries(
        [...PROVIDERS.map((p) => p.id), "perplexity"].map((id) => [
          id,
          { set: false, tail: "" },
        ]),
      ) as Record<Credential, { set: boolean; tail: string }>,
  );
  const [workspaceRole, setWorkspaceRole] = useState<"member" | "admin" | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [workspacePeople, setWorkspacePeople] = useState(1);
  // Built from the provider list, so adding one cannot leave it out of the
  // starting state and read as "the deployment has no key for that".
  const [serverKeys, setServerKeys] = useState<Record<Provider, boolean>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, false])) as Record<Provider, boolean>,
  );
  /**
   * The workspace could not be read, after retrying.
   *
   * Distinct from not having loaded yet, which is `ready`. One is a moment and
   * the other is a dead end, and the screen has to be able to tell them apart
   * to offer the right thing.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * Signed in, and in no business.
   *
   * A different thing from a load that failed: no amount of retrying fixes it,
   * and the person needs to be told to ask somebody rather than to try again.
   */
  const [noWorkspace, setNoWorkspace] = useState(false);
  /*
   * The same fact, in a ref. The retry loop captured its variables when it
   * started, so it cannot see a state update from the attempt it is inside,
   * and this is what lets it stop rather than retry something that cannot
   * change.
   */
  const noWorkspaceRef = useRef(false);
  // Bumped by `retryLoad` to send the effect round again.
  const [reloadKey, setReloadKey] = useState(0);
  /*
   * The whole event, not the four fields a prompt needs.
   *
   * The dashboard card was fetching the same calendar a second time to get the
   * id and the going or not going status this narrowed away, which meant two
   * Google round trips on every page load for one calendar. Measured: 436 calls
   * a day against 218 page loads, at 822ms each. Keeping the extra fields costs
   * nothing here and removes the second call entirely; a prompt still sees only
   * the four it uses, since a wider object satisfies the narrower type.
   */
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>("not-connected");
  /**
   * Whether we have heard back about who this is yet.
   *
   * Everything below starts false, which is indistinguishable from a real no.
   * Screens gated on those flags therefore rendered their refusal first and
   * corrected themselves a moment later, so an operator opening the operator
   * screen was told they were not one, briefly, every single time.
   */
  const [statusReady, setStatusReady] = useState(false);
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
        setPermissions(parsePermissions(status?.permissions));
        setWorkspacePeople(status?.workspacePeople ?? 1);
        setIsOperator(Boolean(status?.isOperator));
        setIsOwner(Boolean(status?.isOwner));
        setMode(status?.hosted && status.signedIn ? "hosted" : "local");
        setStatusReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMode("local");
        // Answered, badly, which is still an answer: a screen that waits for
        // this must not wait forever because the request failed.
        setStatusReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * The calendar, once, if there is one. The status is kept alongside the
   * events because an empty array otherwise means three different things: no
   * calendar, a free week, and one we cannot read.
   */
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/calendar?days=7")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { events?: CalendarEvent[]; problem?: CalendarStatus } | null) => {
        if (cancelled || !body) return;
        setCalendar(body.events ?? []);
        setCalendarStatus(body.problem ?? "connected");
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

  /**
   * The workspace request, started at mount rather than after the status one.
   *
   * These used to be a waterfall. The snapshot was fetched only once the status
   * call had come back saying the workspace was hosted, so the request that
   * actually fills the screen did not begin until an earlier round trip had
   * finished. Measured on a running server, /api/workspace started eleven
   * milliseconds after /api/workspace/status ended and never once overlapped
   * it.
   *
   * It never needed to wait. /api/workspace resolves who is asking by itself
   * and answers 401 or 501 when there is nobody or no database, which is the
   * same thing the status call would have told us, one round trip later.
   *
   * Signed out, this costs one request that answers 401 on the sign-in page.
   * Signed in, which is everybody who sees anything, it takes a whole round
   * trip out of every page load.
   */
  const started = useRef<Promise<Response | null> | null>(null);
  useEffect(() => {
    /*
     * The catch matters. Nothing awaits this until the effect below runs, and
     * on a signed out visitor nothing awaits it at all, so a dropped
     * connection here would surface as an unhandled rejection rather than as
     * the retry that is already written for it. A failure resolves to null and
     * the loader fetches again for itself.
     */
    started.current = fetch("/api/workspace").catch(() => null);
  }, []);

  // The hosted snapshot is read once; every later change is applied to it
  // locally and sent to the server, so no request is needed to re-render.
  useEffect(() => {
    if (!hosted) return;
    let cancelled = false;

    const load = async () => {
      /*
       * The one already in flight, if this is the first pass. Cleared as it is
       * taken, so a retry and a workspace switch both fetch again rather than
       * reading the same answer twice.
       */
      const inFlight = started.current;
      started.current = null;
      const response = (inFlight ? await inFlight : null) ?? (await fetch("/api/workspace"));

      /*
       * Being in no workspace is not a failure to retry. Somebody signed in
       * with an address nobody has invited needs telling that, not three
       * attempts and a connection error.
       */
      if (response.status === 403) {
        const said = (await response.json().catch(() => null)) as
          | { reason?: string }
          | null;
        if (said?.reason === "no-workspace") {
          noWorkspaceRef.current = true;
          setNoWorkspace(true);
          return null;
        }
      }

      const initial = response.ok ? ((await response.json()) as Workspace) : null;
      if (cancelled || !initial) return initial;

      // Reassigned by the reconciliation steps below, which refetch after
      // writing, so it is narrowed once here rather than at every use.
      let snapshot: Workspace = initial;

      // A brand new account has no departments at all. Seed it with the same
      // eight heads and shipped skills a fresh browser would get, so signing in
      // on a second device never lands on an empty org chart.
      if (snapshot.departments.length === 0) {
        /*
         * Everything except who the business is. The settings row already
         * carries the name the operator typed, and a settings write renames
         * the workspace row to match, so seeding the whole of DEFAULT_SETTINGS
         * would rename the business to "Your Company" the first time anybody
         * opened it. Defaults are for fields nobody has chosen yet.
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

        /*
         * The house writing rules, upgraded only while the workspace is still
         * on a version we shipped. They live in a column rather than in the
         * prompt builder, so without this an improvement reaches new businesses
         * and nobody else. A copy somebody has edited is theirs; an empty one
         * means they were never written rather than deliberately cleared.
         */
        if (writingRulesReplaceable(snapshot.settings.writingRules, WRITING_RULES)) {
          ops.push({
            table: "settings",
            action: "upsert",
            row: { writingRules: WRITING_RULES },
          });
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

    /*
     * Three attempts with a widening gap, then a state the shell can offer a
     * retry from. Failing silently leaves a blank screen for the rest of the
     * session, which reads as broken rather than as busy.
     */
    const attempt = async (left: number): Promise<void> => {
      try {
        const snapshot = await load();
        if (cancelled) return;
        if (snapshot) {
          commitRemote(snapshot);
          setLoadFailed(false);
          return;
        }
        throw new Error("the workspace came back empty");
      } catch (error) {
        if (cancelled) return;
        // Nothing to retry when the answer is that they have no business.
        if (noWorkspaceRef.current) return;
        if (left > 0) {
          await new Promise((resolve) => setTimeout(resolve, (4 - left) * 1200));
          if (!cancelled) await attempt(left - 1);
          return;
        }
        // Reported only once the retries are spent. A blip that recovered is
        // not an outage, and counting it as one would bury the ones that are.
        report({
          operation: "client.load-failed",
          ok: false,
          errorKind: error instanceof Error ? error.name : "LoadFailed",
          errorNote: error instanceof Error ? error.message : String(error),
        });
        setLoadFailed(true);
      }
    };

    // Read inside the retry, which is holding the value from when it started.
    noWorkspaceRef.current = false;
    void attempt(3);

    return () => {
      cancelled = true;
    };
  }, [hosted, isOwner, commitRemote, reloadKey]);


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
  /**
   * What the inline script in the root layout already put on <html>.
   *
   * Read once through a lazy initialiser rather than in an effect, because an
   * effect runs after the first paint and the whole point is to agree with the
   * document before anything is drawn. Empty on the server, where there is no
   * localStorage and the markup carries the default anyway.
   */
  const themeChoice = useThemeChoice();
  const densityChoice = useDensityChoice();

  const [storedTheme] = useState<Settings["theme"] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const value = window.localStorage.getItem("eterneon-theme");
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  });

  /** Before the personal override. See companyTheme on StoreValue. */
  const companyTheme: ThemeMode =
    (remote?.settings?.theme as ThemeMode | undefined) ??
    storedTheme ??
    DEFAULT_SETTINGS.theme;

  /** The same distinction for density, and for the same reason. */
  const companyDensity: Density =
    (remote?.settings?.density as Density | undefined) ?? DEFAULT_SETTINGS.density;

  const settings: Settings = useMemo(() => {
    // The server's answer sits between the shipped defaults and the workspace
    // proper, so the name on screen is right from the first frame instead of
    // reading "Your Company" until the fetch lands.
    const base = {
      ...DEFAULT_SETTINGS,
      /*
       * The theme this browser last used, until the workspace says otherwise.
       *
       * This is the frame of dark that flashed on a light workspace. The script
       * in the root layout reads the same value and applies it before anything
       * is painted, correctly. Then the store mounted, and until the snapshot
       * arrived a second later `settings.theme` was still the shipped default
       * of dark, so the effect below dutifully wrote dark back over it and then
       * corrected itself when the fetch landed.
       *
       * Reading the same mirror here means the two agree from the first render,
       * and the effect writes the value that is already on the element.
       */
      ...(storedTheme ? { theme: storedTheme } : {}),
      ...(initialBranding
        ? { companyName: initialBranding.name, companyMark: initialBranding.mark }
        : {}),
      ...(remote?.settings ?? {}),
    };
    /*
     * This person's own theme, over the top of the company's.
     *
     * Last, so it beats the workspace: the workspace value is what the business
     * opens as, and this is what somebody has said they would rather read in.
     * Null means they never said, and then the company's answer stands and
     * keeps standing when it changes.
     */
    const themed = themeChoice ? { ...base, theme: themeChoice } : base;
    // And this person's own density over the company's, for the same reason:
    // a thirteen inch laptop is not a company decision.
    const packed = densityChoice ? { ...themed, density: densityChoice } : themed;

    // Neither storage holds the credentials, so they are laid over the top from
    // this browser once read. Overlaying unconditionally is what lets an empty
    // key mean cleared rather than merely absent.
    return credentialsReady ? { ...packed, ...credentials } : packed;
  }, [
    remote?.settings,
    credentials,
    credentialsReady,
    initialBranding,
    storedTheme,
    themeChoice,
    densityChoice,
  ]);

  /**
   * Google fills in what the person has not set for themselves.
   *
   * The address is the exception and always comes from Google, because it is
   * the identity rather than a preference: the access row, every message and
   * every permission is keyed on it.
   *
   * Name and picture work the other way round. Whatever they chose wins, and
   * Google is only the fallback. The picture used to be the wrong way round,
   * which meant uploading one saved it correctly and then showed the Google
   * one anyway, so the feature looked broken while working perfectly.
   */
  const account: UserAccount = useMemo(() => {
    const stored = remote?.account ?? DEFAULT_ACCOUNT;
    return {
      ...stored,
      email: googleIdentity?.email ?? stored.email,
      avatarUrl: stored.avatarUrl || googleIdentity?.image,
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
    document.documentElement.dataset.brand = settings.brand;
    document.documentElement.dataset.density = settings.density;
    try {
      window.localStorage.setItem("eterneon-theme", settings.theme);
      window.localStorage.setItem("eterneon-brand", settings.brand);
      window.localStorage.setItem("eterneon-density", settings.density);
    } catch {
      // Private mode or blocked storage. All three still apply this session.
    }
  }, [settings.theme, settings.brand, settings.density]);

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
  const runList = remote?.meetings ?? NONE;
  const taskCommentList = remote?.taskComments ?? NONE;

  const [writeError, setWriteError] = useState<string | null>(null);

  /*
   * What to do when a batch fails, kept current rather than captured.
   *
   * The queue below is built once and outlives every render, so anything it
   * holds is from whichever render happened to create it. Reading through a ref
   * that an effect keeps up to date means the failure path always uses the
   * latest commitRemote instead of a stale one.
   */
  const onWriteFailure = useRef<(error: unknown) => Promise<void>>(async () => {});
  useEffect(() => {
    onWriteFailure.current = async (error: unknown) => {
      console.error("[workspace] write failed, reloading", error);
      // What the user experiences as work disappearing. Worth knowing about
      // without waiting for somebody to write in about it.
      report({
        operation: "client.write",
        ok: false,
        errorKind: error instanceof Error ? error.name : "WriteFailed",
        errorNote: error instanceof Error ? error.message : String(error),
      });
      setWriteError(
        error instanceof Error && error.message
          ? error.message
          : "That change could not be saved.",
      );
      /*
       * Safe to trust precisely because the queue drops whatever was still
       * waiting before calling this, so nothing is in flight to be overwritten.
       */
      const fresh = await fetch("/api/workspace")
        .then((r) => (r.ok ? (r.json() as Promise<Workspace>) : null))
        .catch(() => null);
      if (fresh) commitRemote(fresh);
    };
  });

  /** One sender, draining in order. See writeQueue for why this exists. */
  const queue = useRef<WriteQueue<MutationOp> | null>(null);

  /**
   * Applies one change locally at once, so the interface never waits on a round
   * trip, and queues it to be sent in the order it was made.
   */
  const push = useCallback(
    async (op: MutationOp) => {
      // Applied against the ref rather than through a functional update, so a
      // second write in the same tick sees the first one.
      commitRemote(remoteRef.current ? applyOp(remoteRef.current, op) : remoteRef.current);
      /*
       * Built on the first write rather than during a render, so nothing reads
       * a ref while React is rendering. There is only ever one, and the first
       * write cannot happen before the component that makes it exists.
       */
      queue.current ??= createWriteQueue<MutationOp>({
        send: async (batch) => {
          const response = await fetch("/api/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ops: batch }),
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
        },
        onSuccess: () => setWriteError(null),
        onFailure: (error) => onWriteFailure.current(error),
      });
      await queue.current.push(op);
    },
    [commitRemote],
  );

  const value = useMemo<StoreValue>(() => {
    return {
      ready: remote !== null,
      loadFailed,
      noWorkspace,
      retryLoad: () => {
        setNoWorkspace(false);
        setLoadFailed(false);
        setReloadKey((n) => n + 1);
      },
      writeError,
      dismissWriteError: () => setWriteError(null),
      storage: mode,
      accountEmail: signedInEmail,
      serverKey,
      serverKeys,
      workspaceKeys,
      workspaceRole,
      permissions,
      /*
       * Asked here rather than at each screen, so the one exemption that
       * matters lives in one place: an administrator is never restricted by a
       * list they can edit themselves.
       */
      can: (area: Area) => allowsArea(workspaceRole, permissions, area),
      canOpenHead: (departmentId: string) =>
        allowsHead(workspaceRole, permissions, departmentId),
      canOpenPath: (href: string) => allowsHref(workspaceRole, permissions, href),
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
      statusReady,
      calendar,
      calendarStatus,
      allDepartments: departmentList,
      departments: departmentList.filter((d) => !d.isOrchestrator && !d.personal),
      personalDepartments: departmentList.filter((d) => d.personal),
      orchestrator: departmentList.find((d) => d.isOrchestrator) ?? departmentList.find((d) => d.id === ORCHESTRATOR_ID),
      conversations: conversationList,
      deliverables: deliverableList,
      memory: memoryList,
      tasks: taskList,
      wikiPages: wikiList,
      projects: projectList,
      meetings: runList,
      skills: skillList,
      files: fileList,
      profile,
      settings,
      companyTheme,
      companyDensity,
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
       * Writes. Each builds the finished row and hands it to whichever storage
       * is in use; hosted mode needs the whole row, since the server upserts.
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

      /*
       * The patch, not the merged row, because applyOp and the server upsert
       * both merge by key. Clearing a field therefore has to send an empty
       * string rather than undefined: JSON.stringify drops an undefined value
       * entirely, so the server would receive an empty row and write nothing.
       */
      updateAccount: async (patch) => {
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

      saveMeeting: async (run) => {
        await push({ table: "meetings", action: "upsert", rows: [run] });
      },

      deleteMeeting: async (id) => {
        await push({ table: "meetings", action: "delete", ids: [id] });
      },

      addFile: async (file) => {
        // The bytes go to the store first, so the row carries a location rather
        // than a third of a megabyte of base64.
        file = { ...file, ...(await toBlob(file)) };
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
          archived: input.archived ?? false,
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

      resetSkills: async () => {
        const shipped = seedSkills();
        const stored = remoteRef.current?.skills ?? [];
        const now = Date.now();
        const byId = new Map(stored.map((skill) => [skill.id, skill]));

        /*
         * Told apart by id, not by content. A shipped skill's id is derived
         * from its department and name and never changes, so anything starting
         * skill_seed_ came from the panel and anything else was written here.
         * Content would be the wrong test: the whole point of this button is
         * that the content has been changed.
         */
        const current = new Set(shipped.map((skill) => skill.id));

        /*
         * Nothing is destroyed, only set aside.
         *
         * Two things would otherwise be lost. A shipped skill somebody has
         * edited is about to be written back over, and a shipped skill the
         * panel has since withdrawn was being deleted outright. Both are
         * somebody's library, and a reset that quietly eats writing is a button
         * nobody can afford to press.
         *
         * The edited one is archived as a copy under a new id, so the shipped
         * version can go back to the id it belongs to and both exist. The
         * withdrawn one is archived where it stands, since nothing is coming to
         * take its place.
         */
        const kept = shipped.flatMap((fresh) => {
          const mine = byId.get(fresh.id);
          if (!mine) return [];
          const same =
            mine.content === fresh.content && mine.description === fresh.description;
          if (same) return [];
          return [
            {
              ...mine,
              id: newId("skill"),
              name: `${mine.name} (before reset)`,
              enabled: false,
              archived: true,
              createdAt: now,
              updatedAt: now,
            },
          ];
        });

        const withdrawn = stored
          .filter((skill) => skill.id.startsWith("skill_seed_") && !current.has(skill.id))
          .filter((skill) => !skill.archived)
          .map((skill) => ({ ...skill, enabled: false, archived: true, updatedAt: now }));

        /*
         * Everything shipped is rewritten, not just what differs. Working out
         * which ones changed would save a few rows and would have to get the
         * comparison exactly right, including enabled and the description, on
         * the one path where being wrong means the reset silently did not
         * reset. Twenty rows is not worth being clever about.
         */
        await push({
          table: "skills",
          action: "upsert",
          rows: [...shipped, ...kept, ...withdrawn],
        });

        return { restored: shipped.length, archived: kept.length + withdrawn.length };
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

      openDeliverable: async (id) => {
        const current = remoteRef.current?.deliverables.find((d) => d.id === id);
        if (!current) return "";
        if (current.bodyLoaded) return current.body;

        const response = await fetch(
          `/api/workspace/deliverable-body?id=${encodeURIComponent(id)}`,
        );
        // The truncated opening is a worse answer than the whole document and a
        // better one than an empty dialog, so a failure keeps what it had.
        if (!response.ok) return current.body;

        const body = ((await response.json()) as { body?: string }).body ?? "";
        const latest = remoteRef.current?.deliverables.find((d) => d.id === id);
        if (!latest) return body;

        commitRemote(
          applyOp(remoteRef.current!, {
            table: "deliverables",
            action: "upsert",
            rows: [{ ...latest, body, bodyLoaded: true }],
          }),
        );
        return body;
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
          departmentId: input.departmentId ?? ORCHESTRATOR_ID,
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
          accent: input.accent,
          assignedTo: input.assignedTo,
          createdBy: signedInEmail || undefined,
        };
        await push({ table: "tasks", action: "upsert", rows: [task] });
        return task;
      },

      taskComments: taskCommentList,

      commentOnTask: async (taskId, body) => {
        const text = body.trim();
        if (!text) return;
        await push({
          table: "taskComments",
          action: "upsert",
          rows: [
            {
              id: newId("cmt"),
              taskId,
              // The server stamps whoever is saving over this, so a hand
              // written request cannot put somebody else's name on a comment.
              authorEmail: signedInEmail ?? "",
              body: text,
              createdAt: Date.now(),
            },
          ],
        });
      },

      deleteTaskComment: async (id) => {
        await push({ table: "taskComments", action: "delete", ids: [id] });
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
    permissions,
    workspacePeople,
    mode,
    signedInEmail,
    serverKey,
    isOperator,
    statusReady,
    calendar,
    calendarStatus,
    loadFailed,
    noWorkspace,
    remote,
    push,
    departmentList,
    conversationList,
    deliverableList,
    projectList,
    skillList,
    fileList,
    runList,
    taskCommentList,
    profile,
    settings,
    companyTheme,
    companyDensity,
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
