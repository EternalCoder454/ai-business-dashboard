/**
 * Which conversation a department opens to.
 *
 * The rule is small and easy to get subtly wrong, and getting it wrong is what
 * the change was for: it used to be conversations[0] with no way out, so every
 * visit for the rest of the month reopened whichever thread was most recent and
 * a second subject went into the middle of the first one.
 *
 * Run with: npm run route-test
 */
import type { Conversation } from "../src/lib/types";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/**
 * The same decision ChatView makes, kept here so it can be exercised without a
 * browser. Changing one without the other is the obvious hazard, so the shape
 * is deliberately tiny.
 */
function open(conversations: Conversation[], requested: string | null) {
  const started = conversations.filter((c) => c.messageCount > 0);
  const showList = !requested && started.length > 0;

  let active: Conversation | undefined;
  if (requested === "new") active = undefined;
  else if (requested) active = conversations.find((c) => c.id === requested);
  if (!active && requested !== "new") {
    active = started.length > 0 ? undefined : conversations[0];
  }
  return { showList, active };
}

const convo = (id: string, messageCount: number): Conversation => ({
  id,
  departmentId: "marketing",
  title: `Conversation ${id}`,
  messages: [],
  messageCount,
  createdAt: 0,
  updatedAt: 0,
});

console.log("a head nobody has spoken to");
{
  const { showList, active } = open([], null);
  check("no list to show", !showList);
  check("and a blank chat", active === undefined);
}

console.log("\na head with a blank conversation already made");
{
  const { showList, active } = open([convo("a", 0)], null);
  check("still no list", !showList, "an empty thread is not a conversation");
  check("and it reuses the blank one", active?.id === "a", "rather than leaving empties behind");
}

console.log("\na head that has answered something");
{
  const { showList, active } = open([convo("a", 4)], null);
  check("opens the list", showList, "the whole point of the change");
  check("and no conversation is active", active === undefined);
}

console.log("\nasking for one by name");
{
  const { showList, active } = open([convo("a", 4), convo("b", 2)], "b");
  check("no list", !showList);
  check("opens that one", active?.id === "b");
}

console.log("\nasking for a new one");
{
  const { showList, active } = open([convo("a", 4), convo("b", 2)], "new");
  check("no list", !showList);
  check("and a blank chat", active === undefined, "not the most recent one");
}

console.log("\nasking for one that is gone");
{
  const { showList, active } = open([convo("a", 4)], "deleted-id");
  check("does not silently open somebody else's", active === undefined);
  check("and does not fall back to the list either", !showList, "the id was explicit");
}

console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
