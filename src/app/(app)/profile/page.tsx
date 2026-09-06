"use client";

import { PageHeader } from "@/components/PageHeader";
import { useEffect, useRef, useState } from "react";
import {
  Card,
  CheckIcon,
  ChevronIcon,
  Field,
  cx,
} from "@/components/ui";
import { buildCompanyContext, hasProfileContent } from "@/lib/prompts";
import { useStore } from "@/lib/store";
import type { CompanyProfile } from "@/lib/types";

const FIELDS: {
  key: keyof CompanyProfile;
  label: string;
  placeholder: string;
  rows: number;
}[] = [
  {
    key: "mission",
    label: "Mission",
    placeholder: "What the business does, for whom, and why it exists.",
    rows: 3,
  },
  {
    key: "products",
    label: "What you make",
    placeholder:
      "The actual things you sell. Name them, say what each one is, and roughly what it costs.",
    rows: 3,
  },
  {
    key: "audience",
    label: "Audience",
    placeholder:
      "Who buys, who uses, what they are doing today instead, and what they care about.",
    rows: 3,
  },
  {
    key: "brandVoice",
    label: "Brand voice",
    placeholder:
      "How the company sounds, and what it never sounds like.",
    rows: 3,
  },
  {
    key: "stage",
    label: "Where the business is",
    placeholder:
      "Age, headcount, rough turnover, and whether it is your main income.",
    rows: 3,
  },
  {
    key: "goals",
    label: "What you are aiming at",
    placeholder: "What has to be true in six months.",
    rows: 3,
  },
  {
    key: "competitors",
    label: "Competition",
    placeholder:
      "Who else does this, and the honest reason someone picks you instead. Include who you lose to.",
    rows: 3,
  },
  {
    key: "constraints",
    label: "Constraints",
    placeholder:
      "Budget, hours, skills, anything off the table.",
    rows: 3,
  },
  {
    key: "keyFacts",
    label: "Key facts",
    placeholder:
      "Pricing, headcount, launch dates, current numbers, tools you run on, constraints, anything you are tired of repeating.",
    rows: 6,
  },
];

/**
 * A field that is the size of what is in it.
 *
 * Every field was a fixed three rows, so anything longer scrolled inside a box
 * about an inch tall. The products field on a real profile was four lines of
 * pricing behind a scrollbar: you could not read your own answer without
 * dragging inside it, on the one screen in the panel that every head reads
 * before it says anything.
 *
 * `rows` stays as the minimum rather than the size, so an empty field still has
 * a shape to aim at and a full one is simply all there.
 */
function GrowingArea({
  value,
  minRows,
  ...rest
}: {
  value: string;
  minRows: number;
  placeholder: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /*
   * Measured after the value lands rather than from its length: wrapping
   * depends on the column width, so counting characters guesses and reading
   * scrollHeight knows. Height is cleared first because scrollHeight never
   * reports smaller than the box already is, so without it a field that lost a
   * paragraph would keep the taller size.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  /*
   * Borderless, because the card around it is already the box.
   *
   * Every field was a bordered, filled textarea inside a filled card: nine
   * fields drawn as eighteen nested rectangles, each with its own padding, its
   * own edge and a resize handle in the corner. The page read as a form dumped
   * into cards rather than as a profile. The card is the field now, the text
   * sits directly on it, and the card takes the focus ring so it is still
   * obvious what is editable and which one you are in.
   */
  /*
   * A bare textarea rather than the shared TextArea.
   *
   * That component carries a border, a fill and its own padding, and
   * overriding all three from the call site is the collision its own comment
   * warns about: p-0 against the size-s py-2.5 was decided by the order
   * Tailwind emitted them and lost, leaving a 10px inset nothing asked for.
   * A size never fights itself, so this does not pick the fight.
   */
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className="md-body w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-on-surface placeholder:text-on-variant/70 focus:outline-none"
      {...rest}
    />
  );
}

export default function CompanyProfilePage() {
  const { profile, settings, updateProfile } = useStore();
  const [local, setLocal] = useState<CompanyProfile>(profile);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const dirty = useRef(false);

  // Adopt store values until the user starts typing, so the first load fills in.
  useEffect(() => {
    if (!dirty.current) setLocal(profile);
  }, [profile]);

  // Debounced autosave.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(async () => {
      await updateProfile(local);
      setSavedAt(Date.now());
    }, 600);
    return () => window.clearTimeout(timer);
  }, [local, updateProfile]);

  const preview = buildCompanyContext(local, settings.companyName);

  /*
   * Shown because this page pays for itself more than any other and looks
   * finished long before it is. Every head reads these fields on every message,
   * so a half filled profile is the difference between advice and advice about
   * this business, and nothing on the screen said which half was missing.
   */
  const filled = FIELDS.filter((field) => local[field.key].trim()).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Shared context"
        title="Company Profile"
        actions={
          <div className="flex items-center gap-4">
            <span
              className={cx(
                "md-label",
                filled === FIELDS.length ? "text-success" : "text-on-variant",
              )}
            >
              {filled} of {FIELDS.length} filled
            </span>
            {savedAt ? (
              <span className="md-label flex items-center gap-1.5 text-success">
                <CheckIcon className="h-4 w-4" />
                Saved
              </span>
            ) : null}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 medium:px-6 expanded:px-8 py-6">
        {/*
         * Three columns once there is room for them.
         *
         * Two columns left seven ordinary fields to fill six slots, so
         * Constraints sat alone beside an empty half while Key facts waited
         * below the fold. At three, Mission spans the top, the seven fill two
         * full rows and one slot, and Key facts takes the two beside it. No
         * gaps, and the whole profile is on one screen on a desktop instead of
         * a scroll through mostly empty boxes.
         */}
        {/* items-start so a short answer keeps a short card. Without it every
            card in a row grew to match the tallest, which left Constraints as a
            mostly empty box the height of Key facts. */}
        <div className="measure-wide grid grid-cols-1 items-start gap-5 medium:grid-cols-2 expanded:grid-cols-3">
          {FIELDS.map((field) => (
            <Card
              key={field.key}
              elevated={false}
              className={cx(
                // focus-within rather than focus: the ring belongs to the card,
                // and the thing being focused is the textarea inside it.
                "transition-colors focus-within:border-primary",
                !local[field.key].trim() && "border-dashed",
                field.key === "mission" && "medium:col-span-2 expanded:col-span-3",
                field.key === "keyFacts" && "medium:col-span-2",
              )}
            >
              <Field label={field.label}>
                <GrowingArea
                  /*
                   * One row, not three. rows is the floor, and a three row
                   * floor meant "Honest, not hype-driven" reserved two empty
                   * lines under itself in every short field on the page.
                   */
                  minRows={1}
                  value={local[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) => {
                    dirty.current = true;
                    setLocal((current) => ({ ...current, [field.key]: event.target.value }));
                  }}
                />
              </Field>
            </Card>
          ))}

          <div className="medium:col-span-2 expanded:col-span-3">
            <button
              onClick={() => setShowPreview((value) => !value)}
              className="md-state md-label flex items-center gap-2 rounded-xl px-3 py-2 text-on-variant"
            >
              <ChevronIcon
                className={cx("h-4 w-4 transition-transform", showPreview && "rotate-90")}
              />
              {showPreview ? "Hide" : "Show"} system prompt
            </button>

            {showPreview ? (
              <Card className="mt-3" elevated={false}>
                {hasProfileContent(local) ? (
                  <pre className="md-body whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed text-on-variant">
                    {preview}
                  </pre>
                ) : (
                  <p className="md-body text-on-variant">
                    Nothing is injected yet. Fill in at least one field above and every
                    department will start from the same page.
                  </p>
                )}
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
