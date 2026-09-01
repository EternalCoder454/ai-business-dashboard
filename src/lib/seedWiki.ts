import type { WikiBlock, WikiBlockTone, WikiPage } from "./types";

/**
 * The wiki an installation starts with.
 *
 * Every page describes the panel and nothing about whoever built it or runs
 * it, so a fresh deployment reads correctly for whoever bought it. Anything
 * specific to a company belongs in the pages that company writes, and all of
 * this can be rewritten or deleted in Admin.
 */
interface SeedBlock {
  title: string;
  body: string;
  tone?: WikiBlockTone;
}

interface SeedPage {
  slug: string;
  title: string;
  blurb: string;
  blocks: SeedBlock[];
}

const PAGES: SeedPage[] = [
  {
    slug: "onboarding",
    title: "Onboarding",
    blurb: "Start here",
    blocks: [
      {
        title: "What this is",
        body: `One AI per department. Each has its own area, its own conversations, and the company's context, so you do not have to explain the business every time you ask something.

Conversations are separate, so telling one department something does not tell the others. What they all share is the company profile, recorded decisions and figures, and the open tasks in their own area.`,
      },
      {
        title: "Getting a useful answer",
        body: `**Ask the right department.** Pricing goes to Finance, a landing page to Marketing. Ask the wrong one and you get a redirect instead of the work.

**Ask for the thing, not advice about the thing.** "Write the three subject lines" gets you subject lines. "How should I think about subject lines" gets you an essay.

**Include the specifics.** Numbers, names, dates, constraints. If you do not have a number, say so and it will be marked as an assumption rather than invented. Anything you retype often belongs in Memory.

**Disagree when you disagree.** A position will be held if it is sound and changed if you give a reason.`,
      },
      {
        title: "What not to do",
        tone: "warning",
        body: `**Do not paste secrets.** No passwords, API keys, card numbers, or customer personal data. It is sent to a third-party model and stored in the conversation.

**Do not treat an answer as checked.** Answers can be wrong. Anything with money, legal, or customer consequences needs a person to verify it first.

**Legal and Finance are not professionals.** Plain-English guidance to help you ask a real accountant or solicitor the right question. Not advice.

**Nothing here is private.** All conversations and internal messaging are recorded and can be reviewed by an administrator.

**Read before you publish.** Nothing should go out under your name, or the company's, unread.`,
      },
    ],
  },
  {
    slug: "departments",
    title: "Departments",
    blurb: "Who owns what",
    blocks: [
      {
        title: "Who owns what",
        body: `Each department has one area and is told to stay in it. Asking the wrong one gets a one-line redirect rather than the work.

The departments, what they are called, and what each covers are all set in Settings. A department can be renamed, rewritten, given its own model, or removed entirely.`,
      },
      {
        title: "Asking everyone at once",
        body: `Ask Everyone puts one question to every department simultaneously, with an optional summary read across the answers. It costs roughly one reply per department, so it is worth it for a question that genuinely crosses the whole company and wasteful otherwise.

Each answer is capped to a word count, set in Settings. For depth, use a normal conversation.`,
      },
      {
        title: "What a department can do",
        body: `Besides replying, a department can propose an action: creating a task, recording a decision or a figure, saving a deliverable.

Nothing runs on its own. The proposal appears in the conversation as something to approve, and only runs when you approve it.`,
      },
    ],
  },
  {
    slug: "memory",
    title: "Memory",
    blurb: "Decisions and figures",
    blocks: [
      {
        title: "What it holds",
        body: `Decisions and figures about the business. Every department reads these before answering, so they do not have to be repeated in each conversation.

**Decisions** are something settled, in one line, with the reasoning and an optional review trigger.

**Figures** are a measurement and the date it was true. Readings sharing a name are shown as a trend, so write the label the same way each time.`,
      },
      {
        title: "Guidelines",
        tone: "note",
        body: `**Keep entries short.** Every live entry is added to every prompt.

**Use the date it happened,** not the date you typed it, or the trend will be wrong.

**Archive instead of deleting.** Archived entries leave the prompt and stay on record.

**Scope it.** An entry set to all departments reaches every one of them, and is guaranteed a place ahead of department-specific entries.`,
      },
    ],
  },
  {
    slug: "tasks",
    title: "Tasks",
    blurb: "Outstanding work",
    blocks: [
      {
        title: "What it holds",
        body: `Outstanding work. Deliverables are what has been produced; tasks are what has not happened yet.

Open tasks are shared with the department they belong to, so asking what to focus on is answered against the real list.`,
      },
      {
        title: "How it works",
        body: `Three columns: To do, Doing, Done. Drag a card between them or tick it off in place.

New tasks go to the top of their column. Due dates are optional, and anything overdue turns red and appears in notifications. Completed tasks stay on the board and leave the prompt.`,
      },
    ],
  },
  {
    slug: "skills",
    title: "Skills",
    blurb: "Department playbooks",
    blocks: [
      {
        title: "What a skill is",
        body: `A written playbook: a name, a trigger line saying when it applies, and a body saying how to do the work. Every enabled skill is added to that department's prompt in full, on every message.`,
      },
      {
        title: "Writing one",
        tone: "note",
        body: `**The trigger line matters most.** It is what gets matched. "Use when pricing a client website" beats "pricing guidance".

**Be specific to this company.** A skill that would suit any company is one the model already knows. The value is in the parts only true here.

**Disable rather than delete** while testing. A disabled skill costs nothing and can be turned back on.

**Your edits are kept.** Updates only replace a skill whose text still matches what shipped.`,
      },
    ],
  },
  {
    slug: "projects",
    title: "Projects and Library",
    blurb: "Where work is filed",
    blocks: [
      {
        title: "Projects",
        body: `Groups conversations, deliverables, files, tasks, and decisions that belong to the same piece of work. Deleting a project releases its contents rather than deleting them.

A project can be shared with another approved account, which makes its conversations collaborative.`,
      },
      {
        title: "Library",
        body: `**Files** are images, PDFs, and documents attached to any conversation without re-uploading. They can be scoped to one department.

**Deliverables** are replies saved out of a conversation, with a status.

**Skills** are the playbooks each department follows.

**Memory** holds decisions and figures.`,
      },
      {
        title: "Inbox",
        body: `Direct messages with colleagues on this workspace, rather than with a department. Recorded like everything else.`,
      },
    ],
  },
  {
    slug: "cost",
    title: "Cost",
    blurb: "What a reply costs",
    blocks: [
      {
        title: "What is billed",
        body: `Every reply is billed by length, on one shared account, counting both what is sent and what comes back. What is sent includes the department prompt, its skills, the company profile, memory, and open tasks.`,
      },
      {
        title: "Keeping it down",
        tone: "note",
        body: `**Caching does most of the work.** The context block is cached, so later messages in a session cost a fraction of the first.

**One topic per conversation.** A conversation re-sends its full history on every message.

**Ask Everyone costs about one reply per department.** Use it for company-wide questions.

**Attachments are large.** An image or PDF is thousands of tokens, re-sent with every later message in that conversation.

**Effort is adjustable.** Higher effort in Settings costs more. Worth it for architecture and forecasting, not for a caption.`,
      },
    ],
  },
];

/** Stable ids, so a page keeps its identity when the list is reordered. */
export function seedWikiPages(now: number = Date.now()): WikiPage[] {
  return PAGES.map((page, index) => ({
    id: `wiki_${page.slug}`,
    title: page.title,
    blurb: page.blurb,
    blocks: page.blocks.map((block, blockIndex) => ({
      id: `wiki_${page.slug}_${blockIndex}`,
      title: block.title,
      body: block.body,
      tone: block.tone ?? "default",
    })),
    order: index,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * The cards on a page, whichever way it was stored.
 *
 * Pages held one markdown body before they held cards. A page saved then still
 * has that body and no blocks, and reading it as an untitled card is better
 * than showing a blank page while someone works out why.
 */
export function blocksOf(page: WikiPage): WikiBlock[] {
  if (page.blocks?.length) return page.blocks;
  if (page.body?.trim()) {
    return [{ id: `${page.id}_body`, title: "", body: page.body, tone: "default" }];
  }
  return [];
}
