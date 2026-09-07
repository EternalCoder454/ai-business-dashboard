import { eq } from "drizzle-orm";
import { requireDb } from "./client";
import * as t from "./schema";
import { spendSince } from "./spend";

/**
 * Whether a business has spent what it said it was willing to spend.
 *
 * The budget used to be a number that warned and did nothing, on the reasoning
 * that the spending happens on the customer's own key and stopping their heads
 * mid month would be the panel deciding something about somebody else's money.
 * That reasoning had the customer the wrong way round. Setting a ceiling is the
 * business deciding about its own money, and a ceiling that is only ever
 * observed is a number, not a ceiling.
 *
 * Zero means no limit, which is what every workspace has until an administrator
 * types one.
 *
 * Checked on the server, because this is the only place it can be. The card
 * that draws the figure is in a browser, and a browser is not what decides
 * whether a request is sent.
 */

/**
 * How long a total is reused before it is counted again.
 *
 * The count is three aggregates over a month of rows and this runs before every
 * reply, so it is not free. A minute of staleness can let a workspace past its
 * own ceiling by roughly a minute of replies, which is the right trade against
 * putting three grouped scans in front of every message anybody types.
 */
const FRESH_FOR_MS = 60_000;

const recent = new Map<string, { at: number; total: number }>();

export interface BudgetState {
  /** What the business set. Zero is no limit. */
  limit: number;
  spent: number;
  /** Only ever true when a limit was actually set. */
  exceeded: boolean;
}

/** The first moment of this month, in UTC. */
function monthStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

export async function budgetState(workspaceId: string): Promise<BudgetState> {
  const [row] = await requireDb()
    .select({ limit: t.settings.monthlyBudget })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId))
    .limit(1);

  const limit = row?.limit ?? 0;
  // Nothing to count against, so nothing is counted. A workspace with no
  // ceiling never pays for this check.
  if (limit <= 0) return { limit: 0, spent: 0, exceeded: false };

  const cached = recent.get(workspaceId);
  if (cached && Date.now() - cached.at < FRESH_FOR_MS) {
    return { limit, spent: cached.total, exceeded: cached.total >= limit };
  }

  const { total } = await spendSince(workspaceId, monthStart());
  recent.set(workspaceId, { at: Date.now(), total });
  return { limit, spent: total, exceeded: total >= limit };
}

/**
 * Forget what was counted for one workspace.
 *
 * Called when the limit changes, so raising a budget that has just stopped
 * everything takes effect now rather than within the minute. Lowering one is
 * the same question in reverse.
 */
export function forgetBudget(workspaceId: string): void {
  recent.delete(workspaceId);
}
