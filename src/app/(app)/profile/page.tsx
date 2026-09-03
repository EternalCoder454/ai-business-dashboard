"use client";

import { PageHeader } from "@/components/PageHeader";
import { useEffect, useRef, useState } from "react";
import {
  Card,
  CheckIcon,
  ChevronIcon,
  Field,
  TextArea,
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Shared context"
        title="Company Profile"
        actions={
          savedAt ? (
            <span className="md-label flex items-center gap-1.5 text-success">
              <CheckIcon className="h-4 w-4" />
              Saved
            </span>
          ) : null
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
        <div className="measure-wide grid grid-cols-1 gap-5 medium:grid-cols-2 expanded:grid-cols-3">
          {FIELDS.map((field) => (
            <Card
              key={field.key}
              className={cx(
                field.key === "mission" && "medium:col-span-2 expanded:col-span-3",
                field.key === "keyFacts" && "medium:col-span-2",
              )}
            >
              <Field label={field.label}>
                <TextArea
                  rows={field.rows}
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
