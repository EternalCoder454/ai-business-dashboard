"use client";

import { PageHeader } from "@/components/PageHeader";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { CompanyProfilePanel } from "@/components/settings/CompanyProfilePanel";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";
import { StorageCard } from "@/components/StorageCard";
import { BackupsCard } from "@/components/BackupsCard";
import { ProviderKey } from "@/components/ProviderKey";
import { MODELS, PROVIDERS, modelsFor } from "@/lib/providers";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { CompanyMark } from "@/components/CompanyMark";
import { ACCEPTED_IMAGE_TYPES, fileToAvatar } from "@/lib/images";
import { useEffect, useRef, useState } from "react";
import {
  ArchiveIcon,
  BuildingIcon,
  Button,
  Card,
  Chip,
  DocIcon,
  PuzzleIcon,
  SparkIcon,
  UsersIcon,
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
import { DEPARTMENT_ACCENTS, EFFORT_OPTIONS, WRITING_RULES, departmentAccent } from "@/lib/seed";
import { useStore } from "@/lib/store";
import { useTypedField } from "@/lib/useTypedField";
import { BRAND_COLOURS } from "@/lib/brand";
import type { Department, DepartmentStatus, Effort, SearchShortcut, SidebarSide, ThemeMode } from "@/lib/types";

type DeptDraft = Partial<Department> & { isNew?: boolean };

/** The friendly name for a model id, falling back to the id itself. */
function modelLabel(id: string): string {
  return MODELS.find((model) => model.id === id)?.label ?? id;
}


/** The tabs, in the order somebody sets a business up. */
const TABS = ["company", "profile", "heads", "models", "integrations", "data"] as const;
type TabKey = (typeof TABS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  company: "Company",
  profile: "Company Profile",
  heads: "Heads",
  models: "Models and keys",
  integrations: "Integrations",
  data: "Data",
};

/**
 * One icon per tab, the way the Operator screen does it.
 *
 * Not decoration: below medium only the tab you are on says its name, so on a
 * phone the icon is the whole of what the other five are. Each one is the same
 * icon that already means that thing elsewhere in the panel, so a person who
 * has seen Integrations in the account menu meets the same puzzle piece here.
 */
const TAB_ICON: Record<TabKey, ReactNode> = {
  company: <BuildingIcon className="h-4 w-4" />,
  profile: <DocIcon className="h-4 w-4" />,
  heads: <UsersIcon className="h-4 w-4" />,
  models: <SparkIcon className="h-4 w-4" />,
  integrations: <PuzzleIcon className="h-4 w-4" />,
  data: <ArchiveIcon className="h-4 w-4" />,
};

/** Anything that is not a tab is the first one, rather than a blank screen. */
function tabFrom(asked: string | null): TabKey {
  return TABS.includes(asked as TabKey) ? (asked as TabKey) : "company";
}

function SettingsBody() {
  const {
    settings,
    companyTheme,
    updateSettings,
    departments,
    orchestrator,
    storage,
    serverKey,
    ownSkillsFor,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    workspaceRole,
  } = useStore();

  /*
   * The company's name, its mark and its subtitle are on every screen and on
   * the invitation emails, so they belong to whoever runs the business rather
   * than to whoever happens to be looking at Settings. Hidden here and refused
   * by the server, because a hidden field is not a permission: see
   * ADMIN_ONLY_SETTINGS.
   */
  const isAdmin = workspaceRole === "admin";

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
  /*
   * The writing rules are a document, not an answer.
   *
   * The field showed 453px of 3,212px, so you could read about a seventh of
   * your own house style without dragging inside the box. Growing it to fit
   * would be a card three screens tall next to a Departments card of 691px,
   * which trades one bad layout for another, so it opens on request instead.
   * Closed it keeps the height that matches Departments, which is what the row
   * was arranged around.
   */
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = rulesRef.current;
    if (!el) return;
    if (!rulesOpen) {
      // Back to whatever the class says, rather than the height left behind.
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [rulesOpen, writingRules.value]);
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

  const editable = orchestrator ? [orchestrator, ...departments] : departments;

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
        accent: draft.accent ?? "",
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

  /*
   * Six cards became six tabs, and two screens came in with them.
   *
   * Settings was one column about three thousand pixels tall: the keys, the
   * look of the panel, the business's name, the heads, the writing rules and
   * the data tools, one after another. The Company Profile and the Integrations
   * keys were screens of their own, reached from the account menu. Three places
   * to configure one business, and the longest of them had to be scrolled to
   * find out what was on it.
   *
   * The tab is in the address, so a link to a tab is a link to a tab, the back
   * button walks the tabs rather than leaving, and /profile and /integrations
   * still lead where they always did.
   */
  const tab = tabFrom(useSearchParams().get("tab"));
  const router = useRouter();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader eyebrow="Configuration" title="Settings" />

      {/* The row the Operator screen uses, for the reason it uses it: on a
          phone it moves under a thumb rather than crushing every label. */}
      <div
        className={cx(
          "flex flex-none items-center gap-2 border-b border-outline-variant page-x py-3",
          "overflow-x-auto [scrollbar-width:none] [&>*]:flex-none [&::-webkit-scrollbar]:hidden",
        )}
      >
        {TABS.map((key) => (
          <Chip
            key={key}
            selected={tab === key}
            title={TAB_LABEL[key]}
            ariaLabel={TAB_LABEL[key]}
            onClick={() => router.replace(`/settings?tab=${key}`, { scroll: false })}
          >
            <span className="flex items-center gap-1.5">
              {TAB_ICON[key]}
              {/*
                * On a phone only the selected tab says its name, which is the
                * rule the Operator tabs already follow. A row of six unlabelled
                * icons is a guess with no hover to resolve it, and six labels is
                * the squeeze this avoids. The one you are on is the one that
                * needs naming.
                */}
              <span className={cx(tab === key ? "inline" : "hidden medium:inline")}>
                {TAB_LABEL[key]}
              </span>
            </span>
          </Chip>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 expanded:px-8 py-6">
        <div className="measure-wide flex flex-col gap-5">
          {tab === "company" ? (
            <>
          <Card>
            <h2 className="md-title-lg mb-5">Company</h2>
            {isAdmin ? (
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
            ) : null}

            {/*
              * What the business opens as, which is not what anybody has to
              * read in.
               *
               * This was one workspace setting anybody could change, so one
               * person preferring light moved the whole company into light.
               * It is the starting point now, and each person overrides it for
               * their own browser from the account menu, where they will
               * actually look for it.
               */}
            {isAdmin ? (
              <div className="mt-5">
                <p className="md-label mb-2 text-on-variant">Default theme</p>
                <div className="flex gap-2">
                  {(["dark", "light"] as ThemeMode[]).map((mode) => (
                    <Chip
                      key={mode}
                      selected={companyTheme === mode}
                      onClick={() => void updateSettings({ theme: mode })}
                    >
                      {mode === "dark" ? "Dark" : "Light"}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}

            {/*
              * The brand colour, beside the theme because it is the same kind
              * of decision: what the panel looks like to everybody who opens
              * it. Unlike the theme there is no personal override, since this
              * is the company's colour rather than a reading preference.
              *
              * Seven swatches rather than a picker. The brand is a tenth colour
              * on a circle that already holds nine heads and three status
              * colours, and a hue chosen freely lands on one of them sooner or
              * later. See BRAND_COLOURS.
              */}
            {isAdmin ? (
              <div className="mt-5">
                <p className="md-label mb-2 text-on-variant">Brand colour</p>
                <div className="flex flex-wrap gap-2">
                  {BRAND_COLOURS.map((colour) => (
                    <button
                      key={colour}
                      type="button"
                      onClick={() => void updateSettings({ brand: colour })}
                      aria-pressed={settings.brand === colour}
                      aria-label={colour[0].toUpperCase() + colour.slice(1)}
                      /* Both attributes, because that is what the brand
                         blocks select on. With only data-brand the swatch
                         inherits whatever brand is in force and all seven
                         come out the same colour. */
                      data-theme={settings.theme}
                      data-brand={colour}
                      className={cx(
                        "md-state md-target flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors",
                        settings.brand === colour
                          ? "border-primary text-on-surface"
                          : "border-outline-variant text-on-variant",
                      )}
                    >
                      {/* The swatch takes its colour from the data-brand on the
                          button itself, so each one shows the colour it sets
                          rather than the colour currently in force. */}
                      <span
                        aria-hidden
                        className="h-3.5 w-3.5 flex-none rounded-full bg-primary"
                      />
                      <span className="md-label capitalize">{colour}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
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
            </>
          ) : null}

          {tab === "profile" ? <CompanyProfilePanel /> : null}

          {tab === "heads" ? (
            <>
          <Card className="expanded:self-stretch">
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
                      {department.isOrchestrator ? (
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
                    className="md-state md-target grid h-9 w-9 place-items-center rounded-lg text-on-variant"
                  >
                    <EditIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(department)}
                    disabled={department.isOrchestrator}
                    title={
                      department.isOrchestrator
                        ? "The CEO orchestrator cannot be removed"
                        : "Delete department"
                    }
                    aria-label={`Delete ${department.name}`}
                    className="md-state md-target grid h-9 w-9 place-items-center rounded-lg text-on-variant disabled:pointer-events-none disabled:opacity-25"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="expanded:flex expanded:flex-col expanded:self-stretch">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <h2 className="md-title-lg">House writing rules</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="text" onClick={() => setRulesOpen((was) => !was)}>
                  {rulesOpen ? "Collapse" : "Expand"}
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={writingRules.value === WRITING_RULES}
                  onClick={() => writingRules.replace(WRITING_RULES)}
                >
                  Restore defaults
                </Button>
              </div>
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
              // Named, because it is the one field on this screen with no label
              // beside it: the heading above is a section, not a label, and a
              // screen reader lands on sixteen rows of blank edit box.
              aria-label="House writing rules"
              value={writingRules.value}
              onChange={(event) => writingRules.onChange(event.target.value)}
              // Closed, it fills whatever height the departments card beside it
              // sets, with a floor so it never collapses when there are only a
              // few heads. Open, it is the height of the document and the row
              // stops matching, which is the point of asking for it.
              className={cx(
                "font-mono text-[0.8125rem]",
                rulesOpen
                  ? "h-auto min-h-[21rem] resize-none overflow-hidden"
                  : "expanded:min-h-[21rem] expanded:flex-1",
              )}
              ref={rulesRef}
            />
          </Card>
            </>
          ) : null}

          {tab === "models" ?           <Card className="expanded:col-span-2">
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
              {/*
                * The ceiling, for whoever pays the bill.
                *
                * Effort is one click from the composer now, so somebody can put
                * Max on "what is our phone number" without meaning anything by
                * it. Anything above this comes back as this rather than as an
                * error, since refusing the message would punish somebody for a
                * setting they did not know existed.
                */}
              {isAdmin ? (
                <Field label="Highest effort anyone may use">
                  <Select
                    value={settings.maxEffort ?? ""}
                    onChange={(event) =>
                      void updateSettings({
                        maxEffort: event.target.value as Effort | "",
                      })
                    }
                  >
                    <option value="">No limit</option>
                    {EFFORT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label} and below
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>

            <ul className="flex flex-col gap-3">
              {PROVIDERS.map((provider) => (
                <ProviderKey key={provider.id} provider={provider} />
              ))}
            </ul>
          </Card> : null}

          {tab === "integrations" ? <IntegrationsPanel /> : null}

          {tab === "data" ? (
            <>
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
          <BackupsCard />
              <StorageCard />
            </>
          ) : null}
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
              {/* id when there is one, which is an edit; a head being created
                  has none yet, and a colour picked for a draft would change the
                  moment it was saved under a real id. */}
              <DepartmentAvatar
                department={{
                  id: draft.id,
                  name: draft.name ?? "",
                  personaName: draft.personaName ?? "",
                  avatarUrl: draft.avatarUrl,
                  accent: draft.accent,
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

              {/*
                * The colour, next to the picture, because they are the same
                * decision: what this head looks like everywhere it appears.
                *
                * Only shown while there is no picture. An uploaded photograph
                * is the head's face and the accent is not drawn over it, so
                * offering the choice there would be offering a control with
                * nothing to change.
                *
                * The first swatch is the colour the panel would give it, which
                * is what every head had before this and is still the default.
                */}
              {draft.avatarUrl ? null : (
                <div className="flex w-full flex-wrap items-center gap-1.5">
                  <span className="md-label-sm mr-1 text-on-variant">Colour</span>
                  {[{ key: "", label: "Automatic" }, ...DEPARTMENT_ACCENTS].map((option) => {
                    const chosen = (draft.accent ?? "") === option.key;
                    const shown = departmentAccent(draft.id ?? "", option.key || undefined);
                    return (
                      <button
                        key={option.key || "auto"}
                        type="button"
                        aria-label={option.label}
                        aria-pressed={chosen}
                        title={option.label}
                        onClick={() => setDraft({ ...draft, accent: option.key })}
                        className={cx(
                          "md-state grid h-7 w-7 place-items-center rounded-full border-2 transition-colors",
                          chosen ? "border-on-surface" : "border-transparent",
                        )}
                      >
                        <span
                          aria-hidden
                          className="h-4 w-4 rounded-full"
                          style={{ background: shown.dot }}
                        />
                        {/* The automatic one says so, since a swatch alone
                            cannot tell you it is a default rather than a
                            colour somebody picked. */}
                        {option.key === "" ? (
                          <span className="sr-only">Automatic</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
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

/**
 * Wrapped, because reading the address needs a boundary above it.
 *
 * useSearchParams makes a route impossible to prerender unless it sits inside
 * Suspense. Tasks and Meetings have the same wrapper for the same reason.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsBody />
    </Suspense>
  );
}
