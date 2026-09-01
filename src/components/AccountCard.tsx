"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Card } from "./ui";

/**
 * Moving a workspace that started in one browser into the signed-in account.
 *
 * This card used to also print the signed-in address, explain the allowlist,
 * describe where the workspace is stored, and offer a sign out button. The
 * Account page above it shows the address and the storage mode, and sign out
 * is in the account menu, so all that was left is the one thing that actually
 * does something.
 */
export function AccountCard() {
  const { storage, uploadLocalWorkspace } = useStore();
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (storage !== "hosted") return null;

  return (
    <Card>
      <h2 className="md-title-lg mb-1">Local data</h2>
      <p className="md-body mb-4 text-on-variant">
        Copies anything still held in this browser into your account. Running it twice
        changes nothing the second time.
      </p>

      <Button
        variant="outlined"
        disabled={uploading}
        onClick={async () => {
          setUploading(true);
          setNote(null);
          try {
            const { pushed } = await uploadLocalWorkspace();
            setNote(
              pushed === 0
                ? "Nothing left to upload."
                : `Uploaded ${pushed} records.`,
            );
          } catch {
            setNote("Upload failed. Nothing was changed.");
          }
          setUploading(false);
        }}
      >
        {uploading ? "Uploading…" : "Upload this browser's data"}
      </Button>

      {note ? <p className="md-label mt-2 text-on-variant">{note}</p> : null}
    </Card>
  );
}
