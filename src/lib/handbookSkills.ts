import { CEO_ID } from "./seed";
import type { Skill } from "./types";

interface SeedSkill {
  departmentId: string;
  name: string;
  description: string;
  content: string;
}

/**
 * Skills from the AI Business System Handbook.
 *
 * Written as skills rather than folded into system prompts, for two reasons.
 * Prompts are editable and overwriting one would discard whatever was written
 * there; and most of this is reference a department needs on the occasions it
 * applies, not context worth paying for on every request.
 *
 * The bias throughout is toward hard constraints and exact figures: Mojang's
 * rules, Epic's royalty terms, license compatibility, NeoForge conventions.
 * Those are the things a model will otherwise invent plausibly and wrongly.
 * Figures the handbook itself marks as directional say so in the skill.
 */
const HANDBOOK_SKILLS: SeedSkill[] = [
  /* ------------------------------------------------------------ CEO */
  {
    departmentId: CEO_ID,
    name: "Which One This Month",
    description:
      "Use when the founder brings several things at once, or asks how to fit everything in.",
    content: `Two people run three businesses. The scarce resource is attention, not information, and fragmenting it across too many live threads costs a large share of the useful hours. So the answer to five things is never a plan for five things.

Give them:
1. The one that matters this month, and why that one.
2. What waits, named, so it is a decision rather than a thing being dropped quietly.
3. What would tell them in three weeks that the call was wrong.

Hold to three or four active pieces of work at once. Past that, adding work subtracts output.

Two standing biases when you choose:

**Frontier Assembly needs defending.** It is the long bet and the easiest thing to crowd out, because it never has a deadline and client work always does. If it has been squeezed for weeks, say so.

**Client web work is scheduled revenue, not an interrupt.** It gets a defined window. Letting it expand to fill the week is how the game stops moving.`,
  },

  /* ------------------------------------------------------ Marketing */
  {
    departmentId: "marketing",
    name: "Wishlists Before Next Fest",
    description:
      "Use for Frontier Assembly launch planning, Steam page questions, or anything about Next Fest timing.",
    content: `The wishlist is the funnel. Steam Next Fest multiplies what is already there; it does not create it.

From a survey of 208 developers after February 2025's Next Fest, median new wishlists earned that week:

- Entering under 1,000 wishlists: about 462, and none reached the top tier
- Entering 10,000 to 99,999: about 6,360
- Entering 100,000 or more: about 23,731

The order that follows from that: store page, then playable demo, then an early wishlist push, and only then Next Fest. Entering cold wastes the single biggest event available.

What a wishlist buys at launch is a personal notification on release day, which is reach no ad budget buys. Launch discounts conventionally run 10 to 20 per cent.

Capsule art deserves disproportionate effort. Click-through on it is one of the very few funnel steps entirely inside the studio's control, so it is worth more attention than its size suggests. Noor owns the critique.`,
  },
  {
    departmentId: "marketing",
    name: "Mod Listing Discovery",
    description:
      "Use for Vandrix, any mod or modpack release, or questions about CurseForge and Modrinth reach.",
    content: `Discovery happens on platforms the studio does not own, so listing quality is the whole lever.

Every listing needs accurate version and loader tags (NeoForge 1.21.1 for Vandrix), real screenshots rather than renders, and a changelog kept genuinely current. Download velocity feeds each platform's own search ranking, so a listing that stalls keeps stalling.

Modrinth has the cleaner API, so prefer it as the target if any of this gets automated later.

Past the listing, growth is Discord-shaped rather than campaign-shaped: word of mouth inside servers, not paid reach. That part is Kai's.

Do not propose an ad spend here. It is not how this line grows.`,
  },
  {
    departmentId: "marketing",
    name: "Ask For The Referral",
    description:
      "Use for client website work: pipeline, growth, marketing spend, or what to do at the end of a project.",
    content: `This line runs on referrals, not campaigns. Around nine in ten freelance web designers name word of mouth their most-used channel, and roughly eight in ten their most effective, well ahead of social. Treat those as directional but act on the direction.

The two highest-leverage pieces of marketing here are unglamorous:

**A current portfolio site.** Fast, and actually showing recent work. It is the thing a referral checks before calling.

**A deliberate ask at project close.** Not a hope that one appears. Write it into the handoff so it happens every time: name what you want (an intro to someone with a similar problem), make it easy to forward, and ask while the work is fresh and they are pleased.

If asked about campaigns for this line, say plainly that the money is better spent on the portfolio and the ask.`,
  },

  /* --------------------------------------------------- Social Media */
  {
    departmentId: "social",
    name: "Devlog Cadence",
    description:
      "Use for Frontier Assembly content plans, short-form video, or the run-up to a game launch.",
    content: `Short-form devlogs are the discovery engine, and they have to start 12 to 18 months before launch. Starting in the final stretch is the most common and least recoverable mistake.

A cadence that survives contact with development:

- Three to five short clips a week on TikTok and YouTube Shorts, built from bugs, satisfying mechanics, and small odd moments. Failure and jank perform; polish alone does not.
- A longer YouTube devlog every couple of weeks, which is what converts a casual viewer into a Discord member and a wishlist.

Bluesky is worth a presence for professional visibility and press since much of the gamedev community moved there, even though raw reach is smaller. Treat it as networking, not distribution.

Write the actual script and the actual caption. A description of the kind of clip to make is not usable.`,
  },
  {
    departmentId: "social",
    name: "Discord As An Operating System",
    description:
      "Use when setting up or fixing a Discord for a server, mod, or the game community.",
    content: `Discord is retention rather than chat, and a single flat general channel wastes it.

Structure it as a light operating system:

- Bug reports, with a format people actually fill in
- Patch notes, posted on a rhythm so people know when to look
- Feedback, kept separate from bugs because they need different handling
- Recognition, where contributors get named

Reddit (r/Minecraft, r/feedthebeast) amplifies what is already working and rewards genuine participation, but it rarely creates awareness from cold. Do not plan a launch around it.

Discord listing sites are a modest but real discovery source and worth being on.

Feed community chatter back as three piles: bugs for Jun, requests for the roadmap, and noise. Doing that triage is the job, not reading everything.`,
  },
  {
    departmentId: "social",
    name: "When Social Is Not The Channel",
    description:
      "Use when asked to build a social strategy for the client website business.",
    content: `Say plainly that social is not the growth engine for this line. Word of mouth already carries that job, and a content calendar for client web work is effort spent away from the thing that actually produces leads.

Where social does help here is narrow and worth doing:

- A before and after post of a finished client build
- A short case study naming the problem and the result

Both function as portfolio proof for someone already considering the studio, not as discovery. Frame them that way and keep the effort proportionate.

If pushed for a full calendar for this line, push back once and explain the trade before writing one.`,
  },

  /* --------------------------------------------------------- Design */
  {
    departmentId: "design",
    name: "Game HUD Decisions",
    description:
      "Use for Frontier Assembly interface work: HUD, overlays, readability during combat.",
    content: `The general design handbook covers the rest of the studio's UI. This is what it does not cover.

Non-diegetic elements, floating over the screen, are the default and usually correct for a fast first-person shooter, because readability under pressure beats immersion.

A hybrid is usually the better answer for a factory shooter specifically:

- Critical combat data stays non-diegetic. Health and ammo have to be readable without looking for them.
- Secondary information moves onto the wrist or the weapon model. Tool state, suit status, machine readouts. Immersive, and glanceable when there is time to glance.

Let players reposition, resize, and toggle elements. A locked layout fails someone at a different distance from a different sized screen, and factory games are played for long sessions.

Ask which state the player is in when they read a given element. That decides where it belongs more than taste does.`,
  },
  {
    departmentId: "design",
    name: "Teaching Without Stopping Play",
    description:
      "Use for onboarding, tutorials, or first-time-user experience in the game.",
    content: `Onboarding has the tightest budget in the game: it has to teach without breaking pace, and the cost of getting it wrong is a refund.

Four rules:

1. One concept at a time. Two mechanics introduced together are two mechanics half learned.
2. At the moment it is needed, not before. A mechanic explained ten minutes early is explained twice.
3. Through play, never a wall of text. If it can only be explained in writing, the mechanic needs redesigning.
4. Skippable. Someone who has played something similar resents being taught, and they are a large share of the audience for a factory game.

When reviewing a proposed tutorial, ask what the player is doing with their hands during each beat. If the answer is "reading", it is not onboarding yet.`,
  },
  {
    departmentId: "design",
    name: "Key Art Against Click-Through",
    description:
      "Use for capsule art, thumbnails, store imagery, or any art whose job is getting a click.",
    content: `Critique this against click-through, not taste. Capsule art is one of the few funnel steps entirely inside the studio's control, and it carries more weight than any other single visual asset.

What to check, in order:

- **Readable at the smallest size it ships at.** Steam shows the capsule tiny in most placements. If the shape does not survive that, nothing else matters.
- **One subject.** A composition with three focal points has none at this size.
- **Genre legible in under a second.** Someone scrolling should know what kind of game it is before reading the title.
- **Text only if it survives the shrink.** Usually it does not, beyond the logo.
- **Different from the neighbours.** It is seen in a grid of competitors, never alone.

For thumbnails and Discord banners across the Minecraft properties, the win is a consistent template reused constantly, not one excellent one-off.`,
  },
  {
    departmentId: "design",
    name: "One Studio Across Three Lines",
    description:
      "Use when checking whether Vandrix, the servers, Codex, and the game still look like the same studio.",
    content: `Vandrix, the Hunter server, the dungeon-keeper server, and Codex should read as one studio under one system. The job on the Minecraft line is consistency, not invention.

The tokens to hold to:

- Purple seed colour \`a06aff\`
- Dark as the default theme
- Roboto and Roboto Flex
- Material Design 3 structure throughout

Flag drift when you see it: an off-palette accent, a second typeface, a corner radius that belongs to nothing else. Drift arrives one reasonable exception at a time.

Client website work is the exception. Those carry the client's identity, not the studio's, and the general design handbook governs them directly.`,
  },

  /* -------------------------------------------------------- Finance */
  {
    departmentId: "finance",
    name: "UE5 Royalty Arithmetic",
    description:
      "Use for any Frontier Assembly revenue projection, pricing model, or question about what Epic takes.",
    content: `Epic's terms, as fixed numbers:

- 5 per cent of lifetime gross revenue above 1,000,000 dollars, per product
- 3.5 per cent under Launch Everywhere, if the game releases on the Epic Games Store at or before other stores
- No royalty in any calendar quarter where the product earns under 10,000 dollars
- Revenue earned through the Epic Games Store itself never carries a royalty

Worked examples:

| Scenario | Owed |
| --- | --- |
| Lifetime under 1,000,000 | 0 |
| 1,500,000 lifetime, standard | 5% of 500,000 = 25,000 |
| 1,500,000 lifetime, Launch Everywhere | 3.5% of 500,000 = 17,500 |
| A quarter under 10,000 | 0 for that quarter |

The threshold is on revenue above the first million, not on the whole amount. Getting that wrong overstates the cost by a factor of three.

Launch Everywhere is a commercial decision with a distribution cost, not free money. Say what it trades away before recommending it. The compliance side, including the reports owed even at zero, is Priya's.`,
  },
  {
    departmentId: "finance",
    name: "Kickstarter Goal Sizing",
    description:
      "Use when crowdfunding comes up for the game, or when sizing a funding target.",
    content: `Goal size predicts outcome more than almost anything else. Across roughly 17,000 game campaigns tracked since 2009, none of the fifteen aiming at 2.5 million or more succeeded, and 81.8 per cent of all money raised came from campaigns with goals of 500,000 or less.

2025 context: 443 successful game campaigns raised just under 26 million between them, with eleven clearing 500,000, the most in that band since 2015. A smaller, more disciplined market rather than a dead one.

Do not run one without all four of these:

1. Six or more months of community building already done
2. A playable demo
3. A pre-launch email list of 1,000 or more
4. A real plan to hit roughly 30 per cent of goal on day one

Day one momentum decides the rest. A campaign that opens quiet stays quiet.

Treat these figures as directional; they come from industry reporting rather than primary data. The shape of the advice holds regardless: size the goal to what the community can actually carry.`,
  },
  {
    departmentId: "finance",
    name: "Quoting Client Web Work",
    description:
      "Use for pricing a website build, writing a quote, or handling scope creep on a client project.",
    content: `Market bands, directional and worth checking before a quote leans on them:

- Hourly runs 30 to 200, with most experienced work at 50 to 100
- A basic small-business site sits around 2,000 to 8,000
- The realistic band for an established small-business client is 3,000 to 8,000
- About 82 per cent of the industry prices by project rather than hourly

Price by project, and then make scope discipline part of the price. A project quote without a scope boundary is an hourly job at a fixed fee.

Every quote states:

- What is included, as deliverables rather than activities
- How many revision rounds are included, matching what the contract says, usually two or three
- The hourly rate that applies past those rounds, named up front rather than negotiated later
- The payment split, commonly 50/50 or milestones

Scope creep is a finance problem before it is a legal one. The contract clauses are Priya's; the rate that makes them bite is yours.`,
  },
  {
    departmentId: "finance",
    name: "What Minecraft Monetisation Allows",
    description:
      "Use before pricing anything on a Minecraft server, mod, or modpack.",
    content: `There is a hard ceiling here and it is set by Mojang, not by the market.

Allowed: cosmetic ranks, cosmetics, and perks with no gameplay advantage.

Not allowed, ever: anything affecting fairness or competitive standing. That rules out most of what makes server monetisation lucrative elsewhere, and it is not negotiable. Priya has the compliance detail.

What stacks cleanly on top:

- **CurseForge Rewards.** Roughly 0.05 dollars per point from a monthly download-based pool, split about 70 per cent creator, 30 per cent platform. Directional, and it moves.
- **Patreon or Ko-fi tiers** for early access or exclusive builds. These do not compete with the Rewards pool, so they add rather than cannibalise.

When modelling revenue on this line, model it as small and additive. It is not a line that scales with effort the way client work does, and pretending otherwise distorts the whole runway.`,
  },

  /* ---------------------------------------------------------- Legal */
  {
    departmentId: "legal",
    name: "Standing Disclaimer",
    description:
      "Use on every answer touching a specific contract, filing, licence, or compliance question.",
    content: `Say this in your own words, near the start, every time. Not as boilerplate at the end where it is skipped.

The three things it has to carry:

1. This is general information from an AI assistant, not legal advice.
2. No attorney-client relationship exists.
3. Anything with real money or real exposure attached goes to a licensed attorney in the relevant jurisdiction.

Then answer properly. The disclaimer is not a reason to be vague, and hedging every sentence afterwards makes the answer useless. Be specific and useful, and be clear about what it is.

Rank everything you flag as blocking, worth negotiating, or acceptable. An undifferentiated list of concerns is not usable.

Name what a contract is missing, not only what it contains. Absent clauses cause more trouble than bad ones.`,
  },
  {
    departmentId: "legal",
    name: "Mojang Compliance",
    description:
      "Use for any Minecraft server, mod, modpack, or Codex listing, and before anything public ships.",
    content: `Mojang's Commercial Usage Guidelines define commercial use broadly: any use or sharing of the Minecraft name, brand, or assets, paid or free. Free does not exempt anything.

Every Vandrix, Hunter, and Codex property needs, prominently displayed:

- A disclaimer to the effect of "not an official Minecraft product, not approved by or associated with Mojang or Microsoft"
- A clear, real way to contact whoever is responsible. **A Discord invite alone does not count.**

Virtual currencies can never have real-world cash-out value. Not as a policy choice; it is a rule.

Monetisation is capped at cosmetic and non-advantage perks. Desmond has the revenue side, but the ceiling is set here.

Check these before something goes public rather than after. Retrofitting a disclaimer onto an established server is harder than adding it on day one, and the exposure runs the whole time it is missing.`,
  },
  {
    departmentId: "legal",
    name: "Mod Licence Compatibility",
    description:
      "Use before forking a mod, using someone else's code, or picking a licence for studio code.",
    content: `Forking is a licence question first, and the Minecraft case is unusual.

Minecraft's own copyright is effectively all rights reserved. That makes plain **GPL incompatible with modding it**, because GPL requires everything linked to it to be open source too, and Minecraft cannot be. This surprises people and it is the most common serious mistake on this line.

What works instead:

- **LGPL-3.0.** The usual fix, and what most modding libraries use.
- **A source's own linking exception.** Some GPL projects add one specifically for this.
- **MIT.** Permissive, safe to build on inside an all-rights-reserved project like Codex.
- **Apache-2.0.** Also permissive, additionally grants patent rights, and requires notice of changed files.

Two rules that get missed:

**Licence code and assets separately.** Textures, models, and sounds are not covered by the code licence and frequently have different terms.

**Carry attribution forward.** Whatever the original licence requires travels with the code, including into a private project.

When someone names a mod they want to fork, ask for its licence file before anything else.`,
  },
  {
    departmentId: "legal",
    name: "Client Contract Clauses",
    description:
      "Use when drafting, reviewing, or arguing about a client website contract.",
    content: `Build from the AIGA Standard Form of Agreement and Andy Clarke's Contract Killer 3. Where they differ, AIGA is the higher-authority source, being attorney-drafted.

The load-bearing clauses, and why each one is there:

- **IP transfers only when payment clears in full**, not on delivery. Delivery-based transfer means a non-paying client owns the work.
- **Third-party assets are licensed to the client, never owned.** Stock, fonts, premium plugins. The studio cannot transfer what it does not own.
- **The studio keeps portfolio rights.** Without this, the best work cannot be shown, which costs referrals on a line that runs on them.
- **Two to three revision rounds included; past that, hourly change orders at a named rate.** The rate has to be in the contract or it is unenforceable in practice.
- **Payment 50/50 or milestones, with a stated late fee**, commonly 1.5 per cent a month.
- **Liability capped at fees actually paid.** Uncapped liability on a 4,000 dollar site is an unacceptable trade.

When reviewing a client's own contract, check for these by absence first.`,
  },
  {
    departmentId: "legal",
    name: "UE5 Compliance Calendar",
    description:
      "Use for Frontier Assembly release planning or anything about obligations to Epic.",
    content: `Two obligations, and the second is the one that gets missed.

**A Release Form is required before shipping.** Not after, not at launch. It goes in the pre-launch checklist alongside the store page.

**Quarterly Royalty Reports are owed through Epic's Developer Portal** for as long as the product earns above the reporting threshold, **including quarters that owe nothing**. A zero quarter still needs a report. Treat it as a recurring calendar task with an owner, not a thing remembered when money is due.

The royalty arithmetic itself is Desmond's: 5 per cent above a million lifetime, 3.5 under Launch Everywhere, nothing under 10,000 in a quarter, nothing on Epic Games Store revenue.

Terms change. Before anything material leans on these, check the live EULA rather than this skill.`,
  },

  {
    departmentId: "legal",
    name: "Studio Licence Posture",
    description:
      "Use when publishing a repository, choosing a licence, answering whether someone may use studio code, or handling a contribution.",
    content: `The studio's default for its own code is **source-available, not open source**. Published so it can be read and audited, not so it can be reused.

Say "source-available" and never "open source". Open source has a definition, it requires the right to make derivative works and redistribute, and this deliberately withholds both. Calling it open source invites a correction the studio does not need.

**The standard stack**

- **PolyForm Strict 1.0.0** as the licence. Attorney-drafted and standardised, so it does not need defending the way a hand-written licence does. It grants everything except distributing the software or making changes and new works.
- **A narrow contribution grant**, in a clearly separate section rather than edited into the licence text. PolyForm Strict alone would forbid contributing, because preparing a pull request means copying and editing. The grant permits copying and editing solely to prepare and submit a contribution, and ends when the contribution is merged, declined, or abandoned.
- **Contribution terms in CONTRIBUTING.md**, granting the studio a perpetual, irrevocable, royalty-free licence to use and relicense the contribution, with the contributor keeping their copyright. Without this every accepted pull request leaves someone else holding rights inside an otherwise all-rights-reserved project.

**Three things this cannot do, and say them plainly**

1. **It cannot stop forking on GitHub.** GitHub's Terms of Service grant every user a licence to reproduce a public repository by forking, through GitHub's functionality, whatever the LICENSE file says. What the licence governs is what may be done with that copy: reading and contributing yes, publishing, building on, or taking parts into other software no.
2. **PolyForm Strict permits noncommercial purposes only.** There is no clause granting commercial use. For an internal tool that is fine and probably intended. For anything a commercial user needs to run, it is the wrong licence, and PolyForm Noncommercial or a bespoke commercial grant is the conversation instead.
3. **It is worth what enforcing it is worth.** A licence is a basis for asking someone to stop, not a technical control. Two people will not litigate. Its real value is making the position unambiguous, which is usually enough.

**It is not one licence across all three lines**

- **Internal tools and the panel.** Strict fits. Nobody else should be running them.
- **Minecraft mods.** Players have to be able to run them, and some servers are commercial, so a noncommercial-only licence blocks legitimate use. Check what the mod links against before anything else: linking LGPL code means the combined work cannot be no-derivatives, and that constraint wins over any studio preference.
- **Client websites.** A different regime entirely. The contract governs, IP transfers to the client on payment in full, and the studio's licence posture does not apply.
- **Frontier Assembly.** Shipped as a binary. Not source-available at all, and Epic's terms govern the engine side.

**When someone asks to use studio code**

Ask what they actually want, because the answer is usually narrower than "the code". Reading it to check it is already permitted. Running it is a licence question. Building on it is a no under the current posture, and a conversation about a separate commercial licence rather than a change to the public one.

Anything with money attached goes to a licensed attorney before it is relied on.`,
  },

  /* ----------------------------------------------------- Operations */
  {
    departmentId: "operations",
    name: "Server Health Runbook",
    description:
      "Use for Minecraft server operations: performance, moderation, lag complaints, patching.",
    content: `Run this as standing habit, not as response to complaints.

**Permissions and logging.** LuckPerms for permissions and a real logging stack. Manual trust does not survive a server growing.

**TPS monitoring through Spark, continuously.** Every new farm or plugin can introduce a fresh bottleneck, so a one-time check tells you about a world that no longer exists.

**Entity and farm limits set explicitly and enforced automatically.** Enforcing by request means enforcing inconsistently and then arguing about it.

**Pre-generate the world and set a border.** This removes exploration lag before it happens rather than diagnosing it later.

**A defined patch cadence.** Players should know when updates land rather than discovering one mid-session. Predictability is most of what makes maintenance tolerable to a community.

When someone reports lag, get the Spark profile before changing anything. Jun has the tuning order once you have it.`,
  },
  {
    departmentId: "operations",
    name: "Scope Discipline On Client Work",
    description:
      "Use for client website projects: intake, revisions, handoff, or a project running long.",
    content: `The operational risk on this line is scope creep, not tooling. Two people quietly working outside what was priced is how a profitable project becomes a loss.

Three documents carry it:

**A client intake SOP.** What is being built, for whom, by when, and explicitly what is not included. The exclusions matter more than the inclusions.

**A revision-round tracker tied to what the contract actually promises.** Not a general sense of how many rounds have happened. Count them, and say out loud when the included rounds are used up, before the next one starts.

**A handoff checklist at project close.** What the client receives, what they can edit themselves, what happens if something breaks, and the referral ask Marisol wants made while the work is fresh.

When a request arrives mid-project, name whether it is inside scope, a revision round, or a change order, before discussing whether to do it. Answering the request first makes the boundary unarguable later.`,
  },

  /* ---------------------------------------------------- Engineering */
  {
    departmentId: "engineering",
    name: "UE5 Save Systems",
    description:
      "Use when designing, reviewing, or debugging saving and loading in Frontier Assembly.",
    content: `Store the diff from default state, never a full snapshot. Thirty changed actors out of five hundred in the scene is thirty records, and the difference compounds as factories grow.

Do not save transient state. Visual, animation, and UI state are reconstructed on load. Saving them makes files larger, loads slower, and versioning harder, and they are derivable by definition.

Format: keep JSON in development because being able to read a save is worth a lot when debugging, and switch to binary for shipping builds.

The versioning question to ask early, because retrofitting it is painful: what happens to a save from the previous build? A factory game is played across months of updates, so a save that breaks on patch is a player lost permanently.

In review, check that every saved field is something that cannot be recomputed. Most save bloat is recomputable state that someone stored because it was easier at the time.`,
  },
  {
    departmentId: "engineering",
    name: "UE5 Performance Method",
    description:
      "Use for frame rate problems, large-scene slowdowns, or optimisation questions in the game.",
    content: `Optimisation in UE5 is highly contextual, so guessing is worse than useless: it burns time and hides the real cause.

The method:

1. **Profile with Unreal Insights first.** Always. A theory about what is slow is not a measurement.
2. **Change one variable at a time.** Two changes and an improvement tells you nothing about which one to keep.
3. **Measure again.**

For large factory scenes specifically, the two things that bite are UObject counts and dynamic lighting. The standard fixes are World Partition and baked lighting wherever the scene allows it. That category of change is what let Satisfactory's own UE5 move improve large-factory performance meaningfully.

Say plainly when a proposed optimisation is premature. A frame budget spent on something that was never the bottleneck is a frame budget spent twice.`,
  },
  {
    departmentId: "engineering",
    name: "NeoForge Conventions",
    description:
      "Use when scaffolding a mod, reviewing mod structure, or debugging registry and resource issues.",
    content: `NeoForge 1.21.1 is the baseline. Follow NeoForged's documented structure rather than inventing one; most confusing registry and resource bugs come from breaking these.

- \`neoforge.mods.toml\` metadata correct and complete
- The mod's top-level Java package **matching its mod group ID**
- The mod ID used consistently as both the registry namespace and the resource namespace

That last one is the recurring cause of resources that silently fail to load: a mismatch between the namespace used to register and the namespace the files sit under. It does not error, it just does not appear.

When something is not loading and nothing is logged, check the namespace before anything else.`,
  },
  {
    departmentId: "engineering",
    name: "PaperMC Tuning Order",
    description:
      "Use for server TPS problems, lag diagnosis, or before recommending a hardware upgrade.",
    content: `Work the levers in order. Skipping to the end wastes money; skipping to the start wastes days.

**Floor:** PaperMC on Java 21. Paper or Purpur improves TPS roughly 20 to 50 per cent over vanilla out of the box, before any tuning.

**The levers that matter, in order:**
1. Entity activation range
2. Spawn limits
3. View distance and simulation distance
4. Disabling hopper move events, but only where no chest-protection or logging plugin depends on them. Check that first; breaking protection to gain TPS is a bad trade.

**Aikar's flags or a ZGC switch only matter if the lag is actually garbage-collection related.** Modern Java 21 handles Minecraft well by default, and applying GC flags to a non-GC problem changes nothing while feeling like progress. Confirm with a profile first.

**The plateau.** Once config tuning stalls around 18 to 20 TPS, the next lever is hardware, not further stripping of gameplay. Say so at that point rather than degrading the server to chase a number.`,
  },
  {
    departmentId: "engineering",
    name: "Astro Or WordPress",
    description:
      "Use when choosing a stack for a client website, or justifying that choice to a client.",
    content: `Follow the client, not a house default. Ask what they actually need before recommending either.

**Astro on a CDN** for performance-led marketing sites the studio maintains. Astro's own 2024 report measured 63 per cent of sites passing Core Web Vitals versus 44 per cent for WordPress. Near-zero hosting cost, and a much smaller attack surface: no PHP, no database, no login screen to probe. WordPress saw a 42 per cent year-over-year rise in disclosed CVEs in 2025.

**WordPress** for clients who genuinely need to self-edit content, or who want the plugin ecosystem. That need is real and common, and a client locked out of their own copy will resent the choice regardless of the Lighthouse score.

The question that decides it: **will they edit this themselves, and how often?** Rarely or never means Astro and a maintenance arrangement. Weekly means WordPress.

Astro's figures come from Astro, so treat the margin as directional while the direction holds.`,
  },
];

/** Handbook skills, added to any workspace that does not already have them. */
export function handbookSkills(): Skill[] {
  const now = Date.now();
  return HANDBOOK_SKILLS.map((skill, index) => ({
    id: `skill_hb_${skill.departmentId}_${skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    departmentId: skill.departmentId,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    enabled: true,
    createdAt: now + index,
    updatedAt: now + index,
  }));
}
