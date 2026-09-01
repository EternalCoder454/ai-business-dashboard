import { COACH_ID } from "./seed";
import type { Skill } from "./types";

interface SeedSkill {
  name: string;
  description: string;
  content: string;
}

/**
 * Imani's playbooks, drawn from the founder's field guide.
 *
 * Scoped to leadership and communication on purpose. The guide also covers
 * entity structure, financial statements, OKRs, and contractor classification;
 * those belong to Desmond, Theo, and Priya, and a coach who answers them is a
 * coach nobody trusts on the things she is actually for.
 *
 * Figures are deliberately absent from most of these. The guide says plainly
 * that its delegation, burnout, and OKR numbers come from blogs and vendor
 * pages and should be treated as directional, and a coach quoting a statistic
 * she cannot stand behind is worse than one who makes the point without it.
 */
const COACH_SKILLS: SeedSkill[] = [
  {
    name: "Delegation Triage",
    description:
      "Use when they are overloaded, are the approval gate for something, or say they are the only one who can do a job.",
    content: `Sort the work before discussing any of it. Ask them to name the recurring tasks, then put each in one of three buckets.

**Keep.** Needs their specific insight, their relationships, or a judgement call that plays out over a year. Strategic, not reactive.

**Let go.** Repeatable, low leverage, or just time consuming. It does not need their brain, only their time, and that is the trade being made.

**Coach.** The middle, and where founders get stuck. Someone else can own it after one or two real handoffs. Holding these is the single most common reason a founder stays the bottleneck.

Start with the let-go pile. It is the easiest to move and it buys the room to do the rest.

The mindset underneath: the goal is not to be helpful, it is to stop being the permission step. A handoff that still routes back through them has not happened.

Give them this line to use, close to verbatim:

> Run it by me only if you hit a blocker. Do not wait for my review before shipping.

Push on:
- What are they afraid happens if this is done at eighty per cent of their standard?
- Is that fear about the work, or about not being needed?
- What would have to be true for them to stop checking it?`,
  },

  {
    name: "Decide at Seventy Percent",
    description:
      "Use when a decision is stuck, being over-researched, or when they are agonising over something they could simply undo.",
    content: `First question, always: is this reversible?

**Two-way door.** Most decisions. You can walk back through it. Make it fast, alone or with one other person, and expect to correct it. Applying a careful, consultative process here is how a small company grinds to a halt.

**One-way door.** Hard or impossible to undo: firing someone, a public commitment, spending money that is not coming back, anything with a signature on it. Slow down, take advice, sleep on it.

Most stuck decisions are two-way doors being treated as one-way.

**The seventy per cent rule.** Decide with roughly seventy per cent of the information you wish you had. Waiting for ninety is usually just slow, and the skill that matters instead is noticing a wrong call early and correcting it. Ask them what they would need to see in three weeks to know they got it wrong, then agree to look.

**Disagree and commit.** Once a decision is made after real debate, everyone backs it fully, including whoever argued against it. Half-committing to a decision you lost is how a team stops arguing honestly. The exceptions are ethics, safety, and one-way doors.

**For the big personal ones.** Ask what they would regret more from ten years out. It cuts through analysis that is really just fear.

Do not let them use a framework to avoid deciding. If they have named it a two-way door, the conversation is over and they should go and do it.`,
  },

  {
    name: "Feedback, Both Directions",
    description:
      "Use when they have to tell someone something hard, are sitting on it, or have received feedback they cannot act on.",
    content: `**Giving it.**

Feedback is strategy, not self-expression. The test is not whether it was honest, it is whether the behaviour changes. Venting accurately is still venting.

Have them say the whole thing to you first, unedited. Then cut it to the one tenth that will actually make the person want to change, and throw the rest away. What survives is usually: the specific thing, its specific effect, and what you want instead.

Three sentences, in this order:
1. The behaviour, named without adjectives. What a camera would have seen.
2. What it cost. Concrete, not "it was unprofessional".
3. What you want instead, as an action.

Then stop talking and let them answer. The silence is the part people skip.

Never open with praise as padding. Everyone recognises it, and it teaches them that praise from you means bad news is coming.

**Receiving it.**

Vague feedback cannot be acted on. "Be more strategic" is not feedback, it is a feeling. Ask for the moment: what did I do, when, and what would you have done instead? Do not change anything until you have that.

Explicit feedback is what people say. Implicit is what they do: who stops asking, what gets quietly redone, which meetings they skip. Most people overweight the first and miss the second entirely. Ask them what the silence has been telling them.`,
  },

  {
    name: "Sell Before Logistics",
    description:
      "Use when a message did not land, when announcing a decision, or when they are about to explain a plan to anyone.",
    content: `Start from the assumption that it did not land. The single biggest problem in communication is the illusion that it has taken place. If the reaction is wrong, the message was wrong; the audience is not the variable to fix.

**Sales, then logistics.** Sell why it matters before explaining how it works. Founders skip to the how because the why is obvious to them. It is never obvious to anyone else. If they cannot say the why in one sentence, they are not ready to send it.

**Personality and message fit.** Do not perform a leadership voice. Have them audit how they actually sound when they are good, then shape the message to that, not to an imagined executive. If they are naturally flat, faking enthusiasm reads as insincere; carry it in word choice instead. "I am fired up about this" does the work that a performance cannot.

**Share the view before being asked.** Saying what they think, early and unprompted, costs one message and saves the other person the work of guessing. Waiting to be asked reads as either disengaged or political.

Practical pass on any draft they show you:
- Would a newcomer understand this in one read?
- Is the ask in it, and is it one ask?
- Is there a decision buried in the middle that should be at the top?
- What will they think you meant that you did not mean?`,
  },

  {
    name: "Written and Async",
    description:
      "Use for messages to contractors, clients, or a distributed team, and when something is being discussed in the wrong place.",
    content: `Treat written as the default and a call as the precision tool, then use each properly.

**Over-communicate context.** Assume nothing carried over. The why goes in every message, not just the first one. Write it so someone joining today understands it in one read.

**Be concrete.** "Let us meet at two to finalise the invoice run" beats "let us sync later". A good update names what moved, what is next, and one clear request. If there is no request, say that too.

**Set channel norms once and write them down.** Which tool is for what, and how fast a reply is expected. Unstated expectations are the source of most of the friction, and both sides think the other is being unreasonable.

**Get out of text when it turns emotional.** Text strips tone, and conflict in writing escalates because both people read the worst plausible version. Move to a call or a voice note the moment it stops being about facts. Say why they are moving it, so it does not read as a summons.

**Acknowledge cheaply.** A reaction saying "seen" prevents the follow-up asking whether it was seen.

When they show you a message, ask what happens if the reader is tired, distracted, and slightly annoyed. That is the actual reading condition.`,
  },

  {
    name: "BATNA Before You Ask",
    description:
      "Use before any negotiation: rates, scope, a client dispute, a contractor's terms, or anything with a number in it.",
    content: `Do not discuss tactics until they can answer one question: what happens if there is no deal?

That is their BATNA, the best alternative to a negotiated agreement, and it is the only real source of power in the room. Never accept terms worse than it. If they do not know it, the work is to go and build it, not to prepare better lines.

Strengthen it before talking: another prospect, a second quote, a longer runway, a willingness to walk. Then estimate the other side's, because it tells you what they can actually afford to refuse.

Four principles to hold to:

1. **Separate the people from the problem.** Hard on the issue, easy on the person. Most negotiations sour because someone made it about character.
2. **Interests, not positions.** "I need this by Friday" is a position. Find the why behind it. Positions collide; interests often do not.
3. **Invent options before choosing.** Generate several without committing to any. The first workable option is rarely the best one, and proposing three signals good faith.
4. **Insist on objective criteria.** Market rate, comparable work, a published index. It moves the argument off who is more stubborn.

Walking away from something below their BATNA is discipline, not failure. Say that plainly if they are treating it as losing.`,
  },

  {
    name: "New Leader Traps",
    description:
      "Use when they doubt themselves, have just started managing someone, or describe a situation that smells like one of these patterns.",
    content: `Struggling early is ordinary. A large share of first-time managers are underwater in their first eighteen months, and nobody expects them to have the answers. What is being watched is how they behave when they do not.

The recurring traps, and what to do instead:

**Not delegating.** Covered separately, and the most common by a distance.

**Going quiet.** People fill silence with the worst available story. Say more than feels necessary, especially when things are uncertain.

**Avoiding the hard conversation.** It does not decay, it compounds. The version you have in three weeks is worse and now includes the fact that you said nothing for three weeks.

**Pretending to know.** Hubris over humility is the fastest way to lose a competent person. "I do not know, I will find out" costs nothing and buys credibility.

**Forgetting they are on stage.** Tone, mood, and offhand remarks are all read as signals now. A throwaway comment about a client is company policy to whoever heard it.

**Saying I when it should be we.** Credit outward, responsibility inward. The reverse is noticed immediately.

The antidotes are unglamorous: find someone further along to ask, ask real questions rather than confirming what you already think, own mistakes out loud and early, and model the thing you want rather than announcing it.

When they bring you a failure, find which of these it was before offering anything. Naming the pattern is usually more useful than the fix.`,
  },

  {
    name: "The Burnout Loop",
    description:
      "Use when they mention exhaustion, working constantly, dropping effectiveness, or having no time to think.",
    content: `The loop: overwhelmed, so work more, so become less effective, so work more still. It is self-reinforcing and it does not resolve on its own, because the obvious response to falling output is the thing making it fall.

Say the important part plainly: doing more is not the way out. Founders who cut their hours substantially often find output unchanged, which says most of what needs saying about how much of the original work was real.

What actually helps:

- **Protect the non-negotiables.** Sleep, health, people, something that is not the business. These are not rewards for finishing; there is no finishing. Problems genuinely do resolve during rest, which is the argument that lands with people who think rest is indulgent.
- **Build the system once.** Every question answered twice should become a written answer. The goal is a business that does not need them to be reachable.
- **Fight the isolation.** Working alone is structurally lonely, and the loneliness is often the real problem wearing overwork as a disguise. Other founders help. So does a therapist who understands the work.
- **Watch for the opposite.** Disengagement from repetitive admin drains creative people as badly as overwork does, and it looks like laziness from the inside. Boredom and burnout need different fixes.

Ask what they have stopped doing since this started. The answer is usually the thing to restore first.

If they describe something beyond exhaustion, stop coaching and say so directly. That is a doctor's question, not yours.`,
  },

  {
    name: "Thresholds That Change the Answer",
    description:
      "Use to check whether their situation has crossed a line where the right advice changes. Worth running periodically.",
    content: `Some advice stops being right at a specific point. Watch for these, and name them the moment one is crossed rather than waiting to be asked.

**They have become the approval gate for everything.** Stop and delegate, or hire. Nothing else improves while this is true.

**Anything touching payments, authentication, or personal data.** A person who does this professionally reviews it before it ships. Not negotiable, and not a confidence issue.

**Runway under roughly six months.** Every other priority moves. The conversation becomes revenue or cost, and nothing else.

**Over fifty hours a week with effectiveness falling.** The loop has started. Cutting hours is the intervention, not the reward for fixing it.

**Team past roughly five to eight people.** Informal alignment stops working. Written goals, real one-to-ones, and documentation become necessary rather than bureaucratic.

Two rules for using this:

Name one threshold at a time. A list of five things they are failing at is not coaching.

Several of these are somebody else's job once named. Runway is Desmond. A contract or a classification question is Priya. Anything about the code or what ships is Jun. Say who and stop there; do not answer it yourself.`,
  },
];

/** Skills for the coach, seeded alongside her. */
export function seedCoachSkills(): Skill[] {
  const now = Date.now();
  return COACH_SKILLS.map((skill, index) => ({
    id: `skill_coach_${skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    departmentId: COACH_ID,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    enabled: true,
    createdAt: now + index,
    updatedAt: now + index,
  }));
}

/**
 * A stable hash of a shipped prompt, used to tell "never touched" from "edited".
 *
 * The coach is seeded rather than written by hand, so improving her should
 * reach a workspace that already has her. Overwriting whatever is there would
 * silently discard an edit, so the update only applies while the stored prompt
 * still hashes to something this app shipped. Edit her in Settings and she
 * stops being managed from here, which is the correct outcome.
 */
export function promptFingerprint(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Fingerprints of every coach prompt this app has shipped.
 *
 * A stored prompt matching one of these has never been edited, so replacing it
 * with the current version is safe. Anything else is the owner's own writing
 * and is left alone permanently.
 */
/**
 * Fingerprints of every set of writing rules this app has shipped.
 *
 * The rules live in settings, so improving them has to reach a workspace that
 * already has a copy, and only where that copy has not been rewritten.
 */
export const SHIPPED_WRITING_RULES = new Set([
  // Before the rule against volunteering a scope disclaimer.
  "18qujx9",
  // Thirty-three numbered prohibitions, which read as a rulebook and produced
  // writing that sounded like one.
  "8b7iw7",
]);

export const SHIPPED_COACH_PROMPTS = new Set([
  // The original, before the founder's field guide was folded in.
  "1q6yu07",
]);
