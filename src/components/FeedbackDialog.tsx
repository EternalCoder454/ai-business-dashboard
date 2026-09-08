"use client";

import { useRef, useState } from "react";
import { Button, CloseIcon, Dialog, Field, TextArea } from "./ui";
import {
  checkAttachments,
  FEEDBACK_ACCEPT,
  isVideo,
  MAX_FEEDBACK_FILES,
  readableSize,
  type FeedbackAttachment,
} from "@/lib/feedbackFiles";

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
  const [files, setFiles] = useState<FeedbackAttachment[]>([]);
  const picker = useRef<HTMLInputElement | null>(null);

  /**
   * Reads what was chosen into memory, refusing anything that will not send.
   *
   * Checked here as well as on the server, and the server is the one that
   * decides. This only saves somebody uploading eleven megabytes to be told it
   * was too much.
   */
  const take = async (chosen: FileList | null) => {
    if (!chosen?.length) return;
    setError(null);

    const read = await Promise.all(
      Array.from(chosen).map(
        async (file): Promise<FeedbackAttachment> => ({
          name: file.name,
          mediaType: file.type,
          size: file.size,
          data: Buffer.from(await file.arrayBuffer()).toString("base64"),
        }),
      ),
    );

    const next = [...files, ...read];
    const refused = checkAttachments(next);
    if (refused) {
      setError(refused);
    } else {
      setFiles(next);
    }
    // Cleared either way, so choosing the same file again still fires a change.
    if (picker.current) picker.current.value = "";
  };

  const close = () => {
    onClose();
    // Cleared after closing, so the dialog does not visibly empty itself on
    // the way out.
    setTimeout(() => {
      setBody("");
      setFiles([]);
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
        body: JSON.stringify({ body, files }),
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
          It went through. Your name, email, and business came with it, so there
          is no need to follow up with who you are.
        </p>
      ) : (
        <>
          <Field
            label="What would you change?"
            hint="Sent with your name, email and business."
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

          {/*
            * Pictures and clips, because "here is what I saw" is most of what a
            * bug report is and a screenshot says it better than a paragraph.
            * Nothing else: a document attached to a support note is either the
            * wrong channel or a file that belongs in the Library, and every
            * format accepted is one more thing the operator screen has to know
            * how to open.
            */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outlined"
                disabled={files.length >= MAX_FEEDBACK_FILES}
                onClick={() => picker.current?.click()}
              >
                Add a picture or clip
              </Button>
              <span className="md-label-sm text-on-variant/70">
                {files.length} of {MAX_FEEDBACK_FILES}
              </span>
            </div>

            <input
              ref={picker}
              type="file"
              accept={FEEDBACK_ACCEPT}
              multiple
              hidden
              onChange={(event) => void take(event.target.files)}
            />

            {files.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}:${index}`}
                    className="flex items-center gap-3 rounded-xl bg-high px-3 py-2"
                  >
                    {isVideo(file.mediaType) ? (
                      <span className="md-label-sm flex-none text-on-variant">Clip</span>
                    ) : (
                      // The picture itself, from the bytes already read, so
                      // there is no doubt which screenshot is attached.
                      <img
                        src={`data:${file.mediaType};base64,${file.data}`}
                        alt=""
                        className="h-10 w-10 flex-none rounded-lg object-cover"
                      />
                    )}
                    <span className="md-body-sm min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="md-label-sm flex-none text-on-variant/70">
                      {readableSize(file.size)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setFiles(files.filter((_, at) => at !== index))}
                      className="md-state md-target grid h-7 w-7 flex-none place-items-center rounded-lg text-on-variant"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      )}
      {error ? <p className="md-label-sm mt-2 text-error">{error}</p> : null}
    </Dialog>
  );
}
