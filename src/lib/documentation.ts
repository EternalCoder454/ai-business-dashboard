/**
 * The manual for the panel itself.
 *
 * Shipped in the code rather than seeded into each workspace as wiki pages,
 * and that is a deliberate difference from the Wiki next to it. The wiki is
 * what a business writes about itself, so it belongs to the business and lives
 * in its rows. This is what the panel is, which is the same sentence for every
 * customer and has to stay true as the product changes. Rows would mean one
 * stale copy per business and nothing that updates them.
 *
 * Two rules for the writing, both learned the hard way.
 *
 * Titles are labels, not sentences. "Privacy", not "What leaves the panel".
 * Somebody scanning a contents list is looking for a word, and a heading
 * phrased as a sentence makes them read it to find out whether it is the one
 * they want.
 *
 * And a definition says what the thing is in the words somebody would use for
 * it. Decisions were once described as "something that has been settled, so it
 * is not reopened by accident", which is accurate, and nobody speaks like that,
 * so it reads as a riddle rather than an explanation. Lead with what it is and
 * what it is for, then give an example.
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
        title: "Overview",
        body: `Most AI tools give you one assistant that knows nothing about you and forgets the conversation when you close the tab.

This is eight of them. Each one runs a department of your business, has its own personality, its own history with you, and its own memory of what you have decided.

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

Eight is not better than one because it is more. It is better because a pricing question and a contract question are different jobs, and you get a better answer when the thing answering knows which job it is doing and what your business is.

**If you only read one line:** open the Chief of Staff and describe your situation in plain language. Everything else here is optional detail.`,
      },
      {
        id: "first-ten-minutes",
        title: "Setup",
        body: `Four things, in order. Nothing else matters until they are done. It takes about ten minutes.

**1. Connect a model.** Go to **Settings** and add an API key. The panel does not work without one, and this is the only step that costs money. See [Models and keys](#connecting-a-model).

**2. Fill in the company profile.** Go to **Company Profile** and answer as much as you can: what the business does, who it sells to, what stage it is at.

This is the highest value thing you will do. Every head reads it before every answer. It is the difference between advice and advice about your business, which is the whole reason to use this instead of a free chatbot.

**3. Talk to the Chief of Staff.** Describe your situation honestly, including the parts that are going badly. Something like:

> I run a two person cleaning business. Most work comes from word of mouth. I am booked out but barely making money and I do all the quoting myself in the evenings.

That is enough to be useful straight away, and it will bring in Finance or Operations if the question needs them.

**4. Upload one document.** Go to **Library** and add something real: a price list, a contract you use, last month's numbers. Set who can see it. The heads can then answer from your actual terms instead of guessing what a business like yours probably charges.

After those four, the panel knows your business. Everything else is convenience.`,
      },
      {
        id: "connecting-a-model",
        title: "Models and keys",
        body: `The panel does not include AI usage in the subscription. You bring your own key from an AI provider and pay that provider directly for what you use.

This is why the panel costs what it does. You pay for the software, not for somebody else's markup on the AI. It also means you cannot be surprised by a bill, because the spending limit is in your own provider account and you set it.

**Getting a key**

1. Pick a provider. Anthropic is the default and the recommendation.
2. Create an account and add a payment method.
3. Create an API key. It is a long string of text.
4. Paste it into **Settings**.

| Provider | Where to get a key | Notes |
| --- | --- | --- |
| Anthropic | console.anthropic.com | The default. Best writing quality. |
| OpenAI | platform.openai.com | Widely used, good general purpose. |
| Google Gemini | aistudio.google.com | The most generous free allowance. |
| DeepSeek | platform.deepseek.com | The cheapest by a wide margin. |

**What it costs**

One person using the panel normally should expect a few dollars a month. Heavy daily use across several people might reach ten or twenty. You are charged per message, so a quiet week costs almost nothing.

To spend less, point individual heads at a cheaper model. A head that mostly drafts social posts does not need the most expensive one available. Set this per department in **Settings**.

**Your key is safe here.** It is encrypted before it is stored, never sent to your browser, and never shown again after you save it. Clear the field and it is deleted.`,
      },
    ],
  },

  {
    id: "daily",
    title: "Daily use",
    sections: [
      {
        id: "conversations",
        title: "Conversations",
        body: `Click any head in the sidebar to talk to it. Each keeps its own history, so a conversation with Finance never gets mixed up with one with Legal.

**Start a new conversation** for a new subject. Stay in the same one while you are still on the same subject: the head can see everything said earlier in it, and the answers get better as it goes.

**Attach a file** with the plus at the left of the box. Images, PDFs, Word documents, spreadsheets saved as CSV and plain text all work, up to about 14 MB each. Anything you attach is saved to the Library too, so you never have to send it twice.

**What a head can see when it answers:**

- Who it is, and what your company does, from the Company Profile
- Everything said so far in this conversation
- The decisions and figures in Memory
- Your open tasks
- Your calendar for the week, if you have connected it
- The titles of documents in the Library it is allowed to read
- Its own skills

**What it can never see:** your API key, anyone else's private files, and anything belonging to another business you are a member of.

**When a head wants to change something,** such as adding a task or recording a decision, it asks first. A card appears showing exactly what it proposes, and nothing happens until you press Approve. Dismiss is always safe.

**When it only wants to read something,** such as searching the web or opening a document you already gave it, it goes ahead and shows you what it found. Stopping mid answer to ask permission for a lookup would only interrupt the question you just asked.`,
      },
      {
        id: "tasks-projects",
        title: "Tasks and projects",
        body: `**Tasks** is a board with three columns: To do, Doing, Done. Add tasks yourself, or approve one a head proposes.

Each task can have notes, a due date and an owning department, so you can see everything Finance is waiting on without reading back through conversations.

**Schedules** share the page, on the second tab. A task is something you do once. A schedule is a question that comes round again. See [Schedules](#schedules).

**Projects** group related tasks and conversations under one name. Useful when several things are running at once and you want a launch kept separate from ordinary week to week work. With only one thing on, you do not need projects at all.`,
      },
      {
        id: "library",
        title: "Library",
        body: `Everything your business keeps, in four tabs.

**Files.** Documents you upload. This is how the heads learn your real terms, prices and numbers instead of guessing.

Every file has a visibility setting, and it matters:

| Setting | Who can read it |
| --- | --- |
| Private to you | Nobody else, and no head. It is stored, not shared. |
| One department | That head only, plus you. |
| Every department | All heads, plus everyone in your workspace. |

New uploads are private until you change this. A head can only read a document it has been given, and only ones with text in them: it can open a contract, not a photograph.

**Deliverables.** Finished work a head produced and you chose to keep. Reports, drafts, plans. Saved when you approve the card. A head can revise one it wrote earlier rather than saving a second copy.

**Skills.** Playbooks. See [Skills](#skills).

**Memory.** Decisions and figures. See [Memory](#memory).`,
      },
      {
        id: "skills",
        title: "Skills",
        body: `A skill is a written playbook for a job that comes up more than once, attached to a head.

Every workspace starts with skills already written for each department, covering the common work in that area. Read them, change them, switch them off, or write your own.

Each skill has a "when to use" line. The head reads that line, and if the request matches, it follows the playbook exactly instead of improvising.

Write one when you notice yourself correcting the same thing twice. If you always want quotes laid out a particular way, write it down once as a skill for Finance and stop repeating yourself.

**Reset skills** puts the shipped ones back if you have changed them and want the originals again. It archives what you wrote rather than deleting it, so your own skills are recoverable.`,
      },
      {
        id: "memory",
        title: "Memory",
        body: `What your business has agreed, and what its numbers are. Every head reads it before answering, which is what stops you explaining last month's decision every time it comes up.

Two kinds.

**Decisions.** Things you have agreed and do not want to argue again. You can also note what would change your mind, so a call that made sense in March gets a proper second look in September instead of quietly standing forever.

**Figures.** A number and the date it was measured. Use the same label each time and the readings stack up into a trend, so five entries of "Monthly revenue" show you a direction rather than five loose numbers.

Add either yourself from the Memory tab. A head will also offer to record one when something gets settled in conversation, and you approve or dismiss it like any other card.

**Archiving** keeps a decision in the history but stops the heads working from it. That is what you want for a decision that has been overtaken rather than reversed.`,
      },
    ],
  },

  {
    id: "working-together",
    title: "Working together",
    sections: [
      {
        id: "meetings",
        title: "Meetings",
        body: `Ask every head the same question at once and read the answers side by side.

Use it for decisions that cross departments. "Should we raise prices" gets a different and useful answer out of Finance, Marketing and Operations, and seeing the three together is the point.

It costs more than a single conversation because it asks several heads at once. Save it for real decisions rather than questions one head could answer.`,
      },
      {
        id: "inbox",
        title: "Inbox",
        body: `Direct messages between you and the people in your workspace. Ordinary messaging, kept inside the panel so a question about a task sits next to the task.

**Editing and deleting.** You can change or take back a message you sent. An edited message is marked as edited, and a deleted one disappears from the thread for both of you.

It does not disappear from the business. An administrator reading the Messages tab under **Management** still sees it, marked as withdrawn, along with what an edited message said originally. This is deliberate: you should be able to take back something you regret, and a business that may have to answer for what was said inside it should not lose the record because the sender would rather it were gone.`,
      },
      {
        id: "schedules",
        title: "Schedules",
        body: `A question you want asked again and again, on a timetable. The panel asks it for you and the answer is waiting when you next sign in.

Set one up on the Schedules tab of **Tasks**: pick a head, write the question in your own words, and choose how often to run it, daily, weekly on a chosen day, or monthly on a chosen date.

The good ones are the questions you would ask every Monday anyway. "What should I be worried about this week." "Summarise what got finished and what slipped."

Each run costs the same as asking that question yourself, so a daily schedule is a small recurring charge on your own key. A weekly one costs roughly four times less for most of the same value.`,
      },
      {
        id: "people",
        title: "People and roles",
        body: `Invite people from **Management**. They get an email, sign in with Google, and land in your workspace.

| Role | Can do |
| --- | --- |
| Administrator | Everything, including keys, invitations, integrations and settings. |
| Member | Talk to heads, use tasks, projects and the Library. |

Keys and billing are administrator only on purpose, so a new person cannot read the API key or change what the business spends.

**Names and job titles.** An administrator can set what this business calls somebody and what they do here, plus a private note only administrators see. That name applies here and nowhere else: it never changes what the person calls themselves, or what another business they belong to sees. Clear the field and their own name shows through again.

**One person, several businesses.** If you run more than one, each is a separate workspace with its own heads, files, tasks and memory. Switch between them from the top of the sidebar. Nothing crosses over, which is the point: your cleaning business and your consultancy do not share a Finance head, and neither can see the other's documents.

The subscription includes one seat. Additional people are charged per seat.`,
      },
    ],
  },

  {
    id: "extending",
    title: "Extensions",
    sections: [
      {
        id: "web-search",
        title: "Web search",
        body: `Lets a head look something up before it answers, instead of relying on what it already knows. Turn it on when an answer depends on something current: a price, a rule, a competitor, anything that changed recently.

It is off until you switch it on, because searching costs money on your key and a feature that quietly starts spending it is not one you asked for.

| Setting | What happens |
| --- | --- |
| Off | Heads answer from what they already know. |
| Native | The head's own provider searches, on the key you already have. |
| Perplexity | The same search behaviour for every head, whatever model it runs on. Needs a second key. |

Native is the recommendation. It costs nothing extra to set up and uses the key you already added.

Perplexity is worth it if your heads run on different providers and you want them all searching the same way, or if you want an automation to look things up on a schedule. Automations cannot use native search, because that only works while a head is answering you.`,
      },
      {
        id: "integrations",
        title: "Integrations",
        body: `Under **Integrations**, administrators can connect the panel to things outside it.

**Native addons** are built in and ready to use. Google Calendar is one: connect it and the heads can see your week when they answer.

**Custom addons** are automations you ask the Head of Engineering to build. Describe what you want in plain language, for example "post to Slack whenever a task is marked done", and it writes one.

An addon is not code and cannot run any. It is a short recipe assembled from a fixed list of actions we wrote, which is what makes it safe to have one built for you:

- **When:** a task is added, a task is marked done, or once a day
- **Then:** add a task, save a note, search the web, or send a message to an outside service

**Every addon is saved switched off.** An administrator sees exactly what it will do and every outside address it could reach, then approves it by name before it runs once. Pause or delete it at any time. Every run is logged, so you can see what happened.

An addon is never given your keys, your files or anyone's messages. It can only reach addresses you approved, and it reads nothing back from them.`,
      },
      {
        id: "wiki",
        title: "Wiki",
        body: `Your own pages, about your own business. How you quote, how you onboard a client, what your refund policy is.

This is not the manual you are reading. Documentation is about the panel and is the same for every customer. The wiki is about your business and is yours to write.

It is the most useful thing here for anyone who cannot delegate yet, because written procedure is what lets you hand work to a person instead of doing it again yourself. When a head explains how something should be done, that explanation is worth saving here.`,
      },
    ],
  },

  {
    id: "running-it",
    title: "Administration",
    sections: [
      {
        id: "settings",
        title: "Settings",
        body: `**API keys.** One per provider. See [Models and keys](#connecting-a-model).

**Default model.** What every head uses unless pointed elsewhere. Any head can be given its own, which is how you put the expensive model on the work that needs it and a cheap one on the rest.

**Departments.** Rename them, rewrite their personas, change what they are for, or add and remove them. The eight you start with are a starting point, not a fixed structure. A business with no design work does not need a Design head.

**House writing rules.** Applied to every head last, so they beat any individual instruction that disagrees. This is where you say things like "never use bullet points" or "always give a number" and have it hold everywhere.

**Appearance.** Your logo, colours and company name. The logo also appears on invitation emails and in the browser tab.

**Backups.** See [Backups](#backups).`,
      },
      {
        id: "backups",
        title: "Backups",
        body: `A point your workspace can be put back to. A backup holds everything your business has written: conversations and their messages in full, deliverables, skills, the wiki, tasks, memory and the company profile.

The panel takes one every night for you, and skips it when nothing has changed since the last one. You can also take one by hand from **Settings** before doing something you are unsure about, and give it a name so you recognise it later.

**Restoring** replaces everything in the workspace with the contents of that backup. Anything written since is removed, so it is not a merge.

It is safe to try. Before it replaces anything, the panel takes a backup of the workspace as it stands, so restoring the wrong one is undone by restoring the one it just made.

**What a restore does not touch:** your API keys, who can open the workspace, and uploaded files. Keys and access are deliberately left alone, because a restore that reinstated a key you had rotated, or a list of people you had removed somebody from, would be a worse problem than the one you were fixing. File contents are never deleted either, only the rows pointing at them, so nothing you uploaded can be destroyed by a rollback.

Backups are administrator only.`,
      },
      {
        id: "privacy",
        title: "Privacy",
        body: `**Sent to your AI provider** when you send a message: the conversation, your company profile, your memory, your open tasks, the titles of documents the head can read, and the contents of any document it opens. This is how the answer gets written. It goes to the provider whose key you supplied and to nobody else.

**Sent nowhere:** your API keys, files marked private, and anything from another workspace.

**Sent to an outside service only when you approve it by name:** an addon posting to an address you allowed.

Your keys are encrypted before storage and never sent to a browser. Each business is separated at the database level rather than by a filter in the code, so one business cannot read another's rows even in principle.

You can export everything your business has written from **Settings** at any time, as one file.`,
      },
      {
        id: "costs",
        title: "Costs",
        body: `You pay two bills. Keeping them apart in your head avoids the usual surprise.

**The panel** is your subscription. One seat included, additional seats charged per seat.

**The AI** is billed by your provider, directly to you, for what you use. The panel takes no cut and cannot spend on your behalf.

What drives the AI bill:

| Costs more | Costs less |
| --- | --- |
| Meetings, which ask several heads at once | A single conversation |
| Daily schedules | Weekly or monthly schedules |
| Web search turned on | Web search off |
| The most capable models | Cheaper models, set per head |
| Long conversations with many documents open | Short, focused conversations |

The panel reuses as much of each request as it can, so a long conversation costs far less than the same conversation started fresh every time. Continuing one is cheaper than starting a new one on the same subject.

The **Dashboard** shows what you have spent this month, broken down by head, along with what each head's setup costs to send and how much room your workspace is using.`,
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        body: `**A head will not answer.** Almost always the API key. Check **Settings**, and check the key has not been deleted or run out of credit in your provider account.

**Answers are generic and could be about any business.** The Company Profile is empty or thin. Fill it in properly. If it is already filled in, upload a real document and set it to Every department.

**A head says it cannot see a document.** Check that file's visibility in the Library. New uploads are private until you change them, and a head can only read documents with text in them.

**An addon is not running.** It has to be approved first, and stays switched off until it is. Check **Integrations** and read its run log, which says what happened on each run including anything that was blocked.

**Someone cannot see something you can.** They are probably a member rather than an administrator, or the file is scoped to one department. Both are checked from **Management**.

**A scheduled question did not arrive.** Check it is enabled, and that the key still works. Failed runs are recorded rather than hidden.

**Something changed and you do not know why.** **Changelog** lists everything that has changed and when, which usually explains it.`,
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
