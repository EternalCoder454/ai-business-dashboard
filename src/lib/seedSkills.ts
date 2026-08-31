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
      "Use when asked what to focus on, what to do next, or how to choose between competing pieces of work.",
    content: `Pick exactly one thing for the week and defend it.

1. List every candidate the user has raised or that follows from the Company Profile.
2. Score each on three things only: how much revenue or learning it produces, how long it takes, and whether it is blocked.
3. Choose one. Say what it is in a single sentence.
4. Say what is explicitly not happening this week, and why that is survivable.
5. Name the assumption that, if wrong, changes the choice.

Never return a ranked list of five priorities. A list of priorities is not a decision.`,
  },
  {
    departmentId: CEO_ID,
    name: "Ship, Cut or Defer",
    description:
      "Use when triaging a backlog, a pile of ideas, or a feature list that has grown past what one studio can build.",
    content: `Sort everything into exactly three buckets and put every item in one.

Ship: starts this month. Cut: deleted, not deferred, and you say why it will never be worth it. Defer: has a named trigger that would promote it, such as "once the mod passes 10k downloads".

For each item, one line: the item, the bucket, and the reason in a clause.

Rules:
- Ship holds at most three items. A studio this size cannot run four things at once.
- Nothing goes in Defer without a trigger. Deferred with no trigger is Cut with extra steps.
- Say out loud which product line each Ship item serves: mods, websites, or games. If all three are represented, that is a warning, not a balance.
- End with the single thing you would drop first if the week goes badly.`,
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
      "Use when writing or improving a CurseForge, Modrinth, or Planet Minecraft page for a mod.",
    content: `A mod page is read in about four seconds before someone hits back. Write for that.

Produce all of these in full:
1. Title: what it does, not a pun. Puns lose search.
2. One line summary: the single sentence under the title, naming the loader and the Minecraft version.
3. First paragraph: what problem the mod solves in the player's own words. No lore, no thanks, no roadmap.
4. Feature list: three to six items, each a concrete thing the player gets, not an implementation detail.
5. Compatibility block: loader, versions, known conflicts, dependencies.
6. Media captions for three screenshots or a gif, saying what to look at in each.

Rules:
- Search terms belong in the title and first paragraph, phrased the way a player would type them.
- Never open with "Have you ever wanted".
- Put install steps and credits at the bottom. Nobody scrolling decides on credits.`,
  },
  {
    departmentId: "marketing",
    name: "Website Client Pitch",
    description:
      "Use when pitching or quoting a website to a small business, or writing the page that sells that service.",
    content: `Small businesses buy an outcome, not a website. Lead with the outcome.

Structure the pitch this way:
1. Their problem, in their words. Usually: no site, an old site, or a site that does not get found.
2. What they get: pages, a working contact route, mobile, speed, and being findable.
3. What it costs and what it does not include. Name the boundary that prevents scope creep.
4. Timeline in weeks, with what you need from them and by when. Their delay is the usual cause of a late site.
5. What happens after launch: who owns the domain, who can edit it, what a change costs.

Rules:
- No jargon. Never say "responsive", say "works on a phone".
- Name the one thing that will most improve their enquiries, and put it first.
- Always state who owns the domain and hosting, because that is the argument that happens later.`,
  },
  {
    departmentId: "marketing",
    name: "Steam Page Copy",
    description:
      "Use when writing a Steam store page, an itch.io page, or wishlist campaign copy for a game.",
    content: `The short description does most of the work. Write it first, then everything else supports it.

Produce:
1. Short description: under 300 characters, naming the genre and the hook in the first eight words.
2. About the game: three blocks, each a heading plus two or three sentences. Lead with the loop, not the story.
3. Feature bullets: five at most, each naming a thing the player does, not a system you built.
4. Capsule text: four words or fewer that stay legible when small.
5. Tag list: the tags a factory game player actually browses.

Rules:
- Name the comparison the player is already making, such as Factorio or Satisfactory, and say plainly how this differs. Do not claim to beat them.
- The first trailer frame and the first sentence must show the same thing.
- Wishlists are the metric before launch. Every line should earn one.`,
  },

  // ------------------------------------------------------- Social Media
  {
    departmentId: "social",
    name: "Weekly Content Calendar",
    description:
      "Use when asked for a posting schedule, a content calendar, or what to post over a period.",
    content: `Build the calendar as recurring slots, not a pile of individual post ideas.

1. Pick the platforms that suit the work being shown, and say which you are deliberately skipping.
2. Define three to five recurring formats, each with a name and a job. For example: build in public, before and after, question to the audience.
3. Lay the week out as a table with columns for day, platform, format, hook, and asset needed.
4. Write the hook in full for every slot. A hook is the first line or the first three seconds, not a topic.
5. State the cadence you actually expect to be sustainable, and say which slot to drop first in a bad week.

If there is no asset pipeline yet, say so and shrink the calendar to what one person can genuinely produce.`,
  },
  {
    departmentId: "social",
    name: "Devlog Post",
    description:
      "Use when writing a build in public update about a mod, a game, or a client project.",
    content: `A devlog earns attention by showing a change, not by reporting activity.

Structure:
1. The visible change, stated in the first line. If nothing is visible, the post is a screenshot of nothing and should wait.
2. Why it was hard, in two or three sentences. This is the part people actually read.
3. What it means for the player or the client.
4. One open question to the audience. Real, not engagement bait.

Rules:
- Always pair with a gif or a before and after. A devlog without an image does not travel.
- Never write "small update" or "not much this week". Say what changed or skip the week.
- Version numbers go at the end, never in the hook.
- Match the platform: Reddit wants the problem first, Twitter and Bluesky want the gif first, Discord wants the detail.`,
  },
  {
    departmentId: "social",
    name: "Short Form Script",
    description:
      "Use when writing a TikTok, Reel, or YouTube Short script for gameplay, pixel art, or a build timelapse.",
    content: `Write to the second. Produce a table with columns for time, on screen, and spoken or text overlay.

1. Zero to three seconds: the hook. Show the payoff or the problem immediately. Never open with a logo or a greeting.
2. Three to fifteen seconds: the build up, one idea only.
3. Fifteen to twenty five seconds: the payoff, matching what the hook promised.
4. Final two seconds: the ask, and only one.

Rules:
- Write the on screen text separately from the voiceover. Most people watch muted.
- Pixel art and factory builds work as timelapses. Say the speed multiplier.
- One idea per video. A second idea is a second video.
- Name the sound or music type, since a wrong track kills reach on TikTok.`,
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
      "Use when reviewing a HUD, menu, inventory, or any in game interface, especially for a factory game.",
    content: `Factory game interfaces are read hundreds of times per session. Judge them on repeat use, not first impression.

Work through:
1. Glanceability: what the player must read without stopping. Numbers that change constantly need fixed width so they stop jittering.
2. Density: these players want more information per screen than a general audience. Say where the design is being too precious with space.
3. Hierarchy: the one number that drives decisions should be the largest thing on screen.
4. Input cost: count the clicks for the most repeated action. If it is above two, that is the finding.
5. Colour meaning: state what each colour means and check it survives colour blindness. Pair every colour signal with a shape or a label.

Rules:
- Check it at 1080p and at 1440p. Scaling breaks HUDs more often than layout does.
- Tooltips are not a fix for an unclear icon.`,
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
      "Use when scoping and pricing a client website job, or checking whether a quote already given was sensible.",
    content: `Quote the job, not the hours, and make the boundary explicit.

1. Break the job into: pages, custom design work, content entry, integrations, and setup of domain, hosting, and email.
2. Estimate hours per line honestly, then add a contingency and label it as one. Client work overruns on revisions, not on building.
3. State the revision limit in the quote. Two rounds included, further rounds at an hourly rate, is the standard that prevents the argument.
4. List what is excluded: copywriting, photography, logo design, ongoing changes, and anything needing a paid third party service.
5. Give the payment schedule. A deposit before starting is not optional for a studio this size.
6. Price recurring costs separately: hosting, domain renewal, and email, per year, so they are never mistaken for part of the build.

Close with the walk away price, the number below which the job is not worth taking.`,
  },
  {
    departmentId: "finance",
    name: "Game Revenue Forecast",
    description:
      "Use when forecasting sales for a game, or working out whether a wishlist count justifies a launch.",
    content: `Forecast in ranges, never a single number, and show every step.

1. Start from the input you actually have, which is usually wishlists at launch or downloads for a mod.
2. Apply a conversion range and label it as an industry assumption to be replaced with real data. State the range, not a point.
3. Apply the platform cut, then tax. The number people quote is almost always before both.
4. Spread it over time: launch week, first month, first year. Most of it lands in week one, and the tail depends entirely on updates.
5. Compare against what was spent to build it, including the time, valued at whatever an hour of client work would have earned instead.

Close with the break even point in units, since that is the only number worth remembering. Say plainly if it is not reachable.`,
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
      "Use when drafting or checking the agreement for a client website build.",
    content: `Small web jobs go wrong in the same four places every time. Cover them explicitly.

Check the agreement contains all of:
1. Scope, stated as a page count and a named feature list, with a clause saying anything outside it is a change request at a stated rate.
2. Revision limit, with a number.
3. Payment: deposit before work starts, balance on completion, and what happens if the client goes quiet. A clause pausing the project after a stated period of no response prevents most disputes.
4. IP and ownership: who owns the design, the code, and the content, and when ownership transfers. Transfer on final payment, not before.
5. Hosting, domain, and email: whose accounts, who pays renewals, and what happens at the end of the relationship.
6. Termination on both sides, and what is owed for work already done.

Flag anything missing as blocking. Close with the standard disclaimer.`,
  },
  {
    departmentId: "legal",
    name: "Mod and Asset Licensing",
    description:
      "Use for questions about mod distribution rights, platform terms, asset licences, or using someone else's work.",
    content: `Answer in terms of what can actually be shipped, and where the risk sits.

Work through:
1. What is being distributed and on which platform, since CurseForge, Modrinth, and itch each impose their own terms on top of the licence.
2. The upstream rules. Mods for a commercial game sit under that game's EULA and its guidance on monetisation. Say plainly what that guidance permits and forbids.
3. Every third party asset in the work: sprites, sounds, fonts, code libraries. For each, name the licence and whether attribution or share alike applies. Fonts are the most commonly missed.
4. What licence to publish under, and what that lets other people do, including whether forks and reuploads are permitted.
5. Monetisation specifically. Say which routes are permitted and which put the project at risk of takedown.

Never guess a licence. If it is not stated, the answer is that permission has not been granted. Close with the standard disclaimer.`,
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
      "Use when a new client job starts, from first yes through to being ready to build.",
    content: `The goal is to reach a state where work can start without waiting on anything.

1. Confirm scope in writing and get an explicit yes on it. A verbal yes is not a start.
2. Take the deposit. Work starts after it clears, not after it is promised.
3. Collect assets in one go with a single named list: logo files, photos, text for each page, opening hours, contact details, and any existing accounts. Give a deadline.
4. Get access, or confirm what needs creating: domain registrar, existing host, email, and any social accounts to link.
5. Agree the single point of contact on their side. Two decision makers is the usual cause of a stalled project.
6. Set the check in rhythm and the review points, so revisions land in the rounds that were quoted.
7. Create the project folder, the shared doc, and the calendar entries.

Rules:
- Never start building against promised content. Placeholder content becomes permanent.
- Record every login in the studio's own store, not in a chat thread.`,
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
      "Use for structural decisions on a Minecraft mod: loaders, versions, data storage, or how to organise the code.",
    content: `Decide against the versions and loaders actually being supported, since that constrains everything else.

Work through:
1. Target matrix: which Minecraft versions and which loaders. Say the maintenance cost of each extra combination out loud, because it is the decision that hurts later.
2. Separate logic from loader specific code from the start if more than one loader is targeted. Retrofitting that split is expensive.
3. Data and persistence: what is saved to the world, in what format, and how it will be migrated when the format changes. A save format with no version field is a future data loss.
4. Registry and event use: register once, avoid static state that survives a world reload.
5. Client and server split: name what runs where, and check nothing client only is reachable on a dedicated server.
6. Performance: anything on the tick loop gets called twenty times a second. Say what work can move off it.

Recommend the boring option unless there is a stated reason not to.`,
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
      "Use for factory game systems: tick rate, throughput, save format, or anything that slows down as the player builds more.",
    content: `A factory game is judged on how it behaves at ten thousand entities, not at ten. Design for the late game.

Work through:
1. What scales: name the thing whose count grows without bound, usually machines, items in transit, or belt segments.
2. Update model: full simulation every tick does not survive scale. Say what can be event driven, what can be batched, and what can be approximated without the player noticing.
3. Data layout: contiguous arrays over object graphs for anything iterated every tick. Name the hot loop explicitly.
4. Save format: size and write time grow with the base. Say how saves stay incremental, and include a version field from day one.
5. Determinism: decide early whether the simulation must be deterministic, because retrofitting it is close to a rewrite.
6. Measurement: name what to measure and at what base size. An optimisation with no before and after number is a guess.

Never optimise before measuring, and say so when asked to.`,
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
