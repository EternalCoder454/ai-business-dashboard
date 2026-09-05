/**
 * Every credential the panel can hold is wired all the way through.
 *
 * This file exists because one of them was not, twice, in the same way. The
 * request schema for saving a key was an enum of the three providers that
 * existed when it was written. Adding DeepSeek and then Perplexity left both
 * unable to save a key at all: refused at the schema boundary, before the route
 * that knew about them ran, with an error naming the three it still believed in.
 *
 * Nothing caught it because every test used one of the original three. So this
 * walks the list instead of naming anything.
 *
 * Run with: npm run credentials-test
 */
import { keysBody } from "../src/lib/schemas";
import { PROVIDERS, MODELS, modelsFor, providerOf } from "../src/lib/providers";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

/*
 * Named here rather than imported from db/keys, which reaches the database on
 * import. If the two ever disagree the check below about models fails, because
 * a provider missing from this list has no models to find.
 */
const CREDENTIALS = [...PROVIDERS.map((p) => p.id), "perplexity"];

console.log("every credential can be sent to the keys route");
{
  for (const id of CREDENTIALS) {
    const parsed = keysBody.safeParse({ provider: id, key: "" });
    check(`${id} passes the request schema`, parsed.success,
      parsed.success ? "" : JSON.stringify(parsed.error.issues[0]?.message));
  }
  // Clearing is how a key is removed, so an empty value must survive.
  check("an empty key is allowed, which is how one is cleared",
    keysBody.safeParse({ provider: "anthropic", key: "" }).success);
  check("a key longer than the column is refused",
    !keysBody.safeParse({ provider: "anthropic", key: "x".repeat(501) }).success);
  check("a missing provider is refused", !keysBody.safeParse({ key: "" }).success);
}

console.log("\nevery provider is a complete provider");
{
  for (const provider of PROVIDERS) {
    check(`${provider.label} has at least one model`, modelsFor(provider.id).length > 0);
    check(`${provider.label} names the environment variable it reads`, Boolean(provider.envVar));
    check(`${provider.label} says what its key looks like`, Boolean(provider.keyPrefix));
    check(`${provider.label} has somewhere to get one`, provider.consoleUrl.startsWith("https://"));
  }
}

console.log("\nevery model belongs to a provider that exists");
{
  const known = new Set(PROVIDERS.map((p) => p.id));
  const orphans = MODELS.filter((m) => !known.has(m.provider)).map((m) => m.id);
  check("no model names a provider that is not in the list", orphans.length === 0, orphans.join());

  for (const model of MODELS) {
    check(`${model.id} resolves to ${model.provider}`, providerOf(model.id) === model.provider);
  }
  check("an unknown model falls back rather than throwing", Boolean(providerOf("no-such-model")));
}

console.log("\nPerplexity is a credential and not a provider");
{
  /*
   * The distinction that keeps a head from being pointed at something it cannot
   * use. Perplexity answers a search and has no tool calling, so a department
   * running on it could talk and never file anything.
   */
  check("it is not in the provider list", !PROVIDERS.some((p) => String(p.id) === "perplexity"));
  // String() rather than a cast: the type already makes this impossible, which
  // is the guarantee, and the check is here so that stays true if it changes.
  check("it offers no models", !MODELS.some((m) => String(m.provider) === "perplexity"));
  check("but the keys route still accepts it",
    keysBody.safeParse({ provider: "perplexity", key: "" }).success);
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
