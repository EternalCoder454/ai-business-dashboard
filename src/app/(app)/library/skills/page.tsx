"use client";

import { PageHeader } from "@/components/PageHeader";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Dialog,
  DownloadIcon,
  EditIcon,
  EmptyState,
  Field,
  PlusIcon,
  Select,
  SparkIcon,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { LibraryTabs } from "@/components/LibraryTabs";
import { createRipple } from "@/components/ui/ripple";
import { CEO_ID, COMPANY_ID } from "@/lib/seed";
import {
  buildSkillsBlock,
  estimateTokens,
  parseSkillMarkdown,
  skillFileName,
  skillToMarkdown,
} from "@/lib/skills";
import { useStore } from "@/lib/store";
import type { Skill } from "@/lib/types";

type SkillDraft = Partial<Skill> & { departmentId: string; isNew?: boolean };

const TEMPLATE = `Describe the playbook here, the way you would explain it to a new hire.

1. First step, starting with a verb.
2. Second step.
3. What the finished thing has to contain.

Rules:
- Anything the head must always do.
- Anything the head must never do.`;

export default function SkillsPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <SkillsView />
    </Suspense>
  );
}

function SkillsView() {
  const searchParams = useSearchParams();
  const { allDepartments, skills, createSkill, updateSkill, deleteSkill } = useStore();

  const [filter, setFilter] = useState<string>("all");
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Deep link from a department chat header.
  const requestedDept = searchParams.get("dept");
  useEffect(() => {
    if (requestedDept) setFilter(requestedDept);
  }, [requestedDept]);

  const visible = useMemo(
    () =>
      (filter === "all" ? skills : skills.filter((s) => s.departmentId === filter)).slice(),
    [skills, filter],
  );

  const departmentOf = (id: string) => allDepartments.find((d) => d.id === id);
  const ownerLabel = (id: string) =>
    id === COMPANY_ID
      ? "Every department"
      : departmentOf(id)?.personaName || departmentOf(id)?.name || "Unassigned";
  const countFor = (id: string) => skills.filter((s) => s.departmentId === id).length;

  const save = async () => {
    if (!draft) return;
    if (draft.isNew || !draft.id) {
      await createSkill({
        departmentId: draft.departmentId,
        name: draft.name,
        description: draft.description,
        content: draft.content,
        enabled: draft.enabled ?? true,
      });
    } else {
      await updateSkill(draft.id, {
        departmentId: draft.departmentId,
        name: draft.name?.trim() || "Untitled skill",
        description: draft.description ?? "",
        content: draft.content ?? "",
        enabled: draft.enabled ?? true,
      });
    }
    setDraft(null);
  };

  const download = (skill: Skill) => {
    const blob = new Blob([skillToMarkdown(skill)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = skillFileName(skill);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (files: FileList | File[]) => {
    const target = filter === "all" ? allDepartments[0]?.id ?? CEO_ID : filter;
    let added = 0;
    for (const file of Array.from(files)) {
      const parsed = parseSkillMarkdown(
        await file.text(),
        file.name.replace(/\.(SKILL\.)?md$/i, ""),
      );
      if (!parsed.content.trim()) continue;
      await createSkill({ departmentId: target, ...parsed, enabled: true });
      added += 1;
    }
    setNotice(
      added === 0
        ? "Nothing imported. A skill file needs a body."
        : `Imported ${added} skill${added === 1 ? "" : "s"} into ${
            departmentOf(target)?.name ?? "the first department"
          }.`,
    );
  };

  // Rough gauge of what the skills cost inside the cached system prefix.
  const blockChars = (id: string) =>
    buildSkillsBlock(skills.filter((s) => s.departmentId === id)).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Library"
        title="Skills"
        actions={
          <>
            <Button variant="outlined" onClick={() => fileRef.current?.click()}>
              Import .md
            </Button>
            <Button
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={() =>
                setDraft({
                  isNew: true,
                  departmentId: filter === "all" ? allDepartments[0]?.id ?? CEO_ID : filter,
                  name: "",
                  description: "",
                  content: TEMPLATE,
                  enabled: true,
                })
              }
            >
              New skill
            </Button>
          </>
        }
      />

      <LibraryTabs />

      <div className="filter-row flex-none border-b border-outline-variant px-4 medium:px-6 expanded:px-8 py-3">
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
          All · {skills.length}
        </Chip>
        <Chip
          selected={filter === COMPANY_ID}
          title="Injected into every prompt"
          onClick={() => setFilter(COMPANY_ID)}
        >
          🏢 Company · {countFor(COMPANY_ID)}
        </Chip>
        {allDepartments.map((department) => (
          <Chip
            key={department.id}
            selected={filter === department.id}
            onClick={() => setFilter(department.id)}
          >
            <DepartmentAvatar department={department} size={18} />
            {department.personaName || department.name} · {countFor(department.id)}
          </Chip>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 expanded:px-8 py-6">
        <div className="measure">
          {notice ? (
            <p className="md-label mb-4 rounded-xl bg-low px-4 py-2.5 text-on-variant">
              {notice}
            </p>
          ) : null}

          {filter !== "all" ? (
            <p className="md-label-sm mb-4 text-on-variant/75">
              {countFor(filter)} skill{countFor(filter) === 1 ? "" : "s"} add roughly{" "}
              {Math.round(blockChars(filter) / 3.7).toLocaleString()} tokens to every{" "}
              {departmentOf(filter)?.personaName ?? "department"} request. That block is
              inside the cached prefix, so it is charged in full once and then read back at
              about a tenth of the price.
            </p>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              icon={<SparkIcon className="h-8 w-8" />}
              title="No skills here yet"
              description="Write one after correcting the same head twice."
              action={
                <Button
                  onClick={() =>
                    setDraft({
                      isNew: true,
                      departmentId:
                        filter === "all" ? allDepartments[0]?.id ?? CEO_ID : filter,
                      name: "",
                      description: "",
                      content: TEMPLATE,
                      enabled: true,
                    })
                  }
                >
                  Write one
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {visible.map((skill) => {
                const department = departmentOf(skill.departmentId);
                return (
                  <li key={skill.id}>
                    <Card className={cx("group", !skill.enabled && "opacity-60")}>
                      {/* Stacked until there is room, or the owner chip and the
                          action buttons collide with the name on a narrow card. */}
                      <div className="flex flex-col gap-2 medium:flex-row medium:items-start medium:justify-between medium:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {skill.departmentId === COMPANY_ID ? null : (
                              (() => {
                                const owner = departmentOf(skill.departmentId);
                                return owner ? (
                                  <DepartmentAvatar department={owner} size={20} />
                                ) : null;
                              })()
                            )}
                            <h2 className="md-title truncate">{skill.name}</h2>
                            {skill.departmentId === COMPANY_ID ? (
                              <Chip tone="primary">Every department</Chip>
                            ) : null}
                            {!skill.enabled ? <Chip>Disabled</Chip> : null}
                          </div>
                          <p className="md-label mt-1 text-on-variant">
                            {ownerLabel(skill.departmentId)} ·{" "}
                            {skill.description || "No trigger described"}
                          </p>
                          <p className="md-label-sm mt-1 text-on-variant/75">
                            {skill.enabled
                              ? `Costs about ${estimateTokens(skill.content).toLocaleString()} tokens on every message to ${
                                  skill.departmentId === COMPANY_ID
                                    ? "every department"
                                    : ownerLabel(skill.departmentId)
                                }`
                              : `Off, saving about ${estimateTokens(skill.content).toLocaleString()} tokens a message`}
                          </p>
                        </div>

                        <div className="flex flex-none flex-wrap items-center gap-1">
                          {/*
                            Every control here names its skill. A page of thirty
                            two skills otherwise gives a screen reader thirty two
                            buttons called "Delete", read one after another with
                            nothing to tell them apart. The visible text stays
                            short; only the announced name grows.
                          */}
                          <Chip
                            selected={skill.enabled}
                            ariaLabel={`${skill.enabled ? "Switch off" : "Switch on"} ${skill.name}`}
                            onClick={() =>
                              void updateSkill(skill.id, { enabled: !skill.enabled })
                            }
                          >
                            {skill.enabled ? "On" : "Off"}
                          </Chip>
                          <IconAction label={`Download ${skill.name} as markdown`} onClick={() => download(skill)}>
                            <DownloadIcon className="h-4 w-4" />
                          </IconAction>
                          <IconAction
                            label={`Edit ${skill.name}`}
                            onClick={() => setDraft({ ...skill, departmentId: skill.departmentId })}
                          >
                            <EditIcon className="h-4 w-4" />
                          </IconAction>
                          <IconAction
                            label={`Delete ${skill.name}`}
                            onClick={() => void deleteSkill(skill.id)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </IconAction>
                        </div>
                      </div>

                      <pre className="md-body mt-3 max-h-32 overflow-hidden whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed text-on-variant">
                        {skill.content.slice(0, 420)}
                        {skill.content.length > 420 ? "…" : ""}
                      </pre>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".md,text/markdown"
        multiple
        className="hidden"
        onChange={(event) => {
          // Copied before the input is cleared. `files` is a live view of the
          // input, so resetting the value empties the very list being passed
          // on, and the picker silently did nothing at all.
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void upload(files);
        }}
      />

      <Dialog
        open={Boolean(draft)}
        title={draft?.isNew ? "New skill" : `Edit ${draft?.name || "skill"}`}
        onClose={() => setDraft(null)}
        width="max-w-3xl"
        footer={
          <>
            <Button variant="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save skill</Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" hint="How it is referred to when used.">
                <TextInput
                  value={draft.name ?? ""}
                  autoFocus
                  placeholder="Campaign Brief"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>
              <Field
                label="Owner"
                hint="A company wide skill is added to every head's prompt."
              >
                <Select
                  value={draft.departmentId}
                  onChange={(event) =>
                    setDraft({ ...draft, departmentId: event.target.value })
                  }
                >
                  <option value={COMPANY_ID}>
                    🏢 Company wide (every head)
                  </option>
                  {allDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.personaName || department.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="When to use"
              hint="The line a request is matched against."
            >
              <TextInput
                value={draft.description ?? ""}
                placeholder="Use when asked to plan a campaign, a launch, or any go to market push."
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </Field>

            <Field
              label="SKILL.md body"
              hint="Markdown. Numbered steps and explicit rules."
            >
              <TextArea
                rows={18}
                value={draft.content ?? ""}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                className="font-mono text-[0.8125rem]"
              />
            </Field>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.enabled ?? true}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                className="h-4 w-4 accent-[var(--md-primary)]"
              />
              <span className="md-label">Inject this skill into the system prompt</span>
            </label>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(event) => {
        createRipple(event);
        onClick();
      }}
      title={label}
      aria-label={label}
      className="md-state md-target grid h-9 w-9 place-items-center rounded-full text-on-variant"
    >
      {children}
    </button>
  );
}
