"use client";

import { useEffect, useState } from "react";
import { PROJECT_ACCENTS } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { Project, ProjectStatus } from "@/lib/types";
import { Button, Dialog, Field, Select, TextArea, TextInput, cx } from "./ui";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  shipped: "Shipped",
  archived: "Archived",
};

/**
 * One dialog for both creating and editing, because the fields are identical
 * and two near-copies would drift apart the first time one gained a field.
 */
export function ProjectDialog({
  open,
  project,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** Omit to create. */
  project?: Project;
  onClose: () => void;
  onCreated?: (project: Project) => void;
}) {
  const { createProject, updateProject } = useStore();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [accent, setAccent] = useState<string>(PROJECT_ACCENTS[0].key);
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset on open rather than on mount, since the dialog stays mounted.
  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setSummary(project?.summary ?? "");
    setStatus(project?.status ?? "active");
    setAccent(project?.accent ?? PROJECT_ACCENTS[0].key);
    setDueOn(project?.dueOn ?? "");
  }, [open, project]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const patch = { name: name.trim(), summary, status, accent, dueOn };
    if (project) {
      await updateProject(project.id, patch);
    } else {
      const created = await createProject(patch);
      onCreated?.(created);
    }
    setBusy(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project ? "Edit project" : "New project"}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || busy} onClick={save}>
            {project ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {project ? null : (
          <p className="md-body text-on-variant">
            A project gathers work from any department. Nothing is moved out of the
            departments it came from.
          </p>
        )}
        <Field label="Name">
          <TextInput
            value={name}
            autoFocus
            placeholder="What this piece of work is called"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
          />
        </Field>

        <Field label="Summary" hint="What it is, and what finishing looks like.">
          <TextArea
            value={summary}
            rows={3}
            placeholder="What finishing it looks like, and by when."
            onChange={(event) => setSummary(event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            >
              {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((value) => (
                <option key={value} value={value}>
                  {PROJECT_STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Target date" hint="Optional.">
            <TextInput
              type="date"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Colour" hint="So it is recognisable in a list at a glance.">
          <div className="flex flex-wrap gap-2">
            {PROJECT_ACCENTS.map((option) => (
              <button
                key={option.key}
                type="button"
                title={option.label}
                aria-label={option.label}
                aria-pressed={accent === option.key}
                onClick={() => setAccent(option.key)}
                className={cx(
                  "h-9 w-9 rounded-full border-2 transition-transform md-state",
                  accent === option.key
                    ? "border-on-surface scale-105"
                    : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: option.dot }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
