# Eterneon

A personal AI operating system for running Eterneon Studio. One CEO orchestrator sits at the
top; each department underneath is its own AI workspace with its own system prompt and its
own conversation history, so nothing has to be re-explained when you switch topics.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open the app and add your Anthropic API key under **Settings**, or create
`.env.local` from the example and restart:

```bash
cp .env.local.example .env.local
```

## How the AI layer works

Every request goes to the app's own `/api/chat` route, which calls the Anthropic Messages
API server-side and streams the reply back as newline-delimited JSON. Each frame is one of
`{type:"text"}`, `{type:"thinking"}`, `{type:"error"}`, or `{type:"done"}`.

The system prompt for each request is assembled in [`src/lib/prompts.ts`](src/lib/prompts.ts)
from three parts:

1. **Department identity**: the department's own scoped prompt (editable in Settings).
2. **Company Profile**: mission, audience, brand voice, and key facts, injected into
   *every* department so they all work from the same business facts.
3. **Shared operating rules**: the house style all departments follow.

Defaults: `claude-opus-5`, adaptive thinking with summarized reasoning display, and
`medium` reasoning effort (both the model and the effort are changeable in Settings).
Requests on Opus 5 also enable server-side refusal fallbacks, so a refused request is
routed to a suitable model instead of failing.

## Where data lives

Everything is local to the browser, in IndexedDB via Dexie: departments, conversations,
deliverables, the company profile, and settings. Nothing is stored server-side.

The API key you enter in Settings is kept in that same IndexedDB store and sent with each
request to `/api/chat`, which uses it and discards it. It is deliberately excluded from
**Settings → Export data**. If you would rather the key never touch the browser at all, put
it in `.env.local` instead and leave the Settings field empty. The server falls back to
`ANTHROPIC_API_KEY`.

## Layout

```
src/
  app/
    page.tsx              Org chart (home)
    ceo/                  CEO Office chat
    dept/[id]/            One chat page per department
    deliverables/         Kanban of outputs, taggable by department
    profile/              Company Profile, shared context for every department
    settings/             API key, model, department CRUD, theme, export/reset
    api/chat/route.ts     Streaming Anthropic call
  components/
    Sidebar.tsx           Nav, departments, recent conversations
    OrgChart.tsx          CEO card + measured SVG connectors
    ChatView.tsx          Message list, streaming, markdown, save-as-deliverable
    ui/                   Material 3 primitives (button, card, chip, dialog, fields)
  lib/
    db.ts                 Dexie schema, seeding, export/reset
    store.tsx             App-wide state and mutations
    prompts.ts            System prompt composition
    seed.ts               CEO + seven department prompts, defaults
    types.ts              Department, Conversation, Message, CompanyProfile, Deliverable
```

## Design

Material 3, dark by default with a light theme. Tokens are defined once in
[`src/app/globals.css`](src/app/globals.css) as CSS custom properties and exposed to
Tailwind through `@theme inline`, so `[data-theme="light"]` swaps the whole palette without
any component knowing about it. Cards use elevation and 12 to 16px radii; interactions use
Material state layers and ripples rather than glows.
