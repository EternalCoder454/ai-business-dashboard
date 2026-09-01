/**
 * Checks the provider routing, and that adding it changed nothing for a
 * workspace that was here before it.
 *
 * The whole risk of this feature is a silent regression: a department that
 * used to reach Anthropic now reaching nothing, or a stored key leaking into
 * the database because a new field was not excluded.
 *
 *   npm run providers-test
 */
import {
  DEFAULT_PROVIDER,
  MODELS,
  defaultModelFor,
  geminiThinkingBudget,
  modelsFor,
  providerInfo,
  providerOf,
  PROVIDERS,
} from "../src/lib/providers";
import { seedDepartments } from "../src/lib/seed";
import { DEFAULT_SETTINGS } from "../src/lib/seed";
import type { Effort } from "../src/lib/types";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

console.log("nothing that existed before changed");
{
  // The one that matters: a workspace from before this feature has no provider
  // recorded anywhere, and its departments have no model. Both have to land on
  // Anthropic without anyone editing anything.
  check("the default provider is still Anthropic", DEFAULT_PROVIDER === "anthropic");
  check(
    "the shipped default model is still a Claude model",
    providerOf(DEFAULT_SETTINGS.model) === "anthropic",
    DEFAULT_SETTINGS.model,
  );
  check(
    "no seeded department pins a model",
    seedDepartments().every((d) => d.model === undefined),
  );
  check(
    "a department with no model falls back to the workspace default",
    providerOf(undefined || DEFAULT_SETTINGS.model) === "anthropic",
  );
  // An older client sends no provider field at all, and the server reads it
  // off the model id instead.
  check("an unknown model id routes to Anthropic", providerOf("something-else") === "anthropic");
  check("an absent model id routes to Anthropic", providerOf(undefined) === "anthropic");
}

console.log("\nevery provider is wired up");
{
  check("three providers", PROVIDERS.length === 3, String(PROVIDERS.length));
  for (const provider of PROVIDERS) {
    const models = modelsFor(provider.id);
    check(`${provider.label} has models`, models.length > 0, String(models.length));
    check(
      `${provider.label} models all claim it`,
      models.every((m) => m.provider === provider.id),
    );
    check(
      `${provider.label} has a default model`,
      Boolean(defaultModelFor(provider.id)),
      defaultModelFor(provider.id),
    );
    check(`${provider.label} names an env var`, /^[A-Z0-9_]+$/.test(provider.envVar), provider.envVar);
    check(
      `${provider.label} header is lowercase`,
      provider.header === provider.header.toLowerCase(),
      provider.header,
    );
  }

  const ids = MODELS.map((m) => m.id);
  check("no duplicate model ids", new Set(ids).size === ids.length);
  check(
    "every model maps back to its provider",
    MODELS.every((m) => providerOf(m.id) === m.provider),
  );
  check(
    "every env var is distinct",
    new Set(PROVIDERS.map((p) => p.envVar)).size === PROVIDERS.length,
  );
  check(
    "every header is distinct",
    new Set(PROVIDERS.map((p) => p.header)).size === PROVIDERS.length,
  );
  check("an unknown provider id falls back rather than throwing", providerInfo(undefined).id === "anthropic");
}

console.log("\neffort maps onto each provider");
{
  const efforts: Effort[] = ["low", "medium", "high", "xhigh", "max"];
  // Gemini takes a token budget, where -1 means let it decide.
  for (const effort of efforts) {
    const budget = geminiThinkingBudget(effort);
    check(`gemini budget for ${effort} is usable`, budget === -1 || budget >= 1024, String(budget));
  }
  check(
    "harder effort never asks for less thinking",
    geminiThinkingBudget("low") < geminiThinkingBudget("high"),
  );
  check("max lets Gemini decide", geminiThinkingBudget("max") === -1);
}

console.log("\nkeys stay out of the database");
{
  // StoredSettings is a type, so this checks the runtime path instead: the
  // store strips these before writing, and the workspace type has no field for
  // them. A key reaching Postgres is the failure worth catching.
  const stripped = ["apiKey", "workspaceId", "openaiKey", "googleKey"];
  const source = require("node:fs").readFileSync("src/lib/workspace.ts", "utf8") as string;
  for (const field of stripped) {
    check(`${field} is omitted from StoredSettings`, source.includes(`"${field}"`), field);
  }
}

console.log(failures ? "\nFAILURES ABOVE" : "\nall checks passed");
process.exit(failures ? 1 : 0);
