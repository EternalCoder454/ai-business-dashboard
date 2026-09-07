/**
 * That pulling the offer out of a reply never damages the reply.
 *
 * This is a pattern run over text a model wrote, so it will meet sentences
 * nobody here thought of. The bar is not that it catches every offer. The bar
 * is that when it is unsure it leaves the answer exactly as written, because
 * the failure that matters is a sentence quietly disappearing out of somebody's
 * advice.
 *
 *   npm run offers-test
 */
import { splitOffers } from "../src/lib/offers";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

/** The offer came out, the answer above it did not move. */
function pulled(reply: string, body: string, offers: string[]): void {
  const out = splitOffers(reply);
  check(
    JSON.stringify(reply.slice(-60)),
    out.body === body && JSON.stringify(out.offers) === JSON.stringify(offers),
    out.offers.length ? out.offers.join(" | ") : "nothing found",
  );
}

/** Nothing was touched. */
function kept(label: string, reply: string): void {
  const out = splitOffers(reply);
  const ok = out.body === reply && out.offers.length === 0;
  check(label, ok, ok ? "" : out.offers.join(" | ") || "the body was rewritten");
}

console.log("\nthe ordinary closing offer");
{
  pulled(
    "The margin is 34%, which is healthy for this size of order.\n\nWant me to draft the email to the supplier?",
    "The margin is 34%, which is healthy for this size of order.",
    ["Draft the email to the supplier."],
  );
  pulled(
    "Three of them are overdue.\n\nShould I chase the two from last month first?",
    "Three of them are overdue.",
    ["Chase the two from last month first."],
  );
  pulled(
    "That clause is unusual.\n\nWould you like me to mark up the whole contract?",
    "That clause is unusual.",
    ["Mark up the whole contract."],
  );
  pulled(
    "Here is where the money went.\n\nI can break it down by month if you like.",
    "Here is where the money went.",
    ["Break it down by month."],
  );
}

console.log("\ntwo offers become two buttons");
{
  pulled(
    "Both routes work.\n\nWant me to price the first one? Or should I put the numbers side by side?",
    "Both routes work.",
    ["Price the first one.", "Put the numbers side by side."],
  );
}

console.log("\nand the answer above is left exactly as it was");
{
  const reply = "# Pricing\n\n- 100 units at 4.20\n- 250 units at 3.80\n\nThe second is better once you clear 180.\n\nWant me to write that up as a quote?";
  const out = splitOffers(reply);
  check("everything before the offer survives",
    out.body === "# Pricing\n\n- 100 units at 4.20\n- 250 units at 3.80\n\nThe second is better once you clear 180.",
    out.body.slice(0, 20));
  check("and the offer is the button", JSON.stringify(out.offers) === '["Write that up as a quote."]', out.offers.join());
}

console.log("\nwhen it is not sure, it changes nothing");
{
  kept("a plain answer", "The invoice is due on the 14th.");
  kept("a question that is not an offer",
    "You have two suppliers.\n\nWhich of them did you use last time?");
  kept("a question that is not an offer, at the end of a paragraph",
    "The margin is thin.\n\nThat is before shipping. Which supplier did you use?");
  kept("an offer inside a bullet list",
    "Options:\n\n- Raise the price\n- Want me to model that?");
  kept("a reply that is only its offer", "Want me to draft the email?");
  kept("a half written code fence, which is every frame while it streams",
    "Try this:\n\n```sql\nselect * from orders\n\nWant me to run it?");
  kept("an offer running to a paragraph",
    `The numbers are in.\n\nWant me to ${"go through each line of the ledger and then ".repeat(6)}write it up?`);
}

console.log("\nthe sentence before the offer stays where it is");
{
  /*
   * The ordinary ending, and the one the first version of this missed. A rule
   * that wanted the whole closing paragraph to be offers left it alone, and
   * this shape is most of them. Found in a real reply sitting in the panel.
   */
  pulled(
    "The mic is echoing.\n\nThat is a question for Theo, he would know whether it is settings or hardware. Want me to log it as a task?",
    "The mic is echoing.\n\nThat is a question for Theo, he would know whether it is settings or hardware.",
    ["Log it as a task."],
  );
}

console.log("\nand a finished code block is still read");
{
  pulled(
    "Try this:\n\n```sql\nselect * from orders\n```\n\nWant me to run it against last quarter?",
    "Try this:\n\n```sql\nselect * from orders\n```",
    ["Run it against last quarter."],
  );
}

console.log("\nthe same offer twice is one button");
{
  const out = splitOffers("Fine.\n\nWant me to send it? Should I send it?");
  check("no duplicates", out.offers.length === 1, out.offers.join(" | "));
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
