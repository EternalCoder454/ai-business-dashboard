import type { Config } from "drizzle-kit";

// drizzle-kit runs outside Next, so it does not pick up .env.local the way the
// app does. Node loads it here instead of pulling in dotenv for one line.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent in CI and in any environment that injects variables directly.
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // The pooler rejects some DDL, so migrations go direct where a direct URL
    // is available and fall back to the pooled one otherwise.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
} satisfies Config;
