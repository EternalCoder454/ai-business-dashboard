"use client";

import Link from "next/link";
import { Card, Chip, PageHeader, cx } from "@/components/ui";
import { useStore } from "@/lib/store";

/**
 * The page to send someone on their first day.
 *
 * Behind sign-in like everything else, which costs nothing: the sign-in page
 * carries a `from` parameter, so the link lands here after they authenticate.
 * Anyone who cannot sign in has no use for the instructions anyway.
 */
export default function OnboardingPage() {
  const { settings, departments, ceo } = useStore();
  const company = settings.companyName || "this company";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Start here"
        title={`Working with ${company}`}
        description="10 minute read · Highly recommended"
      />

      <div className="min-h-0 flex-1 overflow-y-auto page-x py-6">
        <div className="measure-read flex flex-col gap-5">
          <Section title="What this is">
            <p>
              One AI per department, each with a single job, its own memory, and the
              company&apos;s context, so it answers as a colleague who already knows
              where they work rather than an assistant you brief from scratch.
            </p>
            <p>
              {ceo?.personaName ? `${ceo.personaName} sits above them` : "A CEO sits above them"}
              {departments.length
                ? `, with ${departments.length} heads reporting in: ${departments
                    .map((d) => d.personaName || d.name)
                    .join(", ")}.`
                : "."}{" "}
              They keep separate conversations, so what you tell one is not
              automatically known to another.
            </p>
          </Section>

          <Section title="Getting something useful out of it">
            <Step n={1} title="Pick whose job it is">
              Ask whoever owns the area. Pricing goes to Finance, a landing page to
              Marketing. Asking the wrong one gets you a redirect rather than a bad
              answer, which is the system working, but it costs a round trip.
            </Step>
            <Step n={2} title="Ask for the thing, not for advice about the thing">
              &ldquo;Write the three subject lines&rdquo; beats &ldquo;how should I
              think about subject lines&rdquo;. They are set up to hand back work you
              can use, and they will tell you what they assumed while writing it.
            </Step>
            <Step n={3} title="Give them the specifics you already have">
              Numbers, names, dates, constraints. Vagueness in, vagueness out. If you
              do not have a number, say so and they will mark the assumption rather
              than quietly inventing one.
            </Step>
            <Step n={4} title="Push back">
              Disagreeing is useful. They will hold a position if it is sound and
              change it if you give them a reason, and they are told to name what
              would change their mind.
            </Step>
          </Section>

          <Section title="The rest of the app">
            <Definition term="CEO Office">
              For decisions that cross departments, or when you do not know who to
              ask. Answers the executive layer and points you at the right department.
            </Definition>
            <Definition term="All Hands">
              One question to every department at once. Worth it for a genuinely
              company-wide question, wasteful otherwise, since it costs roughly
              eight replies instead of one.
            </Definition>
            <Definition term="Projects">
              Groups conversations, deliverables, and files that belong to the same
              piece of work, wherever in the company they happened.
            </Definition>
            <Definition term="Library">
              Files you have uploaded, deliverables worth keeping, and the skills each
              department follows.
            </Definition>
            <Definition term="Inbox">
              People rather than departments. Ordinary direct messages with colleagues.
            </Definition>
          </Section>

          <Section title="What not to do" tone="warning">
            <Rule title="Do not paste secrets">
              No passwords, API keys, card numbers, or customer personal data. It
              goes to a third-party model and it is stored in the conversation
              afterwards. If you would not put it in a shared document, do not put it
              here.
            </Rule>
            <Rule title="Do not treat an answer as checked">
              They can be confidently wrong. They are told to flag guesses and show
              their reasoning, which helps, but anything with money, legal, or
              customer consequences needs a human to verify it before it goes out.
            </Rule>
            <Rule title="Do not mistake Legal or Finance for professionals">
              Plain-English guidance to help you ask a real accountant or solicitor
              the right question. Not advice, and not a substitute for either.
            </Rule>
            <Rule title="Do not assume this is private">
              These conversations are company records on a company tool, and an
              administrator can review them. Direct messages between people are
              not.
            </Rule>
            <Rule title="Do not publish anything unread">
              Nothing here should go out under your name, or the company&apos;s,
              without you having read every line of it.
            </Rule>
          </Section>

          <Section title="A note on cost">
            <p>
              Every reply is billed by length, on one shared account. Long rambling
              threads cost more than short specific ones, and All Hands costs about
              eight times a single question. Keeping a conversation to one topic is
              cheaper and gets better answers, since nothing is sifting through three
              unrelated topics to find yours.
            </p>
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
              <Link href="/">
                <Chip>See the org chart</Chip>
              </Link>
              <Link href="/ceo">
                <Chip>Talk to the CEO</Chip>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  tone = "neutral",
  children,
}: {
  title: string;
  tone?: "neutral" | "warning";
  children: React.ReactNode;
}) {
  return (
    <Card className={cx(tone === "warning" && "border border-warning/30")}>
      <h2 className="md-title-lg mb-3">{title}</h2>
      <div className="flex flex-col gap-3 [&>p]:md-body [&>p]:text-on-variant">{children}</div>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="md-label-sm grid h-6 w-6 flex-none place-items-center rounded-full bg-secondary-container text-on-secondary-container"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="md-title">{title}</p>
        <p className="md-body mt-0.5 text-on-variant">{children}</p>
      </div>
    </div>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="md-title">{term}</p>
      <p className="md-body mt-0.5 text-on-variant">{children}</p>
    </div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="md-title text-warning">{title}</p>
      <p className="md-body mt-0.5 text-on-variant">{children}</p>
    </div>
  );
}
