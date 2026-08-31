import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // Every table is scoped by user_email rather than isolated per schema.
  verbose: true,
  strict: true,
} satisfies Config;
