import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { isEmpty } from "@/db/repo";
import { isAdminEmail, isOwnerEmail } from "@/lib/admin";

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
/**
 * Anthropic only, and named without a provider because it predates the others.
 * The interface uses it for "can anything reply at all", which stays true.
 */
const serverKeyConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

/** Which providers the deployment holds a key for, so Settings can say so. */
const serverKeys = () => ({
  anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
  google: Boolean(process.env.GEMINI_API_KEY?.trim()),
});

export async function GET() {
  // Auth alone decides whether someone is signed in. The database decides
  // whether their workspace is hosted. Treating those as one fact made a
  // deployment with auth but no database look signed out.
  if (!authEnabled) {
    return Response.json({
      hosted: false,
      signedIn: false,
      serverKey: serverKeyConfigured(),
      serverKeys: serverKeys(),
      empty: null,
    });
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return Response.json({
      hosted: databaseEnabled,
      signedIn: false,
      serverKey: serverKeyConfigured(),
      serverKeys: serverKeys(),
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
      serverKeys: serverKeys(),
      email,
      name: session.user?.name ?? undefined,
      givenName: session.user?.name?.split(" ")[0] ?? undefined,
      image: session.user?.image ?? undefined,
      empty: null,
    });
  }

  const serverKey = serverKeyConfigured();
  const isAdmin = isAdminEmail(email);
  const isOwner = isOwnerEmail(email);

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
      serverKeys: serverKeys(),
      isAdmin,
      isOwner,
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
      serverKeys: serverKeys(),
      isAdmin,
      isOwner,
      email,
      ...identity,
      empty: null,
    });
  }
}
