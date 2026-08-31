"use client";

import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { ACCEPTED_IMAGE_TYPES, fileToAvatar } from "@/lib/images";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Dialog,
  DownloadIcon,
  EditIcon,
  Field,
  PageHeader,
  PlusIcon,
  STATUS_LABEL,
  Select,
  StatusDot,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { AccountCard } from "@/components/AccountCard";
import { WorkspacePicker } from "@/components/WorkspacePicker";
import { exportAll, importAll, resetAll, restoreDefaultDepartments } from "@/lib/db";
import { EFFORT_OPTIONS, MODEL_OPTIONS, WRITING_RULES } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { Department, DepartmentStatus, Effort, ThemeMode } from "@/lib/types";

type DeptDraft = Partial<Department> & { isNew?: boolean };

export default function SettingsPage() {
  const {
    settings,
    updateSettings,
    departments,
    ceo,
    storage,
    serverKey,
    ownSkillsFor,
    createDepartment,
    updateDepartment,
    deleteDepartment,
  } = useStore();

  const [keyDraft, setKeyDraft] = useState(settings.apiKey);
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [draft, setDraft] = useState<DeptDraft | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Department | null>(null);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // The credentials are read from this browser a moment after mount, so the
  // first render sees an empty key. Adopt the real one when it lands, but
  // never over the top of something being typed.
  useEffect(() => {
    if (!keyTouched) setKeyDraft(settings.apiKey);
  }, [settings.apiKey, keyTouched]);

  const editable = ceo ? [ceo, ...departments] : departments;

  const saveDepartment = async () => {
    if (!draft) return;
    if (draft.isNew) {
      await createDepartment(draft);
    } else if (draft.id) {
      await updateDepartment(draft.id, {
        name: draft.name?.trim() || "Untitled",
        avatarUrl: draft.avatarUrl,
        roleTitle: draft.roleTitle?.trim() || "Department Head",
        personaName: draft.personaName?.trim() ?? "",
        persona: draft.persona ?? "",
        systemPrompt: draft.systemPrompt ?? "",
        status: draft.status ?? "online",
      });
    }
    setDraft(null);
  };

  const download = async () => {
    const payload = await exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `eterneon-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDataNotice("Exported.");
  };

  const upload = async (file: File) => {
    try {
      const counts = await importAll(JSON.parse(await file.text()));
      setDataNotice(
        `Imported ${counts.departments} departments, ${counts.conversations} conversations, ${counts.deliverables} deliverables.`,
      );
    } catch (error) {
      setDataNotice(
        error instanceof Error ? `Import failed. ${error.message}` : "Import failed.",
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description={
          storage === "hosted"
            ? "Departments, conversations, and deliverables sync to your account. Your API key is the exception: it stays in this browser and is never written to the database."
            : "Everything here lives in this browser only. Departments, conversations, and your API key are stored on this machine."
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 expanded:px-8 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <Card>
            <h2 className="md-title-lg mb-1">Anthropic API</h2>

            {serverKey ? (
              <>
                <p className="md-body text-on-variant">
                  The server holds the key, so there is nothing to enter here. Every
                  device signed into this workspace can chat straight away, including
                  this one, and the key never reaches a browser.
                </p>
                <p className="md-label-sm mt-3 text-on-variant/75">
                  It is set as{" "}
                  <code className="font-mono text-[0.85em]">ANTHROPIC_API_KEY</code> in
                  the deployment&apos;s environment. A key typed into a browser is ignored
                  while that is true, which is why this field is hidden rather than empty.
                </p>
              </>
            ) : (
              <>
                <p className="md-body mb-5 text-on-variant">
                  Your key is kept in this browser and sent with each request to this
                  app&apos;s own{" "}
                  <code className="font-mono text-[0.85em]">/api/chat</code> route, which
                  calls Anthropic server-side. It is never written to the database, which
                  is also why it does not follow you to another device. Setting{" "}
                  <code className="font-mono text-[0.85em]">ANTHROPIC_API_KEY</code> on
                  the server instead covers every device at once and takes precedence over
                  anything entered here.
                </p>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="API key">
                <TextInput
                  type={keyVisible ? "text" : "password"}
                  value={keyDraft}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-ant-…"
                  onChange={(event) => {
                    setKeyDraft(event.target.value);
                    setKeyTouched(true);
                  }}
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button
                  variant="outlined"
                  onClick={() => setKeyVisible((value) => !value)}
                >
                  {keyVisible ? "Hide" : "Show"}
                </Button>
                <Button
                  disabled={!keyTouched}
                  onClick={async () => {
                    await updateSettings({ apiKey: keyDraft.trim() });
                    setKeyTouched(false);
                  }}
                >
                  Save key
                </Button>
              </div>
            </div>

                <WorkspacePicker />
              </>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Model" hint="Applies to every department.">
                <Select
                  value={settings.model}
                  onChange={(event) => void updateSettings({ model: event.target.value })}
                >
                  {MODEL_OPTIONS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} ({model.hint})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Reasoning effort"
                hint="Higher effort thinks longer and costs more per reply."
              >
                <Select
                  value={settings.effort}
                  onChange={(event) =>
                    void updateSettings({ effort: event.target.value as Effort })
                  }
                >
                  {EFFORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} ({option.hint})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="md-title-lg mb-5">Company</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <TextInput
                  value={settings.companyName}
                  onChange={(event) =>
                    void updateSettings({ companyName: event.target.value })
                  }
                />
              </Field>
              <Field label="Subtitle" hint="Shown under the name in the sidebar.">
                <TextInput
                  value={settings.companySubtitle}
                  onChange={(event) =>
                    void updateSettings({ companySubtitle: event.target.value })
                  }
                />
              </Field>
            </div>

            <div className="mt-5">
              <p className="md-label mb-2 text-on-variant">Theme</p>
              <div className="flex gap-2">
                {(["dark", "light"] as ThemeMode[]).map((mode) => (
                  <Chip
                    key={mode}
                    selected={settings.theme === mode}
                    onClick={() => void updateSettings({ theme: mode })}
                  >
                    {mode === "dark" ? "Dark" : "Light"}
                  </Chip>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="md-title-lg">Departments</h2>
                <p className="md-body mt-1 text-on-variant">
                  Each one gets its own system prompt and its own conversation history.
                </p>
              </div>
              <Button
                icon={<PlusIcon className="h-4 w-4" />}
                onClick={() =>
                  setDraft({
                    isNew: true,
                    name: "",
                    personaName: "",
                    persona: "",
                    roleTitle: "",
                    systemPrompt: "",
                    status: "online",
                  })
                }
              >
                Add
              </Button>
            </div>

            <ul className="divide-y divide-[var(--md-outline-variant)]">
              {editable.map((department) => (
                <li key={department.id} className="flex items-center gap-3 py-3">
                  <DepartmentAvatar department={department} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="md-title truncate">
                      {department.name}
                      {department.isCeo ? (
                        <span className="md-label-sm ml-2 rounded-md bg-primary-container px-1.5 py-0.5 text-on-primary-container">
                          Orchestrator
                        </span>
                      ) : null}
                    </p>
                    <p className="md-label truncate text-on-variant">
                      {department.personaName ? `${department.personaName}, ` : ""}
                      {department.roleTitle} · {ownSkillsFor(department.id).length} skills
                    </p>
                  </div>
                  <span className="md-label-sm flex items-center gap-1.5 text-on-variant">
                    <StatusDot status={department.status} animate={false} />
                    {STATUS_LABEL[department.status]}
                  </span>
                  <button
                    onClick={() => setDraft({ ...department })}
                    title="Edit"
                    aria-label={`Edit ${department.name}`}
                    className="md-state md-target grid h-9 w-9 place-items-center rounded-full text-on-variant"
                  >
                    <EditIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(department)}
                    disabled={department.isCeo}
                    title={
                      department.isCeo
                        ? "The CEO orchestrator cannot be removed"
                        : "Delete department"
                    }
                    aria-label={`Delete ${department.name}`}
                    className="md-state md-target grid h-9 w-9 place-items-center rounded-full text-on-variant disabled:pointer-events-none disabled:opacity-25"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <h2 className="md-title-lg">House writing rules</h2>
              <Button
                size="sm"
                variant="outlined"
                disabled={settings.writingRules === WRITING_RULES}
                onClick={() => void updateSettings({ writingRules: WRITING_RULES })}
              >
                Restore defaults
              </Button>
            </div>
            <p className="md-body mb-4 text-on-variant">
              Injected last into every department prompt, so they beat any department
              prompt or skill that disagrees. Roughly{" "}
              {Math.round(settings.writingRules.length / 3.7).toLocaleString()} tokens,
              charged once per cache write and then read back at about a tenth. Trim them
              if replies start feeling stiff: a long rule list constrains voice as well as
              format.
            </p>
            <TextArea
              rows={16}
              value={settings.writingRules}
              onChange={(event) => void updateSettings({ writingRules: event.target.value })}
              className="font-mono text-[0.8125rem]"
            />
          </Card>

          <AccountCard />

          <Card>
            <h2 className="md-title-lg mb-1">Data</h2>
            <p className="md-body mb-5 text-on-variant">
              Exports include departments, conversations, deliverables, and your company
              profile. The API key is deliberately left out of the file.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outlined"
                icon={<DownloadIcon className="h-4 w-4" />}
                onClick={download}
              >
                Export data
              </Button>
              <Button variant="outlined" onClick={() => fileRef.current?.click()}>
                Import data
              </Button>
              <Button
                variant="outlined"
                onClick={async () => {
                  await restoreDefaultDepartments();
                  setDataNotice("Built-in departments restored to their shipped prompts.");
                }}
              >
                Restore default departments
              </Button>
              <Button variant="danger" onClick={() => setConfirmReset(true)}>
                Reset everything
              </Button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />

            {dataNotice ? (
              <p className="md-label mt-4 text-on-variant">{dataNotice}</p>
            ) : null}
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(draft)}
        title={draft?.isNew ? "New department" : `Edit ${draft?.name ?? "department"}`}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveDepartment}>Save</Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <DepartmentAvatar
                department={{
                  name: draft.name ?? "",
                  personaName: draft.personaName ?? "",
                  avatarUrl: draft.avatarUrl,
                }}
                size={64}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outlined"
                  onClick={() => avatarInput.current?.click()}
                >
                  {draft.avatarUrl ? "Replace picture" : "Upload picture"}
                </Button>
                {draft.avatarUrl ? (
                  <Button
                    size="sm"
                    variant="text"
                    onClick={() => setDraft({ ...draft, avatarUrl: undefined })}
                  >
                    Remove
                  </Button>
                ) : null}
                <input
                  ref={avatarInput}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    try {
                      setDraft((current) =>
                        current ? { ...current, avatarUrl: undefined } : current,
                      );
                      const avatarUrl = await fileToAvatar(file);
                      setDraft((current) => (current ? { ...current, avatarUrl } : current));
                      setAvatarError(null);
                    } catch (error) {
                      setAvatarError(
                        error instanceof Error ? error.message : "That image could not be read.",
                      );
                    }
                  }}
                />
              </div>
            </div>

            {avatarError ? (
              <p className="md-label text-error">{avatarError}</p>
            ) : null}

            <div className="grid gap-4 medium:grid-cols-2">
              <Field label="Department">
                <TextInput
                  value={draft.name ?? ""}
                  autoFocus
                  placeholder="Customer Success"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>
              <Field label="Head's name">
                <TextInput
                  value={draft.personaName ?? ""}
                  placeholder="Marisol"
                  onChange={(event) =>
                    setDraft({ ...draft, personaName: event.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Role title"
                hint="Skill count is no longer typed in. It comes from the SKILL.md files on the Skills page."
              >
                <TextInput
                  value={draft.roleTitle ?? ""}
                  placeholder="Head of Customer Success"
                  onChange={(event) =>
                    setDraft({ ...draft, roleTitle: event.target.value })
                  }
                />
              </Field>
              <Field label="Status">
                <Select
                  value={draft.status ?? "online"}
                  onChange={(event) =>
                    setDraft({ ...draft, status: event.target.value as DepartmentStatus })
                  }
                >
                  {(["online", "busy", "offline"] as DepartmentStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Personality"
              hint="Temperament and voice. This is injected ahead of the system prompt, so it colours how they write rather than what they know."
            >
              <TextArea
                rows={4}
                value={draft.persona ?? ""}
                placeholder="You are calm, exacting, and quietly opinionated…"
                onChange={(event) => setDraft({ ...draft, persona: event.target.value })}
              />
            </Field>

            <Field
              label="System prompt"
              hint="Scope it tightly. The Company Profile and the shared house rules are appended automatically."
            >
              <TextArea
                rows={14}
                value={draft.systemPrompt ?? ""}
                placeholder="You are the Head of…"
                onChange={(event) =>
                  setDraft({ ...draft, systemPrompt: event.target.value })
                }
                className="font-mono text-[0.8125rem]"
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name ?? ""}?`}
        onClose={() => setPendingDelete(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="text" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (pendingDelete) await deleteDepartment(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          This removes the department and every conversation in it. Deliverables tagged to
          it are kept, but will show as unassigned.
        </p>
      </Dialog>

      <Dialog
        open={confirmReset}
        title="Reset everything?"
        onClose={() => setConfirmReset(false)}
        width="max-w-md"
        footer={
          <>
            <Button variant="text" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await resetAll();
                setConfirmReset(false);
                window.location.href = "/";
              }}
            >
              Erase and re-seed
            </Button>
          </>
        }
      >
        <p className={cx("md-body text-on-variant")}>
          Every department, conversation, deliverable, and profile field goes back to the
          defaults. Export first if you want a copy. This cannot be undone.
        </p>
      </Dialog>
    </div>
  );
}
