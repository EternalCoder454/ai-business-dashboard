# Eterneon

An AI panel a business runs itself on. One lead sits at the top; each department underneath
is its own workspace with its own prompt, its own skills, and its own conversation history,
so nothing has to be re-explained when the subject changes.

It is multi-tenant. One deployment holds many businesses, each sealed off from the others,
and people sign up at the address it is deployed to rather than installing anything.

- **Live:** [business.eterneon.net](https://business.eterneon.net)
- **Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
  Drizzle + Postgres · next-auth v5

---

## What is in it

### For a business

| | |
|---|---|
| **Departments** | A lead plus a head for each area, each with its own prompt, model, skills, and threads. Personal heads sit outside the org chart and out of everything shared. |
| **Ask Everyone** | One question to the whole room. Each head answers from their own area, then the lead reads across the answers and says what to do. |
| **Company Profile** | Mission, products, audience, voice, constraints. Written once and injected into every head, so they all argue from the same facts. |
| **Library** | Skills, deliverables, recorded decisions, and uploaded files, in card, compact, or list view. Deliverables export as Word, Markdown, or plain text. |
| **Projects** | A thread, its outputs, its files, and its tasks kept together. |
| **Briefings** | Questions put to a head on a rhythm, answered overnight, waiting when somebody signs in. Daily, weekly, or monthly, set by an administrator. |
| **Tasks** | A board fed by hand, by a head capturing something out of a reply, or by the API. |
| **Internal Wiki** | The business's own written record, edited in place by anyone with permission. |
| **Inbox** | Direct messages between colleagues, with presence. |
| **Your people** | An administrator adds colleagues, sets what each can do, and holds the model keys. |
| **Integrations** | API keys for the developer API. The addon catalogue is still being built. |
| **Google Calendar** | Connected per person from Settings, read only, shown on the dashboard. Asked for separately from signing in, and never visible to anybody else in the business. |

### For whoever runs the deployment

An **Operator** screen, reached only by an address in `OPERATOR_EMAILS` and never by
anything a customer can grant themselves:

- **Businesses**: create one, name it, invite its first administrator, delete it.
- **Clients**: who each business is, who can open it, whether they are in it now, and what
  they have spent.
- **Reports**: the conduct reviewer (below).
- **Feedback**: what people have said about the product, with their name, email, and
  business attached automatically.
- **Overview** and **Access**: totals, and who can sign in at all.

---

## How the AI layer works

Every request goes to the app's own `/api/chat`, which calls the provider server-side and
streams back newline-delimited JSON. Each frame is one of `{type:"text"}`,
`{type:"thinking"}`, `{type:"error"}`, or `{type:"done"}`.

The system prompt is assembled in [`src/lib/prompts.ts`](src/lib/prompts.ts) from:

1. **Department identity**: that head's own prompt.
2. **Company Profile**: the same business facts for everyone.
3. **The person**: their name, role, pronouns, timezone, and what they are working on.
   Never their email address; it does not leave the app.
4. **Shared operating rules**: house style, and the limits: this is advice, not a
   professional service, and no head ever asks for confidential client information.

**Three providers.** Anthropic, OpenAI, and Google, chosen per department or per workspace.
Anthropic keeps its own path because prompt caching, adaptive thinking, and server-side
refusal fallbacks have no equivalent in the others; the rest go through one adapter.

**Caching.** Two breakpoints, in render order. The whole system block gets a one-hour TTL,
because the gap between one question and the next is usually longer than five minutes. The
last message gets the default, so each turn reads everything before it and writes only what
that turn added.

### The conduct reviewer

Reads internal messages for harassment, threats, fraud, malware, and anyone who may be at
risk, and raises them to the operator. It deliberately does **not** look for business
secrets, client information, or figures, which are the business's own, and it
does not judge tone, swearing, or disagreement. A report holds a category, a sentence, and
one short quote, not a copy of the conversation. It runs on the deployment's key, not the
customer's. Nothing it finds acts on its own.

It runs on its own, daily at 03:00 UTC, through the cron entry in `vercel.json`. Vercel
calls `/api/reports/run` with `CRON_SECRET` as a bearer token; that route accepts nothing
else except an operator with a session, so the same URL can be opened by hand. Daily is
what every Vercel plan allows: on Pro, change the schedule to `0 * * * *` for hourly. Each
business is reviewed on its own, so one that fails does not stop the rest, and it is named
in the result rather than passed over in silence.

> If you deploy this, tell your people it exists. Several jurisdictions require notice for
> workplace monitoring, and it is the difference between a safety net and something that
> feels like surveillance when it is discovered.

---

## The developer API

`/api/v1`, authenticated with a bearer token made under **Integrations**. Keys are stored
only as a SHA-256, shown once, and scoped to a business rather than a person, so an addon
keeps working after whoever set it up has left.

```bash
curl https://business.eterneon.net/api/v1/tasks?status=todo \
  -H "Authorization: Bearer ek_your_key"
```

```json
{ "data": { "items": [], "next_cursor": null, "has_more": false },
  "request_id": "9d70a291-…" }
```

Conventions: successes are `{ data, request_id }`, failures are
`{ error: { type, message, param? }, request_id }` with a `type` worth branching on.
Cursor paging, not offsets, because both a person and an addon write to the task list.
Every response carries `X-Request-Id` and the `RateLimit-Limit`, `RateLimit-Remaining`,
and `RateLimit-Reset` headers, so a client can pace itself instead of discovering the
ceiling by hitting it. 120 requests a minute per key.

The envelope holds at the edges too. A method a path does not take is a
`method_not_allowed_error` with an `Allow` header, not an empty 405; an unknown path is a
`not_found_error` in JSON, not the application's HTML error page. Both were the framework's
defaults, and both break a client that parses every response, with a parse error rather
than the typed one it was ready for.

**Retries are safe.** Send `Idempotency-Key` on a POST and a second attempt returns the
first one's answer with `Idempotency-Replayed: true`, rather than creating a second thing.
The body is fingerprinted alongside the key, so reusing a key with different content is a
`conflict_error` rather than a silent hit on somebody else's result, and two identical
requests racing each other resolve in the database rather than in a check that was true a
moment ago.

`GET /api/v1` describes every endpoint and needs no key, so the documentation cannot drift
from the deployment.

| Endpoint | Scope |
|---|---|
| `GET /api/v1` | none |
| `GET /api/v1/me` | any key |
| `GET /api/v1/departments` | `departments:read` |
| `GET /api/v1/memory` | `memory:read` |
| `GET /api/v1/tasks` | `tasks:read` |
| `POST /api/v1/tasks` | `tasks:write` |
| `GET·PATCH·DELETE /api/v1/tasks/{id}` | `tasks:read` · `tasks:write` |

---

## Tenancy

Every tenant-scoped table carries a `workspace_id`, and `membershipFor(email)` resolves the
session to exactly one. **Nothing takes a workspace from a request body.** The one route
that does is operator-gated.

Two permissions that are deliberately not one function:

- **Administrator of a business**: an `access` row with `role = 'admin'`. Manages that
  business's people and keys.
- **Operator of the deployment**: an address in `OPERATOR_EMAILS`, read from the
  environment and never from a database row, so it cannot be granted by anything the app
  does. Every customer's first member is an administrator; unioning the two would hand
  every customer the routes that read every other customer's workspace.

Access is checked per request, not per session, so revoking somebody takes effect on their
next call rather than whenever their session expires.

---

## Running it

```bash
npm install
```

```bash
cp .env.local.example .env.local
```

```bash
npm run dev
```

### Environment

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres. Use the **pooled** string on serverless. |
| `AUTH_SECRET` | yes | `npx auth secret`. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google OAuth client. Auth turns itself on only when all three `AUTH_` values are present. |
| `OPERATOR_EMAILS` | yes | Whoever runs the deployment. Comma, space, semicolon, or newline separated. Leave it empty on a fresh install and the first person to sign in becomes the operator; that window closes the moment a row exists. |
| `KEY_ENCRYPTION_KEY` | yes | 32 bytes of base64. What the businesses' own model keys are encrypted with. See below. |
| `NEXT_PUBLIC_SITE_URL` | deploys | The canonical origin, so invitation links never point at a preview. |
| `RESEND_API_KEY` | invites | [Resend](https://resend.com). Without it access still works, because the row is what grants entry, but nobody is told. |
| `INVITE_FROM` | invites | An address on a domain verified in Resend. Falls back to Resend's shared sender, which only delivers to the key's owner. |
| `REVIEWER_API_KEY` | reports | What the conduct reviewer runs on. Unset, the feature is off and the screen says so. |
| `CRON_SECRET` | schedules | What Vercel sends on the nightly call at `/api/cron`, which runs briefings and the reviewer. Without it neither runs on its own. |
| `ANTHROPIC_API_KEY` | no | The deployment's own chat key. See the warning below before setting it. |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | no | Same, for those providers. |
| `ANTHROPIC_WORKSPACE_ID` | no | Only for an identity-linked Anthropic key, and only for the environment key above. |

Key precedence is **environment, then the business's own, then a key typed into a
browser**. So setting `ANTHROPIC_API_KEY` on a multi-tenant deployment takes every
customer off their own key and bills the whole thing to you. That is right for a
single-tenant install and wrong for a product, which is why the reviewer has its own
variable rather than sharing that one.

Businesses set their own under **Settings**, and only an administrator can. They are
write-only: nothing returns a key, to an administrator or anyone else, only whether one
exists and its last four characters.

At rest they are encrypted with AES-256-GCM under `KEY_ENCRYPTION_KEY`, which lives in the
environment and not the database, so a leaked connection string or a stolen backup is a
file of ciphertext. Each value is bound to its workspace and its column, so one lifted into
another business's row does not decrypt. `npm run keys-encrypt` sweeps up anything stored
before encryption was switched on, verifying every row round trips before it writes.

This is not protection against somebody who has the running server: they can read the
master key out of its environment, which is what it is there for. What it buys is that the
database alone is no longer enough, and the database is the thing that gets copied.
`npm run keys-test` plants real keys and searches every payload for them.

### Database

Migrations are plain SQL in [`drizzle/`](drizzle). `drizzle-kit generate` wants a TTY for
rename prompts, so they are written by hand and applied directly.

```bash
npm run db:studio
```

### Scripts

| | |
|---|---|
| `npm run typecheck` · `lint` · `build` | the usual |
| `npm run keys-test` | plants a real key and searches every payload for it |
| `npm run keys-encrypt` | encrypts credentials stored before encryption was switched on |
| `npm run tenancy-audit` | reads the source: every query on a scoped table names a workspace, and deleting a business clears every table |
| `npm run tenancy-test` | a saved row cannot choose which business it lands in |
| `npm run api-test` | the developer API end to end, including cross-tenant isolation (needs `npm run dev`) |
| `npm run admin-test` | operator reads stay inside the business they name |
| `npm run messages-test` | direct messages, threads, and who can read them |
| `npm run guard-test` | operator and workspace-admin gates |
| `npm run smoke` | a workspace round trip against the real database |
| `npm run providers-test` · `tools-test` · `skills-test` · `memory-test` | prompt and provider assembly |
| `npm run payload-check` | what a page load carries that it does not display |
| `npm run email-preview` | writes the invitation to a file so it can be looked at |

Most of these run against the database in `.env.local`, and clean up after themselves.

---

## Layout

```
src/
  app/
    (app)/                Everything behind sign-in. The layout resolves the visitor's
                          business server-side so the shell never draws the wrong name.
      page.tsx            Org chart
      ceo/ dept/[id]/     Chat
      all-hands/          Ask Everyone
      library/            Skills, deliverables, memory, files
      projects/ tasks/    Work
      manage/             Your people (workspace admin)
      integrations/       API keys and the developer API
      admin/              Operator
    api/
      chat/               Streaming, all three providers
      workspace/          Snapshot, mutations, members, keys, export
      v1/                 The developer API
      reports/            The conduct reviewer
  db/
    schema.ts             26 tables. The source of truth for every type below it.
    repo.ts               loadWorkspace, loadConversationMessages, applyMutations
    tenancy.ts            membershipFor, and everything that decides who sees what
    apiKeys.ts            Bearer tokens, stored as hashes
  lib/
    store.tsx             App-wide state and mutations
    prompts.ts            System prompt composition
    reporter.ts           The conduct reviewer
    api/v1.ts             One envelope, one error shape, for the public API
  proxy.ts                Session gate. Excludes /api/v1, which uses bearer tokens.
```

---

## Design

Material 3, dark by default. Tokens are defined once in
[`src/app/globals.css`](src/app/globals.css) as custom properties and exposed to Tailwind
through `@theme inline`, so `[data-theme="light"]` swaps the whole palette without any
component knowing. Breakpoints are Material's window size classes (`medium` 600, `expanded` 840,
`large` 1200, `xlarge` 1600) rather than device widths.

Icons are Material Symbols, inlined as paths rather than loaded as a font.
