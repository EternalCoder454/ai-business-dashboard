"use client";

import { useState } from "react";
import { Button, Dialog, Field, TextArea } from "./ui";

/**
 * Somewhere to say what is wrong with the panel, or what it is missing.
 *
 * Asks for the message and nothing else. Who they are and which business they
 * are in is read from the session on the way in, so there is no name field to
 * fill in and no way to send it as somebody else.
 */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const close = () => {
    onClose();
    // Cleared after closing, so the dialog does not visibly empty itself on
    // the way out.
    setTimeout(() => {
      setBody("");
      setSent(false);
      setError(null);
    }, 200);
  };

  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? "That did not send.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={sent ? "Thank you" : "Send feedback"}
      onClose={close}
      width="max-w-lg"
      footer={
        sent ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <>
            <Button variant="text" onClick={close}>
              Cancel
            </Button>
            <Button disabled={busy || !body.trim()} onClick={() => void send()}>
              {busy ? "Sending…" : "Send"}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <p className="md-body text-on-variant">
          It went through. Your name, address, and business came with it, so
          there is no need to follow up with who you are.
        </p>
      ) : (
        <Field
          label="What would you change?"
          hint="An idea, or something that is broken. Sent with your name and business."
        >
          <TextArea
            autoFocus
            rows={6}
            value={body}
            maxLength={4000}
            placeholder="What happened, or what you wish it did instead."
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
      )}
      {error ? <p className="md-label-sm mt-2 text-error">{error}</p> : null}
    </Dialog>
  );
}
