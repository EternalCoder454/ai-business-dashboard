/**
 * That saving a conversation does not rewrite the messages already in it.
 *
 * The client sends the whole thread on every save, because a shared
 * conversation has to reconcile rather than append. So the thirtieth message
 * re-sent the twenty nine before it, and each arrived as an upsert that set
 * every column to the value it already held.
 *
 * In Postgres that is not free and not a no-op. An update that changes nothing
 * still writes a new tuple version, still updates both indexes, still leaves a
 * dead tuple behind for vacuum, and still goes through the WAL. A conversation
 * therefore cost roughly the square of its own length in writes over its life,
 * which is invisible until a thread gets long.
 *
 * Measured on production before the fix: 84 live rows and 53 dead ones,
 * carrying 2.1MB of index on 128KB of table.
 *
 * Checked through xmin, the transaction that last wrote each row, because that
 * is the only thing that distinguishes "written again with the same values"
 * from "not written". Reading the rows back cannot tell the difference, which
 * is exactly why this went unnoticed.
 *
 *   npm run message-churn-test
 */
import { eq, sql } from "drizzle-orm";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { applyMutations } from "../src/db/repo";

const WS = `ws_churntest_${Date.now().toString(36)}`;
const EMAIL = "churn@selftest.local";

void (async () => {
  const db = requireDb();
  let failures = 0;
  const ok = (l: string, c: boolean, d = "") => {
    console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? ` (${d})` : ""}`);
    if (!c) failures += 1;
  };

  const xmin = async () => {
    const rows = await db.execute<{ id: string; v: string }>(sql`
      select id, xmin::text as v from messages where workspace_id = ${WS} order by id
    `);
    return Object.fromEntries([...rows].map((r) => [r.id, r.v]));
  };

  try {
    await db.insert(t.departments).values({ id: "d1", workspaceId: WS, name: "Eng", roleTitle: "Head", status: "active" });

    const messages = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`, role: i % 2 ? "assistant" : "user", content: `line ${i}`,
      timestamp: 1000 + i, attachments: [],
    }));
    const conversation = { id: "c1", departmentId: "d1", title: "Thread", messages };

    await applyMutations(WS, EMAIL, [{ table: "conversations", action: "upsert", rows: [conversation] } as never]);
    const first = await xmin();
    ok("eight messages written", Object.keys(first).length === 8, `${Object.keys(first).length}`);

    console.log("\nsaving the same thread again");
    await applyMutations(WS, EMAIL, [{ table: "conversations", action: "upsert", rows: [conversation] } as never]);
    const second = await xmin();
    const rewritten = Object.keys(first).filter((id) => first[id] !== second[id]);
    ok("no row was rewritten", rewritten.length === 0, rewritten.join(",") || "none");

    console.log("\nadding a ninth, the way a reply does");
    const grown = { ...conversation, messages: [...messages, { id: "m8", role: "user", content: "line 8", timestamp: 2000, attachments: [] }] };
    await applyMutations(WS, EMAIL, [{ table: "conversations", action: "upsert", rows: [grown] } as never]);
    const third = await xmin();
    const touched = Object.keys(second).filter((id) => second[id] !== third[id]);
    ok("the eight before it were left alone", touched.length === 0, touched.join(",") || "none");
    ok("and the new one landed", Boolean(third["m8"]), `${Object.keys(third).length} rows`);

    console.log("\nediting one still saves");
    const edited = { ...grown, messages: grown.messages.map((m) => m.id === "m3" ? { ...m, content: "changed" } : m) };
    await applyMutations(WS, EMAIL, [{ table: "conversations", action: "upsert", rows: [edited] } as never]);
    const fourth = await xmin();
    ok("the edited row was rewritten", third["m3"] !== fourth["m3"]);
    const others = Object.keys(third).filter((id) => id !== "m3" && third[id] !== fourth[id]);
    ok("and only that one", others.length === 0, others.join(",") || "none");
    const [row] = await db.select({ content: t.messages.content }).from(t.messages)
      .where(sql`${t.messages.workspaceId} = ${WS} and ${t.messages.id} = 'm3'`).limit(1);
    ok("with the new text", row?.content === "changed", row?.content);
  } finally {
    for (const table of [t.messages, t.conversations, t.departments]) {
      await db.delete(table).where(eq((table as { workspaceId: typeof t.messages.workspaceId }).workspaceId, WS));
    }
    const left = await db.select().from(t.messages).where(eq(t.messages.workspaceId, WS));
    console.log("\nand the scratch workspace is cleaned up");
    ok("nothing is left behind", left.length === 0, `${left.length} rows`);
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
