"use client";

import { Button, cx } from "./ui";
import { signOutAction } from "@/app/auth-actions";
import { useStore } from "@/lib/store";

/**
 * Signed in, and in no business.
 *
 * Somebody signs in with an address nobody has added anywhere. Before this they
 * got the dashboard: a sidebar of departments that were not theirs to have, an
 * empty board, and no explanation. When the retry was added they got something
 * worse, "could not load your workspace, try again", which is a lie in a
 * helpful voice: trying again was never going to work and the one thing they
 * needed to know, that somebody has to invite them, was the one thing it did
 * not say.
 *
 * It shows which address they used. Almost every case of this is a person with
 * two Google accounts who signed in with the wrong one, and seeing it written
 * down is usually the whole fix.
 *
 * Covers the screen. There is nothing behind it that belongs to them.
 */
export function NoWorkspace() {
  const { noWorkspace, accountEmail } = useStore();
  if (!noWorkspace) return null;

  return (
    <div
      role="alert"
      className={cx(
        "fixed inset-0 z-[60] grid place-items-center bg-surface/95 px-6",
        "backdrop-blur-sm",
      )}
    >
      <div className="measure-read text-center">
        <h1 className="md-title-lg mb-2">You have not been added to a business yet</h1>

        <p className="md-body mb-2 text-on-variant">
          Whoever set up your company&apos;s panel needs to add you. Ask them to
          invite this address:
        </p>

        {accountEmail ? (
          <p className="md-title mb-5 break-all">{accountEmail}</p>
        ) : null}

        <p className="md-label-sm mb-6 text-on-variant/75">
          If you have more than one Google account, check you signed in with the
          one your work uses.
        </p>

        <form action={signOutAction}>
          <Button type="submit" variant="outlined">
            Sign in as somebody else
          </Button>
        </form>
      </div>
    </div>
  );
}
