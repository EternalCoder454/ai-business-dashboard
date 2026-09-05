/**
 * The manual for the panel itself.
 *
 * Shipped in the code rather than seeded into each workspace as wiki pages,
 * and that is a deliberate difference from the Internal Wiki next to it. The
 * wiki is what a business writes about itself, so it belongs to the business
 * and lives in its rows. This is what the panel is, which is the same sentence
 * for every customer and has to stay true as the product changes. Rows would
 * mean one stale copy per business and nothing that updates them.
 *
 * Written for somebody on their first day who has never used anything like
 * this. Direct, and no assumed vocabulary: a person who has just paid for a
 * business tool should not have to know what a token or a system prompt is to
 * get value on the first afternoon.
 */

export interface DocSection {
  /** The anchor, and what the contents rail links to. */
  id: string;
  title: string;
  /** Markdown. Tables and lists render, the same as anywhere else. */
  body: string;
}

export interface DocChapter {
  id: string;
  title: string;
  sections: DocSection[];
}

export const DOCUMENTATION: DocChapter[] = [
  {
    id: "start",
    title: "Getting started",
    sections: [
      {
        id: "what-this-is",
        title: "What the panel is",
        body: `Most AI tools give you one assistant that knows nothing about you and forgets the conversation when you close the tab.

This is eight of them, each running a department of your business, each with its own personality, its own history with you, and its own memory of what you have decided.

You do not manage them. You ask them things, the way you would ask a colleague.

| Head | What it is for |
| --- | --- |
| Chief of Staff | Your first stop. Pulls the others in when a question needs them. |
| Marketing | Positioning, pricing, campaigns, competitors. |
| Social Media | Posts, calendars, tone, what to publish where. |
| Design | Brand, layout, what things should look like. |
| Finance | Pricing, margins, cash, what a decision costs. |
| Legal | Contracts, terms, risk, what you can and cannot say. |
| Operations | Process, onboarding, checklists, what happens after the sale. |
| Engineering | Anything technical, plus building automations for you. |

The point is not that eight is better than one. It is that a question about pricing and a question about a contract are different jobs, and the answers get better when the thing answering has been told which one it is doing and what your business is.

**If you only remember one thing:** start with the Chief of Staff and just describe your situation in plain language. Everything else in this manual is optional detail.`,
      },
      {
        id: "first-ten-minutes",
        title: "Your first ten minutes",
        body: `Do these four things in order. Nothing else matters until they are done.

**1. Connect a model.** Go to **Settings** and add an API key. The panel does not work without one, and this is the only step that costs money. It is explained in full below under [Connecting a model](#connecting-a-model).

**2. Fill in the company profile.** Go to **Company Profile** and answer as much as you can. What the business does, who it sells to, what stage it is at.

This is the single highest value thing you will do. Every head reads it before every answer. Skipping it is the difference between advice and advice about your business, which is the entire reason to use this rather than a free chatbot. Five minutes here changes every answer you get afterwards.

**3. Talk to the Chief of Staff.** Open it and describe your situation honestly, including the parts that are not going well. Something like:

> I run a two person cleaning business. Most work comes from word of mouth. I am booked out but barely making money and I do all the quoting myself in the evenings.

That is enough for it to be useful immediately, and it will bring in Finance or Operations if the question needs them.

**4. Upload one document.** Go to **Library** and add something real: a price list, a contract you use, last month's numbers. Set who can see it. The heads can then answer from your actual terms instead of guessing at what a business like yours probably does.

Once those four are done, the panel knows your business. Everything after this is convenience.`,
      },
      {
        id: "connecting-a-model",
        title: "Connecting a model",
        body: `The panel does not include AI usage in the subscription. You bring your own key from an AI provider, and you pay that provider directly for what you use.

This is worth understanding rather than resenting, because it is why the panel costs what it does. You are paying for the software, not for someone else's markup on the AI. It also means nobody can be surprised by a bill: your spending limit lives in your own provider account, set by you.

**Getting a key**

1. Pick a provider. Anthropic is the default and the recommendation.
2. Create an account with them and add a payment method.
3. Create an API key. It is a long string of text.
4. Paste it into **Settings** in the panel.

| Provider | Where to get a key | Notes |
| --- | --- | --- |
| Anthropic | console.anthropic.com | The default. Best writing quality. |
| OpenAI | platform.openai.com | Widely used, good general purpose. |
| Google Gemini | aistudio.google.com | Has the most generous free allowance. |
| DeepSeek | platform.deepseek.com | The cheapest by a wide margin. |

**What it will cost you**

For one person using the panel normally, expect a few dollars a month. Heavy daily use across several people might reach ten or twenty. It is charged per message, so a quiet week costs almost nothing.

You can lower it by pointing individual heads at a cheaper model. A head that mostly drafts social posts does not need the most expensive model available. Set this per department in **Settings**.

**Your key is safe here.** It is encrypted before it is stored, it is never sent to your browser, and it is never shown again after you save it. If you ever want it gone, clear the field and it is deleted.`,
      },
    ],
  },

  {
    id: "daily",
    title: "Using it day to day",
    sections: [
      {
        id: "conversations",
        title: "Conversations",
        body: `Click any head in the sidebar to talk to it. Each one keeps its own separate history, so a conversation with Finance never gets mixed up with one with Legal.

**Start a new conversation** for a new subject. Keep going in the same one when you are still on the same subject, because the head can see everything said earlier in that conversation and the answers get better as it goes.

**Attach a file** with the paperclip. Images, PDFs, Word documents, spreadsheets exported as CSV, and plain text all work, up to about 14 MB each. Anything you attach is also saved to the Library so you do not have to send it twice.

**What a head knows when it answers you:**

- Who it is, and what your company does, from the Company Profile
- Everything said so far in this conversation
- The decisions and figures in Memory
- Your open tasks
- Your calendar for the week, if you have connected it
- The titles of documents in the Library it is allowed to read
- Its own skills

**What it never knows:** your API key, anyone else's private files, and anything belonging to another business you are a member of.

**When a head wants to do something**, such as add a task or record a decision, it asks first. A card appears with exactly what it proposes. Nothing happens until you press Approve. Dismiss is always safe.`,
      },
      {
        id: "tasks-projects",
        title: "Tasks and projects",
        body: `**Tasks** is a simple board with three columns: To do, Doing, Done. Add tasks yourself, or let a head add them when you approve the card.

Each task can have notes, a due date, and an owning department, so you can see everything Finance is waiting on without reading through conversations.

**Projects** group related tasks and conversations under one name. Useful when you have several things running at once and want to keep a launch separate from ordinary week to week work. If you only have one thing on, you do not need projects at all.`,
      },
      {
        id: "library",
        title: "The Library",
        body: `Everything your business keeps, in four tabs.

**Files.** Documents you upload. This is how the heads learn your actual terms, prices and numbers instead of guessing.

Every file has a visibility setting, and it matters:

| Setting | Who can read it |
| --- | --- |
| Private to you | Nobody else, and no head. It is stored, not shared. |
| One department | That head only, plus you. |
| Every department | All heads, plus everyone in your workspace. |

New uploads are private until you change this. A head can only read a document it has been given, and only ones with readable text: it can open a contract, not a photograph.

**Deliverables.** Finished work a head produced and you chose to keep. Reports, drafts, plans. Saved when you approve the card.

**Skills.** Playbooks. Explained under [Skills](#skills).

**Memory.** Decisions and figures. Explained under [Memory](#memory).`,
      },
      {
        id: "skills",
        title: "Skills",
        body: `A skill is a written playbook for a job that comes up more than once, attached to a head.

Every workspace ships with skills already written for each department, covering the common work in that area. You can read them, change them, switch them off, or write your own.

Each skill has a "when to use" line. The head reads that line, and if the request matches, it follows that playbook exactly instead of improvising.

Write one when you find yourself correcting the same thing twice. If you always want quotes laid out a particular way, write it down once as a skill for Finance and stop repeating yourself.`,
      },
      {
        id: "memory",
        title: "Memory",
        body: `The record of what your business has settled and what its numbers are. Every head reads it before answering, which is what stops you re-explaining last month's decision every time it comes up.

Two kinds:

**Decisions.** Something that has been settled, so it is not reopened by accident. Each one can record what would make you look at it again, which is how a decision that made sense in March gets revisited in September rather than quietly forgotten.

**Figures.** A number and the date it was true. Use the same label each time and readings stack into a trend, so "Monthly revenue" measured five times reads as a direction rather than five unrelated numbers.

You can add both yourself from the Memory tab. A head will also offer to record one when something gets settled in conversation, and you approve or dismiss it like any other card.

Archiving keeps the history without the heads still working from it, which is the right thing for a decision that has been overtaken rather than reversed.`,
      },
    ],
  },

  {
    id: "working-together",
    title: "Working with several heads",
    sections: [
      {
        id: "meetings",
        title: "Meetings",
        body: `Ask every head the same question at once and read the answers side by side.

Use it for decisions that cross departments. "Should we raise prices" gets a different and useful answer from Finance, Marketing and Operations, and seeing the three together is the point.

It costs more than a single conversation, because it is asking several heads at once. Use it for real decisions rather than for questions one head could answer.`,
      },
      {
        id: "inbox",
        title: "Inbox",
        body: `Direct messages between you and the people in your workspace. Ordinary messaging, kept inside the panel so a question about a task lives next to the task.`,
      },
      {
        id: "briefings",
        title: "Briefings",
        body: `A standing question, asked on a schedule, answered while you are not there.

Set one up with a head, a question in your own words, and how often to run it: daily, weekly on a chosen day, or monthly on a chosen date. The answer is waiting for you when you next open the panel.

Good ones are the questions you would ask every Monday anyway. "What should I be worried about this week." "Summarise what got finished and what slipped."

Each run costs the same as asking that question yourself, so a daily briefing is a small recurring charge on your own key. A weekly one costs about four times less than a daily one for most of the same value.`,
      },
      {
        id: "people",
        title: "People and roles",
        body: `Invite people from **Settings**. They get an email, sign in with Google, and land in your workspace.

| Role | Can do |
| --- | --- |
| Administrator | Everything, including keys, invitations, integrations and settings. |
| Member | Talk to heads, use tasks, projects and the Library. |

Keys and billing are administrator only on purpose, so a new person cannot see the API key or change what the business spends.

**One person, several businesses.** If you run more than one, each is a separate workspace with its own heads, files, tasks and memory. Switch between them from the top of the sidebar. Nothing crosses between them, which is the whole point: your cleaning business and your consultancy do not share a Finance head, and neither can see the other's documents.

The subscription includes one seat. Additional people are charged per seat.`,
      },
    ],
  },

  {
    id: "extending",
    title: "Extending the panel",
    sections: [
      {
        id: "web-search",
        title: "Web search",
        body: `Off by default, and deliberately so: searching costs money on your key, and a feature that quietly starts spending it is not one you asked for.

| Setting | What happens |
| --- | --- |
| Off | Heads answer from what they already know. |
| Native | The head's own provider searches, on the key you already have. |
| Perplexity | One search behaviour for every head, whatever model it runs on. Needs a second key. |

Native is the recommendation. It costs nothing extra to set up and works with the key you already added.

Perplexity is worth it if your heads run on different providers and you want them all searching the same way, or if you want an automation to look things up on a schedule. Automations cannot use native search, because native search only works while a head is answering you.

Turn it on when an answer depends on something current: a price, a rule, a competitor, anything that changed recently.`,
      },
      {
        id: "integrations",
        title: "Integrations and addons",
        body: `Under **Integrations**, administrators can connect the panel to things outside it.

**Native addons** are built in and ready. Google Calendar is one: connect it and the heads can see your week when they answer.

**Custom addons** are automations you ask the Head of Engineering to build. Describe what you want in plain language, for example "post to Slack whenever a task is marked done", and it writes one.

An addon is not code and cannot run any. It is a short recipe made from a fixed list of actions we wrote, which is why one can be built for you safely:

- **When:** a task is added, a task is marked done, or once a day
- **Then:** add a task, save a note, search the web, or send a message to an outside service

**Every addon is saved switched off.** An administrator sees exactly what it will do and every outside address it could reach, and approves it by name before it runs once. You can pause or delete it at any time, and every run is logged so you can see what happened.

An addon is never given your keys, your files, or anyone's messages. It can only reach addresses you approved, and it reads nothing back from them.`,
      },
      {
        id: "wiki",
        title: "Internal Wiki",
        body: `Your own pages, for your own business. How you quote, how you onboard a client, what your refund policy is.

This is different from the manual you are reading. Documentation is about the panel and is the same for everybody. The wiki is about your business and is yours to write.

It is the most useful thing in the panel for anyone who cannot delegate yet, because written procedure is what lets you hand work to a person instead of doing it again yourself. When a head explains how something should be done, that explanation is worth saving here.`,
      },
    ],
  },

  {
    id: "running-it",
    title: "Running it",
    sections: [
      {
        id: "settings",
        title: "Settings",
        body: `**API keys.** One per provider. Explained under [Connecting a model](#connecting-a-model).

**Default model.** What every head uses unless pointed elsewhere. Any head can be given its own model, which is how you put the expensive one on the work that needs it and a cheap one on the rest.

**Departments.** Rename them, rewrite their personas, change what they are for, or add and remove them. The eight you start with are a starting point, not a fixed structure. A business with no design work does not need a Design head.

**House writing rules.** Applied to every head, last, so they beat any individual instruction that disagrees. This is where you say things like "never use bullet points" or "always give a number" and have it hold everywhere.

**Appearance.** Your logo, colours, and company name. The logo also appears on invitation emails and in the browser tab.`,
      },
      {
        id: "privacy",
        title: "What leaves the panel",
        body: `Worth being precise about, because it is a fair thing to ask.

**Goes to your AI provider** when you send a message: the conversation, your company profile, your memory, your open tasks, the titles of documents the head can read, and the contents of any document it opens. This is unavoidable, it is how the answer gets written, and it goes to the provider whose key you supplied and nobody else.

**Goes nowhere:** your API keys, files marked private, and anything from another workspace.

**Goes to an outside service only when you approve it by name:** an addon sending to an address you allowed.

Your keys are encrypted before storage and never sent to a browser. Each business is separated at the database level, not by a filter in the code, so one business cannot read another's rows even in principle.

You can export everything your business has written from **Settings** at any time, as one file.`,
      },
      {
        id: "costs",
        title: "What things cost",
        body: `Two separate bills, and keeping them straight avoids the common surprise.

**The panel** is your subscription. One seat included, additional seats charged per seat.

**The AI** is billed by your provider, directly to you, for what you use. The panel takes no cut and cannot spend on your behalf.

What drives the AI bill:

| Costs more | Costs less |
| --- | --- |
| Meetings, which ask several heads at once | A single conversation |
| Daily briefings | Weekly or monthly briefings |
| Web search turned on | Web search off |
| The most capable models | Cheaper models, set per head |
| Long conversations with many documents open | Short, focused conversations |

The panel reuses as much of each request as it can, so a long conversation costs far less than the same conversation started fresh every time. Continuing a conversation is cheaper than starting a new one on the same subject.

**Information** shows what each head's setup costs to send, if you want to see where it goes.`,
      },
      {
        id: "troubleshooting",
        title: "When something is wrong",
        body: `**A head will not answer.** Almost always the API key. Check **Settings**, and check the key has not been deleted or run out of credit in your provider account.

**Answers are generic and could be about any business.** The Company Profile is empty or thin. Fill it in properly. If it is filled in, upload a real document and set it to Every department.

**A head says it cannot see a document.** Check the visibility on that file in the Library. New uploads are private until you change them, and a head can only read documents with text in them.

**An addon is not running.** It has to be approved first, and it stays switched off until it is. Check **Integrations**, and read its run log, which says what happened on each run including anything that was blocked.

**Someone cannot see something you can.** They are probably a member rather than an administrator, or the file is scoped to a department. Both are checked in **Settings**.

**A briefing did not arrive.** Check it is enabled, and that the key still works. Failed runs are recorded rather than hidden.

**Something else.** **Changelog** lists everything that has changed and when, which often explains behaviour that just changed.`,
      },
    ],
  },
];

/** Every section, flattened, for search and for counting. */
export function allSections(): DocSection[] {
  return DOCUMENTATION.flatMap((chapter) => chapter.sections);
}

/**
 * Sections matching a search, by title and body.
 *
 * An empty search returns everything rather than nothing, so the page reads as
 * a manual with a filter on it rather than as a search box with a blank page
 * behind it.
 */
export function searchDocs(query: string): DocChapter[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return DOCUMENTATION;

  return DOCUMENTATION.map((chapter) => ({
    ...chapter,
    sections: chapter.sections.filter(
      (section) =>
        section.title.toLowerCase().includes(wanted) ||
        section.body.toLowerCase().includes(wanted),
    ),
  })).filter((chapter) => chapter.sections.length > 0);
}
