"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { db, ensureSeeded, newId } from "./db";
import { CEO_ID, COMPANY_ID, DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./seed";
import type {
  AllHandsRun,
  CompanyProfile,
  Conversation,
  Deliverable,
  DeliverableStatus,
  Department,
  Message,
  Settings,
  Skill,
} from "./types";

interface StoreValue {
  ready: boolean;
  /** Department heads only. The CEO is excluded. */
  departments: Department[];
  /** Every department including the CEO, for lookups. */
  allDepartments: Department[];
  ceo: Department | undefined;
  conversations: Conversation[];
  deliverables: Deliverable[];
  allHandsRuns: AllHandsRun[];
  skills: Skill[];
  profile: CompanyProfile;
  settings: Settings;

  getDepartment: (id: string) => Department | undefined;
  /**
   * Every skill a head follows: their own, plus the company wide ones. Sorted
   * so company skills come first, since they set the ground rules.
   */
  skillsFor: (departmentId: string) => Skill[];
  /** Only the skills owned by that department, for counts and the Skills page. */
  ownSkillsFor: (departmentId: string) => Skill[];

  createSkill: (input: Partial<Skill> & { departmentId: string }) => Promise<Skill>;
  updateSkill: (id: string, patch: Partial<Skill>) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  conversationsFor: (departmentId: string) => Conversation[];

  updateSettings: (patch: Partial<Omit<Settings, "id">>) => Promise<void>;
  updateProfile: (patch: Partial<CompanyProfile>) => Promise<void>;

  createDepartment: (input: Partial<Department>) => Promise<Department>;
  updateDepartment: (id: string, patch: Partial<Department>) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;

  createConversation: (departmentId: string, title?: string) => Promise<Conversation>;
  updateConversation: (id: string, patch: Partial<Conversation>) => Promise<void>;
  setMessages: (id: string, messages: Message[]) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  saveAllHandsRun: (run: AllHandsRun) => Promise<void>;
  deleteAllHandsRun: (id: string) => Promise<void>;

  createDeliverable: (input: Partial<Deliverable>) => Promise<Deliverable>;
  updateDeliverable: (id: string, patch: Partial<Deliverable>) => Promise<void>;
  deleteDeliverable: (id: string) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
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
  }, []);

  const allDepartments = useLiveQuery(
    async () => (db ? db.departments.orderBy("order").toArray() : []),
    [seeded],
    undefined,
  );

  const conversations = useLiveQuery(
    async () =>
      db ? db.conversations.orderBy("updatedAt").reverse().toArray() : [],
    [seeded],
    undefined,
  );

  const deliverables = useLiveQuery(
    async () =>
      db ? db.deliverables.orderBy("updatedAt").reverse().toArray() : [],
    [seeded],
    undefined,
  );

  const skills = useLiveQuery(
    async () => (db ? db.skills.orderBy("updatedAt").reverse().toArray() : []),
    [seeded],
    undefined,
  );

  const allHandsRuns = useLiveQuery(
    async () => (db ? db.allHands.orderBy("updatedAt").reverse().toArray() : []),
    [seeded],
    undefined,
  );

  const storedProfile = useLiveQuery(
    async () => (db ? db.profile.get("profile") : undefined),
    [seeded],
    undefined,
  );

  const storedSettings = useLiveQuery(
    async () => (db ? db.settings.get("app") : undefined),
    [seeded],
    undefined,
  );

  const settings: Settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...(storedSettings ?? {}) }),
    [storedSettings],
  );

  const profile: CompanyProfile = useMemo(() => {
    if (!storedProfile) return DEFAULT_PROFILE;
    const { id: _id, ...rest } = storedProfile;
    return { ...DEFAULT_PROFILE, ...rest };
  }, [storedProfile]);

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

  const departmentList = allDepartments ?? [];

  const value = useMemo<StoreValue>(() => {
    const conversationList = conversations ?? [];

    const requireDb = () => {
      if (!db) throw new Error("Database is only available in the browser.");
      return db;
    };

    return {
      ready: seeded && allDepartments !== undefined,
      allDepartments: departmentList,
      departments: departmentList.filter((d) => !d.isCeo),
      ceo: departmentList.find((d) => d.isCeo) ?? departmentList.find((d) => d.id === CEO_ID),
      conversations: conversationList,
      deliverables: deliverables ?? [],
      allHandsRuns: allHandsRuns ?? [],
      skills: skills ?? [],
      profile,
      settings,

      getDepartment: (id: string) => departmentList.find((d) => d.id === id),

      skillsFor: (departmentId: string) => {
        const all = skills ?? [];
        return [
          ...all.filter((skill) => skill.departmentId === COMPANY_ID),
          ...all.filter((skill) => skill.departmentId === departmentId),
        ];
      },

      ownSkillsFor: (departmentId: string) =>
        (skills ?? []).filter((skill) => skill.departmentId === departmentId),

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
        await requireDb().skills.put(skill);
        return skill;
      },

      updateSkill: async (id, patch) => {
        await requireDb().skills.update(id, { ...patch, updatedAt: Date.now() });
      },

      deleteSkill: async (id) => {
        await requireDb().skills.delete(id);
      },

      conversationsFor: (departmentId: string) =>
        conversationList.filter((c) => c.departmentId === departmentId),

      updateSettings: async (patch) => {
        await requireDb().settings.put({ ...settings, ...patch, id: "app" });
      },

      updateProfile: async (patch) => {
        await requireDb().profile.put({ id: "profile", ...profile, ...patch });
      },

      createDepartment: async (input) => {
        const database = requireDb();
        const maxOrder = departmentList.reduce((max, d) => Math.max(max, d.order), 0);
        const department: Department = {
          id: input.id ?? newId("dept"),
          name: input.name?.trim() || "New Department",
          emoji: input.emoji || "🏢",
          personaName: input.personaName?.trim() || "",
          persona: input.persona ?? "",
          roleTitle: input.roleTitle?.trim() || `Head of ${input.name?.trim() || "New Department"}`,
          systemPrompt: input.systemPrompt ?? "",
          skillCount: input.skillCount ?? 0,
          status: input.status ?? "online",
          order: input.order ?? maxOrder + 1,
        };
        await database.departments.put(department);
        return department;
      },

      updateDepartment: async (id, patch) => {
        await requireDb().departments.update(id, patch);
      },

      deleteDepartment: async (id) => {
        const database = requireDb();
        await database.transaction(
          "rw",
          database.departments,
          database.conversations,
          async () => {
            await database.departments.delete(id);
            await database.conversations.where("departmentId").equals(id).delete();
          },
        );
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
        await requireDb().conversations.put(conversation);
        return conversation;
      },

      updateConversation: async (id, patch) => {
        await requireDb().conversations.update(id, {
          ...patch,
          updatedAt: Date.now(),
        });
      },

      setMessages: async (id, messages) => {
        await requireDb().conversations.update(id, {
          messages,
          updatedAt: Date.now(),
        });
      },

      deleteConversation: async (id) => {
        await requireDb().conversations.delete(id);
      },

      saveAllHandsRun: async (run) => {
        await requireDb().allHands.put(run);
      },

      deleteAllHandsRun: async (id) => {
        await requireDb().allHands.delete(id);
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
        await requireDb().deliverables.put(deliverable);
        return deliverable;
      },

      updateDeliverable: async (id, patch) => {
        await requireDb().deliverables.update(id, {
          ...patch,
          updatedAt: Date.now(),
        });
      },

      deleteDeliverable: async (id) => {
        await requireDb().deliverables.delete(id);
      },
    };
  }, [
    seeded,
    allDepartments,
    departmentList,
    conversations,
    deliverables,
    allHandsRuns,
    skills,
    profile,
    settings,
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
