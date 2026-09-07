"use client";

import { useEffect, useState } from "react";
import { Card, Chip, cx } from "./ui";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { PRICED_ON, money } from "@/lib/pricing";
import { useStore } from "@/lib/store";

interface Spend {
  since: number;
  total: number;
  unpriced: number;
  departments: { departmentId: string; cost: number; replies: number; unpriced: number }[];
}

/**
 * What the heads have cost this month, and which of them cost it.
 *
 * The panel is bring-your-own-key, so the bill arrives from Anthropic or OpenAI
 * and says one number for the whole account. It cannot say that Legal cost four
 * times what Design did, because it does not know what Legal is. The panel is
 * the only thing that does: it has recorded the tokens and the model on every
 * reply since the beginning and had never once added them up.
 *
 * An estimate, and it says so. Published list prices read on a date, against a
 * workspace that may have negotiated rates or be paying a cloud reseller
 * instead. Close enough to answer whether this costs pounds or pence, which is
 * the question; not close enough to reconcile an invoice with, which it does
 * not claim to be.
 */
export function SpendCard() {
  const { allDepartments, settings, updateSettings, workspaceRole } = useStore();
  const [spend, setSpend] = useState<Spend | null>(null);
  const [failed, setFailed] = useState(false);
  const [budget, setBudget] = useState("");

  const admin = workspaceRole === "admin";
  const limit = settings.monthlyBudget ?? 0;

  useEffect(() => {
    // The month as this browser reckons it, since a server in another timezone
    // disagrees about when it turned and the figure has to match the month the
    // person thinks they are looking at.
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let cancelled = false;
    fetch(`/api/spend?since=${since}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((body: Spend) => {
        if (!cancelled) setSpend(body);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setBudget(limit > 0 ? String(limit) : "");
  }, [limit]);

  if (failed) return null;

  const nameOf = (id: string) =>
    allDepartments.find((department) => department.id === id)?.personaName ||
    allDepartments.find((department) => department.id === id)?.name ||
    id;

  const over = limit > 0 && spend !== null && spend.total > limit;
  const near = limit > 0 && spend !== null && !over && spend.total > limit * 0.8;
  const biggest = spend?.departments[0];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="md-title-lg">Spent this month</h2>
        {over ? <Chip tone="error">Over budget</Chip> : null}
        {near ? <Chip tone="warning">Near budget</Chip> : null}
      </div>

      {spend === null ? (
        <p className="md-body mt-1 text-on-variant">Adding it up…</p>
      ) : (
        <>
          <p className="md-headline mt-2 tabular-nums">{money(spend.total)}</p>
          <p className="md-body-sm mt-0.5 text-on-variant/75">
            Estimated, list prices on {PRICED_ON}
          </p>

          {spend.unpriced > 0 ? (
            <p className="md-body-sm mt-1 text-warning">
              {spend.unpriced} {spend.unpriced === 1 ? "reply is" : "replies are"} not
              counted above, on a model with no published price the panel could read.
            </p>
          ) : null}

          {spend.departments.length === 0 ? (
            <p className="md-body mt-3 text-on-variant">Nothing yet this month.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {spend.departments.map((row) => {
                const department = allDepartments.find((d) => d.id === row.departmentId);
                // A bar against the biggest, not against the budget: what this
                // answers is which head is expensive, and against a budget of
                // ten dollars every bar would be a sliver saying nothing.
                const share = biggest?.cost ? (row.cost / biggest.cost) * 100 : 0;
                return (
                  <li key={row.departmentId}>
                    <div className="flex items-center gap-2">
                      {department ? (
                        <DepartmentAvatar department={department} size={20} />
                      ) : null}
                      <span className="md-body min-w-0 flex-1 truncate">
                        {nameOf(row.departmentId)}
                      </span>
                      <span className="md-label-sm text-on-variant/75">
                        {row.replies} {row.replies === 1 ? "reply" : "replies"}
                      </span>
                      <span className="md-label ml-2 tabular-nums">{money(row.cost)}</span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-highest">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(share, 1)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/*
        * Shown to everybody who can see the spend, changed only by an
        * administrator.
        *
        * It used to be hidden outright from anybody else, which meant a member
        * watching the figure climb had no way of knowing what it was climbing
        * towards, and no way of knowing why their heads would stop when it got
        * there. Reading a ceiling and setting one are different permissions.
        */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
        <label className="md-label text-on-variant" htmlFor="monthly-budget">
          Monthly budget
        </label>
        <span className="md-body text-on-variant">$</span>
        {admin ? (
          <input
            id="monthly-budget"
            inputMode="numeric"
            size={1}
            value={budget}
            // Zero rather than "none", because zero is what it is: the number
            // the column holds, and the number that means no limit.
            placeholder="0"
            onChange={(event) => setBudget(event.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => {
              const next = Number(budget) || 0;
              if (next !== limit) void updateSettings({ monthlyBudget: next });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={cx(
              "md-body w-20 rounded-lg border border-outline-variant bg-transparent px-2 py-1 tabular-nums",
              "text-on-surface transition-colors focus:border-primary focus:outline-none",
            )}
          />
        ) : (
          <span className="md-body tabular-nums text-on-surface">{limit || 0}</span>
        )}
        {/*
          * What it does, which changed. It stops replies now rather than
          * watching them, and a spending control that has started refusing work
          * has to say so where it is set.
          */}
        <span className="md-body-sm text-on-variant/75">
          {limit > 0 ? "Replies stop when this is reached." : "No limit while this is 0."}
        </span>
      </div>
    </Card>
  );
}
