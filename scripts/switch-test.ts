/**
 * One person, two businesses, and nothing crossing between them.
 *
 * The panel has a workspace switcher, the access table is keyed on address and
 * workspace together, and `membershipFor` picks whichever one somebody is
 * currently in. All three have to agree, and the failure this file exists for
 * is quiet: everything works for as long as every person belongs to exactly
 * one business, and the first accountant with two clients finds all of it at
 * once.
 *
 * Runs against the real database, in two workspaces it creates and deletes.
 *
 * Run with: npm run switch-test
 */
import { and, eq } from "drizzle-orm";
import { db, requireDb } from "../src/db/client";
import * as t from "../src/db/schema";
import {
  chooseWorkspace,
  createWorkspace,
  deleteWorkspace,
  listMembers,
  membershipFor,
  membershipIn,
  membershipsFor,
} from "../src/db/tenancy";
import { grantAccess } from "../src/db/access";
import { loadWorkspace } from "../src/db/repo";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

const PERSON = "switch-test-person@example.invalid";
const OUTSIDER = "switch-test-outsider@example.invalid";

async function main() {
  const database = requireDb();
  let alpha = "";
  let beta = "";

  try {
    alpha = await createWorkspace({ name: "Switch Test Alpha", createdBy: "test", firstMember: PERSON });
    console.log("one person in a second business");
    // The thing that used to be refused outright.
    beta = await createWorkspace({ name: "Switch Test Beta", createdBy: "test", firstMember: PERSON });
    check("the same address can be given a second business", Boolean(alpha && beta));

    const memberships = await membershipsFor(PERSON);
    check("both memberships exist", memberships.length === 2, `${memberships.length}`);
    check(
      "and they are the two we made",
      memberships.every((m) => m.workspaceId === alpha || m.workspaceId === beta),
    );

    console.log("\nadministering one does not depend on the other");
    // The second bug: these used to read whichever business the person was
    // currently in, so managing them from the other one said "nobody here".
    await chooseWorkspace(PERSON, beta);
    const inAlpha = await membershipIn(PERSON, alpha);
    check("their row in Alpha is found while they are sitting in Beta", inAlpha !== null);
    check("and it is Alpha's row", inAlpha?.workspaceId === alpha, inAlpha?.workspaceId);

    const active = await membershipFor(PERSON);
    check("the active one is the one they chose", active?.workspaceId === beta, active?.workspaceId);

    console.log("\nswitching moves them, and only them");
    await chooseWorkspace(PERSON, alpha);
    check("choosing Alpha makes Alpha active", (await membershipFor(PERSON))?.workspaceId === alpha);
    check("both memberships survive the switch", (await membershipsFor(PERSON)).length === 2);

    console.log("\nnaming a business is not a way of reaching it");
    await grantAccess({ email: OUTSIDER, workspaceId: alpha, role: "member", invitedBy: "test" });
    const stolen = await chooseWorkspace(OUTSIDER, beta);
    check("somebody outside Beta cannot choose it", stolen === false);
    check("and they stay where they belong", (await membershipFor(OUTSIDER))?.workspaceId === alpha);
    check("Beta's member list does not contain them",
      !(await listMembers(beta)).some((m) => m.email === OUTSIDER));

    console.log("\nnothing bleeds between the two");
    // Something distinctive in each, then read each back whole.
    await database.insert(t.tasks).values([
      { id: "alpha-task", workspaceId: alpha, title: "ALPHA ONLY", notes: "", status: "todo", departmentId: "company" },
      { id: "beta-task", workspaceId: beta, title: "BETA ONLY", notes: "", status: "todo", departmentId: "company" },
    ]);
    await database.insert(t.memory).values([
      { id: "alpha-note", workspaceId: alpha, kind: "decision", label: "ALPHA SECRET", detail: "x", departmentId: "company", occurredAt: Date.now() },
      { id: "beta-note", workspaceId: beta, kind: "decision", label: "BETA SECRET", detail: "x", departmentId: "company", occurredAt: Date.now() },
    ]);

    const loadedAlpha = JSON.stringify(await loadWorkspace(alpha, PERSON));
    const loadedBeta = JSON.stringify(await loadWorkspace(beta, PERSON));

    check("Alpha carries its own task", loadedAlpha.includes("ALPHA ONLY"));
    check("Alpha carries none of Beta's", !loadedAlpha.includes("BETA ONLY") && !loadedAlpha.includes("BETA SECRET"));
    check("Beta carries its own task", loadedBeta.includes("BETA ONLY"));
    check("Beta carries none of Alpha's", !loadedBeta.includes("ALPHA ONLY") && !loadedBeta.includes("ALPHA SECRET"));
    check("neither carries the other's workspace id", !loadedAlpha.includes(beta) && !loadedBeta.includes(alpha));

    console.log("\nleaving one leaves the other alone");
    await database
      .delete(t.access)
      .where(and(eq(t.access.email, PERSON), eq(t.access.workspaceId, beta)));
    const left = await membershipsFor(PERSON);
    check("one membership remains", left.length === 1, `${left.length}`);
    check("and it is Alpha", left[0]?.workspaceId === alpha);
    check(
      "the active business follows them somewhere they still belong",
      (await membershipFor(PERSON))?.workspaceId === alpha,
    );
  } finally {
    // Before and after, so a crashed run does not leave a business behind.
    for (const id of [alpha, beta]) if (id) await deleteWorkspace(id).catch(() => {});
    await db!
      .delete(t.access)
      .where(eq(t.access.email, PERSON))
      .catch(() => {});
    await db!
      .delete(t.access)
      .where(eq(t.access.email, OUTSIDER))
      .catch(() => {});
    console.log("\ncleaned up");
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
