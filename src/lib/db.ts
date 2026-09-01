import Dexie, { type Table } from "dexie";
import {
  DEFAULT_MODEL,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  PERSONA_BACKFILL,
  seedDepartments,
} from "./seed";
import { COMPANY_ID } from "./seed";
import { seedSkills } from "./seedSkills";
import { seedWikiPages } from "./seedWiki";
import type {
  AllHandsRun,
  LibraryFile,
  UserAccount,
  CompanyProfile,
  Conversation,
  Deliverable,
  Department,
  MemoryEntry,
  Project,
  Task,
  Settings,
  Skill,
  WikiPage,
} from "./types";

/** Singleton rows still need a key in Dexie. */
export interface StoredAccount extends UserAccount {
  id: "me";
}

/** The profile is a singleton row; Dexie still needs a keyed record. */
export interface StoredProfile extends CompanyProfile {
  id: "profile";
}

const PROFILE_FIELDS: (keyof CompanyProfile)[] = [
  "mission",
  "audience",
  "brandVoice",
  "keyFacts",
];

function profileIsEmpty(profile: Partial<CompanyProfile> | undefined): boolean {
  if (!profile) return true;
  return !PROFILE_FIELDS.some((field) => (profile[field] ?? "").trim());
}

class CeoHqDatabase extends Dexie {
  departments!: Table<Department, string>;
  projects!: Table<Project, string>;
  conversations!: Table<Conversation, string>;
  deliverables!: Table<Deliverable, string>;
  allHands!: Table<AllHandsRun, string>;
  skills!: Table<Skill, string>;
  memory!: Table<MemoryEntry, string>;
  tasks!: Table<Task, string>;
  wikiPages!: Table<WikiPage, string>;
  files!: Table<LibraryFile, string>;
  account!: Table<StoredAccount, string>;
  profile!: Table<StoredProfile, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("ceo-hq");

    this.version(1).stores({
      departments: "id, order, isCeo",
      conversations: "id, departmentId, updatedAt",
      deliverables: "id, departmentId, status, updatedAt",
      profile: "id",
      settings: "id",
    });

    // v2 adds named personas, moves the default model to Sonnet 5, and renames
    // the company. Stored system prompts are left alone so any edits survive.
    this.version(2)
      .stores({
        departments: "id, order, isCeo",
        conversations: "id, departmentId, updatedAt",
        deliverables: "id, departmentId, status, updatedAt",
        profile: "id",
        settings: "id",
      })
      .upgrade(async (tx) => {
        await tx
          .table<Department>("departments")
          .toCollection()
          .modify((department) => {
            const defaults = PERSONA_BACKFILL[department.id];
            if (!department.personaName) {
              department.personaName = defaults?.personaName ?? department.name;
            }
            if (!department.persona) {
              department.persona = defaults?.persona ?? "";
            }
          });

        await tx
          .table<Settings>("settings")
          .toCollection()
          .modify((settings) => {
            if (settings.model === "claude-opus-5") settings.model = DEFAULT_MODEL;
            if (settings.companyName === "CEO HQ") {
              settings.companyName = DEFAULT_SETTINGS.companyName;
            }
          });

        const profiles = tx.table<StoredProfile>("profile");
        const current = await profiles.get("profile");
        if (profileIsEmpty(current)) {
          await profiles.put({ id: "profile", ...DEFAULT_PROFILE });
        }
      });

    // v3 adds the all-hands table. Existing tables are unchanged, so there is
    // nothing to migrate.
    this.version(3).stores({
      departments: "id, order, isCeo",
      conversations: "id, departmentId, updatedAt",
      deliverables: "id, departmentId, status, updatedAt",
      allHands: "id, createdAt",
      profile: "id",
      settings: "id",
    });

    // v4 turns the typed-in skill count into real SKILL.md documents.
    this.version(4)
      .stores({
        departments: "id, order, isCeo",
        conversations: "id, departmentId, updatedAt",
        deliverables: "id, departmentId, status, updatedAt",
        allHands: "id, createdAt",
        skills: "id, departmentId, updatedAt",
        profile: "id",
        settings: "id",
      })
      .upgrade(async (tx) => {
        const skills = tx.table<Skill>("skills");
        if ((await skills.count()) === 0) {
          await skills.bulkPut(seedSkills());
        }
      });

    // v5 turns each all-hands run into a threaded room with rounds, so the same
    // group can be asked follow-up questions.
    this.version(5)
      .stores({
        departments: "id, order, isCeo",
        conversations: "id, departmentId, updatedAt",
        deliverables: "id, departmentId, status, updatedAt",
        allHands: "id, createdAt, updatedAt",
        skills: "id, departmentId, updatedAt",
        profile: "id",
        settings: "id",
      })
      .upgrade(async (tx) => {
        await tx
          .table("allHands")
          .toCollection()
          .modify((run: Record<string, unknown>) => {
            if (Array.isArray(run.rounds)) return;
            const question = typeof run.question === "string" ? run.question : "Untitled";
            run.title =
              question.length > 48 ? `${question.slice(0, 48)}…` : question;
            run.rounds = [
              {
                id: `${run.id}_r1`,
                question,
                responses: Array.isArray(run.responses) ? run.responses : [],
                synthesis: run.synthesis,
                synthesisError: run.synthesisError,
                createdAt: run.createdAt ?? Date.now(),
              },
            ];
            delete run.question;
            delete run.responses;
            delete run.synthesis;
            delete run.synthesisError;
          });
      });

    // v6 moves the house writing rules into settings so they can be edited.
    this.version(6)
      .stores({
        departments: "id, order, isCeo",
        conversations: "id, departmentId, updatedAt",
        deliverables: "id, departmentId, status, updatedAt",
        allHands: "id, createdAt, updatedAt",
        skills: "id, departmentId, updatedAt",
        profile: "id",
        settings: "id",
      })
      .upgrade(async (tx) => {
        await tx
          .table<Settings>("settings")
          .toCollection()
          .modify((settings) => {
            if (!settings.writingRules) settings.writingRules = DEFAULT_SETTINGS.writingRules;
          });
      });

    // v7 replaces the eight starter skills with the full library. The first
    // batch used positional ids, so a plain upsert would have duplicated every
    // one of them. Unedited originals are removed and replaced; anything the
    // user changed is kept, and its replacement is skipped so there is no pair.
    this.version(7)
      .stores({
        departments: "id, order, isCeo",
        conversations: "id, departmentId, updatedAt",
        deliverables: "id, departmentId, status, updatedAt",
        allHands: "id, createdAt, updatedAt",
        skills: "id, departmentId, updatedAt",
        profile: "id",
        settings: "id",
      })
      .upgrade(async (tx) => {
        const table = tx.table<Skill>("skills");
        const existing = await table.toArray();

        const legacy = /^skill_seed_[a-z]+_\d+$/;
        const untouchedLegacy = existing.filter(
          (skill) => legacy.test(skill.id) && skill.createdAt === skill.updatedAt,
        );
        await table.bulkDelete(untouchedLegacy.map((skill) => skill.id));

        const kept = existing.filter(
          (skill) => !untouchedLegacy.some((dead) => dead.id === skill.id),
        );
        const taken = new Set(kept.map((skill) => `${skill.departmentId}::${skill.name}`));

        const additions = seedSkills().filter(
          (skill) => !taken.has(`${skill.departmentId}::${skill.name}`),
        );
        if (additions.length) await table.bulkPut(additions);
      });

    /**
     * v14 adds the internal wiki as data, so an installation can write its
     * own pages rather than reading whatever was compiled into the app.
     */
    this.version(14).stores({
      departments: "id, order, isCeo",
      projects: "id, status, updatedAt",
      conversations: "id, departmentId, projectId, updatedAt",
      deliverables: "id, departmentId, projectId, status, updatedAt",
      allHands: "id, createdAt, updatedAt",
      skills: "id, departmentId, updatedAt",
      memory: "id, kind, departmentId, projectId, archived, occurredAt",
      tasks: "id, status, departmentId, projectId, order, dueAt",
      wikiPages: "id, order, enabled",
      files: "id, kind, departmentId, projectId, updatedAt",
      account: "id",
      profile: "id",
      settings: "id",
    });

    /**
     * v13 adds tasks: things to do, as opposed to deliverables, which are
     * things produced. Indexed by status and by hand ordering, which is how
     * the board reads them.
     */
    this.version(13).stores({
      departments: "id, order, isCeo",
      projects: "id, status, updatedAt",
      conversations: "id, departmentId, projectId, updatedAt",
      deliverables: "id, departmentId, projectId, status, updatedAt",
      allHands: "id, createdAt, updatedAt",
      skills: "id, departmentId, updatedAt",
      memory: "id, kind, departmentId, projectId, archived, occurredAt",
      tasks: "id, status, departmentId, projectId, order, dueAt",
      files: "id, kind, departmentId, projectId, updatedAt",
      account: "id",
      profile: "id",
      settings: "id",
    });

    /**
     * v12 adds the studio's own record: decisions that stand, and figures that
     * were true on a date. Indexed by kind and by when it happened, which is
     * how the prompt reads it. Nothing else changes, so there is no upgrade.
     */
    this.version(12).stores({
      departments: "id, order, isCeo",
      projects: "id, status, updatedAt",
      conversations: "id, departmentId, projectId, updatedAt",
      deliverables: "id, departmentId, projectId, status, updatedAt",
      allHands: "id, createdAt, updatedAt",
      skills: "id, departmentId, updatedAt",
      memory: "id, kind, departmentId, projectId, archived, occurredAt",
      files: "id, kind, departmentId, projectId, updatedAt",
      account: "id",
      profile: "id",
      settings: "id",
    });

    // v11 adds projects, which group work across departments. Conversations,
    // deliverables, and files gain a projectId index so a project page can be
    // assembled without walking every row.
    this.version(11).stores({
      departments: "id, order, isCeo",
      projects: "id, status, updatedAt",
      conversations: "id, departmentId, projectId, updatedAt",
      deliverables: "id, departmentId, projectId, status, updatedAt",
      allHands: "id, createdAt, updatedAt",
      skills: "id, departmentId, updatedAt",
      files: "id, kind, departmentId, projectId, updatedAt",
      account: "id",
      profile: "id",
      settings: "id",
    });

    // v10 adds the account: who is using the app, as opposed to the company
    // the app is about.
    this.version(10).stores({
      departments: "id, order, isCeo",
      conversations: "id, departmentId, updatedAt",
      deliverables: "id, departmentId, status, updatedAt",
      allHands: "id, createdAt, updatedAt",
      skills: "id, departmentId, updatedAt",
      files: "id, kind, departmentId, updatedAt",
      account: "id",
      profile: "id",
      settings: "id",
    });

    // v9 adds the Library: images, PDFs, and documents kept once and attached
    // to any conversation, rather than re-uploaded each time.
    this.version(9).stores({
      departments: "id, order, isCeo",
      conversations: "id, departmentId, updatedAt",
      deliverables: "id, departmentId, status, updatedAt",
      allHands: "id, createdAt, updatedAt",
      skills: "id, departmentId, updatedAt",
      files: "id, kind, departmentId, updatedAt",
      profile: "id",
      settings: "id",
    });

    // v8 adds the company wide skills, which every head inherits.
    this.version(8)
      .stores({
        departments: "id, order, isCeo",
        conversations: "id, departmentId, updatedAt",
        deliverables: "id, departmentId, status, updatedAt",
        allHands: "id, createdAt, updatedAt",
        skills: "id, departmentId, updatedAt",
        profile: "id",
        settings: "id",
      })
      .upgrade(async (tx) => {
        const table = tx.table<Skill>("skills");
        const have = new Set((await table.toArray()).map((skill) => skill.id));
        const additions = seedSkills().filter(
          (skill) => skill.departmentId === COMPANY_ID && !have.has(skill.id),
        );
        if (additions.length) await table.bulkPut(additions);
      });
  }
}

/**
 * Dexie touches IndexedDB at construction time, so the instance is only created
 * in the browser. Server renders read `undefined` and fall back to defaults.
 */
export const db: CeoHqDatabase | undefined =
  typeof window === "undefined" ? undefined : new CeoHqDatabase();

let seedPromise: Promise<void> | undefined;

/** Populates the seed departments, profile, and settings exactly once. */
export function ensureSeeded(): Promise<void> {
  if (!db) return Promise.resolve();
  if (!seedPromise) {
    seedPromise = (async () => {
      const existingDepartments = await db.departments.count();
      if (existingDepartments === 0) {
        await db.departments.bulkPut(seedDepartments());
      }

      const existingProfile = await db.profile.get("profile");
      if (!existingProfile) {
        await db.profile.put({ id: "profile", ...DEFAULT_PROFILE });
      }

      const existingSkills = await db.skills.count();
      if (existingSkills === 0) {
        await db.skills.bulkPut(seedSkills());
      }

      const existingWiki = await db.wikiPages.count();
      if (existingWiki === 0) {
        await db.wikiPages.bulkPut(seedWikiPages());
      }

      const existingSettings = await db.settings.get("app");
      if (!existingSettings) {
        await db.settings.put({ ...DEFAULT_SETTINGS });
      }
    })().catch((error) => {
      // Let the next caller retry rather than caching a failed seed.
      seedPromise = undefined;
      throw error;
    });
  }
  return seedPromise;
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export interface ExportPayload {
  app: "ceo-hq";
  version: number;
  exportedAt: string;
  departments: Department[];
  conversations: Conversation[];
  deliverables: Deliverable[];
  allHands?: AllHandsRun[];
  skills?: Skill[];
  files?: LibraryFile[];
  profile?: StoredProfile;
  settings?: Settings;
}

/** Everything in one object, for Settings, Export data. */
export async function exportAll(): Promise<ExportPayload> {
  if (!db) throw new Error("Database is only available in the browser.");
  const [
    departments,
    conversations,
    deliverables,
    allHands,
    skills,
    files,
    profile,
    settings,
  ] =
    await Promise.all([
      db.departments.toArray(),
      db.conversations.toArray(),
      db.deliverables.toArray(),
      db.allHands.toArray(),
      db.skills.toArray(),
      db.files.toArray(),
      db.profile.get("profile"),
      db.settings.get("app"),
    ]);

  // The API key is a credential, not data worth putting in a downloaded file.
  const safeSettings = settings ? { ...settings, apiKey: "" } : undefined;

  return {
    app: "ceo-hq",
    version: 2,
    exportedAt: new Date().toISOString(),
    departments,
    conversations,
    deliverables,
    allHands,
    skills,
    files,
    profile,
    settings: safeSettings,
  };
}

/**
 * Replaces local data with the contents of an export file. The API key already
 * stored in this browser is kept, because exports never contain one.
 */
export async function importAll(raw: unknown): Promise<{
  departments: number;
  conversations: number;
  deliverables: number;
}> {
  if (!db) throw new Error("Database is only available in the browser.");

  const payload = raw as Partial<ExportPayload> | null;
  if (!payload || typeof payload !== "object" || payload.app !== "ceo-hq") {
    throw new Error("That file is not a workspace export.");
  }

  const departments = Array.isArray(payload.departments) ? payload.departments : [];
  const conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
  const deliverables = Array.isArray(payload.deliverables) ? payload.deliverables : [];
  const allHands = Array.isArray(payload.allHands) ? payload.allHands : [];
  const skills = Array.isArray(payload.skills) ? payload.skills : [];
  const files = Array.isArray(payload.files) ? payload.files : [];

  if (departments.length === 0) {
    throw new Error("That export has no departments in it.");
  }

  const currentKey = (await db.settings.get("app"))?.apiKey ?? "";

  // Dexie's positional overload tops out at five tables, so pass an array.
  await db.transaction(
    "rw",
    [
      db.departments,
      db.conversations,
      db.deliverables,
      db.allHands,
      db.skills,
      db.files,
      db.profile,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.departments.clear(),
        db.conversations.clear(),
        db.deliverables.clear(),
        db.allHands.clear(),
        db.skills.clear(),
        db.files.clear(),
      ]);
      await db.departments.bulkPut(departments);
      if (conversations.length) await db.conversations.bulkPut(conversations);
      if (deliverables.length) await db.deliverables.bulkPut(deliverables);
      if (allHands.length) await db.allHands.bulkPut(allHands);
      if (skills.length) await db.skills.bulkPut(skills);
      if (files.length) await db.files.bulkPut(files);

      if (payload.profile) {
        const { id: _id, ...fields } = payload.profile;
        await db.profile.put({ id: "profile", ...DEFAULT_PROFILE, ...fields });
      }

      if (payload.settings) {
        await db.settings.put({
          ...DEFAULT_SETTINGS,
          ...payload.settings,
          id: "app",
          apiKey: currentKey,
        });
      }
    },
  );

  return {
    departments: departments.length,
    conversations: conversations.length,
    deliverables: deliverables.length,
  };
}

/**
 * Puts the built-in departments back to their shipped prompts and personas,
 * leaving conversations, deliverables, and the company profile untouched.
 */
export async function restoreDefaultDepartments(): Promise<void> {
  if (!db) return;
  await db.departments.bulkPut(seedDepartments());
}

/** Wipes every table and re-seeds. Used by Settings, Reset all data. */
export async function resetAll(): Promise<void> {
  if (!db) return;
  await db.transaction(
    "rw",
    [
      db.departments,
      db.conversations,
      db.deliverables,
      db.allHands,
      db.skills,
      db.files,
      db.profile,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.departments.clear(),
        db.conversations.clear(),
        db.deliverables.clear(),
        db.allHands.clear(),
        db.skills.clear(),
        db.files.clear(),
        db.profile.clear(),
        db.settings.clear(),
      ]);
    },
  );
  seedPromise = undefined;
  await ensureSeeded();
}
