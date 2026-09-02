import { and, eq } from "drizzle-orm";
import { auth, authEnabled } from "@/auth";
import { databaseEnabled, requireDb } from "@/db/client";
import * as t from "@/db/schema";
import { membershipFor } from "@/db/tenancy";
import { buildDocx } from "@/lib/export/docx";
import { withinRate } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One deliverable, as a file somebody can send to somebody else.
 *
 * The gap this closes: a head would write a good campaign brief or a pricing
 * model and there was no way out of the panel except selecting the text. The
 * Library's own shipped skills are called Campaign Brief, Contract Read, and
 * SOP Writer, which are all documents, and the product could not produce one.
 *
 * Built on the server rather than in the browser so that anything else that
 * needs a document later, a scheduled brief in an email, can use the same
 * function and produce the same file.
 */
const TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
} as const;

type Format = keyof typeof TYPES;

const isFormat = (value: string): value is Format => value in TYPES;

/** A filename that survives every operating system somebody might save it on. */
function safeName(title: string, format: Format): string {
  const base =
    title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "deliverable";
  return `${base}.${format}`;
}

export async function GET(request: Request) {
  if (!authEnabled || !databaseEnabled) {
    return Response.json({ error: "Not available on this instance." }, { status: 503 });
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const asked = url.searchParams.get("format")?.trim() ?? "docx";
  if (!id) return Response.json({ error: "Nothing named." }, { status: 400 });
  if (!isFormat(asked)) {
    return Response.json(
      { error: `Format has to be one of ${Object.keys(TYPES).join(", ")}.` },
      { status: 400 },
    );
  }

  try {
    const mine = await membershipFor(email);
    if (!mine) return Response.json({ error: "Not found." }, { status: 404 });

    // Building a .docx is a zip and a compress, which is the only real CPU work
    // this deployment does on a request. Downloads are occasional by nature.
    if (!withinRate(`doc:${email}`, 30, 60_000)) {
      return Response.json({ error: "Too many at once." }, { status: 429 });
    }

    // Keyed by workspace and id together, so an id from another business simply
    // does not match rather than matching and then being refused.
    const [row] = await requireDb()
      .select({
        title: t.deliverables.title,
        body: t.deliverables.body,
        departmentId: t.deliverables.departmentId,
        updatedAt: t.deliverables.updatedAt,
      })
      .from(t.deliverables)
      .where(
        and(eq(t.deliverables.workspaceId, mine.workspaceId), eq(t.deliverables.id, id)),
      )
      .limit(1);
    if (!row) return Response.json({ error: "Not found." }, { status: 404 });

    const [head] = await requireDb()
      .select({ name: t.departments.name })
      .from(t.departments)
      .where(
        and(
          eq(t.departments.workspaceId, mine.workspaceId),
          eq(t.departments.id, row.departmentId),
        ),
      )
      .limit(1);

    const when = row.updatedAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const subtitle = [head?.name, when].filter(Boolean).join(", ");

    const headers = {
      "Content-Type": TYPES[asked],
      "Content-Disposition": `attachment; filename="${safeName(row.title, asked)}"`,
      "Cache-Control": "no-store",
    };

    if (asked === "docx") {
      const bytes = await buildDocx({ title: row.title, subtitle, body: row.body });
      return new Response(bytes as unknown as BodyInit, { headers });
    }

    // Markdown keeps the source as it was written. Plain text is the same
    // thing without the markers, for pasting somewhere that does not read them.
    const text =
      asked === "md"
        ? `# ${row.title}\n\n_${subtitle}_\n\n${row.body}\n`
        : `${row.title}\n${subtitle}\n\n${row.body.replace(/^#{1,6}\s+/gm, "").replace(/\*\*|__|`/g, "")}\n`;

    return new Response(text, { headers });
  } catch (error) {
    console.error("[api/workspace/deliverable]", error);
    return Response.json({ error: "Could not build that file." }, { status: 500 });
  }
}
