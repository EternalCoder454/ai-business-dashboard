import { toNextJsHandler } from "better-auth/next-js";
import { authInstance } from "@/auth";

export const runtime = "nodejs";

/**
 * Everything better-auth serves: starting the Google redirect, taking the
 * callback, reading a session, signing out.
 *
 * The path changed from [...nextauth] to [...all] because that is the segment
 * better-auth expects. It stays under /api/auth, which is the one prefix the
 * proxy has always excluded, so an unauthenticated person can still reach the
 * thing that makes them authenticated.
 *
 * A deployment with no OAuth client configured answers 404 rather than
 * crashing on a null handler. Nothing should be asking, and if something is,
 * saying the endpoint is not here is the honest answer.
 */
const handler = authInstance ? toNextJsHandler(authInstance) : null;

const missing = () =>
  Response.json({ error: "Auth is not configured." }, { status: 404 });

export const GET = handler?.GET ?? missing;
export const POST = handler?.POST ?? missing;
