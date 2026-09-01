"use client";

import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { useMemo, useState } from "react";
import { PROJECT_DEFAULT_ICON, ProjectMeter } from "@/components/ProjectBits";
import { PROJECT_STATUS_LABEL, ProjectDialog } from "@/components/ProjectDialog";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  PlusIcon,
  cx,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/routes";
import { projectAccent } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";

const FILTERS: { key: ProjectStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "shipped", label: "Shipped" },
  { key: "archived", label: "Archived" },
];

interface Tally {
  conversations: number;
  deliverables: number;
  files: number;
  departments: Set<string>;
}

export default function ProjectsPage() {
  const { ready, projects, conversations, deliverables, files, allDepartments } = useStore();
  const [filter, setFilter] = useState<ProjectStatus | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * Counted in one pass over each collection rather than per project, so a
   * workspace with forty projects does not walk every conversation forty times.
   */
  const tallies = useMemo(() => {
    const map = new Map<string, Tally>();
    const bucket = (id: string | undefined): Tally | null => {
      if (!id) return null;
      let found = map.get(id);
      if (!found) {
        found = { conversations: 0, deliverables: 0, files: 0, departments: new Set() };
        map.set(id, found);
      }
      return found;
    };

    for (const row of conversations) {
      const found = bucket(row.projectId);
      if (found) {
        found.conversations += 1;
        found.departments.add(row.departmentId);
      }
    }
    for (const row of deliverables) {
      const found = bucket(row.projectId);
      if (found) {
        found.deliverables += 1;
        found.departments.add(row.departmentId);
      }
    }
    for (const row of files) {
      const found = bucket(row.projectId);
      if (found) found.files += 1;
    }
    return map;
  }, [conversations, deliverables, files]);

  const visible = useMemo(() => {
    if (filter !== "all") return projects.filter((row) => row.status === filter);
    // Archived work is finished business, so it sinks rather than competing for
    // attention with what is still live.
    const rank = (status: ProjectStatus) => (status === "archived" ? 1 : 0);
    return [...projects].sort(
      (a, b) => rank(a.status) - rank(b.status) || b.updatedAt - a.updatedAt,
    );
  }, [projects, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Work"
        title="Projects"
        actions={
          <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setDialogOpen(true)}>
            New project
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        <div className="measure flex flex-col gap-5">
          {projects.length ? (
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((option) => {
                const count =
                  option.key === "all"
                    ? projects.length
                    : projects.filter((row) => row.status === option.key).length;
                if (option.key === "archived" && count === 0) return null;
                return (
                  <Chip
                    key={option.key}
                    selected={filter === option.key}
                    onClick={() => setFilter(option.key)}
                  >
                    {option.label} {count}
                  </Chip>
                );
              })}
            </div>
          ) : null}

          {!ready ? null : visible.length === 0 ? (
            <EmptyState
              icon={PROJECT_DEFAULT_ICON}
              title={projects.length ? "Nothing under this filter" : "No projects yet"}
              description={
                projects.length
                  ? "Every project is filed under a different status. Switch the filter to see the rest."
                  : "Group a launch, a client build, or a release across every department that touches it, then open one page to see all of it at once."
              }
              action={
                projects.length ? null : (
                  <Button
                    icon={<PlusIcon className="h-4 w-4" />}
                    onClick={() => setDialogOpen(true)}
                  >
                    New project
                  </Button>
                )
              }
            />
          ) : (
            <ul className="stagger flex flex-col gap-3">
              {visible.map((project) => {
                const accent = projectAccent(project.accent);
                const tally = tallies.get(project.id);
                const departmentIds = [...(tally?.departments ?? [])];
                const heads = departmentIds
                  .map((id) => allDepartments.find((d) => d.id === id))
                  .filter((d): d is NonNullable<typeof d> => Boolean(d))
                  .slice(0, 4);
                const total =
                  (tally?.conversations ?? 0) +
                  (tally?.deliverables ?? 0) +
                  (tally?.files ?? 0);

                return (
                  <li key={project.id}>
                    <Link href={`/projects/${project.id}`} className="block">
                      <Card
                        className={cx(
                          "md-state transition-colors",
                          project.status === "archived" && "opacity-60",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden
                            className="mt-1.5 h-3 w-3 flex-none rounded-full"
                            style={{ backgroundColor: accent.dot }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="md-title truncate">{project.name}</p>
                              <Chip tone={project.status === "shipped" ? "success" : "neutral"}>
                                {PROJECT_STATUS_LABEL[project.status]}
                              </Chip>
                              {project.dueOn ? <Chip tone="warning">Due {project.dueOn}</Chip> : null}
                            </div>

                            {project.summary ? (
                              <p className="md-body mt-1 line-clamp-2 text-on-variant">
                                {project.summary}
                              </p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                              <ProjectMeter
                                conversations={tally?.conversations ?? 0}
                                deliverables={tally?.deliverables ?? 0}
                                files={tally?.files ?? 0}
                              />
                              {heads.length ? (
                                <span
                                  className="flex items-center -space-x-1.5"
                                  title={heads.map((d) => d.name).join(", ")}
                                >
                                  {heads.map((d) => (
                                    <DepartmentAvatar
                                      key={d.id}
                                      department={d}
                                      size={20}
                                      className="ring-2 ring-container"
                                    />
                                  ))}
                                  {departmentIds.length > heads.length ? (
                                    <span className="md-label-sm pl-3 text-on-variant/75">
                                      +{departmentIds.length - heads.length}
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}
                              {total === 0 ? (
                                <span className="md-label-sm text-on-variant/75">No items</span>
                              ) : null}
                              <span className="md-label-sm text-on-variant/75">
                                {formatRelativeTime(project.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
