"use client";

import Link from "next/link";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { useMemo } from "react";
import { Card, Chip, PageHeader, cx } from "@/components/ui";
import { estimateAttachmentTokens, formatBytes } from "@/lib/files";
import { buildCompanyContext, hasProfileContent } from "@/lib/prompts";
import { COMPANY_ID, SHARED_OPERATING_RULES } from "@/lib/seed";
import { buildSkillsBlock } from "@/lib/skills";
import { useStore } from "@/lib/store";

/** Characters per token, close enough for a proportion bar. */
const CPT = 3.7;
const tok = (text: string) => Math.round(text.length / CPT);

/** Cache minimums, which decide whether the system block caches at all. */
const CACHE_MINIMUM: Record<string, number> = {
  "claude-opus-5": 512,
  "claude-fable-5": 512,
  "claude-sonnet-5": 1024,
  "claude-opus-4-8": 1024,
  "claude-sonnet-4-6": 1024,
  "claude-haiku-4-5": 4096,
};

const SEGMENT_COLOURS = [
  "var(--md-primary)",
  "var(--md-success)",
  "var(--md-warning)",
  "var(--md-secondary-container)",
  "var(--md-outline)",
  "var(--md-error)",
];

/**
 * What the machine is currently doing, in numbers rather than description.
 *
 * Every other page is for using the studio. This one is for understanding it:
 * what each head actually receives, what that costs, whether it caches, and
 * where the data lives.
 */
export default function InformationPage() {
  const {
    allDepartments,
    departments,
    skills,
    files,
    conversations,
    deliverables,
    allHandsRuns,
    profile,
    settings,
    skillsFor,
  } = useStore();

  const minimum = CACHE_MINIMUM[settings.model] ?? 1024;
  const companySkills = skills.filter((s) => s.departmentId === COMPANY_ID);

  const anatomy = useMemo(() => {
    const context = buildCompanyContext(profile, settings.companyName);
    return allDepartments.map((department) => {
      const mine = skillsFor(department.id).filter((s) => s.enabled);
      const segments = [
        { label: "Identity", tokens: tok(`Your name is ${department.personaName}. You are the ${department.roleTitle} at ${settings.companyName}.`) },
        { label: "Persona", tokens: tok(department.persona ?? "") },
        { label: "Department prompt", tokens: tok(department.systemPrompt) },
        { label: "Skills", tokens: tok(buildSkillsBlock(mine)) },
        { label: "Company Profile", tokens: tok(context) },
        { label: "House and writing rules", tokens: tok(SHARED_OPERATING_RULES + settings.writingRules) },
      ];
      const total = segments.reduce((sum, s) => sum + s.tokens, 0);
      return { department, segments, total, skillCount: mine.length };
    });
  }, [allDepartments, skillsFor, profile, settings, ]);

  const storage = [
    { label: "Departments", value: allDepartments.length },
    { label: "Skills", value: skills.length },
    { label: "Conversations", value: conversations.filter((c) => c.messages.length > 0).length },
    { label: "Messages", value: conversations.reduce((n, c) => n + c.messages.length, 0) },
    { label: "Deliverables", value: deliverables.length },
    { label: "All Hands rounds", value: allHandsRuns.reduce((n, r) => n + r.rounds.length, 0) },
    { label: "Library files", value: files.length },
  ];

  const fileBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const fileTokens = files.reduce((sum, f) => sum + estimateAttachmentTokens(f), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Information"
        title="Current systems"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        <div className="measure flex flex-col gap-5">
          {/* ------------------------------------------------ the model */}
          <Card>
            <h2 className="md-title-lg mb-1">The call being made</h2>
            <p className="md-body mb-4 text-on-variant">
              Every message goes to this app&apos;s own{" "}
              <code className="font-mono text-[0.85em]">/api/chat</code> route, which calls
              Anthropic server-side and streams the reply back as newline-delimited JSON.
              The key never leaves this browser except on that request.
            </p>
            <dl className="grid gap-3 medium:grid-cols-2">
              <Fact label="Model" value={settings.model} />
              <Fact label="Reasoning effort" value={settings.effort} />
              <Fact
                label="Thinking"
                value={
                  settings.model === "claude-haiku-4-5"
                    ? "off (unsupported on this model)"
                    : "adaptive, summarized"
                }
              />
              <Fact
                label="API key"
                value={settings.apiKey ? "stored in this browser" : "not set"}
                tone={settings.apiKey ? undefined : "error"}
              />
            </dl>
          </Card>

          {/* ------------------------------------------------ caching */}
          <Card>
            <h2 className="md-title-lg mb-1">Prompt caching</h2>
            <p className="md-body mb-4 text-on-variant">
              Two breakpoints per request. The whole system block is cached for one hour,
              because the gap between your questions is usually longer than five minutes.
              The final message is cached for five, so each turn reads everything before it
              and writes only what the last turn added. A prefix shorter than{" "}
              <strong>{minimum.toLocaleString()} tokens</strong> is silently not cached on{" "}
              {settings.model}.
            </p>
            <div className="flex flex-wrap gap-2">
              {anatomy.map(({ department, total }) => (
                <Chip
                  key={department.id}
                  tone={total >= minimum ? "success" : "warning"}
                  title={
                    total >= minimum
                      ? "Clears the minimum, so the system block caches"
                      : "Below the minimum, so the system block will not cache"
                  }
                >
                  <DepartmentAvatar department={department} size={18} />
                  {department.personaName || department.name} ·{" "}
                  {total.toLocaleString()}
                </Chip>
              ))}
            </div>
          </Card>

          {/* ------------------------------------------------ anatomy */}
          <Card>
            <h2 className="md-title-lg mb-1">What each department receives</h2>
            <p className="md-body mb-4 text-on-variant">
              The system prompt is assembled in the same order every time, so the whole
              thing sits inside the cached prefix. Writing rules go last, which is why they
              win any conflict with a department prompt or a skill.
            </p>

            <ul className="flex flex-col gap-4">
              {anatomy.map(({ department, segments, total, skillCount }) => (
                <li key={department.id}>
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                    <DepartmentAvatar department={department} size={20} />
                    <span className="md-title">
                      {department.personaName || department.name}
                    </span>
                    <span className="md-label-sm text-on-variant/75">
                      {skillCount} skill{skillCount === 1 ? "" : "s"} enabled
                    </span>
                    <span className="md-label-sm ml-auto text-on-variant">
                      {total.toLocaleString()} tokens
                    </span>
                  </div>

                  <div className="flex h-2.5 overflow-hidden rounded-full bg-highest">
                    {segments.map((segment, index) => (
                      <span
                        key={segment.label}
                        title={`${segment.label}: ${segment.tokens.toLocaleString()} tokens`}
                        style={{
                          width: `${total ? (segment.tokens / total) * 100 : 0}%`,
                          background: SEGMENT_COLOURS[index % SEGMENT_COLOURS.length],
                        }}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
              {anatomy[0]?.segments.map((segment, index) => (
                <li key={segment.label} className="md-label-sm flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: SEGMENT_COLOURS[index % SEGMENT_COLOURS.length] }}
                  />
                  {segment.label}
                </li>
              ))}
            </ul>
          </Card>

          {/* ------------------------------------------------ shared context */}
          <Card>
            <h2 className="md-title-lg mb-1">Shared across every department</h2>
            <dl className="mt-3 grid gap-3 medium:grid-cols-2">
              <Fact
                label="Company Profile"
                value={hasProfileContent(profile) ? "filled in" : "empty"}
                tone={hasProfileContent(profile) ? undefined : "warning"}
                href="/profile"
              />
              <Fact
                label="Company wide skills"
                value={`${companySkills.length}, injected into all ${allDepartments.length} prompts`}
                href="/library/skills"
              />
              <Fact
                label="House writing rules"
                value={`${tok(settings.writingRules).toLocaleString()} tokens`}
                href="/settings"
              />
              <Fact
                label="Room protocol"
                value={`All Hands, ${settings.roomBrevity === "standard" ? "140" : "60"} words per head`}
                href="/all-hands"
              />
            </dl>
          </Card>

          {/* ------------------------------------------------ storage */}
          <Card>
            <h2 className="md-title-lg mb-1">Where this lives</h2>
            <p className="md-body mb-4 text-on-variant">
              Everything is in IndexedDB in this browser, schema version 9. Nothing is
              stored on a server. Clearing site data deletes all of it, so use{" "}
              <Link href="/settings" className="text-primary underline">
                Export
              </Link>{" "}
              if it matters.
            </p>
            <dl className="grid grid-cols-2 gap-3 medium:grid-cols-4">
              {storage.map((item) => (
                <div key={item.label} className="rounded-xl bg-high px-3 py-2.5">
                  <dd className="text-xl font-medium leading-tight">{item.value}</dd>
                  <dt className="md-label-sm text-on-variant">{item.label}</dt>
                </div>
              ))}
            </dl>
            {files.length > 0 ? (
              <p className="md-label-sm mt-3 text-on-variant/75">
                Library files take {formatBytes(fileBytes)} and would cost about{" "}
                {fileTokens.toLocaleString()} tokens if every one were attached to a single
                message.
              </p>
            ) : null}
          </Card>

          {/* ------------------------------------------------ heads */}
          <Card>
            <h2 className="md-title-lg mb-3">The room</h2>
            <ul className="divide-y divide-[var(--md-outline-variant)]">
              {departments.map((department) => (
                <li key={department.id} className="flex items-center gap-3 py-2.5">
                  <DepartmentAvatar department={department} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="md-body block truncate">
                      {department.personaName}, {department.roleTitle}
                    </span>
                    <span className="md-label-sm block truncate text-on-variant/75">
                      {department.persona?.split(".")[0] ?? ""}.
                    </span>
                  </span>
                  <Link
                    href={`/library/skills?dept=${encodeURIComponent(department.id)}`}
                    className="md-label-sm flex-none text-primary"
                  >
                    skills
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone?: "warning" | "error";
  href?: string;
}) {
  const body = (
    <div className="rounded-xl bg-high px-3 py-2.5">
      <dt className="md-label-sm text-on-variant">{label}</dt>
      <dd
        className={cx(
          "md-body mt-0.5 truncate",
          tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "",
        )}
      >
        {value}
      </dd>
    </div>
  );

  return href ? (
    <Link href={href} className="md-state block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
