import { timingSafeEqual } from "node:crypto";
import { auth, authEnabled } from "@/auth";
import { isOperator } from "@/lib/admin";
import { reporterEnabled, runReview } from "@/lib/reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A pass talks to the model once per batch per business. It is the longest
// thing this deployment does and it must not be cut off half way, because a
// half finished pass leaves the cursors somewhere nobody chose.
export const maxDuration = 300;

/**
 * The scheduled entry point for the conduct reviewer.
 *
 * Separate from /api/reports because the caller is different in kind. That one
 * is a person with a session, reading a screen. This one is a scheduler with no
 * session at all, which is why it cannot reuse the operator gate and needs a
 * door of its own.
 *
 * Two ways in, and nothing else:
 *
 * - `Authorization: Bearer $CRON_SECRET`, which is what Vercel sends on a
 *   scheduled invocation once CRON_SECRET is set. Compared in constant time,
 *   because this is a secret comparison and not a lookup.
 * - An operator with a session, so the same URL can be opened by hand to see
 *   what a pass does without waiting for the schedule.
 *
 * With no CRON_SECRET set, the bearer path is closed entirely rather than
 * open. An unauthenticated route that spends money on every request is the
 * kind of thing that is discovered by the bill.
 */
function bearerMatches(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  if (!token || scheme.toLowerCase() !== "bearer") return false;

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function operatorSignedIn(): Promise<boolean> {
  if (!authEnabled) return false;
  const session = await auth();
  return isOperator(session?.user?.email?.toLowerCase());
}

export async function GET(request: Request) {
  const allowed = bearerMatches(request) || (await operatorSignedIn());
  if (!allowed) {
    // 404 rather than 401. Somebody probing for a scheduled job should not be
    // told they have found one.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (!reporterEnabled()) {
    return Response.json(
      { ok: false, skipped: "REVIEWER_API_KEY is not set on this deployment." },
      { status: 200 },
    );
  }

  const started = Date.now();
  try {
    const result = await runReview();
    // Logged rather than only returned, because the usual reader of this is a
    // scheduler that throws the body away. The log is where somebody looks
    // when they want to know whether it has been running at all.
    console.log(
      `[reporter] pass over ${result.workspaces} businesses: ${result.reviewed} messages, ` +
        `${result.raised} raised, ${result.failed.length} failed, ${Date.now() - started}ms`,
    );
    return Response.json({ ok: true, ...result, ms: Date.now() - started });
  } catch (error) {
    console.error("[reporter] the pass itself failed", error);
    return Response.json({ ok: false, error: "The pass failed." }, { status: 500 });
  }
}
