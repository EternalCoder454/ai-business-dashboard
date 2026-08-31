import { auth, authEnabled } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets the client know whether there is an account to show, without guessing. */
export async function GET() {
  if (!authEnabled) return Response.json({ enabled: false, email: null });
  const session = await auth();
  return Response.json({ enabled: true, email: session?.user?.email ?? null });
}
