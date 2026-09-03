"use client";

import Link from "next/link";
import { Dialog, cx } from "./ui";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { useStore } from "@/lib/store";
import type { Department } from "@/lib/types";

/**
 * Who a head is, from their own picture at the top of the screen.
 *
 * They are a tool and nobody is pretending otherwise, but the whole idea of the
 * panel is a room of people you can go and ask, and a name with a job title
 * above a chat box gives you no way to know which of them to ask. This is the
 * page you would read before knocking on somebody's door.
 *
 * The brief is shown as it is written, in the second person, because that is
 * what it is: the instructions this head was given, not a description somebody
 * wrote about them afterwards. Reading "you push back when a brief is fuzzy"
 * tells you more about what you will get than any polished third person summary
 * of the same sentence, and it is the truth rather than a rendering of it.
 *
 * The model is not here. It is already named in the footer under every answer
 * the head gives, and saying it twice on one screen made it look like a setting
 * rather than a fact.
 */
export function HeadProfile({
  department,
  open,
  onClose,
}: {
  department: Department;
  open: boolean;
  onClose: () => void;
}) {
  const { skillsFor, workspaceRole } = useStore();
  const skills = skillsFor(department.id).filter((skill) => skill.enabled);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={department.personaName || department.name}
      width="max-w-xl"
      footer={
        workspaceRole === "admin" ? (
          <Link
            href="/settings"
            onClick={onClose}
            className="md-label text-primary underline underline-offset-2"
          >
            Edit in Settings
          </Link>
        ) : undefined
      }
    >
      <div className="flex items-center gap-4">
        <DepartmentAvatar department={department} size={64} />
        <div className="min-w-0">
          <p className="md-title-lg truncate">
            {department.personaName || department.name}
          </p>
          <p className="md-body truncate text-on-variant">{department.roleTitle}</p>
          <p className="md-label-sm truncate text-on-variant/70">{department.name}</p>
        </div>
      </div>

      {department.persona?.trim() ? (
        <Section title="Brief">
          <p className="md-body whitespace-pre-wrap text-on-variant">
            {department.persona.trim()}
          </p>
        </Section>
      ) : null}

      {skills.length > 0 ? (
        <Section title={`Skills (${skills.length})`}>
          <ul className="flex flex-col gap-2">
            {skills.map((skill) => (
              <li key={skill.id}>
                <p className="md-label">{skill.name}</p>
                {skill.description ? (
                  <p className="md-label-sm text-on-variant/75">{skill.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cx("mt-5 border-t border-outline-variant pt-4")}>
      <p className="md-label-sm mb-2 text-on-variant/70">{title}</p>
      {children}
    </div>
  );
}
