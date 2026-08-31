import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { isEmpty } from "@/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the client which storage it is actually running on, so the store can
 * decide between IndexedDB and the hosted workspace without guessing.
 */
export async function GET() {
  if (!databaseEnabled || !authEnabled) {
    return Response.json({ hosted: false, signedIn: false, empty: null });
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ hosted: true, signedIn: false, empty: null });

  const identity = {
    name: session.user?.name ?? undefined,
    givenName: session.user?.name?.split(" ")[0] ?? undefined,
    image: session.user?.image ?? undefined,
  };

  try {
    return Response.json({
      hosted: true,
      signedIn: true,
      email,
      ...identity,
      empty: await isEmpty(email),
    });
  } catch (error) {
    console.error("[api/workspace/status]", error);
    return Response.json({ hosted: true, signedIn: true, email, ...identity, empty: null });
  }
}
