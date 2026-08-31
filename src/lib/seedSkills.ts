import { CEO_ID, COMPANY_ID } from "./seed";
import type { Skill } from "./types";

interface SeedSkill {
  departmentId: string;
  name: string;
  description: string;
  content: string;
}

/**
 * The shipped skill library, written around what this studio actually makes:
 * Minecraft mods, small business websites, and factory games, on the stack
 * named in the Company Profile.
 *
 * Every one of these is an ordinary skill. Rewrite, disable, or delete freely.
 * They are deliberately short: each enabled skill is injected into that head's
 * system prompt in full, so a bloated library dilutes attention rather than
 * adding capability.
 */
const SEED_SKILLS: SeedSkill[] = [
  // ------------------------------------------------------ Company wide
  // These are injected into every head's prompt, so they cost their tokens
  // eight times over. Keep this list very short.
  {
    departmentId: COMPANY_ID,
    name: "Handoff Note",
    description:
      "Use when work has to move to another department head, or when the user asks how to brief someone else on it.",
    content: `Write the note the receiving head actually needs, and nothing else.

1. What is being handed over, in one sentence.
2. Why it is moving now, and what is already decided so it does not get reopened.
3. What the receiver has to produce, stated as a finished thing rather than an activity.
4. Constraints they cannot change: budget, deadline, platform, anything already promised.
5. The open questions, marked as theirs to answer.
6. Everything they need to start, named and located.

Rules:
- Address it to the head by name.
- Never hand over a decision you should have made. If you are handing over the choice, say that is what you are doing.
- Keep it under 150 words. A handoff longer than the work is a sign the work is not scoped.`,
  },
  {
    departmentId: COMPANY_ID,
    name: "Decision Record",
    description:
      "Use when a real decision gets made, or when the user asks to write one down so it is not relitigated later.",
    content: `Capture it so the same argument does not happen again in three weeks.

Write exactly these parts:
- Decision: what was decided, in one sentence, in the past tense.
- Date and who decided.
- Context: the situation that forced a choice. Two or three sentences.
- Options considered: each with the one reason it lost. An option with no reason was not really considered.
- Consequences: what this now commits the studio to, including the bad parts.
- Revisit when: the specific signal that would justify reopening it. Not a date, a condition.

Rules:
- Record the decision that was actually made, not the one that should have been.
- If no decision was reached, say so and record what is blocking it instead.
- Never editorialise. This is a record, and it will be read by someone who has forgotten the argument.`,
  },

  // ---------------------------------------------------------------- CEO
  {
    departmentId: CEO_ID,
    name: "Weekly Priority Call",
    description:
      "Use when asked what to focus on, what to do next, how to choose between competing work, or to triage a backlog.",
    content: `Two people run three businesses, so the scarce resource is attention. Fragmenting it across too many live threads costs more than any single choice. Hold to three or four active pieces of work; past that, adding work subtracts output.

**Choosing this week**

1. List every candidate the user raised or that follows from the Company Profile.
2. Score each on three things only: revenue or learning produced, time taken, and whether it is blocked.
3. Choose one. Say it in a sentence.
4. Say what is explicitly not happening, and why that is survivable.
5. Name the assumption that, if wrong, changes the call, and what would show it in three weeks.

Never return a ranked list of five. A list of priorities is not a decision.

**Triaging a backlog**

Every item goes in exactly one bucket, one line each, with the reason in a clause.

- **Ship** starts this month. At most three items.
- **Cut** is deleted, and you say why it will never be worth it.
- **Defer** needs a named trigger that would promote it, such as passing 10k downloads. Deferred with no trigger is Cut with extra steps.

Say which line each Ship item serves. All three represented at once is a warning, not a balance.

**Two standing biases**

Frontier Assembly needs defending: it is the long bet and the easiest thing to crowd out, because it never has a deadline and client work always does. Say so if it has been squeezed for weeks.

Client web work is scheduled revenue, not an interrupt. It gets a defined window.

End with the single thing to drop first if the week goes badly.`,
  },
  {
    departmentId: CEO_ID,
    name: "Revenue Path Check",
    description:
      "Use when an idea, feature, or project is proposed and you need to know whether it actually makes money.",
    content: `Trace the line from the work to the money, and say where it breaks.

1. State the idea in one sentence.
2. Name who pays. If nobody pays directly, name what it feeds that does get paid for.
3. Trace the steps: build, reach, convert, collect. Say roughly how long each takes.
4. Put a number on the first realistic revenue and the date it could land. Mark every figure as an assumption.
5. Name the weakest link in the chain, which is usually reach rather than build.

Close with a verdict in one line: worth building now, worth building later, or a hobby. Say "this is a hobby" plainly when it is, because a hobby is fine as long as it is not counted as a business plan.`,
  },
  {
    departmentId: CEO_ID,
    name: "Launch Retro",
    description:
      "Use after a mod release, a site handover, or a game update, to work out what to repeat and what to stop.",
    content: `Keep it short and specific to the launch that just happened.

1. What was the goal, in the number that was supposed to move.
2. What the number actually did. If it was not measured, say so and treat that as the first finding.
3. Three things that worked and are worth making standard. For each, say what would turn it into a skill or an SOP.
4. Two things that cost time or money for nothing. For each, say what you would do instead.
5. One thing to change before the next launch, chosen because it is the cheapest to fix.

Do not write a timeline of what happened. The user was there. Findings only.`,
  },

  // ---------------------------------------------------------- Marketing
  {
    departmentId: "marketing",
    name: "Campaign Brief",
    description:
      "Use when asked to plan a campaign, a launch, a promotion, or any go to market push.",
    content: `Produce a brief with these parts, in this order, and never skip one.

1. Buyer: who this is for, in plain words, and what they are doing instead today.
2. Promise: the single claim the campaign makes. One sentence.
3. Proof: why anyone should believe the promise.
4. Channel: where it runs, and why that channel suits this buyer.
5. Offer: the specific thing being asked for, including price if there is one.
6. Assets: every piece that has to exist, listed so it can be handed to someone.
7. Measure: the one number that says it worked, and the number that says stop.

Write the headline and the primary body copy in full inside the brief. Do not describe the copy you would write.`,
  },
  {
    departmentId: "marketing",
    name: "Mod Listing Copy",
    description:
      "Use for a CurseForge, Modrinth, or Planet Minecraft page, or questions about mod discovery.",
    content: `Discovery happens on platforms the studio does not own, so listing quality is the whole lever. Download velocity feeds each platform's search ranking, so a listing that stalls keeps stalling. Modrinth has the cleaner API, so prefer it if any of this gets automated later.

A mod page is read in about four seconds before someone hits back. Produce all of this in full:

1. Title: what it does, not a pun. Puns lose search.
2. One line summary naming the loader and Minecraft version. Vandrix is NeoForge 1.21.1.
3. First paragraph: the problem it solves, in the player's words. No lore, no thanks, no roadmap.
4. Three to six features, each a concrete thing the player gets.
5. Compatibility: loader, versions, known conflicts, dependencies.
6. Captions for three screenshots or a gif, saying what to look at. Real screenshots, not renders.
7. A changelog kept genuinely current.

Rules:
- Search terms go in the title and first paragraph, phrased as a player would type them.
- Never open with "Have you ever wanted".
- Install steps and credits at the bottom. Nobody scrolling decides on credits.
- Do not propose ad spend. Growth here is Discord-shaped, word of mouth inside servers, and that is Kai's.`,
  },
  {
    departmentId: "marketing",
    name: "Website Client Pitch",
    description:
      "Use when pitching or quoting a website to a small business, or asked how this line grows.",
    content: `This line runs on referrals, not campaigns. Around nine in ten freelance web designers name word of mouth their most-used channel and roughly eight in ten their most effective, well ahead of social. Directional figures, but act on the direction: the two highest-leverage things are a current portfolio site and a deliberate referral ask at project close. Write the ask into the handoff so it happens every time, name what you want, and ask while the work is fresh.

**The pitch.** Small businesses buy an outcome, not a website.

1. Their problem in their words. Usually no site, an old site, or one nobody finds.
2. What they get: pages, a working contact route, mobile, speed, findable.
3. What it costs and what it excludes. Name the boundary that prevents scope creep.
4. Timeline in weeks, with what you need from them and by when. Their delay is the usual cause of a late site.
5. After launch: who owns the domain, who can edit, what a change costs.

Rules:
- No jargon. Never "responsive", say "works on a phone".
- Name the one thing that will most improve their enquiries and put it first.
- Always state who owns the domain and hosting. That is the argument that happens later.`,
  },
  {
    departmentId: "marketing",
    name: "Steam Page Copy",
    description:
      "Use for the Steam or itch page, wishlist campaigns, or anything about Next Fest timing.",
    content: `The wishlist is the funnel, and Steam Next Fest multiplies what is already there rather than creating it. From a survey of 208 developers after February 2025's Next Fest, median new wishlists that week: under 1,000 entering earned about 462 and none reached the top tier; 10,000 to 99,999 earned about 6,360; 100,000 or more earned about 23,731.

So the order is store page, then playable demo, then an early wishlist push, and only then Next Fest. Entering cold wastes the biggest event available.

**The page itself.** The short description does most of the work, so write it first.

1. Short description: under 300 characters, genre and hook in the first eight words.
2. About the game: three blocks, each a heading plus two or three sentences. Lead with the loop, not the story.
3. Feature bullets: five at most, each a thing the player does rather than a system you built.
4. Capsule text: four words or fewer, legible when small.
5. Tags a factory game player actually browses.

Rules:
- Name the comparison they are already making, Factorio or Satisfactory, and say how this differs. Do not claim to beat them.
- The first trailer frame and the first sentence show the same thing.
- Capsule art deserves disproportionate effort: click-through on it is one of the few funnel steps entirely in the studio's control. Noor owns the critique.
- A wishlist buys a personal notification on release day, which is reach no ad budget buys. Launch discounts conventionally run 10 to 20 per cent.`,
  },

  // ------------------------------------------------------- Social Media
  {
    departmentId: "social",
    name: "Weekly Content Calendar",
    description:
      "Use when asked for a posting schedule, a content calendar, or what to post over a period.",
    content: `Build the calendar as recurring slots, not a pile of post ideas.

1. Pick platforms that suit the work being shown, and say which you are deliberately skipping.
2. Define three to five recurring formats, each with a name and a job: build in public, before and after, question to the audience.
3. Lay the week out as a table: day, platform, format, hook, asset needed.
4. Write the hook in full for every slot. A hook is the first line or first three seconds, not a topic.
5. State the cadence that is genuinely sustainable, and which slot to drop first in a bad week.

If there is no asset pipeline yet, say so and shrink the calendar to what one person can produce.

**Client website work is the exception.** Say plainly that social is not the growth engine there: word of mouth already carries it, and a calendar for that line is effort taken from what actually produces leads. What helps is narrow, a before and after of a finished build or a short case study, and both work as portfolio proof for someone already considering the studio rather than as discovery. Push back once before writing a full calendar for it.`,
  },
  {
    departmentId: "social",
    name: "Devlog Post",
    description:
      "Use for build-in-public updates and short-form clips: devlogs, TikTok, Shorts, Reels.",
    content: `Short-form devlogs are the discovery engine for the game and have to start 12 to 18 months before launch. Starting in the final stretch is the least recoverable mistake. A cadence that survives development: three to five short clips a week built from bugs, satisfying mechanics and small odd moments, plus a longer YouTube devlog every couple of weeks, which is what converts a viewer into a Discord member and a wishlist. Failure and jank perform; polish alone does not.

**A written devlog** earns attention by showing a change, not reporting activity.

1. The visible change, in the first line. If nothing is visible, the post is a screenshot of nothing and should wait.
2. Why it was hard, two or three sentences. This is the part people read.
3. What it means for the player or client.
4. One real open question.

Always pair with a gif or before and after. Never "small update". Version numbers at the end, never in the hook. Reddit wants the problem first, Bluesky wants the gif first, Discord wants the detail.

**A clip script** is written to the second, as a table of time, on screen, and spoken or overlay text.

- 0 to 3s: the hook. Show the payoff or the problem. Never a logo or greeting.
- 3 to 15s: build up, one idea.
- 15 to 25s: the payoff the hook promised.
- Final 2s: one ask.

Write on-screen text separately from voiceover, since most people watch muted. Name the sound or music type, because the wrong track kills reach. One idea per video; a second idea is a second video.`,
  },
  {
    departmentId: "social",
    name: "Launch Day Plan",
    description:
      "Use when a mod, game, update, or client site is going live and the posts need coordinating.",
    content: `Lay out the day as a schedule with times, and write every post in full.

1. Pre-launch, the day before: one post that says when, so the launch is not a surprise to your own audience.
2. Launch hour: the main post per platform, each written natively rather than cross-posted.
3. Two to four hours after: a follow up showing something different, usually a detail or a reaction.
4. End of day: a thank you plus the single most useful link.
5. Day two: the piece that answers whatever people actually asked.

Rules:
- Communities have rules about self-promotion. Say which subreddits or Discords need a different format or permission.
- Have one prepared response for the most likely complaint.
- Never post the same text to two platforms. It reads as a broadcast and both suffer.`,
  },

  // ------------------------------------------------------------- Design
  {
    departmentId: "design",
    name: "Design Critique",
    description:
      "Use when asked to review, critique, or give feedback on a visual, a layout, a screen, or a flow.",
    content: `Critique in three passes, always in this order, and lead with whichever pass is most broken.

1. Communication: does it say the right thing to the right person in the first two seconds. Name what a stranger would think it is.
2. Usability: can someone complete the task. Check hierarchy, target sizes, contrast, and whether meaning survives without colour.
3. Craft: spacing rhythm, alignment, type scale, restraint.

Rules for the feedback itself:
- State the goal you are critiquing against. If none was given, name the goal you are assuming before you start.
- Every criticism comes with a specific change. Not "the hierarchy is weak" but "drop the subtitle to 14px and cut the third button".
- Say which single change would improve it most, and put that first.`,
  },
  {
    departmentId: "design",
    name: "Pixel Art Direction",
    description:
      "Use when directing sprites, tiles, icons, or any pixel art made in Aseprite.",
    content: `Give direction a pixel artist can open Aseprite and execute.

Specify all of these:
1. Canvas size in pixels, and the intended on screen scale. State it as a whole number multiple, never fractional, or every pixel softens.
2. Palette: an exact hex list, usually eight to sixteen colours, with which are shared across the set.
3. Outline rule: full outline, selective outline, or none, applied consistently across the whole set.
4. Light direction, stated once and applied to everything.
5. Readability check: describe what the sprite must still communicate at one to one, since that is the size it ships at.

Rules:
- Anti-aliasing is a decision, not a default. Say yes or no.
- For a tile set, name the tiling rule and check the seam explicitly.
- For an icon set, keep silhouettes distinct. If two read the same in black, one has to change.
- Never specify a colour by name. Give the hex.`,
  },
  {
    departmentId: "design",
    name: "Client Site Layout",
    description:
      "Use when laying out a small business website, or reviewing a layout before it is built.",
    content: `Small business sites fail by burying the one thing the visitor came for. Design against that.

Produce a section by section outline. For each section: its job, its content, and the single action available.

1. Above the fold: who this business is, where it is, and what it does, in one line, plus the primary action. For most local businesses the primary action is calling or booking, not "learn more".
2. Proof: photos of real work, reviews, or credentials. Stock imagery reads as fake and costs enquiries.
3. What they offer: scannable, with prices or price ranges wherever the business will allow it.
4. Contact: phone, hours, and a map if there is a physical location. Repeat the phone number in the footer.

Rules:
- Assume a phone first. Design compact, then let it grow.
- One primary action per page, repeated, never competing with a second.
- Name the fonts with fallbacks and give the palette as hex, including the one accent colour used for actions only.`,
  },
  {
    departmentId: "design",
    name: "Game UI Review",
    description:
      "Use for any in-game interface: HUD, menus, inventory, overlays, readability during play.",
    content: `Factory game interfaces are read hundreds of times a session, so judge them on repeat use rather than first impression.

**Where an element belongs.** Non-diegetic, floating over the screen, is the default and usually right for a fast first-person shooter, because readability under pressure beats immersion. A hybrid is usually better for a factory shooter: critical combat data stays non-diegetic, since health and ammo have to be readable without looking for them, while secondary information like tool state, suit status and machine readouts moves onto the wrist or weapon model. Let players reposition, resize and toggle; a locked layout fails someone at a different distance from a different screen, and these are long sessions. Ask which state the player is in when they read a given element. That decides placement more than taste does.

**Reviewing it:**

1. Glanceability: what must be read without stopping. Constantly changing numbers need fixed width so they stop jittering.
2. Density: these players want more per screen than a general audience. Say where the design is too precious with space.
3. Hierarchy: the one number driving decisions is the largest thing on screen.
4. Input cost: count clicks for the most repeated action. Above two is the finding.
5. Colour meaning: state what each colour means, check it survives colour blindness, pair every colour signal with a shape or label.

Check at 1080p and 1440p; scaling breaks HUDs more often than layout does. A tooltip is not a fix for an unclear icon.`,
  },

  // ------------------------------------------------------------ Finance
  {
    departmentId: "finance",
    name: "Pricing Model",
    description:
      "Use when asked about price, packaging, margins, or whether something is worth building at a given cost.",
    content: `Build the model in the open so any assumption can be swapped.

1. State the unit being priced. One mod, one website, one game, one hour.
2. List every cost that unit carries, fixed and variable, each labelled known or assumed.
3. Work out the value side first: what the buyer avoids, saves, or earns by paying. Price from that.
4. Sanity check the value price against cost. If cost is above it, say so plainly and say what has to change.
5. Give three price points, not one: a floor you would never go below, a target, and a stretch. Say what has to be true for the stretch.
6. Show the arithmetic as a table with an assumptions column.

Close with the single number that most changes the outcome, so the user knows what to go and find out.`,
  },
  {
    departmentId: "finance",
    name: "Website Quote",
    description:
      "Use when scoping and pricing a client website, or checking whether a quote already given was sensible.",
    content: `Market bands, directional and worth checking before a quote leans on them: hourly runs 30 to 200 with most experienced work at 50 to 100; a basic small-business site sits around 2,000 to 8,000; the realistic band for an established client is 3,000 to 8,000; about 82 per cent of the industry prices by project rather than hourly.

Price by project and make scope discipline part of the price. A project quote without a scope boundary is an hourly job at a fixed fee.

1. Break the job into pages, custom design, content entry, integrations, and setup of domain, hosting and email.
2. Estimate hours per line honestly, then add a contingency and label it as one. Client work overruns on revisions, not on building.
3. State the revision limit, matching the contract. Two rounds included, further rounds hourly at a named rate, is the standard that prevents the argument. The rate has to be in the quote or it is unenforceable in practice.
4. List exclusions: copywriting, photography, logo design, ongoing changes, anything needing a paid third-party service.
5. Give the payment schedule. A deposit before starting is not optional at this size.
6. Price recurring costs separately, per year: hosting, domain renewal, email.

Close with the walk-away price, the number below which the job is not worth taking. Scope creep is a finance problem before it is a legal one; the clauses are Priya's, the rate that makes them bite is yours.`,
  },
  {
    departmentId: "finance",
    name: "Game Revenue Forecast",
    description:
      "Use when forecasting game sales, checking whether a wishlist count justifies a launch, or working out what Epic takes.",
    content: `**Epic's terms, as fixed numbers.** 5 per cent of lifetime gross revenue above 1,000,000 dollars, per product. 3.5 per cent under Launch Everywhere, if the game releases on the Epic Games Store at or before other stores. No royalty in any calendar quarter earning under 10,000 dollars. Revenue through the Epic Games Store itself never carries a royalty.

| Scenario | Owed |
| --- | --- |
| Lifetime under 1,000,000 | 0 |
| 1,500,000 lifetime, standard | 5% of 500,000 = 25,000 |
| 1,500,000 lifetime, Launch Everywhere | 3.5% of 500,000 = 17,500 |
| A quarter under 10,000 | 0 for that quarter |

The threshold applies to revenue above the first million, not the whole amount. Getting that wrong overstates the cost threefold. Launch Everywhere is a commercial decision with a distribution cost, not free money; say what it trades away. The reports owed even at zero are Priya's.

**Forecasting.** In ranges, never a single number, showing every step.

1. Start from the input you have, usually wishlists at launch or downloads for a mod.
2. Apply a conversion range, labelled as an industry assumption to be replaced with real data. State the range, not a point.
3. Apply the platform cut, then the royalty above, then tax. The quoted number is almost always before all three.
4. Spread it over launch week, first month, first year. Most lands in week one; the tail depends entirely on updates.
5. Compare against what it cost to build, including time valued at what an hour of client work would have earned instead.

Close with the break-even in units, the only number worth remembering. Say plainly if it is not reachable.`,
  },
  {
    departmentId: "finance",
    name: "Monthly Books Check",
    description:
      "Use for a monthly or quarterly review of spending, subscriptions, income, and runway.",
    content: `A short review that catches the two things that actually hurt: silent subscriptions and uneven income.

1. List every recurring cost with its renewal date and annual total. Google Workspace, Hostinger, Cloudflare, Vercel, and any asset or software subscriptions.
2. Flag anything paying for capacity that is not being used, and anything renewing annually within the next sixty days.
3. Split income by product line: mods, client sites, games. Say which line is actually carrying the studio.
4. Calculate runway in months at the current burn, and again assuming client work stops, because it is the volatile line.
5. Name the single largest avoidable cost.

Rules:
- Separate one off costs from recurring ones, or the burn figure is wrong.
- Treat unpaid invoices as unpaid until the money lands, never as income.
- This is general bookkeeping guidance. Anything with a filing deadline goes to a licensed accountant.`,
  },

  // -------------------------------------------------------------- Legal
  {
    departmentId: "legal",
    name: "Contract Read",
    description:
      "Use when given a contract, terms of service, licence, or any agreement to review or explain.",
    content: `Read it the way a founder needs it read.

1. Say in two sentences what the agreement does and who carries the risk.
2. Go clause by clause on anything that matters. For each: quote the clause briefly, restate it in one plain sentence, then say what it means in practice.
3. Rank every flagged item as blocking, worth negotiating, or acceptable. For blocking and negotiable items, write the replacement wording you would ask for.
4. List what is missing. Absent terms cause more trouble than bad ones. Check at minimum: termination, payment timing, IP ownership, liability cap, governing law.
5. Ask which jurisdiction governs it if that changes your answer.

Always close with the disclaimer: this is general information, not legal advice, no attorney client relationship exists, and anything with real exposure needs a licensed attorney in the relevant jurisdiction.`,
  },
  {
    departmentId: "legal",
    name: "Client Web Agreement",
    description:
      "Use when drafting, reviewing, or arguing about a client website contract.",
    content: `Build from the AIGA Standard Form of Agreement and Andy Clarke's Contract Killer 3. Where they differ, AIGA is the higher authority, being attorney-drafted.

The load-bearing clauses, and why each is there:

- **IP transfers only when payment clears in full**, not on delivery. Delivery-based transfer means a non-paying client owns the work.
- **Third-party assets are licensed to the client, never owned.** Stock, fonts, premium plugins. The studio cannot transfer what it does not own.
- **The studio keeps portfolio rights.** Without this the best work cannot be shown, which costs referrals on a line that runs on them.
- **Two to three revision rounds included; past that, hourly change orders at a named rate.** The rate has to be in the contract or it is unenforceable in practice.
- **Payment 50/50 or milestones, with a stated late fee**, commonly 1.5 per cent a month.
- **Liability capped at fees actually paid.** Uncapped liability on a 4,000 dollar site is an unacceptable trade.
- **Scope as a page count and named feature list**, with anything outside it a change request at the stated rate.
- **A pause clause** if the client goes quiet for a stated period. It prevents most disputes.
- **Hosting, domain and email**: whose accounts, who pays renewals, what happens at the end.
- **Termination on both sides**, and what is owed for work already done.

When reviewing a client's own contract, check for these by absence first. Flag anything missing as blocking, and close with the standard disclaimer.`,
  },
  {
    departmentId: "legal",
    name: "Mod and Asset Licensing",
    description:
      "Use before forking a mod, using someone else's work, picking a licence, or answering a distribution question.",
    content: `**The Minecraft case is unusual and this is the mistake people make.** Minecraft's own copyright is effectively all rights reserved, which makes plain GPL incompatible with modding it, because GPL requires everything linked to it to be open source too and Minecraft cannot be.

What works instead: **LGPL-3.0**, the usual fix and what most modding libraries use; a source's own linking exception; **MIT**, permissive and safe to build on even inside an all-rights-reserved project; **Apache-2.0**, also permissive, additionally granting patent rights and requiring notice of changed files.

Two rules that get missed. Licence code and assets separately, since textures, models and sounds are not covered by the code licence and frequently have different terms. And carry attribution forward, including into a private project.

When someone names a mod to fork, ask for its licence file before anything else. Never guess a licence: if it is not stated, permission has not been given.

**The studio's own posture** is LGPL-3.0-or-later for mod code with assets all rights reserved, so a mod outlives the studio's attention while the art and the name stay. See the licensing notes in the repository.

**Distribution questions**, work through:

1. What is being distributed and on which platform, since CurseForge, Modrinth and itch each add terms on top of the licence.
2. The upstream rules. Mods for a commercial game sit under that game's EULA and monetisation guidance.
3. Every third-party asset: sprites, sounds, fonts, code libraries. Name the licence and whether attribution or share-alike applies. Fonts are the most commonly missed.
4. What licence to publish under, and what that lets other people do.
5. Monetisation, and which routes risk a takedown.`,
  },
  {
    departmentId: "legal",
    name: "Privacy and Compliance Check",
    description:
      "Use when a site or game collects data, uses analytics, has a contact form, or needs a privacy policy.",
    content: `Start from what is actually collected, since most policies describe things the site does not do.

1. Inventory the data: contact form fields, analytics, cookies, embedded third parties, error tracking, and anything a game sends home.
2. For each, name the purpose, where it goes, and how long it is kept. Anything with no stated purpose should be switched off rather than documented.
3. Say which rules plausibly apply given where the visitors are, usually UK and EU GDPR for a public site, and what each requires in practice.
4. Cookie banners are needed only for non essential cookies. If analytics are cookieless, say so and skip the banner.
5. Produce the policy sections needed, in plain English, with placeholders marked for the business name, contact address, and jurisdiction.

Rules:
- Never copy a policy from another site. It will describe the wrong processing.
- Flag any third party embed that sets cookies before consent, because that is the common failure.
- Close with the standard disclaimer.`,
  },

  // --------------------------------------------------------- Operations
  {
    departmentId: "operations",
    name: "SOP Writer",
    description:
      "Use when asked to document a process, write a checklist, or make something repeatable.",
    content: `Write it so someone who has never done it can do it correctly the first time.

Structure every SOP this way:
- Purpose: one sentence on what this produces.
- Owner: the single role accountable. Never "the team".
- Trigger: the event that starts it.
- Steps: numbered, each starting with a verb, each doable without asking a question.
- Done condition: how you know it is finished and correct.
- Failure modes: the two or three ways this usually goes wrong, and what to do about each.

Rules:
- If a step needs judgement, say what the judgement call is and give the rule of thumb.
- Name the actual tool and the actual place a thing gets saved.
- Keep it to one screen. If it is longer, it is two processes.`,
  },
  {
    departmentId: "operations",
    name: "Site Launch Checklist",
    description:
      "Use when taking a client website live, or checking one that just went live.",
    content: `Work through in order. Each item is either done or blocking, never partly done.

Before pointing the domain:
1. Every page loads, every internal link resolves, no placeholder text remains.
2. Contact form submits and the message actually arrives at the Google Workspace inbox. Send a real test.
3. Phone numbers and addresses are correct and tappable on a phone.
4. Checked on a real phone, not just a resized browser window.
5. Titles and meta descriptions written per page, not left as the template default.
6. Favicon, share image, and a 404 page exist.

Domain and hosting:
7. DNS at Cloudflare pointing at the Vercel deployment, with the apex and www both resolving.
8. HTTPS working and forced, no mixed content warnings.
9. Email records intact after the DNS change. This is the step that breaks a client's email, so verify MX before and after.
10. Analytics installed and recording a test visit.

After launch: confirm the client can find the site by searching their own business name, and record who holds the Hostinger and Cloudflare logins.`,
  },
  {
    departmentId: "operations",
    name: "Mod Release Checklist",
    description:
      "Use when shipping a mod version to CurseForge, Modrinth, or anywhere else.",
    content: `Same order every release, because the failures are always the same ones.

Before building:
1. Version number bumped, following the scheme already in use, and the Minecraft and loader versions confirmed.
2. Changelog written for players, not from commit messages. Group into added, changed, fixed.
3. Dependencies and their minimum versions checked.

Testing:
4. Fresh world loads. Existing world from the previous version loads without losing anything. This is the one that generates the bug reports.
5. Tested on the actual target loader versions, not only the development one.
6. Uninstall does not corrupt a save, or the changelog says clearly that it does.

Publishing:
7. Jar built from a clean checkout and named to the platform convention.
8. Uploaded with correct version tags, loader tags, and dependency links on every platform.
9. Page updated: screenshots current, compatibility block correct.
10. Announcement posted after the file is live and confirmed downloadable, never before.

Keep the released jar and its source tag archived.`,
  },
  {
    departmentId: "operations",
    name: "Client Onboarding",
    description:
      "Use when a client job starts, or when one is running long or drifting outside what was priced.",
    content: `The operational risk on this line is scope creep, not tooling. Two people quietly working outside what was priced is how a profitable project becomes a loss.

**Getting to a state where work can start:**

1. Confirm scope in writing and get an explicit yes. A verbal yes is not a start. State the exclusions; they matter more than the inclusions.
2. Take the deposit. Work starts after it clears, not after it is promised.
3. Collect assets in one go with a single named list: logo files, photos, text per page, opening hours, contact details, existing accounts. Give a deadline.
4. Get access or confirm what needs creating: registrar, host, email, social accounts.
5. Agree one point of contact. Two decision makers is the usual cause of a stalled project.
6. Set the check-in rhythm and review points, so revisions land in the rounds that were quoted.
7. Create the project folder, shared doc, and calendar entries.

**Holding the line during the build.** Keep a revision tracker counting against what the contract actually promises, not a general sense of how many rounds have happened, and say out loud when the included rounds are used up before the next one starts. When a request arrives mid-project, name whether it is in scope, a revision round, or a change order before discussing whether to do it; answering first makes the boundary unarguable later.

**At close**, a handoff checklist: what they receive, what they can edit, what happens if something breaks, and the referral ask Marisol wants made while the work is fresh.

Never build against promised content; placeholder content becomes permanent. Record every login in the studio's own store, not a chat thread.`,
  },

  // -------------------------------------------------------- Engineering
  {
    departmentId: "engineering",
    name: "Code Review",
    description:
      "Use when given code, a diff, or a pull request to review, or when asked whether an implementation is sound.",
    content: `Review in strict priority order and label every comment with its category.

1. Correctness: does it do the wrong thing. Give the concrete input or state that breaks it.
2. Security: injection, secrets, authorisation, unsafe deserialisation, anything that trusts input it should not.
3. Reliability: unhandled errors, missing cleanup, race conditions, silent failure paths.
4. Performance: only where it is measurably real, not theoretical.
5. Clarity: naming, dead code, duplicated logic.

Rules:
- Prefix every comment with its category so style is never argued at the same weight as a bug.
- For every correctness or security finding, describe the failing scenario. A claim without a scenario is a guess, and you say so.
- Say plainly when the code is fine. Manufacturing findings to look thorough wastes the user's time.
- Suggest the fix as code, not as a description of the fix.`,
  },
  {
    departmentId: "engineering",
    name: "Mod Architecture",
    description:
      "Use for structural decisions on a Minecraft mod: loaders, versions, package layout, data storage, or registry problems.",
    content: `**NeoForge 1.21.1 is the baseline, and its conventions are not optional.** Correct neoforge.mods.toml metadata; the mod's top-level Java package matching its mod group ID; the mod ID used consistently as both registry namespace and resource namespace. That last one is the recurring cause of resources that silently fail to load, a mismatch between the namespace used to register and the namespace the files sit under. It does not error, it just does not appear. When something is not loading and nothing is logged, check the namespace before anything else.

Decide the rest against the versions and loaders actually being supported, since that constrains everything:

1. Target matrix: which versions, which loaders. Say the maintenance cost of each extra combination out loud, because it is the decision that hurts later.
2. Separate logic from loader-specific code from the start if more than one loader is targeted. Retrofitting that split is expensive.
3. Data and persistence: what is saved to the world, in what format, and how it migrates when the format changes. A save format with no version field is future data loss.
4. Registry and event use: register once, avoid static state surviving a world reload.
5. Client and server split: name what runs where, and check nothing client-only is reachable on a dedicated server.
6. Performance: anything on the tick loop runs twenty times a second. Say what work happens there and what can move off it.`,
  },
  {
    departmentId: "engineering",
    name: "Client Site Build Spec",
    description:
      "Use when deciding how to build a client website, or reviewing the technical setup of one.",
    content: `These sites are built once and rarely touched, so optimise for handover and for not breaking.

Specify:
1. Whether this needs a framework at all. Many small business sites are five static pages and a form, and shipping a static site removes an entire class of future breakage.
2. Content editing: whether the client will ever edit it. If yes, say how, and price it. If no, say so and keep it in the repo.
3. Forms: where submissions go and what happens if the service stops. A form that silently fails is worse than no form.
4. Hosting on Vercel with DNS at Cloudflare: name what is set where, and keep the domain registrar separate from both.
5. Performance budget: the site must be usable on a phone on mobile data. Give a target and name the images as the usual culprit.
6. Analytics and error visibility, so a broken form is noticed by you rather than by the client.

Close with what the client is handed at the end: repo, accounts, and how to make a text change.`,
  },
  {
    departmentId: "engineering",
    name: "Simulation Performance",
    description:
      "Use for frame rate, large scenes, tick rate, throughput, or anything that slows as the player builds more.",
    content: `A factory game is judged at ten thousand entities, not ten. Design for the late game.

**Method first, because guessing here is worse than useless.** Profile with Unreal Insights before changing anything; a theory about what is slow is not a measurement. Change one variable at a time, then measure again. Two changes and an improvement tells you nothing about which to keep. Say plainly when a proposed optimisation is premature: a frame budget spent on something that was never the bottleneck is spent twice.

**What to work through:**

1. What scales: name the thing whose count grows without bound, usually machines, items in transit, or belt segments.
2. Update model: full simulation every tick does not survive scale. Say what can be event driven, what can be batched, and what can be approximated without the player noticing.
3. Data layout: contiguous arrays over object graphs for anything iterated every tick. Name the hot loop.
4. Save format: size and write time grow with the base. Say how saves stay incremental, and include a version field from day one.
5. Determinism: decide early, because retrofitting it is close to a rewrite.
6. Measurement: name what to measure and at what base size. An optimisation with no before and after number is a guess.

**In UE5 specifically**, the two things that bite in large factory scenes are UObject counts and dynamic lighting. The standard fixes are World Partition and baked lighting wherever the scene allows, the same category of change that let Satisfactory's own UE5 move improve large-factory performance meaningfully.`,
  },
  {
    departmentId: "engineering",
    name: "Bug Triage",
    description:
      "Use when given a bug report, a crash, or a description of something behaving wrongly.",
    content: `Reproduce before theorising. Most wrong fixes come from skipping step one.

1. Restate the bug as expected behaviour versus actual behaviour, in one line each.
2. Establish reproduction: exact steps, versions, loader, and whether it happens on a fresh world or save. If it cannot be reproduced, say what information would make it reproducible and stop there.
3. Isolate: name the narrowest thing that still triggers it. Binary search the surface area rather than reading the whole codebase.
4. Diagnose: state the cause as a mechanism, not a location. "The list is mutated while being iterated" beats "something is wrong in the tick handler".
5. Fix, and write the check that would have caught it.
6. Severity: crash, data loss, wrong behaviour, or cosmetic. Data loss outranks a crash, because a crash is visible and data loss is not.

Say plainly when a report has too little information to act on, and give the three questions that would unblock it.`,
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
