"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "./ui";

interface Connection {
  available: boolean;
  connected: boolean;
  googleEmail: string;
  connectedAt: number | null;
}

/** What came back on the query string after the consent screen. */
const OUTCOME: Record<string, string> = {
  connected: "Connected. Your next few days show on the dashboard.",
  cancelled: "Not connected. Nothing changed.",
  expired: "That took too long. Start again.",
  "signed-out": "You were signed out part way through. Try again.",
  mismatch:
    "That consent was for a different account than the one signed in here. Nothing was connected.",
  "no-workspace": "You are not in a workspace yet.",
  failed: "Google did not grant calendar access.",
  unavailable: "Google is not configured on this deployment.",
};

/**
 * Connecting a calendar, from Settings.
 *
 * Separate from signing in on purpose. The sign-in consent asks for a name and
 * an address; this one asks to read a diary, and bundling them would put
 * calendar access in front of every new person before they had any reason to
 * want it.
 */
export function GoogleCalendarCard() {
  const [state, setState] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations/google");
      if (!response.ok) return;
      setState((await response.json()) as Connection);
    } catch {
      // Offline. The card simply does not appear.
    }
  }, []);

  useEffect(() => {
    void load();

    // The callback comes back to /settings with the outcome on the query
    // string, which is then cleared so a refresh does not repeat it.
    const params = new URLSearchParams(window.location.search);
    const said = params.get("google");
    if (said) {
      setNotice(OUTCOME[said] ?? null);
      params.delete("google");
      const rest = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
  }, [load]);

  if (!state?.available) return null;

  const act = async (action: "connect" | "disconnect") => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/integrations/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setNotice(body?.error ?? "That did not work.");
        return;
      }
      if (body?.url) {
        window.location.href = body.url;
        return;
      }
      await load();
      setNotice("Disconnected.");
    } catch {
      setNotice("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="md-title-lg mb-1">Google Calendar</h2>
      <p className="md-body mb-4 text-on-variant">
        {state.connected
          ? `Reading ${state.googleEmail || "your calendar"}. The next three days show on your dashboard.`
          : "Show your next few days on the dashboard. Read only, and only your own: nobody else in the business sees it."}
      </p>

      <Button
        variant="outlined"
        disabled={busy}
        onClick={() => void act(state.connected ? "disconnect" : "connect")}
      >
        {busy ? "…" : state.connected ? "Disconnect" : "Connect Google Calendar"}
      </Button>

      {notice ? <p className="md-label mt-3 text-on-variant">{notice}</p> : null}
    </Card>
  );
}
