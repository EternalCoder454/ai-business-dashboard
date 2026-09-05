"use client";

import { PageHeader } from "@/components/PageHeader";
import { ProviderKey } from "@/components/ProviderKey";
import { MODELS, PROVIDERS, modelsFor } from "@/lib/providers";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { CompanyMark } from "@/components/CompanyMark";
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
  PlusIcon,
  STATUS_LABEL,
  Select,
  TextArea,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { EFFORT_OPTIONS, WRITING_RULES } from "@/lib/seed";
import { useStore } from "@/lib/store";
import { useTypedField } from "@/lib/useTypedField";
import type { Department, DepartmentStatus, Effort, SearchShortcut, SidebarSide, ThemeMode } from "@/lib/types";

type DeptDraft = Partial<Department> & { isNew?: boolean };

/** The friendly name for a model id, falling back to the id itself. */
function modelLabel(id: string): string {
  return MODELS.find((model) => model.id === id)?.label ?? id;
}

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

  /*
   * The four text fields, each saving once you stop rather than once per key.
   * They wrote through on every keystroke, so one edit of the writing rules was
   * a couple of hundred transactions.
   */
  const companyName = useTypedField(settings.companyName, (value) =>
    void updateSettings({ companyName: value }),
  );
  const companySubtitle = useTypedField(settings.companySubtitle, (value) =>
    void updateSettings({ companySubtitle: value }),
  );
  const companyMark = useTypedField(settings.companyMark, (value) =>
    void updateSettings({ companyMark: value }),
  );
  const writingRules = useTypedField(settings.writingRules, (value) =>
    void updateSettings({ writingRules: value }),
  );

  const [keyDraft, setKeyDraft] = useState(settings.apiKey);
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [draft, setDraft] = useState<DeptDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Department | null>(null);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const markInput = useRef<HTMLInputElement | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

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
        model: draft.model,
        status: draft.status ?? "online",
      });
    }
    setDraft(null);
  };

  /**
   * The export comes from the server now.
   *
   * It used to be built from this browser's own IndexedDB, which stopped
   * holding anything when workspaces moved to the server, so the button went
   * on producing a file, and the file was empty. Anybody who pressed it walked
   * away thinking they had a backup.
   */
  const download = async () => {
    setDataNotice("Building the export…");
    try {
      const response = await fetch("/api/workspace/export");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setDataNotice(body?.error ?? "Could not build the export.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `eterneon-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setDataNotice("Exported.");
    } catch {
      setDataNotice("Could not reach the server.");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 expanded:px-8 py-6">
        <div className="measure-wide grid grid-cols-1 items-start gap-5 expanded:grid-cols-2">
          <Card className="expanded:col-span-2">
            <h2 className="md-title-lg mb-1">API</h2>
            <p className="md-body mb-5 text-on-variant">
              The default every department uses. One can be pointed elsewhere below.
            </p>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* The hint goes under the field rather than into the option
                  text. A select cannot ellipsis, so a long option is simply
                  cut off, and on a phone that cut lands mid-sentence. */}
              <Field
                label="Default model"
                hint={MODELS.find((model) => model.id === settings.model)?.hint}
              >
                <Select
                  value={settings.model}
                  onChange={(event) => void updateSettings({ model: event.target.value })}
                >
                  {PROVIDERS.map((provider) => (
                    <optgroup key={provider.id} label={provider.label}>
                      {modelsFor(provider.id).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field
                label="Reasoning effort"
                hint={EFFORT_OPTIONS.find((option) => option.id === settings.effort)?.hint}
              >
                <Select
                  value={settings.effort}
                  onChange={(event) =>
                    void updateSettings({ effort: event.target.value as Effort })
                  }
                >
                  {EFFORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <ul className="flex flex-col gap-3">
              {PROVIDERS.map((provider) => (
                <ProviderKey key={provider.id} provider={provider} />
              ))}
            </ul>
          </Card>

          {/* ------------------------------------------------ appearance */}
          <Card>
            <h2 className="md-title-lg mb-1">Appearance</h2>


            <div className="flex items-center gap-4">
              <CompanyMark size={56} />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outlined" onClick={() => markInput.current?.click()}>
                  {settings.companyLogoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {settings.companyLogoUrl ? (
                  <Button
                    size="sm"
                    variant="text"
                    // null, not undefined: JSON.stringify drops an undefined value, so
                    // the server never sees the key. It clears on null, which
                    // the write path allows for this field alone.
                    onClick={() => void updateSettings({ companyLogoUrl: null })}
                  >
                    Remove
                  </Button>
                ) : null}
                <input
                  ref={markInput}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    try {
                      await updateSettings({ companyLogoUrl: await fileToAvatar(file) });
                      setMarkError(null);
                    } catch (error) {
                      setMarkError(
                        error instanceof Error ? error.message : "That image could not be read.",
                      );
                    }
                  }}
                />
              </div>
            </div>

            {markError ? <p className="md-label mt-2 text-error">{markError}</p> : null}

            <div className="mt-5 grid grid-cols-1 gap-4 medium:grid-cols-3">
              <Field label="Letters">
                <TextInput
                  value={companyMark.value}
                  maxLength={2}
                  className="text-center uppercase"
                  onChange={(event) => companyMark.onChange(event.target.value.toUpperCase())}
                />
              </Field>

              <Field label="Navigation side">
                <Select
                  value={settings.sidebarSide}
                  onChange={(event) =>
                    void updateSettings({ sidebarSide: event.target.value as SidebarSide })
                  }
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </Select>
              </Field>

              <Field
                label="Search key"
              >
                <Select
                  value={settings.searchShortcut}
                  onChange={(event) =>
                    void updateSettings({
                      searchShortcut: event.target.value as SearchShortcut,
                    })
                  }
                >
                  <option value="slash">Slash</option>
                  <option value="k">K</option>
                  <option value="none">Off</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="md-title-lg mb-5">Company</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <TextInput
                  value={companyName.value}
                  onChange={(event) => companyName.onChange(event.target.value)}
                />
              </Field>
              <Field label="Subtitle">
                <TextInput
                  value={companySubtitle.value}
                  onChange={(event) => companySubtitle.onChange(event.target.value)}
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

          <Card className="expanded:col-span-2">
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
                  {department.model ? (
                    <Chip title={`Uses ${modelLabel(department.model)} rather than the default`}>
                      {modelLabel(department.model)}
                    </Chip>
                  ) : null}
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

          <Card className="expanded:col-span-2">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <h2 className="md-title-lg">House writing rules</h2>
              <Button
                size="sm"
                variant="outlined"
                disabled={writingRules.value === WRITING_RULES}
                onClick={() => writingRules.replace(WRITING_RULES)}
              >
                Restore defaults
              </Button>
            </div>
            <p className="md-body mb-4 text-on-variant">
              Injected last into every department prompt, so they beat any department
              prompt or skill that disagrees. Roughly{" "}
              {Math.round(writingRules.value.length / 3.7).toLocaleString()} tokens,
              charged once per cache write and then read back at about a tenth. Trim them
              if replies start feeling stiff: a long rule list constrains voice as well as
              format.
            </p>
            <TextArea
              rows={16}
              value={writingRules.value}
              onChange={(event) => writingRules.onChange(event.target.value)}
              className="font-mono text-[0.8125rem]"
            />
          </Card>

          <Card>
            <h2 className="md-title-lg mb-1">Data</h2>

            <p className="md-body mb-3 text-on-variant">
              Everything this business has written, as one file: heads, conversations,
              deliverables, the wiki, the profile. The model keys are left out.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outlined"
                icon={<DownloadIcon className="h-4 w-4" />}
                onClick={download}
              >
                Export data
              </Button>
            </div>

            {/* Import, restore-defaults, and reset used to live here. All three
                wrote to this browser's own IndexedDB, which stopped being where
                the workspace lived; they went on succeeding and changing
                nothing, and the reset dialog said "this cannot be undone" about
                an action that did not happen. A button that lies is worse than
                a button that is missing. */}

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

            <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Role title"
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
              <Field label="Model">
                <Select
                  value={draft.model ?? ""}
                  onChange={(event) =>
                    // Empty means follow the workspace default rather than
                    // pinning this department to whatever it happens to be now.
                    setDraft({ ...draft, model: event.target.value || undefined })
                  }
                >
                  <option value="">
                    Workspace default ({modelLabel(settings.model)})
                  </option>
                  {PROVIDERS.map((provider) => (
                    <optgroup key={provider.id} label={provider.label}>
                      {modelsFor(provider.id).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Personality"
            >
              <TextArea
                rows={4}
                value={draft.persona ?? ""}
                placeholder="You are calm, exacting, and quietly opinionated…"
                onChange={(event) => setDraft({ ...draft, persona: event.target.value })}
              />
            </Field>

            <Field label="System prompt"
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

    </div>
  );
}
