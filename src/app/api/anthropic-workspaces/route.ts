export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lists the Anthropic workspaces this key can act in.
 *
 * An identity-linked key that spans several workspaces refuses any Messages
 * request that does not name one, and the id is otherwise only findable by
 * digging through the Console. The same kind of key is allowed to call the
 * Admin API's List Workspaces, so the app can simply ask.
 *
 * The installed SDK predates client.beta.organization, so this is the
 * documented REST endpoint called directly.
 */
export async function POST(request: Request) {
  const serverKey = process.env.ANTHROPIC_API_KEY?.trim();
  const apiKey = serverKey || request.headers.get("x-anthropic-key")?.trim();

  if (!apiKey) {
    return Response.json({ error: "Add an API key first." }, { status: 400 });
  }

  try {
    const response = await fetch(
      "https://api.anthropic.com/v1/organizations/workspaces?limit=100&include_archived=false",
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      },
    );

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      return Response.json(
        {
          error:
            detail?.error?.message ??
            `Anthropic refused the lookup (${response.status}). A key scoped to a single workspace cannot list them.`,
        },
        { status: 200 },
      );
    }

    const body = (await response.json()) as {
      data?: { id: string; name: string }[];
    };

    return Response.json({
      workspaces: (body.data ?? []).map((w) => ({ id: w.id, name: w.name })),
    });
  } catch (error) {
    console.error("[api/anthropic-workspaces]", error);
    return Response.json({ error: "Could not reach the Anthropic API." }, { status: 200 });
  }
}
