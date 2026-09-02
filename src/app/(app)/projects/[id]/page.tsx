"use client";

import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PROJECT_DEFAULT_ICON } from "@/components/ProjectBits";
import { PROJECT_STATUS_LABEL, ProjectDialog } from "@/components/ProjectDialog";
import {
  Button,
  Card,
  Chip,
  Dialog,
  Field,
  EditIcon,
  EmptyState,
  TextInput,
  TrashIcon,
  cx,
} from "@/components/ui";
import { conversationHref, formatRelativeTime } from "@/lib/routes";
import { projectAccent } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { Conversation, Deliverable, Department, LibraryFile } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const {
    ready,
    getProject,
    projectContents,
    allDepartments,
    deleteProject,
    setConversationProject,
  } = useStore();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const project = getProject(projectId);
  const contents = projectContents(projectId);

  /**
   * Grouped by department, because the whole point of a project is seeing which
   * parts of the company are involved. A flat list by date would hide that.
   */
  const byDepartment = useMemo(() => {
    const groups = new Map<
      string,
      { department: Department | undefined; conversations: Conversation[]; deliverables: Deliverable[] }
    >();

    const slot = (departmentId: string) => {
      let found = groups.get(departmentId);
      if (!found) {
        found = {
          department: allDepartments.find((d) => d.id === departmentId),
          conversations: [],
          deliverables: [],
        };
        groups.set(departmentId, found);
      }
      return found;
    };

    for (const row of contents.conversations) slot(row.departmentId).conversations.push(row);
    for (const row of contents.deliverables) slot(row.departmentId).deliverables.push(row);

    return [...groups.values()].sort(
      (a, b) => (a.department?.order ?? 999) - (b.department?.order ?? 999),
    );
  }, [contents.conversations, contents.deliverables, allDepartments]);

  if (!ready) return <div className="flex-1" />;

  if (!project) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader eyebrow="Work" title="Project not found" />
        <div className="px-4 py-6 medium:px-6 expanded:px-8">
          <EmptyState
            icon={PROJECT_DEFAULT_ICON}
            title="This project is gone"
            description="Anything it held is untouched and still sits with its department."
            action={<Button onClick={() => router.push("/projects")}>Back to projects</Button>}
          />
        </div>
      </div>
    );
  }

  const accent = projectAccent(project.accent);
  const total =
    contents.conversations.length + contents.deliverables.length + contents.files.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Project"
        title={project.name}
        description={project.summary || undefined}
        actions={
          <>
            <Button
              variant="outlined"
              icon={<EditIcon className="h-4 w-4" />}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              variant="text"
              icon={<TrashIcon className="h-4 w-4" />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        <div className="measure flex flex-col gap-5">

          <div className="flex flex-wrap items-center gap-2">
            <Chip>
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: accent.dot }}
              />
              {PROJECT_STATUS_LABEL[project.status]}
            </Chip>
            {project.dueOn ? <Chip tone="warning">Due {project.dueOn}</Chip> : null}
            <Chip>{byDepartment.length} department{byDepartment.length === 1 ? "" : "s"}</Chip>
            <span className="md-label-sm text-on-variant/75">
              Updated {formatRelativeTime(project.updatedAt)}
            </span>
          </div>

          {total === 0 ? (
            <EmptyState
              icon={PROJECT_DEFAULT_ICON}
              title="Nothing filed here yet"
              description="Use the project chip in a conversation header to file it here."
            />
          ) : null}

          {byDepartment.map((group) => (
            <Card key={group.department?.id ?? "unknown"}>
              <div className="mb-4 flex items-center gap-2.5">
                {group.department ? (
                  <DepartmentAvatar department={group.department} size={32} />
                ) : (
                  <span className="h-8 w-8 flex-none rounded-full bg-high" />
                )}
                <div className="min-w-0">
                  <p className="md-title truncate">
                    {group.department?.name ?? "Deleted department"}
                  </p>
                  {group.department ? (
                    <p className="md-label-sm text-on-variant">
                      {group.department.personaName}, {group.department.roleTitle}
                    </p>
                  ) : null}
                </div>
              </div>

              {group.conversations.length ? (
                <ul className="flex flex-col gap-1">
                  {group.conversations.map((conversation) => (
                    <li key={conversation.id} className="flex items-center gap-2">
                      <Link
                        href={conversationHref(conversation.departmentId, conversation.id)}
                        className={cx(
                          "md-state min-w-0 flex-1 rounded-lg px-2.5 py-2 transition-colors",
                        )}
                      >
                        <span className="md-body block truncate">{conversation.title}</span>
                        <span className="md-label-sm text-on-variant/75">
                          {conversation.messages.length} message
                          {conversation.messages.length === 1 ? "" : "s"} ·{" "}
                          {formatRelativeTime(conversation.updatedAt)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        title="Remove from this project"
                        aria-label={`Remove ${conversation.title} from this project`}
                        onClick={() => void setConversationProject(conversation.id, undefined)}
                        className="md-state md-label-sm flex-none rounded-lg px-2 py-1 text-on-variant/75 transition-colors"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {group.deliverables.length ? (
                <div className={cx(group.conversations.length > 0 && "mt-4 border-t border-outline-variant pt-4")}>
                  <p className="md-label-sm mb-2 text-on-variant">Deliverables</p>
                  <ul className="flex flex-col gap-1.5">
                    {group.deliverables.map((deliverable) => (
                      <li key={deliverable.id} className="flex items-center gap-2">
                        <span className="md-body min-w-0 flex-1 truncate">
                          {deliverable.title}
                        </span>
                        <Chip
                          tone={deliverable.status === "done" ? "success" : "neutral"}
                        >
                          {deliverable.status}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ))}

          {contents.files.length ? (
            <Card>
              <p className="md-title mb-3">Files</p>
              <ul className="flex flex-col gap-1.5">
                {contents.files.map((file: LibraryFile) => (
                  <li key={file.id} className="flex items-center gap-2">
                    <span className="md-body min-w-0 flex-1 truncate">{file.name}</span>
                    <Chip>{file.kind}</Chip>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <ProjectDialog open={editing} project={project} onClose={() => setEditing(false)} />

      <Dialog
        open={confirmDelete}
        title={`Delete ${project.name}?`}
        onClose={() => setConfirmDelete(false)}
        width="max-w-md"
        footer={
          <>
            <Button variant="text" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await deleteProject(project.id);
                setConfirmDelete(false);
                router.push("/projects");
              }}
            >
              Delete project
            </Button>
          </>
        }
      >
        <p className="md-body text-on-variant">
          The {total} item{total === 1 ? "" : "s"} filed here will not be deleted. They stay
          with their departments and simply stop belonging to a project. Only the grouping
          goes.
        </p>
      </Dialog>
    </div>
  );
}
