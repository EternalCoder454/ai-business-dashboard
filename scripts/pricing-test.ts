/**
 * What a reply costs, and what the panel does about a model it cannot price.
 *
 * The arithmetic is the easy half. The half worth testing is the refusal: an
 * unpriced model has to come back as unpriced rather than as zero, everywhere,
 * because a zero folds silently into a total that then reads as complete while
 * missing a whole provider. That is the failure that would send somebody to
 * their accountant with the wrong number.
 *
 *   npm run pricing-test
 */
import { MODELS } from "../src/lib/providers";
import { PRICES, costOf, isPriced, money } from "../src/lib/pricing";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

console.log("\nthe arithmetic is per million tokens");
{
  // Anthropic's own worked example: 50,000 in and 15,000 out on Opus 5 is
  // $0.25 plus $0.375. Taken from their pricing page rather than invented, so
  // this catches a table edited into the wrong units.
  const plain = costOf("claude-opus-5", {
    input: 50_000,
    output: 15_000,
    cacheRead: 0,
    cacheWrite: 0,
  });
  check("matches the vendor's worked example", plain !== null && Math.abs(plain - 0.625) < 1e-9, String(plain));

  // And the cached version of the same example: 10,000 uncached plus 40,000
  // read back is $0.05 plus $0.02, with output unchanged.
  const cached = costOf("claude-opus-5", {
    input: 10_000,
    output: 15_000,
    cacheRead: 40_000,
    cacheWrite: 0,
  });
  check("and its cached variant", cached !== null && Math.abs(cached - 0.445) < 1e-9, String(cached));

  check("nothing used costs nothing", costOf("claude-sonnet-5", {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  }) === 0);
}

console.log("\nreading the cache is a tenth of writing to it, not free");
{
  for (const [model, price] of Object.entries(PRICES)) {
    if (!model.startsWith("claude")) continue;
    check(
      `${model}: a cache read is a tenth of base input`,
      Math.abs(price.cacheRead - price.input / 10) < 1e-9,
      `${price.cacheRead} against ${price.input / 10}`,
    );
    // The panel asks for the one hour cache, which is 2x rather than the 1.25x
    // of the five minute one. A table copied from the wrong column would make
    // every cached prompt look 37% cheaper than it is.
    check(
      `${model}: a cache write is the one hour rate`,
      Math.abs(price.cacheWrite - price.input * 2) < 1e-9,
      `${price.cacheWrite} against ${price.input * 2}`,
    );
  }
}

console.log("\nan unpriced model is unpriced, never zero");
{
  const usage = { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 };
  check("an unknown model has no cost", costOf("some-model-nobody-added", usage) === null);
  check("and is not priced", !isPriced("some-model-nobody-added"));
  check("no model at all has no cost", costOf(undefined, usage) === null);
  check("no usage at all has no cost", costOf("claude-opus-5", undefined) === null);

  /*
   * The models the panel offers but deliberately cannot price. Listed by name
   * so that adding a price for one is a decision somebody makes here as well as
   * in the table, rather than this test quietly passing either way.
   */
  const knownUnpriced = ["gpt-5.1-mini", "deepseek-chat", "deepseek-reasoner"];
  for (const model of knownUnpriced) {
    check(`${model} is offered and unpriced`, !isPriced(model));
  }

  const offered = MODELS.map((m) => m.id);
  const unexpected = offered.filter((id) => !isPriced(id) && !knownUnpriced.includes(id));
  check(
    "every other model the panel offers has a price",
    unexpected.length === 0,
    unexpected.join(", ") || "none",
  );
}

console.log("\nsmall money keeps enough places to be true");
{
  check("nothing is nothing", money(0) === "$0", money(0));
  // Four heads each at a third of a penny must not all read "$0.00" while the
  // total is plainly not zero.
  check("a third of a penny is visible", money(0.0033) === "$0.0033", money(0.0033));
  check("pennies keep three places", money(0.42) === "$0.420", money(0.42));
  check("pounds keep two", money(12.345) === "$12.35", money(12.345));
  check("hundreds stop pretending", money(1234.56) === "$1,235", money(1234.56));
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
