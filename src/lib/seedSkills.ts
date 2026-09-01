import { CEO_ID, COMPANY_ID } from "./seed";
import type { Skill } from "./types";

interface SeedSkill {
  departmentId: string;
  name: string;
  description: string;
  content: string;
}

/**
 * The shipped skill library.
 *
 * Two per department and two company-wide, deliberately. Every enabled skill
 * is injected into that department's prompt in full on every message, so a
 * large library does not add capability, it dilutes attention and costs tokens
 * on every turn. This set covers the work any small business does; anything
 * specific to one company is worth more than any of these and belongs in
 * skills that company writes itself.
 *
 * Each one ends in rules rather than encouragement, because the failure mode
 * of a playbook is not that it says too little, it is that it says something
 * agreeable and unfalsifiable.
 *
 * Every one of these is an ordinary skill. Rewrite, disable, or delete freely.
 */
const SEED_SKILLS: SeedSkill[] = [
  // ------------------------------------------------------ Company wide
  // Injected into every department's prompt, so these cost their tokens once
  // per department. Keep this list to the things that are genuinely universal.
  {
    departmentId: COMPANY_ID,
    name: "Handoff Note",
    description:
      "Use when work has to move to another department, or when the user asks how to brief someone else on it.",
    content: `Write the note the receiver actually needs, and nothing else.

1. What is being handed over, in one sentence.
2. Why it is moving now, and what is already decided so it does not get reopened.
3. What they have to produce, stated as a finished thing rather than an activity.
4. Constraints they cannot change: budget, deadline, platform, anything already promised.
5. The open questions, marked as theirs to answer.
6. Everything they need to start, named and located.

Rules:
- Never hand over a decision you should have made. If you are handing over the choice, say that is what you are doing.
- Under 150 words. A handoff longer than the work is a sign the work is not scoped.
- Name the file or the place, not the client. If something can only be found by naming a customer, say what to look under instead.`,
  },
  {
    departmentId: COMPANY_ID,
    name: "Decision Record",
    description:
      "Use when a real decision gets made, or when the user asks to write one down so it is not relitigated later.",
    content: `Capture it so the same argument does not happen again in three weeks.

Write exactly these parts:
- Decision: what was decided, in one sentence, in the past tense.
- Date, and who decided.
- Context: the situation that forced a choice. Two or three sentences.
- Options considered, each with the one reason it lost. An option with no reason was not really considered.
- Consequences: what this commits the company to, including the bad parts.
- Revisit when: the specific signal that would justify reopening it. A condition, not a date.

Rules:
- Record the decision that was actually made, not the one that should have been.
- If the reasoning was "it was late and we had to pick", write that. A record that flatters the process is worth nothing later.
- Keep it short enough to live in memory, where it is re-read on every message.`,
  },

  // ------------------------------------------------------ Chief of Staff
  {
    departmentId: CEO_ID,
    name: "Weekly Priority Call",
    description:
      "Use when asked what to focus on this week, or when a list of competing work needs cutting down to one thing.",
    content: `Pick one thing. A list of priorities is not a priority.

1. List what is actually open, from tasks and recent conversations, not from what was asked.
2. For each, name what it is worth and what it costs in days. Guess out loud if there is no number, and mark it as a guess.
3. Name the one that moves the business, and say what it moves: money in, a deadline met, a risk closed.
4. Say what waits, and until when. "Later" is not a date.
5. Name the one thing most likely to derail the week, and what to do about it now.

Rules:
- Recommend, do not present options. Options are the answer to a question nobody asked.
- If the honest answer is that everything is second to one overdue thing, say only that.
- Never soften a cut. Naming what gets dropped is the entire value of the call.`,
  },
  {
    departmentId: CEO_ID,
    name: "Project Retro",
    description:
      "Use after something ships, or when the user wants to work out what went wrong and what to keep.",
    content: `Short, honest, and about the process rather than the people.

- What shipped, and against what was planned. Dates and scope, side by side.
- What worked, and the specific reason it worked, so it can be repeated deliberately.
- What went wrong, traced to a cause rather than a person. "The estimate was made before the scope was known" is a cause. "We were slow" is not.
- One change to make next time, stated as something someone does on a specific day.
- What to leave alone. A retro that changes everything changes nothing.

Rules:
- If it went well, say so and stop. Manufacturing lessons from a smooth project teaches nothing.
- No blame, no names in a fault sentence. The process failed, not the person.
- One change. A retro producing eight changes has produced none.`,
  },

  // ------------------------------------------------------ Marketing
  {
    departmentId: "marketing",
    name: "Campaign Brief",
    description:
      "Use when asked to plan a campaign, a launch, or any push to get something in front of people.",
    content: `A brief someone could execute without asking a follow-up question.

- The one thing this campaign is trying to make happen, as a number and a date.
- Who it is aimed at, described by what they are doing today instead, not by demographics.
- The single message. If it needs a comma, it is two messages.
- Channels, with the reason each one is on the list. A channel with no reason is a habit.
- What gets made: name each asset, its length or size, and who writes it.
- How you will know it worked, decided before it runs.

Rules:
- Pick fewer channels than feel comfortable. Two done properly beat five half done.
- Say what this campaign is not doing, so scope does not grow quietly.
- If the goal cannot be stated as a number, say so and ask for one rather than inventing it.`,
  },
  {
    departmentId: "marketing",
    name: "Positioning Statement",
    description:
      "Use when the message is unclear, when a page is not converting, or when asked what to actually say about the product.",
    content: `Get to one sentence a stranger could repeat correctly.

Work in this order:
1. Who it is for, narrowly. "Small businesses" is not an audience.
2. What they do today instead, including doing nothing. That is the real competitor.
3. The one thing this does better, stated so it could be wrong.
4. The proof: a number, a name, a guarantee, or a demonstration. An adjective is not proof.
5. The honest cost of choosing it: price, switching effort, what they give up.

Then write the sentence, under twenty-five words, no clauses.

Rules:
- If the differentiator would be true of a competitor, it is not a differentiator. Start again.
- Never claim a result the user has not told you they can deliver.
- Test it by writing the competitor's version of the same sentence. If they read the same, you have not positioned anything.`,
  },

  // ------------------------------------------------------ Social Media
  {
    departmentId: "social",
    name: "Content Calendar",
    description:
      "Use when asked for a posting schedule, a content calendar, or what to post over a period.",
    content: `Build recurring slots, not a pile of post ideas. A pile runs out; a slot does not.

1. Pick the platforms that suit the work being shown, and say which are deliberately skipped.
2. Define three or four repeating slots, each with a name, a day, and a fixed shape. "Tuesday, one screenshot and one line about what changed."
3. Fill four weeks against those slots.
4. Mark which posts need something that does not exist yet, so it can be made in time.
5. Name the one slot to keep if everything else slips.

Rules:
- A cadence that cannot be held for two months is the wrong cadence. Halve it.
- Every slot needs a source of material that already exists in the work. A slot needing invention every week will be the one that dies.
- Never plan a post about a customer without saying it needs their permission first.`,
  },
  {
    departmentId: "social",
    name: "Launch Day Plan",
    description:
      "Use for the day something goes live: what gets posted, in what order, and what to do when it goes quiet.",
    content: `One page, ordered by hour, written before the day rather than during it.

- What goes live, and the exact moment. Everything else hangs off that.
- The posts, in order, each with its copy already written and its asset already made.
- Where to reply, and for how long. Launch day is answering, not broadcasting.
- The quiet-hour plan: what to do at hour four when nothing is happening, decided now while calm.
- What would make you stop, and who decides.

Rules:
- Write the copy in advance. Copy written on the day is written badly.
- Reply to everyone in the first few hours, briefly. That is the whole mechanism.
- Do not schedule a second announcement to rescue a slow start. Judge after a day.`,
  },

  // ------------------------------------------------------ Design
  {
    departmentId: "design",
    name: "Design Critique",
    description:
      "Use when asked to review a design, a layout, a screen, or any visual piece of work.",
    content: `Critique against the job it has to do, not against taste.

1. State what this is for and who is looking at it. If that is unclear, ask; a critique without it is decoration.
2. Say what works, specifically enough to repeat.
3. Name problems in order of how much they cost: does it fail its job, is it confusing, is it inconsistent, is it unpolished. Fix in that order.
4. For each, say why it fails and what would fix it. "Feels cluttered" is not a note. "Three things compete for first read; make the price largest" is.
5. Check contrast, tap target size, and how it holds at the smallest width it will actually be seen at.

Rules:
- Give at most five notes. A critique with fifteen notes gets none of them acted on.
- Separate "wrong" from "I would have done it differently", and say which you are doing.
- If it is good, say it is good. Finding a fault to seem rigorous wastes the review.`,
  },
  {
    departmentId: "design",
    name: "Landing Page Layout",
    description:
      "Use when structuring a page that has to get one action out of the person reading it.",
    content: `Structure around a single action. A page with two goals achieves neither.

Order, top to bottom:
1. What this is and who it is for, in one line, readable without scrolling.
2. The action, visible immediately and repeated at the bottom.
3. Proof: a number, a name, a screenshot of the real thing. Not a stock photo.
4. What they get, in their words rather than feature names.
5. The objection they actually have, answered plainly. Price, effort, or trust; pick the real one.
6. The action again.

Rules:
- One action per page. Two buttons of equal weight is a decision handed back to the visitor.
- Anything above the fold that is not the offer or the action is in the way.
- Write the copy before the layout. A layout designed around placeholder text fits nothing.`,
  },

  // ------------------------------------------------------ Finance
  {
    departmentId: "finance",
    name: "Pricing Model",
    description:
      "Use when setting a price, changing one, or working out whether something is worth doing at the price offered.",
    content: `Start from what it is worth to the buyer, then check it clears cost. Cost sets the floor, never the price.

1. What it is worth to them, in money or time saved. Ask if you do not know.
2. The floor: real hours at a real rate, plus anything bought in, plus the share of fixed costs it has to carry.
3. What the alternatives cost, including doing nothing.
4. The price, and what it includes, stated so a scope argument later has an answer.
5. What happens at half the volume, and at double. If half is fatal, the price is wrong.

Rules:
- Show the arithmetic. A price with no working cannot be defended or adjusted.
- Mark every assumption in line, as "assuming 20 hours, replace with your real number". Never invent a number.
- This is a planning model, not tax or regulated financial advice. Anything with a filing, a statutory deadline, or a tax position on it goes to a licensed accountant in the user's jurisdiction, and you say so once, in line.`,
  },
  {
    departmentId: "finance",
    name: "Monthly Books Check",
    description:
      "Use for a monthly or quarterly review of spending, income, and runway.",
    content: `A short review that catches the two things that actually hurt: silent subscriptions, and uneven income.

1. Every recurring cost, with its renewal date and its annual total. Annual totals are what make a small monthly charge visible.
2. Anything paid for and unused in sixty days. Name it, say what cancelling saves in a year.
3. Income by month for the last six, and by source. One source above half of it is a risk, and should be named as one.
4. Money owed to the business, and how old. Anything past thirty days needs a chase this week.
5. Runway: cash divided by an average month, stated as a number of months.

Rules:
- Work only from figures the user has given. Never estimate revenue and present it as fact.
- End with the one action worth taking this month, not a list of observations.
- This is bookkeeping hygiene, not accounting, tax, or investment advice. Filings, tax treatment, and anything with a legal deadline go to a licensed accountant, said once and in line.`,
  },

  // ------------------------------------------------------ Legal
  {
    departmentId: "legal",
    name: "Contract Read",
    description:
      "Use when the user has been sent a contract, an agreement, or terms, and wants to know what is in it.",
    content: `Read it for what it costs them, in plain English, and say what to get checked.

Go clause by clause on the ones that carry risk:
- Who owns what is produced, and when ownership transfers. Payment-conditional transfer is normal and worth confirming.
- Payment: amount, schedule, what triggers it, what happens when it is late.
- Scope, and what counts as a change. A contract with no change process will produce an argument.
- Termination: who can end it, with what notice, and what is owed at that point.
- Liability, indemnity, and any cap. An uncapped liability clause is the single most expensive thing in most small contracts.
- Anything unusual: exclusivity, non-compete, automatic renewal, one-sided amendment rights.

For each: what it says, what it means for them, and whether it is standard.

Rules:
- Rank by cost. Two clauses matter and eleven do not; say which two.
- Suggest the specific replacement wording where a clause is one-sided, and mark it as a starting point.
- You are not a lawyer and this is not legal advice. Say so once, in line, and name the clauses worth paying a solicitor to look at before signing. Anything with real money, a business's survival, or someone's employment attached is on that list every time.`,
  },
  {
    departmentId: "legal",
    name: "Privacy and Compliance Check",
    description:
      "Use when handling personal data, adding a form or analytics, or writing a privacy policy or notice.",
    content: `Work from what data is actually collected, not from what the policy says.

1. List every piece of personal data collected, where it enters, where it is stored, and how long it is kept. Anything with no answer to "how long" is a problem.
2. Name every third party it reaches: hosting, analytics, email, payments, support tooling. Each one is a processor and belongs in the notice.
3. Say what the lawful basis is for each collection in plain terms, and whether consent is genuinely being asked for or assumed.
4. Cover the rights people have: access, correction, deletion, and how someone actually exercises them.
5. Say what happens if it leaks: who is told, and how fast.

Rules:
- Rules differ by jurisdiction and change. Say which regime you are reasoning about and that it needs confirming, rather than stating requirements as settled fact.
- Never write a policy describing practices the business does not have. A policy that overstates is worse than none.
- You are not a lawyer and this is not legal advice. Anything involving a regulator, a breach, or children's data goes to a qualified person, and you say so plainly rather than working around it.`,
  },

  // ------------------------------------------------------ Operations
  {
    departmentId: "operations",
    name: "SOP Writer",
    description:
      "Use when a process happens more than twice and should be written down so anyone can run it.",
    content: `Write it so someone who has never done it can, without asking.

- Title: the thing being done, as a verb. "Publish a release", not "Release process".
- When it runs, and who runs it.
- What must be true before starting, as a checklist that can be ticked.
- Numbered steps. One action each. Name the exact button, file, or command.
- The two or three places it usually goes wrong, and what to do when it does.
- How to know it worked.

Rules:
- Write from the last time it was actually done, not from how it is supposed to work.
- If a step needs judgement, say what the judgement is and give the rule of thumb. Do not pretend it is mechanical.
- Under one page. An SOP nobody reads is a document, not a process.`,
  },
  {
    departmentId: "operations",
    name: "Client Onboarding",
    description:
      "Use when starting work with a new client or customer, so the first week does not set up the problems.",
    content: `The first week decides whether the project is calm or not. Front-load the boring parts.

1. Confirm in writing what was agreed: what is being delivered, by when, for how much, and what is explicitly not included.
2. Collect what you need before starting, as a single list with a deadline. Missing material is the most common cause of a late project.
3. Agree how you will communicate: one channel, and how fast a reply is reasonable.
4. Agree the review points, how many rounds of changes are included, and what happens after those.
5. Name who decides on their side. A project with two approvers has none.

Rules:
- Get scope in writing before any work starts, every time, including for a friend.
- Ask only for the access you actually need, and say what each thing is for.
- Never store credentials, card details, or a client's customer records in this panel. Confirm they exist and note where they live, nothing more.`,
  },

  // ------------------------------------------------------ Engineering
  {
    departmentId: "engineering",
    name: "Code Review",
    description:
      "Use when reviewing a change, a pull request, or code the user has written and wants checked.",
    content: `Review for what breaks, then for what will be hard to change later. Style comes last and briefly.

In order:
1. Correctness. What input makes this wrong? Empty, missing, duplicate, very large, concurrent.
2. Failure. What happens when the network, the disk, or the dependency fails? Silent failure is worse than a crash.
3. Data. Anything that could corrupt or lose data, and whether it is reversible.
4. Security, where user input reaches a query, a file path, a shell, or a template.
5. Clarity. Whether someone reading this in six months will understand why, not just what.

Rules:
- Give a concrete failing case, not a category. "Breaks when the list is empty, line 40" beats "check edge cases".
- Separate what must change from what you would prefer, and say which is which.
- If it is fine, say it is fine. A review that always finds something trains people to ignore reviews.`,
  },
  {
    departmentId: "engineering",
    name: "Bug Triage",
    description:
      "Use when a bug is reported, and it needs to become something reproducible and prioritised.",
    content: `Turn a report into a reproduction, then decide whether it is worth fixing now.

1. Restate what happens and what should happen, in one line each.
2. Reproduction: exact steps, environment, and how often. A bug that cannot be reproduced gets a logging change, not a fix.
3. Blast radius: how many people hit this, and what it costs them. Data loss and money are their own category.
4. Best guess at the cause, with the reason for the guess and the one thing that would confirm it.
5. Now, next, or never. "Never" is a real answer and should be said out loud rather than left in a backlog.

Rules:
- Never propose a fix before the reproduction. A fix for a guess creates a second bug.
- Say what would make you wrong about the cause.
- Strip personal data out of any pasted log or report before working with it, and say that you have.`,
  },
];

/** Stable id derived from the name, so reordering the library never renames a skill. */
function seedId(departmentId: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `skill_seed_${departmentId}_${slug}`;
}

export function seedSkills(now: number = Date.now()): Skill[] {
  return SEED_SKILLS.map((skill) => ({
    id: seedId(skill.departmentId, skill.name),
    departmentId: skill.departmentId,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }));
}
