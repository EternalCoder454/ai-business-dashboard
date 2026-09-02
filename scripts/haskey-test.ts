/**
 * Whether the panel thinks it can produce a reply.
 *
 * The bug this was written for made the product unusable for every colleague
 * anybody invited. The condition was `!serverKey && !settings.apiKey`, which
 * asks about the deployment's key and about one typed into this browser, and
 * skips the business's own: the whole bring-your-own-key model, and the only
 * one of the three most people ever use.
 *
 * So an administrator set the key, invited somebody, and that person was told
 * on the chat screen, in the sidebar, in Ask Everyone, and in their
 * notifications that there was no key. The chat worked. Everything about it
 * said it would not, which is worse than it not working, because they stop
 * before trying.
 *
 * Run with: npm run haskey-test
 */
import { hasKeyFor, type KeySources } from "../src/lib/hasKey";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const NONE: KeySources = {
  serverKeys: { anthropic: false, openai: false, google: false },
  workspaceKeys: { anthropic: { set: false }, openai: { set: false }, google: { set: false } },
};

const with_ = (patch: Partial<KeySources>): KeySources => ({ ...NONE, ...patch });

const ANTHROPIC = "claude-sonnet-5";
const GOOGLE = "gemini-2.5-flash";

console.log("the three places a key can be");
check("nowhere at all", !hasKeyFor(ANTHROPIC, NONE));
check(
  "the deployment has one",
  hasKeyFor(ANTHROPIC, with_({ serverKeys: { anthropic: true, openai: false, google: false } })),
);
check(
  "the business has one",
  hasKeyFor(
    ANTHROPIC,
    with_({
      workspaceKeys: { anthropic: { set: true }, openai: { set: false }, google: { set: false } },
    }),
  ),
  "the case that was missing",
);
check("this browser has one", hasKeyFor(ANTHROPIC, with_({ browserKey: "sk-ant-x" })));

console.log("\nthe invited colleague");
// An administrator set the business key. The colleague has typed nothing.
const invited = with_({
  workspaceKeys: { anthropic: { set: true }, openai: { set: false }, google: { set: false } },
});
check("sees that a key exists", hasKeyFor(ANTHROPIC, invited));

// The condition as it was, written out, to show what it did with this input.
// It asks about the deployment and about this browser and never about the
// business, so for the one arrangement almost every customer uses it answers
// "no key" while the key sits right there.
const asItWas = (serverKey: boolean, browserKey: string) => !serverKey && !browserKey;
check(
  "the old condition said there was none",
  asItWas(false, "") === true,
  "which is why every invited colleague saw the warning",
);

console.log("\nby provider, not in general");
const anthropicOnly = with_({
  workspaceKeys: { anthropic: { set: true }, openai: { set: false }, google: { set: false } },
});
check("a head on Anthropic can reply", hasKeyFor(ANTHROPIC, anthropicOnly));
check("a head pointed at Gemini cannot", !hasKeyFor(GOOGLE, anthropicOnly));

console.log("\nedges");
check("an empty browser key is not a key", !hasKeyFor(ANTHROPIC, with_({ browserKey: "" })));
check("nor is whitespace", !hasKeyFor(ANTHROPIC, with_({ browserKey: "   " })));
check(
  "an unknown model falls back to the default provider",
  hasKeyFor("something-nobody-has-heard-of", with_({ browserKey: "sk-ant-x" })),
);

console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
