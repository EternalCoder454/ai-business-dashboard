import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { membershipFor } from "@/db/tenancy";
import { connectionFor, consentUrl, disconnect, googleEnabled } from "@/lib/google";
import { readJsonWithin } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starting and ending one person's calendar connection.
 *
 * The connection is theirs rather than the business's, so there is no
 * administrator gate here. Somebody choosing to show their own diary beside
 * their own work is not a decision anybody else needs to make for them, and
 * nobody else can see it.
 */
async function requireMember(): Promise<
  { ok: true; email: string; workspaceId: string } | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 501, error: "This instance has no hosted workspace." };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, error: "Not signed in." };
  const membership = await membershipFor(email);
  if (!membership) return { ok: false, status: 403, error: "You are not in a workspace." };
  return { ok: true, email, workspaceId: membership.workspaceId };
}

export async function GET() {
  const who = await requireMember();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  return Response.json({
    available: googleEnabled(),
    ...(await connectionFor(who.email)),
  });
}

export async function POST(request: Request) {
  const who = await requireMember();
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  const parsed = await readJsonWithin<{ action?: string }>(request, 2_000);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  if (parsed.body.action === "disconnect") {
    await disconnect(who.email);
    return Response.json({ ok: true });
  }

  if (parsed.body.action === "connect") {
    if (!googleEnabled()) {
      return Response.json(
        { error: "Google is not configured on this deployment." },
        { status: 501 },
      );
    }
    // The URL is returned rather than redirected to, because the caller is a
    // fetch from a button. A 302 answered to fetch is followed by the browser
    // and lands the consent page inside a JSON parse.
    return Response.json({ url: consentUrl(who.email) });
  }

  return Response.json({ error: "No such action." }, { status: 400 });
}
