import { auth, authEnabled } from "@/auth";
import { databaseEnabled } from "@/db/client";
import { membershipFor } from "@/db/tenancy";
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
  type BackupKind,
} from "@/db/backups";
import { readJsonWithin } from "@/lib/guard";
import { refused, track } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * A backup reads every table in the workspace and a restore rewrites them, so
 * neither is a request that finishes in the time an ordinary one gets.
 */
export const maxDuration = 300;

/** Nothing here accepts a body larger than a label. */
const MAX_BODY = 4 * 1024;

/**
 * Resolves who is asking, and refuses anyone who is not an administrator.
 *
 * Backups are administrator only, which is a stronger check than the areas a
 * member's permissions describe. A restore rewrites every table in the
 * workspace at once, including screens the person asking may not be allowed to
 * open, so there is no version of this that a restricted member should reach.
 */
async function requireAdmin(): Promise<
  { workspaceId: string; email: string } | { error: string; status: number }
> {
  if (!databaseEnabled) {
    return { error: "No database configured on this instance.", status: 501 };
  }
  if (!authEnabled) return { error: "Auth is not configured.", status: 501 };

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { error: "Not signed in.", status: 401 };

  const membership = await membershipFor(email);
  if (!membership) return { error: "No workspace.", status: 404 };
  if (membership.role !== "admin") {
    return {
      error: "Only an administrator of this workspace can manage backups.",
      status: 403,
    };
  }

  return { workspaceId: membership.workspaceId, email };
}

/** Every backup this workspace holds, newest first. */
export async function GET() {
  const who = await requireAdmin();
  if ("error" in who) {
    return Response.json({ error: who.error }, { status: who.status });
  }

  try {
    return Response.json({ backups: await listBackups(who.workspaceId) });
  } catch (error) {
    console.error("[api/backups] list", error);
    return Response.json({ error: "Could not read the backups." }, { status: 500 });
  }
}

/**
 * Takes a backup, or restores one.
 *
 * Both on POST because a restore is not something a browser should be able to
 * be talked into with a link, and the difference is one word in a body rather
 * than a path somebody could be sent.
 */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if ("error" in who) {
    return Response.json({ error: who.error }, { status: who.status });
  }

  const parsed = await readJsonWithin<{ action?: string; label?: string; id?: string }>(
    request,
    MAX_BODY,
  );
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  const { action, label, id } = parsed.body;

  if (action === "create") {
    try {
      const made = await track("backup.create", who.workspaceId, () =>
        createBackup({
          workspaceId: who.workspaceId,
          label: typeof label === "string" && label.trim() ? label.trim() : "Manual backup",
          kind: "manual" as BackupKind,
          takenBy: who.email,
        }),
      );
      if ("error" in made) {
        refused("backup.create", who.workspaceId, "TooLarge");
        return Response.json({ error: made.error }, { status: 400 });
      }
      return Response.json({ backup: made.backup });
    } catch (error) {
      console.error("[api/backups] create", error);
      return Response.json({ error: "Could not take a backup." }, { status: 500 });
    }
  }

  if (action === "restore") {
    if (typeof id !== "string" || !id) {
      return Response.json({ error: "Which backup?" }, { status: 400 });
    }
    try {
      const done = await track("backup.restore", who.workspaceId, () =>
        restoreBackup({ workspaceId: who.workspaceId, id, restoredBy: who.email }),
      );
      if ("error" in done) {
        refused("backup.restore", who.workspaceId, "Refused");
        return Response.json({ error: done.error }, { status: 400 });
      }
      return Response.json({ ok: true, safety: done.safety });
    } catch (error) {
      // The restore is one transaction, so a failure here changed nothing.
      console.error("[api/backups] restore", error);
      return Response.json(
        { error: "Could not restore that backup. Nothing was changed." },
        { status: 500 },
      );
    }
  }

  return Response.json({ error: "Unrecognised action." }, { status: 400 });
}

/** Removes one backup. The rows it describes are untouched. */
export async function DELETE(request: Request) {
  const who = await requireAdmin();
  if ("error" in who) {
    return Response.json({ error: who.error }, { status: who.status });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Which backup?" }, { status: 400 });

  try {
    await deleteBackup(who.workspaceId, id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[api/backups] delete", error);
    return Response.json({ error: "Could not remove that backup." }, { status: 500 });
  }
}
