"use client";

import { PageHeader } from "@/components/PageHeader";
import { useEffect, useRef, useState } from "react";
import { Card, CheckIcon, ChevronIcon, cx } from "@/components/ui";
import { buildCompanyContext, hasProfileContent } from "@/lib/prompts";
import { useStore } from "@/lib/store";
import type { CompanyProfile } from "@/lib/types";

interface ProfileField {
  key: keyof CompanyProfile;
  label: string;
  placeholder: string;
}

/**
 * Grouped, rather than nine cards in a ragged grid.
 *
 * Nine separate cards of different natural heights left every row with an
 * uneven bottom edge and a gap beside the shortest one, which reads as
 * unorganised however tidy each card is on its own. Four groups of related
 * questions give the page a shape somebody can take in, and the fields inside a
 * group are the ones you would answer in the same sitting.
 */
const GROUPS: { id: string; title: string; fields: ProfileField[] }[] = [
  {
    id: "business",
    title: "The business",
    fields: [
      {
        key: "mission",
        label: "Mission",
        placeholder: "What the business does, for whom, and why it exists.",
      },
      {
        key: "products",
        label: "What you make",
        placeholder:
          "The actual things you sell. Name them, say what each one is, and roughly what it costs.",
      },
      {
        key: "stage",
        label: "Where the business is",
        placeholder: "Age, headcount, rough turnover, and whether it is your main income.",
      },
    ],
  },
  {
    id: "market",
    title: "The market",
    fields: [
      {
        key: "audience",
        label: "Audience",
        placeholder:
          "Who buys, who uses, what they are doing today instead, and what they care about.",
      },
      {
        key: "competitors",
        label: "Competition",
        placeholder:
          "Who else does this, and the honest reason someone picks you instead. Include who you lose to.",
      },
      {
        key: "brandVoice",
        label: "Brand voice",
        placeholder: "How the company sounds, and what it never sounds like.",
      },
    ],
  },
  {
    id: "direction",
    title: "Direction",
    fields: [
      {
        key: "goals",
        label: "What you are aiming at",
        placeholder: "What has to be true in six months.",
      },
      {
        key: "constraints",
        label: "Constraints",
        placeholder: "Budget, hours, skills, anything off the table.",
      },
    ],
  },
  {
    id: "facts",
    title: "Key facts",
    fields: [
      {
        key: "keyFacts",
        label: "Anything you are tired of repeating",
        placeholder:
          "Pricing, headcount, launch dates, current numbers, tools you run on, constraints.",
      },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((group) => group.fields);

/**
 * One question and its answer.
 *
 * The answer sits on its own surface rather than directly on the card. Flat
 * text gave no sign it could be edited at all, and a full bordered input inside
 * a bordered card drew every field twice. A fill with no border is the middle:
 * it reads as somewhere to type, and it does not add a second edge to the card
 * it is already inside.
 */
function ProfileEntry({
  field,
  value,
  onChange,
}: {
  field: ProfileField;
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /*
   * Measured after the value lands rather than from its length: wrapping
   * depends on the column width, so counting characters guesses and reading
   * scrollHeight knows. Height is cleared first because scrollHeight never
   * reports smaller than the box already is, so a field that lost a paragraph
   * would otherwise keep the taller size.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();

    /*
     * Re-measured when the box changes width, not only when the text changes.
     * Wrapping depends on the column, so dragging a window narrower rewraps
     * every answer into more lines than the height set for the old width, and
     * the field silently goes back to scrolling. Caught by resizing from 1200
     * to 1920 and finding six of nine had started scrolling again.
     *
     * Width only, and that is the whole point rather than an optimisation.
     * Observing the element and then setting its height inside the callback
     * resizes the thing being observed, which fires the callback again: a
     * genuine ResizeObserver loop, and the browser reported it as one from
     * production within the hour. Height is what this changes and width is what
     * it needs to react to, so comparing width breaks the cycle at the point
     * where it would otherwise close.
     */
    let lastWidth = el.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      /*
       * Deferred to the next frame rather than written here.
       *
       * Comparing the width alone was not enough. Setting a height inside the
       * callback resizes the observed element during delivery, so the browser
       * has to run another pass and reports "ResizeObserver loop completed with
       * undelivered notifications" even when the second pass changes nothing.
       * It was two of those per resize in a real browser. Writing on the next
       * frame takes the mutation out of delivery entirely.
       */
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value]);

  return (
    <label className="block">
      <span className="md-label mb-1.5 block text-on-variant">{field.label}</span>
      {/*
       * A bare textarea rather than the shared TextArea. Overriding that
       * component's border, fill and padding from here is the collision its own
       * comment warns about: p-0 against the size's py-2.5 is decided by the
       * order Tailwind emits them, and it loses. A size never fights itself.
       */}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          "md-body w-full min-w-0 resize-none overflow-hidden rounded-lg border-0 px-3 py-2.5",
          "bg-lowest/60 text-on-surface placeholder:text-on-variant/60",
          "transition-colors hover:bg-lowest focus:bg-lowest focus:outline-none",
          "focus:ring-1 focus:ring-primary",
        )}
      />
    </label>
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
  const filled = ALL_FIELDS.filter((field) => local[field.key].trim()).length;

  const set = (key: keyof CompanyProfile) => (next: string) => {
    dirty.current = true;
    setLocal((current) => ({ ...current, [key]: next }));
  };

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
                filled === ALL_FIELDS.length ? "text-success" : "text-on-variant",
              )}
            >
              {filled} of {ALL_FIELDS.length} filled
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
         * Two columns of groups rather than three of fields. Groups are taller
         * and fewer, so two columns fill the width without leaving the ragged
         * bottom edge that nine independently sized cards produced.
         */}
        <div className="measure-wide grid grid-cols-1 items-start gap-5 large:grid-cols-2">
          {GROUPS.map((group) => (
            <Card key={group.id} elevated={false}>
              <h2 className="md-title-lg mb-4">{group.title}</h2>

              <div className="flex flex-col gap-4">
                {group.fields.map((field) => (
                  <ProfileEntry
                    key={field.key}
                    field={field}
                    value={local[field.key]}
                    onChange={set(field.key)}
                  />
                ))}
              </div>
            </Card>
          ))}

          <div className="large:col-span-2">
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
