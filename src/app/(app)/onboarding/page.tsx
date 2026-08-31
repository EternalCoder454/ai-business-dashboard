"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Card, Chip, PageHeader, cx } from "@/components/ui";
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
  { id: "onboarding", label: "Onboarding", blurb: "Start here on day one" },
  { id: "heads", label: "The heads", blurb: "Who owns what" },
  { id: "memory", label: "Memory", blurb: "Decisions and figures" },
  { id: "tasks", label: "Tasks", blurb: "What is outstanding" },
  { id: "skills", label: "Skills", blurb: "The playbooks they follow" },
  { id: "projects", label: "Projects and Library", blurb: "Where work is filed" },
  { id: "cost", label: "Cost", blurb: "What a reply is billed" },
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
            ? "10 minute read · Highly recommended"
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
          One AI per department, each with a single job, its own memory, and the
          company&apos;s context, so it answers as a colleague who already knows where
          they work rather than an assistant you brief from scratch.
        </p>
        <p>
          {ceoName ? `${ceoName} sits above them` : "A Chief of Staff sits above them"}
          {departments.length
            ? `, with ${departments.length} heads reporting in: ${departments
                .map((d) => d.personaName || d.name)
                .join(", ")}.`
            : "."}{" "}
          They keep separate conversations, so what you tell one is not automatically
          known to another. What they all share is {company}&apos;s profile, its
          recorded decisions and figures, and the open work in their own area.
        </p>
      </Section>

      <Section title="Getting something useful out of it">
        <Step n={1} title="Pick whose job it is">
          Ask whoever owns the area. Pricing goes to Finance, a landing page to
          Marketing. Asking the wrong one gets you a redirect rather than a bad
          answer, which is the system working, but it costs a round trip.
        </Step>
        <Step n={2} title="Ask for the thing, not for advice about the thing">
          &ldquo;Write the three subject lines&rdquo; beats &ldquo;how should I think
          about subject lines&rdquo;. They are set up to hand back work you can use,
          and they will tell you what they assumed while writing it.
        </Step>
        <Step n={3} title="Give them the specifics you already have">
          Numbers, names, dates, constraints. Vagueness in, vagueness out. If you do
          not have a number, say so and they will mark the assumption rather than
          quietly inventing one. Anything you find yourself retyping belongs in
          Memory, where every head reads it once and stops asking.
        </Step>
        <Step n={4} title="Push back">
          Disagreeing is useful. They will hold a position if it is sound and change
          it if you give them a reason, and they are told to name what would change
          their mind.
        </Step>
      </Section>

      <Section title="What not to do" tone="warning">
        <Rule title="Do not paste secrets">
          No passwords, API keys, card numbers, or customer personal data. It goes to
          a third-party model and it is stored in the conversation afterwards. If you
          would not put it in a shared document, do not put it here.
        </Rule>
        <Rule title="Do not treat an answer as checked">
          They can be confidently wrong. They are told to flag guesses and show their
          reasoning, which helps, but anything with money, legal, or customer
          consequences needs a human to verify it before it goes out.
        </Rule>
        <Rule title="Do not mistake Legal or Finance for professionals">
          Plain-English guidance to help you ask a real accountant or solicitor the
          right question. Not advice, and not a substitute for either.
        </Rule>
        <Rule title="Do not assume this is private">
          These conversations are company records on a company tool, and an
          administrator can review them. Direct messages between people are not.
        </Rule>
        <Rule title="Do not publish anything unread">
          Nothing here should go out under your name, or the company&apos;s, without
          you having read every line of it.
        </Rule>
      </Section>

      <Card>
        <h2 className="md-title-lg mb-2">Ready</h2>
        <p className="md-body mb-4 text-on-variant">
          Fill in your name on the Account page first, so they know who they are
          talking to. Then pick someone and ask something real.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/account">
            <Chip tone="primary">Set up your account</Chip>
          </Link>
          <Link href="/library/memory">
            <Chip>Record a fact</Chip>
          </Link>
          <Link href="/ceo">
            <Chip>Talk to the Chief of Staff</Chip>
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
        <p>
          Each head has one area and is told to stay in it. Asking the wrong one is
          not a disaster, but you get a one-line redirect instead of the work.
        </p>
        <Definition term="Chief of Staff">
          Decisions that cross departments, and anything where you do not know who to
          ask. Sets priorities, forces tradeoffs, and says what gets dropped. The call
          is always yours; the job is making it a clear one.
        </Definition>
        <Definition term="Marketing">
          Positioning, campaign strategy, store pages, launch messaging. The Steam
          page and mod listings live here.
        </Definition>
        <Definition term="Social Media">
          Devlogs, short-form clips, posting cadence, community. Discovery for the
          game runs through here rather than through Marketing.
        </Definition>
        <Definition term="Design">
          Creative direction, visual identity, and interface critique, in game and on
          the web.
        </Definition>
        <Definition term="Finance">
          Pricing, quotes, forecasts, and what a job is actually worth taking.
        </Definition>
        <Definition term="Legal">
          Contracts and licensing in plain English, to help you ask a real solicitor
          the right question. Never advice.
        </Definition>
        <Definition term="Operations">
          Process, tooling, client onboarding, and keeping a job from drifting outside
          what was quoted.
        </Definition>
        <Definition term="Engineering">
          Architecture, code review, performance, and build questions across the mods,
          the sites, and the game.
        </Definition>
      </Section>

      <Section title="Asking everyone at once">
        <p>
          Ask Everyone puts one question to every head simultaneously and, if you want
          it, has the Chief of Staff read across the answers. Worth it for a genuinely
          company-wide question and wasteful otherwise: it costs roughly eight replies
          instead of one.
        </p>
        <p>
          Each head answers to a word budget, set in Settings. The point of asking
          eight people at once is breadth; depth is what a one-to-one conversation is
          for.
        </p>
      </Section>
    </>
  );
}

function Memory() {
  return (
    <>
      <Section title="Why it exists">
        <p>
          Without it every conversation starts from the same static profile, so a head
          will happily contradict a decision made last month and has no figure to
          reason from. Memory is the part that accumulates. Every head reads it before
          answering.
        </p>
      </Section>

      <Section title="The two kinds">
        <Definition term="Decisions">
          Something settled, in one line, with the reasoning under it and what would
          reopen it. A decision with no trigger is permanent, which is sometimes
          right and worth being deliberate about.
        </Definition>
        <Definition term="Figures">
          A measurement that was true on a date. Readings sharing a label read as a
          trend, so write &ldquo;Wishlists&rdquo; the same way every time and the
          heads see the direction rather than a pile of unrelated numbers.
        </Definition>
      </Section>

      <Section title="Using it well">
        <Rule title="Keep entries short">
          Every live entry sits in every head&apos;s prompt from then on. A four
          hundred word paragraph costs tokens on every message and buries the line
          that mattered.
        </Rule>
        <Rule title="Date it when it happened">
          Not when you typed it. A reading taken last Friday belongs on last Friday or
          the trend the heads read is wrong.
        </Rule>
        <Rule title="Archive rather than delete">
          An overtaken decision leaves the prompt and stays in the table, so the
          history of what was decided survives being wrong.
        </Rule>
        <Rule title="Scope it">
          Company-wide reaches every head and is paid for eight times over. A finance
          figure belongs to Finance.
        </Rule>
      </Section>
    </>
  );
}

function Tasks() {
  return (
    <>
      <Section title="What it is for">
        <p>
          Deliverables are things produced. Tasks are the other half: what has not
          happened yet. Keeping them apart matters because &ldquo;what have we
          made&rdquo; and &ldquo;what is outstanding&rdquo; are different questions and
          merging them makes both lists useless.
        </p>
        <p>
          The open tasks in a head&apos;s own area go into its prompt, capped and
          sorted by date. That is what makes &ldquo;what should I focus on&rdquo;
          answerable: without it the question is answered from nothing.
        </p>
      </Section>

      <Section title="How it behaves">
        <Step n={1} title="Three columns">
          To do, Doing, Done. Drag a card between them or tick it off in place.
        </Step>
        <Step n={2} title="New tasks go to the top">
          The thing just written down is the thing most on your mind. Appending it
          under forty older ones is how a list stops being read.
        </Step>
        <Step n={3} title="Dates only where a date is real">
          Anything past its date turns red and is called out on the dashboard. A list
          where everything is overdue tells you nothing.
        </Step>
        <Step n={4} title="Finished work leaves the prompt">
          Done tasks are history. They stay on the board and stop being context.
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
          A written playbook a head follows: a name, a trigger line saying when it
          applies, and a body telling it how to do the thing. Every enabled skill is
          injected into that head&apos;s prompt in full, on every message.
        </p>
        <p>
          That last point is the whole design constraint. Skills are not free
          capability; they are prompt weight. A bloated library dilutes attention
          rather than adding ability, which is why the shipped set was cut from
          seventy-two to fifty-six by merging the ones that said the same thing twice.
        </p>
      </Section>

      <Section title="Writing one">
        <Rule title="The trigger line does the work">
          It is what the model matches against. &ldquo;Use when pricing a client
          website&rdquo; beats &ldquo;pricing guidance&rdquo;.
        </Rule>
        <Rule title="Be specific to this studio">
          A skill that would suit any company is a skill the model already knows.
          Value is in the parts only true here: the loaders you target, the bands you
          quote, the platforms you publish on.
        </Rule>
        <Rule title="Disable rather than delete while testing">
          A disabled skill costs nothing and can be turned back on.
        </Rule>
        <Rule title="Edited skills stay edited">
          Anything you rewrite is left alone permanently by updates. The app only
          replaces a skill whose text still matches exactly what it shipped.
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
          A project groups conversations, deliverables, files, tasks, and recorded
          decisions that belong to the same piece of work, wherever in the company
          they happened. Deleting one releases its contents rather than destroying
          them: a conversation is worth more than the folder it was filed in.
        </p>
        <p>
          A project can be shared with another approved account, which makes its
          conversations collaborative. Authorship is pinned when a message is written,
          so re-saving a shared thread never rewrites who said what.
        </p>
      </Section>

      <Section title="Library">
        <Definition term="Files">
          Images, PDFs, and documents kept once and attached to any conversation
          rather than re-uploaded each time. Scope one to a department and only that
          head sees it.
        </Definition>
        <Definition term="Deliverables">
          Replies worth keeping, saved out of a conversation with a status.
        </Definition>
        <Definition term="Skills">
          The playbooks above.
        </Definition>
        <Definition term="Memory">
          The record every head reads.
        </Definition>
      </Section>

      <Section title="Inbox">
        <p>
          People rather than departments: ordinary direct messages with colleagues on
          this workspace. Not visible to an administrator the way department
          conversations are.
        </p>
      </Section>
    </>
  );
}

function Cost() {
  return (
    <>
      <Section title="What you are billed for">
        <p>
          Every reply is billed by length, on one shared account, and both halves
          count: what is sent up and what comes back. What is sent up is larger than
          it looks, because it carries the department prompt, its skills, the company
          profile, the record, and the open work.
        </p>
      </Section>

      <Section title="What makes it cheaper">
        <Rule title="Caching does most of the work">
          The whole system block is cached for an hour, so the second message in a
          session costs a fraction of the first. This is why the record and the task
          list sit late in the prompt: changing them leaves everything above cached.
        </Rule>
        <Rule title="One topic per conversation">
          A long thread re-sends its whole history every turn. Three unrelated topics
          in one conversation is three topics being re-read on every message.
        </Rule>
        <Rule title="Ask Everyone costs about eight replies">
          Use it for genuinely company-wide questions.
        </Rule>
        <Rule title="Attachments are large">
          An image or PDF is measured in thousands of tokens and rides along with
          every later message in that conversation.
        </Rule>
        <Rule title="Effort is a dial">
          Settings controls how hard the model thinks. Higher settings are worth it
          for architecture and forecasting, wasteful for a caption.
        </Rule>
      </Section>
    </>
  );
}

function Licensing() {
  return (
    <>
      <Section title="Three lines, three answers">
        <p>
          Using one licence everywhere would either strangle the mods or give away the
          panel, so the studio runs three positions. Full text is in the repository.
        </p>
        <Definition term="This panel and internal tools">
          Source-available under PolyForm Strict, plus a grant permitting a copy to
          prepare a contribution. Readable, not reusable. Never called open source,
          because that term requires rights this deliberately withholds.
        </Definition>
        <Definition term="Minecraft mods">
          LGPL-3.0-or-later for the code, all rights reserved for the art. The one
          line where control is given up on purpose: a mod that cannot be forked dies
          when the studio stops updating it. The name is trademark, not copyright, so
          the licence does not hand that over either.
        </Definition>
        <Definition term="Client websites">
          The contract governs, and IP transfers on payment in full.
        </Definition>
      </Section>

      <Section title="What a licence cannot do" tone="warning">
        <Rule title="It cannot stop forking on GitHub">
          Their terms grant every user a licence to fork a public repository whatever
          the LICENSE file says. What it governs is what may be done with that copy.
        </Rule>
        <Rule title="It cannot make contributions safe by itself">
          That is what the contributing guide is for.
        </Rule>
        <Rule title="It is worth what enforcing it is worth">
          Two people will not litigate. Its value is making the position unambiguous.
        </Rule>
      </Section>
    </>
  );
}

/** A quiet way onward, so the wiki reads as a book rather than a menu. */
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
