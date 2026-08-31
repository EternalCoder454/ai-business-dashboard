import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { isEmpty } from "@/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the client which storage it is actually running on, so the store can
 * decide between IndexedDB and the hosted workspace without guessing.
 */
/**
 * Whether the server holds its own Anthropic key.
 *
 * Reported as a boolean and never as a value. Settings uses it to stop asking
 * for a key that would be ignored: the chat route prefers the server key
 * outright, so a key typed into a browser when this is true does nothing.
 */
const serverKeyConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export async function GET() {
  // Auth alone decides whether someone is signed in. The database decides
  // whether their workspace is hosted. Treating those as one fact made a
  // deployment with auth but no database look signed out.
  if (!authEnabled) {
    return Response.json({ hosted: false, signedIn: false, serverKey: serverKeyConfigured(), empty: null });
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return Response.json({
      hosted: databaseEnabled,
      signedIn: false,
      serverKey: serverKeyConfigured(),
      empty: null,
    });
  }

  if (!databaseEnabled) {
    // Signed in, but there is nowhere to keep a workspace, so this browser
    // stays on IndexedDB while still knowing who is using it.
    return Response.json({
      hosted: false,
      signedIn: true,
      serverKey: serverKeyConfigured(),
      email,
      name: session.user?.name ?? undefined,
      givenName: session.user?.name?.split(" ")[0] ?? undefined,
      image: session.user?.image ?? undefined,
      empty: null,
    });
  }

  const serverKey = serverKeyConfigured();

  const identity = {
    name: session.user?.name ?? undefined,
    givenName: session.user?.name?.split(" ")[0] ?? undefined,
    image: session.user?.image ?? undefined,
  };

  try {
    return Response.json({
      hosted: true,
      signedIn: true,
      serverKey,
      email,
      ...identity,
      empty: await isEmpty(email),
    });
  } catch (error) {
    console.error("[api/workspace/status]", error);
    return Response.json({
      hosted: true,
      signedIn: true,
      serverKey,
      email,
      ...identity,
      empty: null,
    });
  }
}
