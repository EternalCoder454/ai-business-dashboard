"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "./ui";

interface AccountState {
  enabled: boolean;
  email: string | null;
}

/**
 * Only rendered as anything once auth is configured. A local checkout with no
 * OAuth client has no account to show, and a sign out button there would be a
 * button that does nothing.
 */
export function AccountCard() {
  const [state, setState] = useState<AccountState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState({ enabled: false, email: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state?.enabled) return null;

  return (
    <Card>
      <h2 className="md-title-lg mb-1">Account</h2>
      <p className="md-body mb-4 text-on-variant">
        Signed in as <strong>{state.email ?? "unknown"}</strong>. Only allowlisted Google
        accounts can reach this workspace.
      </p>
      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outlined">
          Sign out
        </Button>
      </form>
    </Card>
  );
}
