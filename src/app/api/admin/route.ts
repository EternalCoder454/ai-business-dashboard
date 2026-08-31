import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import {
  departmentNamesFor,
  listConversationsFor,
  listPeople,
  readConversation,
} from "@/db/admin";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only, administrators only.
 *
 * There is no POST, PATCH, or DELETE here, and there should never be one. This
 * is the only route that reads past the per-account boundary every other route
 * enforces, so the smaller its surface the easier it is to be sure of.
 */
async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; status: number; error: string }
> {
  if (!authEnabled || !databaseEnabled) {
    return { ok: false, status: 503, error: "This instance has no accounts to review." };
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false, status: 401, error: "Not signed in." };

  // A plain 404 rather than a 403: someone who is not an administrator has no
  // business learning that this route exists.
  if (!isAdminEmail(email)) return { ok: false, status: 404, error: "Not found." };

  return { ok: true, email };
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const url = new URL(request.url);
  const person = url.searchParams.get("person")?.trim().toLowerCase();
  const conversation = url.searchParams.get("conversation")?.trim();

  try {
    if (person && conversation) {
      // Logged because reading someone else's thread should leave a trace,
      // even when the only person who can do it is the person who owns the app.
      console.log(`[admin] ${admin.email} read ${person}/${conversation}`);
      const thread = await readConversation(person, conversation);
      if (!thread) return Response.json({ error: "No such conversation." }, { status: 404 });
      return Response.json({ thread });
    }

    if (person) {
      const [conversations, departments] = await Promise.all([
        listConversationsFor(person),
        departmentNamesFor(person),
      ]);
      return Response.json({ conversations, departments });
    }

    return Response.json({ people: await listPeople(), self: admin.email });
  } catch (error) {
    console.error("[api/admin]", error);
    return Response.json({ error: "Could not read that." }, { status: 500 });
  }
}
