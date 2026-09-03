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

/**
 * Makes every query Drizzle sends a prepared one.
 *
 * postgres.js will not put a second query on the wire while an earlier one is
 * still being described, and it describes any parameterised statement it has
 * not prepared before (connection.js: `describeFirst = parameters.length &&
 * !prepared`). Drizzle reaches the driver through `client.unsafe(sql, params)`,
 * and `unsafe` hardcodes `prepare: false`, so nothing it sends is ever
 * cacheable and every query pays a describe and blocks the one behind it.
 *
 * The effect is that `Promise.all` over Drizzle queries has never been
 * parallel anywhere in this codebase. It has been fifteen round trips wearing
 * the shape of one. Measured against the real database, the fifteen queries
 * loadWorkspace runs took 2,106 ms cold and 2,102 ms warm, every time, because
 * a cache that is never written never helps. Forcing the flag: 2,114 ms on the
 * first request over a new socket, then 84 ms. Same rows, checked.
 *
 * Passing the option per call rather than setting `prepare: true` on the
 * connection, because `unsafe` spreads its own options last and would override
 * the connection's.
 *
 * The old comment here said transaction poolers reject prepared statements.
 * That was true of PgBouncer once and is not true of the pooler this connects
 * to: the numbers above, the transactions, and the error recovery were all
 * measured through it.
 */
function pipelined(client: ReturnType<typeof postgres>) {
  const unsafe = client.unsafe.bind(client);
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== "unsafe") return Reflect.get(target, property, receiver);
      return (query: string, params?: unknown[], options?: object) =>
        unsafe(query, params as never, { prepare: true, ...options });
    },
  });
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  return pipelined(
    postgres(url, {
      // Serverless invocations are short lived and numerous, so hold one socket
      // and let the platform's pooler do the pooling. One socket is not the
      // constraint it looks like: postgres.js pipelines, so queries issued
      // together travel together.
      max: 1,
      idle_timeout: 20,
    }),
  );
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
