"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
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
  const { storage, accountEmail, uploadLocalWorkspace } = useStore();
  const [state, setState] = useState<AccountState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

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
        Signed in as <strong>{accountEmail ?? state.email ?? "unknown"}</strong>. Only
        allowlisted Google accounts can reach this workspace.
      </p>

      <p className="md-body mb-4 text-on-variant">
        {storage === "hosted" ? (
          <>
            This workspace is stored on the server, so it follows you between devices.
          </>
        ) : (
          <>
            This workspace is stored in <strong>this browser only</strong>. Set DATABASE_URL
            to move it to your account.
          </>
        )}
      </p>

      {storage === "hosted" ? (
        <div className="mb-4">
          <Button
            variant="outlined"
            disabled={uploading}
            onClick={async () => {
              setUploading(true);
              setUploadNote(null);
              try {
                const { pushed } = await uploadLocalWorkspace();
                setUploadNote(
                  pushed === 0
                    ? "This browser had nothing left to upload."
                    : `Uploaded ${pushed} records into your account.`,
                );
              } catch {
                setUploadNote("The upload failed. Nothing was changed.");
              }
              setUploading(false);
            }}
          >
            {uploading ? "Uploading\u2026" : "Upload this browser's data"}
          </Button>
          <p className="md-label-sm mt-2 text-on-variant/75">
            Copies anything still held in this browser into the account. Rows with the same
            id are overwritten, so running it twice changes nothing the second time.
          </p>
          {uploadNote ? (
            <p className="md-label mt-2 text-on-variant">{uploadNote}</p>
          ) : null}
        </div>
      ) : null}

      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outlined">
          Sign out
        </Button>
      </form>
    </Card>
  );
}
