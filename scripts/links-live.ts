/**
 * The link filter end to end, against the real database.
 *
 * links-test covers the matching on its own. This covers the part that broke
 * in production: what the send path actually reads, in the order it reads it,
 * including the states nobody sets up on purpose. The filter shipped on by
 * default with an empty list and then threw on a table that did not exist, and
 * neither of those is visible from a unit test of the regular expression.
 *
 * Runs against a throwaway business it creates and removes. It never touches a
 * real one, and cleanup runs before the test as well as after so a crashed run
 * cannot leave a workspace behind.
 *
 * Run with: npm run links-live
 */
import { eq } from "drizzle-orm";
import { requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import {
  allowLink,
  allowedLinks,
  disallowLink,
  linkFilterFor,
  recordStrippedLinks,
  setLinkPolicy,
} from "../src/db/links";
import { scrubLinks } from "../src/lib/links";

const WS = "links-live-workspace";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/** What the send path does, so this exercises the decision and not a copy. */
function send(text: string, filter: { policy: string; domains: string[] }) {
  return filter.policy === "allowlist"
    ? scrubLinks(text, filter.domains)
    : { text, removed: [] as string[] };
}

async function cleanUp(): Promise<void> {
  const db = requireDb();
  await db.delete(t.reports).where(eq(t.reports.workspaceId, WS));
  await db.delete(t.linkAllowlist).where(eq(t.linkAllowlist.workspaceId, WS));
  await db.delete(t.settings).where(eq(t.settings.workspaceId, WS));
  await db.delete(t.workspaces).where(eq(t.workspaces.id, WS));
}

async function main() {
  const db = requireDb();
  await cleanUp();
  await db.insert(t.workspaces).values({ id: WS, name: "Links Live" });
  await db.insert(t.settings).values({ workspaceId: WS });

  const message = "the docs are at https://example.com/guide and https://evil.com/login";

  console.log("a new business does not filter anything");
  // The state every existing business is in, and the one that broke.
  const fresh = await linkFilterFor(WS);
  check("policy is open", fresh.policy === "open", fresh.policy);
  const untouched = send(message, fresh);
  check("the message is unchanged", untouched.text === message);
  check("nothing is reported", untouched.removed.length === 0);

  console.log("\nswitched on with nothing allowed yet");
  await setLinkPolicy(WS, "allowlist");
  const empty = await linkFilterFor(WS);
  check("policy is allowlist", empty.policy === "allowlist", empty.policy);
  const stripped = send(message, empty);
  check("both links go", !stripped.text.includes("example.com") && !stripped.text.includes("evil.com"));
  check("the words survive", stripped.text.startsWith("the docs are at"), stripped.text);
  check("both hosts reported", stripped.removed.join() === "example.com,evil.com", stripped.removed.join());

  console.log("\nafter allowing one address");
  const added = await allowLink(WS, "https://example.com/some/path", "ada@example.com");
  check("a whole URL is stored as its host", added.ok && added.domain === "example.com", added.ok ? added.domain : added.error);
  const one = await linkFilterFor(WS);
  const mixed = send(message, one);
  check("the allowed link stays", mixed.text.includes("https://example.com/guide"), mixed.text);
  check("the other one goes", !mixed.text.includes("evil.com"));
  check("only the other is reported", mixed.removed.join() === "evil.com", mixed.removed.join());

  console.log("\na subdomain of an allowed address is allowed");
  const sub = send("see https://docs.example.com/x", one);
  check("it survives", sub.text.includes("docs.example.com"), sub.text);
  const look = send("see https://notexample.com/x", one);
  check("a lookalike does not", look.removed.join() === "notexample.com", look.removed.join());

  console.log("\nwhat an administrator sees");
  const listed = await allowedLinks(WS);
  check("one entry", listed.length === 1, String(listed.length));
  check("with the name of whoever added it", listed[0]?.addedBy === "ada@example.com", listed[0]?.addedBy);
  const bad = await allowLink(WS, "not a domain", "ada@example.com");
  check("nonsense is refused rather than stored", !bad.ok);
  check("and the list is unchanged", (await allowedLinks(WS)).length === 1);

  console.log("\na stripped link reaches Reports");
  await recordStrippedLinks({
    workspaceId: WS,
    messageId: "msg-live-test",
    authorEmail: "ada@example.com",
    hosts: ["evil.com"],
  });
  const reports = await db.select().from(t.reports).where(eq(t.reports.workspaceId, WS));
  check("one report", reports.length === 1, String(reports.length));
  check("filed as a link", reports[0]?.category === "suspicious-link", reports[0]?.category);
  check("naming the host, which is what the Allow button reads", reports[0]?.quote === "evil.com", reports[0]?.quote);
  check("and it carries the business name", reports[0]?.workspaceName === "Links Live", reports[0]?.workspaceName);

  console.log("\nturning it off puts everything back");
  await disallowLink(WS, "example.com");
  check("the entry is gone", (await allowedLinks(WS)).length === 0);
  await setLinkPolicy(WS, "open");
  const off = await linkFilterFor(WS);
  check("policy is open again", off.policy === "open", off.policy);
  check("and the message is whole", send(message, off).text === message);

  await cleanUp();
  check("nothing left behind", (await db.select().from(t.workspaces).where(eq(t.workspaces.id, WS))).length === 0);

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  await cleanUp().catch(() => {});
  console.error(error);
  process.exit(1);
});
