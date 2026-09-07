/**
 * That a workspace's effort ceiling actually holds.
 *
 * Effort is a dial on how hard a model thinks and it is now one click from the
 * composer, so somebody can put Max on "what is our phone number" without
 * meaning anything by it. The bill lands on the business, so the business sets
 * the top.
 *
 * The control only offers what is allowed, and the control is not what decides:
 * the effort travels in the request body like everything else and a hand
 * written one can name any of them. This is the function the route applies.
 *
 *   npm run effort-test
 */
import { EFFORT_ORDER, MODELS, clampEffort, supportsEffort } from "../src/lib/providers";
import { EFFORT_OPTIONS } from "../src/lib/seed";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

console.log("\nwithout a ceiling nothing changes");
{
  for (const id of EFFORT_ORDER) {
    check(`${id} stays ${id}`, clampEffort(id, "") === id);
  }
  check("and an unknown value falls to medium", clampEffort("enormous", "") === "medium");
  check("as does a missing one", clampEffort(undefined, "") === "medium");
}

console.log("\nwith a ceiling, anything above it comes back as it");
{
  check("max is cut to high", clampEffort("max", "high") === "high");
  check("xhigh is cut to high", clampEffort("xhigh", "high") === "high");
  check("high is left alone", clampEffort("high", "high") === "high");
  check("and anything below is untouched", clampEffort("low", "high") === "low");
  check("a ceiling of low means low", clampEffort("max", "low") === "low");
}

console.log("\nthe ceiling is never a refusal");
{
  /*
   * Every input returns a usable effort. Refusing the message would punish
   * somebody for a setting they did not know existed, and answering at the
   * ceiling is what they wanted anyway.
   */
  const inputs = [...EFFORT_ORDER, "", "nonsense", undefined];
  const ceilings = [...EFFORT_ORDER, "", "nonsense", undefined];
  const bad: string[] = [];
  for (const wanted of inputs) {
    for (const ceiling of ceilings) {
      const out = clampEffort(wanted, ceiling);
      if (!(EFFORT_ORDER as readonly string[]).includes(out)) {
        bad.push(`${String(wanted)}/${String(ceiling)} gave ${String(out)}`);
      }
    }
  }
  check("every combination returns a real effort", bad.length === 0, bad.join(", ") || "none");
}

console.log("\nthe order matches what the screen offers");
{
  /*
   * The ceiling and the cycle both read this order, and a select that listed
   * them differently would let somebody pick a "highest" that is not the
   * highest.
   */
  check(
    "same efforts, in the same order",
    JSON.stringify(EFFORT_OPTIONS.map((option) => option.id)) === JSON.stringify([...EFFORT_ORDER]),
    EFFORT_OPTIONS.map((option) => option.id).join(","),
  );
}

console.log("\nand the control is only offered where it does something");
{
  check("Opus 5 takes an effort", supportsEffort("claude-opus-5"));
  check("Sonnet 5 takes one", supportsEffort("claude-sonnet-5"));
  // Haiku 4.5 rejects both adaptive thinking and output_config.effort with a
  // 400, so a control there would be a switch that breaks the next message.
  check("Haiku 4.5 does not", !supportsEffort("claude-haiku-4-5"));
  check("and a model nobody named does not", !supportsEffort(undefined));

  /*
   * An unknown id reads as Anthropic, because that is what a workspace with no
   * provider recorded gets. So it has to fail closed: the alternative is
   * offering the control for a model that answers 400 when it is used.
   */
  check("nor an id that is not on the list", !supportsEffort("gpt-5"));

  /*
   * Both other providers map effort onto every model offered here. Checked
   * against the list rather than against one example, so adding a model cannot
   * quietly lose its effort control.
   */
  const missing = MODELS.filter((model) => model.provider !== "anthropic" && !supportsEffort(model.id));
  check("every non-Anthropic model takes one", missing.length === 0,
    missing.map((model) => model.id).join(", ") || "none");
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
process.exit(failures === 0 ? 0 : 1);
