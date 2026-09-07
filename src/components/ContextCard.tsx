"use client";

import { useMemo } from "react";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { Card } from "./ui";
import { buildLibraryBlock } from "@/lib/library";
import { buildCompanyContext } from "@/lib/prompts";
import { SHARED_OPERATING_RULES } from "@/lib/seed";
import { buildSkillsBlock } from "@/lib/skills";
import { useStore } from "@/lib/store";

/** Characters per token, close enough for a proportion bar. */
const CPT = 3.7;
const tok = (text: string) => Math.round(text.length / CPT);

/*
 * Colours for the segments, as one sweep rather than seven hues.
 *
 * This was wrong twice in different directions before it settled. It began as
 * container and outline tokens, which are surfaces meant to sit behind text: on
 * a light card secondary-container is about 1.1:1, so the bands were nearly
 * invisible. Replacing them with the department accent wheel fixed the contrast
 * and created the opposite problem, because that wheel is categorical. It
 * spreads nine hues round the circle so no two heads look alike, which is
 * exactly what you do not want edge to edge in one bar: seven unrelated
 * saturated colours read as a rainbow rather than as parts of one quantity.
 *
 * A sequential ramp is what this is. The segments are the same seven things in
 * the same order on every row, so position identifies them and the colours only
 * have to stay apart from their neighbours.
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
 * What each head is sent before anybody types anything.
 *
 * The bars are scaled against the largest head rather than against each other's
 * own total, which is the change that made this readable. Every row used to be
 * full width and split into the same seven segments, so the one thing the chart
 * could not tell you was which head was expensive: a head with four thousand
 * tokens and one with four hundred drew exactly the same bar.
 */
export function ContextCard() {
  const { allDepartments, files, profile, settings, skillsFor } = useStore();

  const anatomy = useMemo(() => {
    const context = buildCompanyContext(profile, settings.companyName);
    return allDepartments
      .map((department) => {
        const mine = skillsFor(department.id).filter((s) => s.enabled);
        const segments = [
          {
            label: "Identity",
            tokens: tok(
              `Your name is ${department.personaName}. You are the ${department.roleTitle} at ${settings.companyName}.`,
            ),
          },
          { label: "Persona", tokens: tok(department.persona ?? "") },
          { label: "Department prompt", tokens: tok(department.systemPrompt) },
          { label: "Skills", tokens: tok(buildSkillsBlock(mine)) },
          { label: "Company profile", tokens: tok(context) },
          // The catalogue, not the documents. Its own line because it is the
          // one segment that grows as the business uses the panel.
          { label: "Library", tokens: tok(buildLibraryBlock(files, department.id)) },
          {
            label: "House rules",
            tokens: tok(SHARED_OPERATING_RULES + settings.writingRules),
          },
        ];
        const total = segments.reduce((sum, s) => sum + s.tokens, 0);
        return { department, segments, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [allDepartments, skillsFor, profile, settings, files]);

  const biggest = anatomy[0]?.total ?? 0;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="md-title-lg">Context per head</h2>
        <span className="md-label-sm text-on-variant/75">
          {anatomy.reduce((sum, a) => sum + a.total, 0).toLocaleString()} tokens in total
        </span>
      </div>

      {anatomy.length === 0 ? (
        <p className="md-body text-on-variant">No heads yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {anatomy.map(({ department, segments, total }) => (
            <li key={department.id}>
              <div className="mb-0.5 flex items-baseline gap-2">
                <DepartmentAvatar department={department} size={18} />
                <span className="md-body min-w-0 flex-1 truncate">
                  {department.personaName || department.name}
                </span>
                <span className="md-label-sm tabular-nums text-on-variant">
                  {total.toLocaleString()}
                </span>
              </div>

              {/* Scaled against the largest head, so the length of the bar is
                  the comparison and the segments inside it are the breakdown. */}
              <div
                className="flex h-2 overflow-hidden rounded-full bg-highest"
                style={{ width: `${biggest ? Math.max((total / biggest) * 100, 2) : 0}%` }}
              >
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
      )}

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {anatomy[0]?.segments.map((segment, index) => (
          <li key={segment.label} className="md-label-sm flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: SEGMENT_COLOURS[index % SEGMENT_COLOURS.length] }}
            />
            {segment.label}
          </li>
        ))}
      </ul>
    </Card>
  );
}
