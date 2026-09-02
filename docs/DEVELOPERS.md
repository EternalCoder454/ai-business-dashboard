# Eterneon for developers

Everything needed to build against the panel, run one, or work on it.

- **Base URL** `https://business.eterneon.net`
- **API version** `2026-09-01`
- **Stack** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
  Drizzle + Postgres · next-auth v5

---

## Part one: the API

### Getting a key

Keys are made in the panel under **Integrations**, by an administrator of the
business. A key acts as the business rather than as the person who made it, so an
addon keeps working after they have gone.

The token is shown once. It is stored only as a SHA-256, so nothing can produce
it again. If it is lost, revoke it and make another.

### Authentication

```
Authorization: Bearer ek_...
```

### Start here

`GET /api/v1` needs no key and describes every endpoint the deployment has. It is
generated from the code, so it cannot drift from what is actually running.

```bash
curl https://business.eterneon.net/api/v1
```

### The envelope

Every response, including the ones a framework would normally write for you.

**Success**

```json
{
  "data": { },
  "request_id": "9d70a291-3a12-46c9-8005-ef6a7d7ebe33"
}
```

**Failure**

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "A task needs a title.",
    "param": "title"
  },
  "request_id": "9d70a291-3a12-46c9-8005-ef6a7d7ebe33"
}
```

Branch on `type`, never on `message`. Messages are written for people and will
change.

| type | status | means |
|---|---|---|
| `authentication_error` | 401 | No key, or a key that is not valid |
| `permission_error` | 403 | The key lacks the scope this needs |
| `invalid_request_error` | 400 | The request is wrong; `param` names the field |
| `not_found_error` | 404 | No such thing in this business |
| `method_not_allowed_error` | 405 | Carries an `Allow` header |
| `conflict_error` | 409 | Idempotency key reused with a different body |
| `rate_limit_error` | 429 | Carries `Retry-After` |
| `api_error` | 500 | Ours. Quote the `request_id` |

### Headers

Every response carries:

| Header | |
|---|---|
| `X-Request-Id` | Also in the body. Quote it and it can be found |
| `X-Api-Version` | `2026-09-01` |
| `RateLimit-Limit` | 120 |
| `RateLimit-Remaining` | What is left this minute |
| `RateLimit-Reset` | Unix seconds until the window frees |

**120 requests a minute, per key.** Watch `RateLimit-Remaining` and pace
yourself rather than discovering the ceiling.

### Scopes

Give a key the least that does the job.

| Scope | |
|---|---|
| `tasks:read` | Read the task list |
| `tasks:write` | Add and change tasks |
| `departments:read` | Read the org chart |
| `memory:read` | Read recorded decisions and figures |

---

### Endpoints

#### `GET /api/v1`: discovery

No key. Lists everything below.

#### `GET /api/v1/me`

Which business the key acts for.

```json
{
  "data": {
    "business": { "id": "ws_...", "name": "Skorheim & Associates" },
    "key": { "id": "...", "scopes": ["tasks:read", "tasks:write"] }
  }
}
```

#### `GET /api/v1/departments`: `departments:read`

The org chart. System prompts are not included: they are the business's own
writing and are not needed to file work.

```json
{ "data": { "items": [
  { "id": "ceo", "name": "Chief of Staff", "role_title": "Chief of Staff",
    "persona_name": "Ruth", "status": "active", "is_lead": true }
] } }
```

#### `GET /api/v1/memory`: `memory:read`

Decisions that stand and figures that were true on a date. Archived entries are
left out; they were archived because they stopped being true.

Query: `department_id`, `kind`, `limit`, `cursor`.

Read only. These entries are what every head reasons from, so writing to them
stays a decision a person makes in the panel.

#### `GET /api/v1/tasks`: `tasks:read`

```bash
curl "https://business.eterneon.net/api/v1/tasks?status=todo" \
  -H "Authorization: Bearer ek_your_key"
```

Query: `status` (`todo` `doing` `done`), `department_id`, `limit` (1 to 200,
default 50), `cursor`.

```json
{ "data": {
  "items": [ { "id": "...", "title": "Post the launch video", "notes": "9am",
               "status": "todo", "department_id": "marketing",
               "project_id": null, "due_at": null, "order": -1,
               "created_at": 1756800000000, "updated_at": 1756800000000,
               "completed_at": null } ],
  "next_cursor": null,
  "has_more": false
} }
```

**Paging is by cursor, not offset.** Both a person and your addon write to this
list, and an offset skips rows whenever something is inserted mid-walk. Pass
`next_cursor` back as `cursor` until `has_more` is false.

#### `POST /api/v1/tasks`: `tasks:write`

`title` is the only required field.

```bash
curl -X POST https://business.eterneon.net/api/v1/tasks \
  -H "Authorization: Bearer ek_your_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: post-video-2026-09-02" \
  -d '{"title":"Post the launch video","department_id":"marketing"}'
```

Returns `201` with a `Location` header. Unknown `department_id` is a `404`.

#### `GET · PATCH · DELETE /api/v1/tasks/{id}`

PATCH changes only what you send. Absent means leave it, `null` means clear it,
so marking something done does not wipe the notes.

```bash
curl -X PATCH https://business.eterneon.net/api/v1/tasks/TASK_ID \
  -H "Authorization: Bearer ek_your_key" \
  -H "Content-Type: application/json" \
  -d '{"status":"done"}'
```

Setting `status` to `done` stamps `completed_at`; reopening clears it.

---

### Retries are safe

Send `Idempotency-Key` on a POST and a retry returns the first attempt's answer
rather than creating a second thing.

- A replay carries `Idempotency-Replayed: true`.
- The body is fingerprinted alongside the key, so reusing a key with different
  content is a `conflict_error` rather than a silent hit on somebody else's
  result.
- Two identical requests racing each other resolve in the database, so exactly
  one creates.
- A request that fails validation gives the key back, so you can correct the body
  and use the same key.
- Keys are remembered for 24 hours.

This matters more than it looks. Your connection drops before the reply arrives
and you have no way to know whether the task exists. Retrying is the right thing
to do, and without this it makes two.

### The loop most addons run

```python
import requests

BASE = "https://business.eterneon.net/api/v1"
H = {"Authorization": "Bearer ek_your_key"}

todo = requests.get(f"{BASE}/tasks", params={"status": "todo"}, headers=H).json()

for task in todo["data"]["items"]:
    if "post" not in task["title"].lower():
        continue

    do_the_thing(task)

    requests.patch(
        f"{BASE}/tasks/{task['id']}",
        headers={**H, "Content-Type": "application/json"},
        json={"status": "done"},
    )
```

### What the API deliberately does not do

**No CORS.** Bearer tokens should not be in a browser, and allowing it would
invite putting them there. Server to server.

**No chat.** There is no endpoint that asks a head a question. Streaming, cost,
and abuse all need answering first, and a scope that existed with nothing behind
it would be worse than a missing one.

**Rate limiting is per instance.** The counter is in memory, and on serverless
each instance keeps its own, so the real ceiling is looser than 120. It catches a
client stuck in a loop, which is what it is for. The headers are what a well
behaved client should use.

---

## Part two: how it is built

### Shape

One Next.js app. No separate backend service.

```
src/
  app/
    (app)/              Behind sign-in. The layout resolves the visitor's
                        business server-side, so the shell never draws the
                        wrong name.
    api/
      chat/             Streaming, all three providers
      workspace/        Snapshot, mutations, members, keys, schedules, export
      v1/               The developer API
      cron/             The nightly tick
  db/
    schema.ts           26 tables. The source of truth for every type below it.
    repo.ts             loadWorkspace, loadConversationMessages, applyMutations
    tenancy.ts          membershipFor, and everything deciding who sees what
    secrets.ts          AES-256-GCM for credentials at rest
    apiKeys.ts          Bearer tokens, stored as hashes
  lib/
    prompts.ts          System prompt composition
    schedules.ts        Briefings
    reporter.ts         Conduct review
    export/             docx, markdown, csv
    google.ts           Calendar OAuth and reads
  proxy.ts              Session gate. Excludes /api/v1 and /api/cron.
```

The backend is I/O bound end to end. Profiled against the real database, the
JavaScript is **0.1%** of a request; the rest is waiting on Postgres and on the
model. Optimisation here means doing less I/O, not faster compute.

### Tenancy

Every tenant-scoped table carries `workspace_id`. `membershipFor(email)` resolves
a session to exactly one, and every query is keyed on it.

**Nothing takes a workspace from a request body.** The one route that does is
operator-gated.

Two permissions that are deliberately not one function:

- **Administrator of a business** is an `access` row with `role = 'admin'`.
- **Operator of the deployment** is an address in `OPERATOR_EMAILS`, read from
  the environment and never from a database row, so it cannot be granted by
  anything the app does. Every business's first member is an administrator;
  unioning the two would hand every customer the routes that read every other
  customer's data.

Access is checked per request, not per session, so revoking somebody takes effect
on their next call.

`npm run tenancy-audit` reads the source and checks that every query on a scoped
table names a workspace, follows a variable that does, or carries a written
justification beside it. It also compares the schema against the delete path, so
"delete this business" cannot fall behind a growing schema.

### Credentials

| | |
|---|---|
| Model keys | AES-256-GCM under `KEY_ENCRYPTION_KEY`, bound to workspace and column so one lifted into another business's row will not decrypt |
| API tokens | SHA-256 only. Never stored |
| Google refresh tokens | Encrypted, same master key |
| Passwords | None exist. Google OAuth only |

No route returns a credential, to anybody. `npm run keys-test` plants real keys
and searches every payload for them.

The honest limit: this protects against a database leak, not against someone with
the running server, who can read the master key from its environment. The
database is the thing that gets copied.

### The AI layer

Requests go to `/api/chat`, which calls the provider server-side and streams back
newline-delimited JSON: `{type:"text"}`, `{type:"thinking"}`, `{type:"error"}`,
`{type:"done"}`.

The system prompt is assembled in `src/lib/prompts.ts` from the department's own
prompt, the Company Profile, the person (name, role, pronouns, timezone; **never
their email**), recorded memory, the task board, the calendar, and the shared
operating rules.

**Caching.** Two breakpoints in render order. The system block gets a one hour
TTL, because the gap between questions is usually longer than five minutes. The
last message gets the default, so each turn reads everything before it and writes
only what that turn added. Volatile sections sit late so a daily change does not
push the stable parts out of the cached prefix.

Anthropic keeps its own path; OpenAI and Google go through one adapter.

### Scheduled work

`vercel.json` points one cron at `/api/cron`, authenticated with `CRON_SECRET`
compared in constant time. It runs due schedules first, then the conduct review.

`isDue` compares whole days rather than elapsed time, so a run at 03:00 one
morning and 03:05 the next is not judged early. Each business is wrapped
separately: unattended work that stops at the first error stops silently.

---

## Part three: running one

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

### Required

| | |
|---|---|
| `DATABASE_URL` | Postgres. Pooled string on serverless |
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client |
| `OPERATOR_EMAILS` | Whoever runs the deployment. Empty on a fresh install means the first person to sign in becomes the operator |
| `KEY_ENCRYPTION_KEY` | 32 bytes base64. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

### Optional

| | |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, so invitation links do not point at a preview |
| `RESEND_API_KEY` / `INVITE_FROM` | Invitation email |
| `CRON_SECRET` | Nightly briefings and conduct review |
| `REVIEWER_API_KEY` | What the reviewer runs on. Its own variable on purpose |
| `ANTHROPIC_API_KEY` etc | The deployment's own chat keys. **Setting one takes every customer off their own key** |

Key precedence is **environment, then the business's own, then a browser
header**. Right for a single-tenant install, wrong for a product.

### Google Calendar

Add the callback to the same OAuth client, or consent fails with
`redirect_uri_mismatch` and says nothing useful:

```
https://YOUR-DOMAIN/api/integrations/google/callback
```

### Migrations

Plain SQL in `drizzle/`. `drizzle-kit generate` wants a TTY for its rename
prompts, so they are written by hand and applied directly.

### Tests

| | |
|---|---|
| `tenancy-audit` | Reads the source: every scoped query names a workspace |
| `tenancy-test` | A saved row cannot choose which business it lands in |
| `keys-test` | Plants real keys and searches every payload for them |
| `api-test` | The developer API end to end, including cross-tenant isolation |
| `export-test` | The .docx is structurally valid and escapes hostile input |
| `schedules-test` | When a schedule is owed a run, against real dates |
| `google-test` | The OAuth state parameter actually protects the callback |
| `messages-test` | Threads, unread, and who can read what |
| `admin-test` · `guard-test` · `smoke` | Operator reads, permission gates, repository round trip |
| `payload-check` | What a page load carries that it does not display |

Most run against the database in `.env.local` and clean up after themselves.
`api-test` needs `npm run dev` running.
