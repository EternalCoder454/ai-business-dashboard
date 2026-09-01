"use client";

import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Card,
  Chip,
  cx,
} from "@/components/ui";
import { createRipple } from "@/components/ui/ripple";
import { useStore } from "@/lib/store";

/**
 * The internal wiki: how this company runs its own tool.
 *
 * Chapters rather than one long scroll, because the page has two audiences at
 * once. Someone on their first day wants to be walked through it, and someone
 * eighteen months in wants to check one thing about how skills are billed. A
 * single document serves the first and buries the second.
 *
 * Onboarding is always the chapter you land on. The rest are a click away, and
 * the current one is written to the URL hash so a chapter can be linked to.
 */

type ChapterId =
  | "onboarding"
  | "heads"
  | "memory"
  | "tasks"
  | "skills"
  | "projects"
  | "cost"
  | "licensing";

const CHAPTERS: { id: ChapterId; label: string; blurb: string }[] = [
  { id: "onboarding", label: "Onboarding", blurb: "Start here" },
  { id: "heads", label: "Departments", blurb: "Who owns what" },
  { id: "memory", label: "Memory", blurb: "Decisions and figures" },
  { id: "tasks", label: "Tasks", blurb: "Outstanding work" },
  { id: "skills", label: "Skills", blurb: "Department playbooks" },
  { id: "projects", label: "Projects and Library", blurb: "Where work is filed" },
  { id: "cost", label: "Cost", blurb: "What a reply costs" },
  { id: "licensing", label: "Licensing", blurb: "What may be reused" },
];

export default function WikiPage() {
  const { settings, departments, ceo } = useStore();
  const company = settings.companyName || "this company";

  // Always Onboarding on arrival. A hash only takes over afterwards, so a
  // shared link still works without the first visit landing somewhere odd.
  const [chapter, setChapter] = useState<ChapterId>("onboarding");

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as ChapterId;
    if (CHAPTERS.some((c) => c.id === fromHash)) setChapter(fromHash);
  }, []);

  const open = (id: ChapterId) => {
    setChapter(id);
    history.replaceState(null, "", `#${id}`);
    document.getElementById("wiki-top")?.scrollIntoView({ block: "start" });
  };

  const current = CHAPTERS.find((c) => c.id === chapter) ?? CHAPTERS[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Internal Wiki"
        title={`Working with ${company}`}
        description={
          chapter === "onboarding"
            ? "2 minute read"
            : current.blurb
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto page-x py-6" id="wiki-top">
        {/* Contents beside the chapter on a wide screen, above it otherwise.
            Sticky, so moving between chapters never means scrolling back. */}
        <div className="grid gap-6 expanded:grid-cols-[15rem_minmax(0,1fr)]">
          <nav className="expanded:sticky expanded:top-0 expanded:self-start">
            <h2 className="md-label-sm mb-2 px-2 text-on-variant">Contents</h2>
            <ul className="flex gap-1.5 overflow-x-auto pb-1 expanded:flex-col expanded:overflow-visible expanded:pb-0">
              {CHAPTERS.map((entry) => (
                <li key={entry.id} className="flex-none expanded:flex-auto">
                  <button
                    onClick={(event) => {
                      createRipple(event);
                      open(entry.id);
                    }}
                    aria-current={entry.id === chapter ? "page" : undefined}
                    className={cx(
                      "md-state w-full rounded-xl px-3 py-2 text-left transition-colors",
                      entry.id === chapter
                        ? "bg-primary-container text-on-primary-container"
                        : "text-on-variant",
                    )}
                  >
                    <span className="md-label block whitespace-nowrap">{entry.label}</span>
                    <span className="md-label-sm hidden text-on-variant/70 expanded:block">
                      {entry.blurb}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="measure-read flex flex-col gap-5 expanded:mx-0">
            {chapter === "onboarding" ? (
              <Onboarding company={company} departments={departments} ceoName={ceo?.personaName} />
            ) : null}
            {chapter === "heads" ? <Heads /> : null}
            {chapter === "memory" ? <Memory /> : null}
            {chapter === "tasks" ? <Tasks /> : null}
            {chapter === "skills" ? <Skills /> : null}
            {chapter === "projects" ? <Projects /> : null}
            {chapter === "cost" ? <Cost /> : null}
            {chapter === "licensing" ? <Licensing /> : null}

            <NextChapter chapter={chapter} onOpen={open} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Onboarding({
  company,
  departments,
  ceoName,
}: {
  company: string;
  departments: { name: string; personaName: string }[];
  ceoName?: string;
}) {
  return (
    <>
      <Section title="What this is">
        <p>
          One AI per department. Each has its own area, its own conversations, and
          {company === "this company" ? " the company's" : ` ${company}'s`} context, so
          you do not have to explain the business every time you ask something.
        </p>
        <p>
          {ceoName ? `${ceoName} is the Chief of Staff` : "A Chief of Staff sits above them"}
          {departments.length
            ? `, over ${departments.length} departments: ${departments
                .map((d) => d.personaName || d.name)
                .join(", ")}.`
            : "."}{" "}
          Conversations are separate, so telling one department something does not tell
          the others. What they all share is the company profile, recorded decisions and
          figures, and the open tasks in their own area.
        </p>
      </Section>

      <Section title="Getting a useful answer">
        <Step n={1} title="Ask the right department">
          Pricing goes to Finance, a landing page to Marketing. Ask the wrong one and
          you get a redirect instead of the work.
        </Step>
        <Step n={2} title="Ask for the thing, not advice about the thing">
          &ldquo;Write the three subject lines&rdquo; gets you subject lines.
          &ldquo;How should I think about subject lines&rdquo; gets you an essay.
        </Step>
        <Step n={3} title="Include the specifics">
          Numbers, names, dates, constraints. If you do not have a number, say so and
          it will be marked as an assumption rather than invented. Anything you retype
          often belongs in Memory.
        </Step>
        <Step n={4} title="Disagree when you disagree">
          A position will be held if it is sound and changed if you give a reason.
        </Step>
      </Section>

      <Section title="What not to do" tone="warning">
        <Rule title="Do not paste secrets">
          No passwords, API keys, card numbers, or customer personal data. It is sent
          to a third-party model and stored in the conversation.
        </Rule>
        <Rule title="Do not treat an answer as checked">
          Answers can be wrong. Anything with money, legal, or customer consequences
          needs a person to verify it first.
        </Rule>
        <Rule title="Legal and Finance are not professionals">
          Plain-English guidance to help you ask a real accountant or solicitor the
          right question. Not advice.
        </Rule>
        <Rule title="Nothing here is private">
          All conversations and internal messaging are recorded and can be reviewed by
          an administrator.
        </Rule>
        <Rule title="Read before you publish">
          Nothing should go out under your name, or the company&apos;s, unread.
        </Rule>
      </Section>

      <Card>
        <h2 className="md-title-lg mb-2">Get started</h2>
        <p className="md-body mb-4 text-on-variant">
          Add your name on the Account page, then ask something real.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/account">
            <Chip tone="primary">Account</Chip>
          </Link>
          <Link href="/library/memory">
            <Chip>Memory</Chip>
          </Link>
          <Link href="/ceo">
            <Chip>Chief of Staff</Chip>
          </Link>
        </div>
      </Card>
    </>
  );
}

function Heads() {
  return (
    <>
      <Section title="Who owns what">
        <Definition term="Chief of Staff">
          Decisions that cross departments, priorities, and tradeoffs. Use it when you
          do not know who to ask.
        </Definition>
        <Definition term="Marketing">
          Positioning, campaign strategy, store pages, launch messaging. Steam pages
          and mod listings.
        </Definition>
        <Definition term="Social Media">
          Devlogs, short-form clips, posting schedules, community.
        </Definition>
        <Definition term="Design">
          Creative direction, visual identity, interface critique.
        </Definition>
        <Definition term="Finance">
          Pricing, quotes, forecasts, and whether a job is worth taking.
        </Definition>
        <Definition term="Legal">
          Contracts and licensing in plain English. Not legal advice.
        </Definition>
        <Definition term="Operations">
          Process, tooling, client onboarding, scope control.
        </Definition>
        <Definition term="Engineering">
          Architecture, code review, performance, build questions.
        </Definition>
      </Section>

      <Section title="Ask Everyone">
        <p>
          Puts one question to every department at once, with an optional summary from
          the Chief of Staff. It costs roughly eight replies instead of one, so use it
          for questions that genuinely cross the whole company.
        </p>
        <p>
          Each answer is capped to a word count, set in Settings. For depth, use a
          normal conversation.
        </p>
      </Section>
    </>
  );
}

function Memory() {
  return (
    <>
      <Section title="What it holds">
        <p>
          Decisions and figures about the business. Every department reads these before
          answering, so they do not have to be repeated in each conversation.
        </p>
        <Definition term="Decisions">
          Something settled, in one line, with the reasoning and an optional review
          trigger.
        </Definition>
        <Definition term="Figures">
          A measurement and the date it was true. Readings sharing a name are shown as
          a trend, so write &ldquo;Wishlists&rdquo; the same way each time.
        </Definition>
      </Section>

      <Section title="Guidelines">
        <Rule title="Keep entries short">
          Every live entry is added to every prompt.
        </Rule>
        <Rule title="Use the date it happened">
          Not the date you typed it, or the trend will be wrong.
        </Rule>
        <Rule title="Archive instead of deleting">
          Archived entries leave the prompt and stay on record.
        </Rule>
        <Rule title="Scope it to a department">
          Company-wide entries are sent to all eight.
        </Rule>
      </Section>
    </>
  );
}

function Tasks() {
  return (
    <>
      <Section title="What it holds">
        <p>
          Outstanding work. Deliverables are what has been produced; tasks are what has
          not happened yet.
        </p>
        <p>
          Open tasks are shared with the department they belong to, capped and sorted
          by date, so asking what to focus on is answered against the real list.
        </p>
      </Section>

      <Section title="How it works">
        <Step n={1} title="Three columns">
          To do, Doing, Done. Drag a card between them or tick it off in place.
        </Step>
        <Step n={2} title="New tasks go to the top">
          Newest first within each column.
        </Step>
        <Step n={3} title="Due dates are optional">
          Overdue tasks turn red and appear in notifications.
        </Step>
        <Step n={4} title="Completed tasks leave the prompt">
          They stay on the board.
        </Step>
      </Section>
    </>
  );
}

function Skills() {
  return (
    <>
      <Section title="What a skill is">
        <p>
          A written playbook: a name, a trigger line saying when it applies, and a body
          saying how to do the work. Every enabled skill is added to that
          department&apos;s prompt in full, on every message.
        </p>
      </Section>

      <Section title="Writing one">
        <Rule title="The trigger line matters most">
          It is what gets matched. &ldquo;Use when pricing a client website&rdquo;
          beats &ldquo;pricing guidance&rdquo;.
        </Rule>
        <Rule title="Be specific to this studio">
          The loaders you target, the rates you quote, the platforms you publish on.
        </Rule>
        <Rule title="Disable rather than delete">
          A disabled skill costs nothing and can be turned back on.
        </Rule>
        <Rule title="Your edits are kept">
          Updates only replace a skill whose text still matches what shipped.
        </Rule>
      </Section>
    </>
  );
}

function Projects() {
  return (
    <>
      <Section title="Projects">
        <p>
          Groups conversations, deliverables, files, tasks, and decisions that belong
          to the same piece of work. Deleting a project releases its contents rather
          than deleting them.
        </p>
        <p>
          A project can be shared with another approved account, which makes its
          conversations collaborative.
        </p>
      </Section>

      <Section title="Library">
        <Definition term="Files">
          Images, PDFs, and documents attached to any conversation without
          re-uploading. Can be scoped to one department.
        </Definition>
        <Definition term="Deliverables">
          Replies saved out of a conversation, with a status.
        </Definition>
        <Definition term="Skills">Playbooks each department follows.</Definition>
        <Definition term="Memory">Decisions and figures.</Definition>
      </Section>

      <Section title="Inbox">
        <p>
          Direct messages with colleagues on this workspace, rather than with a
          department. Recorded like everything else.
        </p>
      </Section>
    </>
  );
}

function Cost() {
  return (
    <>
      <Section title="What is billed">
        <p>
          Every reply is billed by length on one shared account, both what is sent and
          what comes back. What is sent includes the department prompt, its skills, the
          company profile, memory, and open tasks.
        </p>
      </Section>

      <Section title="Keeping it down">
        <Rule title="Caching does most of the work">
          The context block is cached for an hour, so later messages in a session cost
          a fraction of the first.
        </Rule>
        <Rule title="One topic per conversation">
          A conversation re-sends its full history on every message.
        </Rule>
        <Rule title="Ask Everyone costs about eight replies">
          Use it for company-wide questions.
        </Rule>
        <Rule title="Attachments are large">
          An image or PDF is thousands of tokens, re-sent with every later message in
          that conversation.
        </Rule>
        <Rule title="Effort is adjustable">
          Higher effort in Settings costs more. Worth it for architecture and
          forecasting, not for a caption.
        </Rule>
      </Section>
    </>
  );
}

function Licensing() {
  return (
    <>
      <Section title="Three lines, three licences">
        <Definition term="This panel and internal tools">
          PolyForm Strict, plus a grant permitting a copy to prepare a contribution.
          Source-available: readable, not reusable.
        </Definition>
        <Definition term="Minecraft mods">
          LGPL-3.0-or-later for code, all rights reserved for art. Forks are allowed;
          the art and the name are not included.
        </Definition>
        <Definition term="Client websites">
          The contract governs. IP transfers on payment in full.
        </Definition>
      </Section>

      <Section title="Limits" tone="warning">
        <Rule title="Forking cannot be prevented on GitHub">
          Their terms grant every user a licence to fork a public repository. The
          licence governs what may be done with that copy.
        </Rule>
        <Rule title="Contributions need their own terms">
          Covered by CONTRIBUTING.md.
        </Rule>
        <Rule title="Check dependencies first">
          Linking copyleft code means the combined work inherits those terms.
        </Rule>
      </Section>
    </>
  );
}

/** A link to the next chapter, so the wiki can be read straight through. */
function NextChapter({
  chapter,
  onOpen,
}: {
  chapter: ChapterId;
  onOpen: (id: ChapterId) => void;
}) {
  const index = CHAPTERS.findIndex((c) => c.id === chapter);
  const next = CHAPTERS[index + 1];
  if (!next) return null;
  return (
    <button
      onClick={(event) => {
        createRipple(event);
        onOpen(next.id);
      }}
      className="md-state rounded-2xl border border-outline-variant px-4 py-3 text-left"
    >
      <span className="md-label-sm block text-on-variant">Next</span>
      <span className="md-title block">{next.label}</span>
      <span className="md-label-sm block text-on-variant/75">{next.blurb}</span>
    </button>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "warning";
  children: ReactNode;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl p-5",
        tone === "warning"
          ? "border border-warning/25 bg-warning/10"
          : "bg-container shadow-e1",
      )}
    >
      <h2 className={cx("md-title-lg mb-3", tone === "warning" && "text-warning")}>
        {title}
      </h2>
      <div className="md-body flex flex-col gap-3 text-on-variant">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="md-label-sm mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-primary-container text-on-primary-container">
        {n}
      </span>
      <div>
        <p className="md-label text-on-surface">{title}</p>
        <p className="mt-1">{children}</p>
      </div>
    </div>
  );
}

function Definition({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <p className="md-label text-on-surface">{term}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="md-label text-on-surface">{title}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
