"use client";

import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { DepartmentAvatar } from "@/components/DepartmentAvatar";
import { useMemo } from "react";
import {
  Card,
  Chip,
  cx,
} from "@/components/ui";
import { estimateAttachmentTokens, formatBytes } from "@/lib/files";
import { buildLibraryBlock } from "@/lib/library";
import { buildCompanyContext, hasProfileContent } from "@/lib/prompts";
import { COMPANY_ID, SHARED_OPERATING_RULES } from "@/lib/seed";
import { buildSkillsBlock } from "@/lib/skills";
import { useStore } from "@/lib/store";
import { SpendCard } from "@/components/SpendCard";

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

/*
 * Colours for the context chart, as one sweep rather than seven hues.
 *
 * This has now been wrong twice in different directions. It began as container
 * and outline tokens, which are surfaces meant to sit behind text: on a light
 * card secondary-container is #d7e7ea, about 1.1:1, so the bands were nearly
 * invisible. Replacing them with the department accent wheel fixed the contrast
 * and created the opposite problem, because that wheel is categorical. It
 * spreads nine hues right round the circle so no two heads look alike, which is
 * exactly what you do not want edge to edge in a stacked bar: seven unrelated
 * saturated colours read as a rainbow, not as parts of one quantity.
 *
 * A sequential ramp is what this chart actually is. The segments are the same
 * seven things in the same order on every row, so position identifies them and
 * the colours only have to stay distinguishable from their neighbours. Teal
 * through indigo, lightness stepping the whole way, dark end first because the
 * leading segments are the small ones and slivers need the contrast.
 *
 * Measured on light: every band clears 1.69:1 against the card and neighbours
 * differ by at least 1.28:1 on top of the hue step. On dark, 3.75:1 and 1.17:1.
 */
const SEGMENT_COLOURS = [
  "var(--md-chart-1)",
  "var(--md-chart-2)",
  "var(--md-chart-3)",
  "var(--md-chart-4)",
  "var(--md-chart-5)",
  "var(--md-chart-6)",
  "var(--md-chart-7)",
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
    skills,
    files,
    conversations,
    deliverables,
    allHandsRuns,
    profile,
    settings,
    skillsFor,
    storage: storageMode,
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
        // The catalogue, not the documents. Worth its own line because it is
        // the one segment that grows as the business uses the panel.
        { label: "Library", tokens: tok(buildLibraryBlock(files, department.id)) },
        { label: "House and writing rules", tokens: tok(SHARED_OPERATING_RULES + settings.writingRules) },
      ];
      const total = segments.reduce((sum, s) => sum + s.tokens, 0);
      return { department, segments, total, skillCount: mine.length };
    });
  }, [allDepartments, skillsFor, profile, settings, files]);
  const uncached = anatomy
    .filter(({ total }) => total < minimum)
    .map(({ department }) => department.personaName || department.name);

  const storage = [
    { label: "Departments", value: allDepartments.length },
    { label: "Skills", value: skills.length },
    { label: "Conversations", value: conversations.filter((c) => c.messageCount > 0).length },
    { label: "Messages", value: conversations.reduce((n, c) => n + c.messageCount, 0) },
    { label: "Deliverables", value: deliverables.length },
    { label: "Meeting rounds", value: allHandsRuns.reduce((n, r) => n + r.rounds.length, 0) },
    { label: "Library files", value: files.length },
  ];

  const fileBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const fileTokens = files.reduce((sum, f) => sum + estimateAttachmentTokens(f), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Information"
        title="System"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 medium:px-6 expanded:px-8">
        <div className="measure flex flex-col gap-5">
          {/* First, because it is the one figure on this page somebody came
              looking for rather than found. */}
          <SpendCard />

          {/* ------------------------------------------------ caching */}
          <Card>
            <h2 className="md-title-lg mb-1">Caching</h2>
            {/*
             * One sentence, not one chip per head.
             *
             * This card used to list every head with its token count, which is
             * the same eight numbers the section below already draws with a
             * breakdown. The only thing it knew that the other did not was
             * whether each head clears the threshold, so that is the only thing
             * it says now, and it names the ones that do not rather than making
             * you compare eight figures against a number in a sentence.
             */}
            <p className="md-body text-on-variant">
              {uncached.length === 0
                ? `Every head is above the ${minimum.toLocaleString()} token minimum, so the stable part of each prompt is cached rather than re-sent.`
                : `${uncached.length} of ${anatomy.length} are under the ${minimum.toLocaleString()} token minimum and are re-sent in full each message: ${uncached.join(", ")}.`}
            </p>
          </Card>

          {/* ------------------------------------------------ anatomy */}
          <Card>
            <h2 className="md-title-lg mb-4">Context per department</h2>

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

          {/* ------------------------------------------------ storage */}
          <Card>
            <h2 className="md-title-lg mb-1">Storage</h2>
            <p className="md-body mb-4 text-on-variant">
              {storageMode === "hosted"
                ? "Synced to your account, and to everyone else in this business."
                : "Waiting for your account."}
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
                Library files: {formatBytes(fileBytes)}, about{" "}
                {fileTokens.toLocaleString()} tokens in total.
              </p>
            ) : null}
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
