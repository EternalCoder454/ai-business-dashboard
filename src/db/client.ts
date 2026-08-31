import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The database is optional. Without DATABASE_URL the app keeps running entirely
 * on IndexedDB, which is what a local checkout should do, and the workspace
 * routes report that they are not configured rather than throwing.
 */
export const databaseEnabled = Boolean(process.env.DATABASE_URL);

declare global {
  // eslint-disable-next-line no-var
  var __eterneonSql: ReturnType<typeof postgres> | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  return postgres(url, {
    // Serverless invocations are short lived and numerous, so hold one socket
    // and let the platform's pooler do the pooling.
    max: 1,
    idle_timeout: 20,
    // Transaction poolers such as PgBouncer reject prepared statements.
    prepare: false,
  });
}

/**
 * Reused across hot reloads in development, or every edit opens another
 * connection and the pool is exhausted within a few minutes.
 */
const sql = globalThis.__eterneonSql ?? (databaseEnabled ? connect() : undefined);
if (process.env.NODE_ENV !== "production" && sql) globalThis.__eterneonSql = sql;

export const db = sql ? drizzle(sql, { schema }) : undefined;

/** Narrows the optional handle for routes that have already checked. */
export function requireDb() {
  if (!db) throw new Error("DATABASE_URL is not set, so there is nothing to query.");
  return db;
}
