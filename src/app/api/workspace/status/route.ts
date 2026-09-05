import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { isEmpty } from "@/db/repo";
import { isOperator, isOwnerEmail } from "@/lib/admin";
import { NO_KEYS, keySummaries } from "@/db/keys";
import { countMembers, membershipFor } from "@/db/tenancy";

import { PROVIDERS, type Provider } from "@/lib/providers";
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
const serverKeys = () =>
  Object.fromEntries(
    // Each provider already records the variable it reads, so this cannot
    // drift from the list the rest of the panel uses.
    PROVIDERS.map((provider) => [
      provider.id,
      Boolean(process.env[provider.envVar]?.trim()),
    ]),
  ) as Record<Provider, boolean>;

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
  const operator = isOperator(email);
  const isOwner = isOwnerEmail(email);

  // Whether the business holds a key, and its last four characters. Never the
  // key: nothing returns that, to an administrator or anyone else.
  const membership = await membershipFor(email);
  const workspaceRole = membership?.role ?? null;
  /*
   * What this person may open, for hiding what they cannot. Sent as it is
   * stored rather than resolved into a list of allowed screens, because the
   * client already knows which screens exist and the server should not have to
   * be redeployed when one is added.
   */
  const permissions = membership?.permissions ?? null;

  // Together, not one after another. None of the three needs an answer from
  // the other two, and this route runs on every page load.
  const [workspaceKeys, workspacePeople, empty] = await Promise.all([
    // How many people share this workspace. A conversation is worth polling
    // for somebody else's messages only when there is somebody else.
    membership ? keySummaries(membership.workspaceId) : Promise.resolve(NO_KEYS),
    membership ? countMembers(membership.workspaceId) : Promise.resolve(0),
    isEmpty(email),
  ]);

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
      workspaceKeys,
      workspaceRole,
      permissions,
      workspacePeople,
      isOperator: operator,
      isOwner,
      email,
      ...identity,
      empty,
    });
  } catch (error) {
    console.error("[api/workspace/status]", error);
    return Response.json({
      hosted: true,
      signedIn: true,
      serverKey,
      serverKeys: serverKeys(),
      workspaceKeys,
      workspaceRole,
      permissions,
      workspacePeople,
      isOperator: operator,
      isOwner,
      email,
      ...identity,
      empty: null,
    });
  }
}
