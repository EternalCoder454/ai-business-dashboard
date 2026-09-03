"use client";

import { useMemo, useState } from "react";
import { Button, Card, TextArea, TextInput, cx } from "./ui";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { ProviderKey } from "./ProviderKey";
import { createRipple } from "./ui/ripple";
import { hasKeyFor } from "@/lib/hasKey";
import { providerInfo, providerOf } from "@/lib/providers";
import { useStore } from "@/lib/store";

/**
 * The first ten minutes of a new business.
 *
 * Written after looking at what the deployment actually holds. Of three
 * businesses, the one with a filled company profile had sent every message in
 * the database; the two with an empty profile had sent none between them. Three
 * is not a study, and one of the three is ours, so treat that as a strong hint
 * rather than a finding. The mechanism behind it is not a hint though, and it is
 * checkable: an empty profile produces no company block in the prompt at all,
 * so every head knows the company's name and nothing else and answers like a
 * search engine. Somebody asks two questions, gets advice that could have come
 * from anywhere, and never opens it again.
 *
 * Nothing here is asked twice and nothing is required. Each step saves as it is
 * passed, so leaving halfway keeps what was already answered, and a business
 * that wants to skip the lot can.
 *
 * Deliberately not a conversation with a head, which was the obvious idea. The
 * key is the customer's own, and a brand new business does not have one set
 * yet, so an onboarding that needs the model cannot run until after the step
 * that is hardest to get through. Cards work with nothing configured.
 */

interface Step {
  title: string;
  /** One line. The card is the explanation; the fields do not get their own. */
  blurb: string;
  /** Nothing to fill in, so Next reads as Next rather than Save. */
  readOnly?: boolean;
}

export function Setup() {
  const {
    ready,
    storage,
    workspaceRole,
    profile,
    settings,
    departments,
    ceo,
    serverKeys,
    workspaceKeys,
    updateProfile,
    updateSettings,
  } = useStore();

  const [step, setStep] = useState(0);
  const [skipped, setSkipped] = useState(false);

  // Local until Next, so typing is never a write and Back does not lose it.
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [products, setProducts] = useState("");
  const [audience, setAudience] = useState("");
  const [goals, setGoals] = useState("");

  const provider = providerOf(settings.model);
  const keySet = hasKeyFor(settings.model, {
    serverKeys,
    workspaceKeys,
    browserKey: settings.apiKey,
  });

  /*
   * Brand new, and nobody else's problem.
   *
   * Only an administrator, because what this asks for belongs to the business
   * rather than to the person: an invited employee should never be the one
   * deciding what the company sells. Only while the profile is genuinely
   * untouched, so it disappears the moment there is anything to keep and can
   * never overwrite an answer somebody already gave.
   */
  const untouched = useMemo(
    () =>
      !profile ||
      [profile.mission, profile.products, profile.audience, profile.goals, profile.keyFacts]
        .join("")
        .trim() === "",
    [profile],
  );

  const dismissed = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("eterneon:setup-skipped") === "1";
    } catch {
      // A browser with storage blocked simply gets asked again, which is a
      // better failure than a crash on the first screen anybody sees.
      return false;
    }
  }, []);

  const steps: Step[] = [
    {
      title: `Welcome to ${settings.companyName || "your panel"}`,
      blurb:
        "A few questions so the heads answer as people who work here rather than as a search engine. Two minutes, and you can stop at any point.",
      readOnly: true,
    },
    {
      title: "Connect a model",
      blurb:
        "The panel runs on your own API key, so the conversations and the bill are yours and nobody else can see either.",
    },
    { title: "What is the business called", blurb: "The name the heads will use when they talk about you." },
    { title: "What does it do", blurb: "In a sentence or two, as you would tell somebody at a party." },
    { title: "What does it sell", blurb: "The products or services people actually pay for." },
    { title: "Who buys it", blurb: "The customers you want more of, not everybody who might." },
    { title: "What are you aiming at", blurb: "What would make the next few months a success." },
    {
      title: "Your heads",
      blurb: "Each one answers in its own area and can see everything above. Ask any of them anything.",
      readOnly: true,
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  if (!ready || storage !== "hosted" || workspaceRole !== "admin") return null;
  if (!untouched || dismissed || skipped) return null;

  const skip = () => {
    try {
      window.localStorage.setItem("eterneon:setup-skipped", "1");
    } catch {
      // Then it asks again next time, which is the whole consequence.
    }
    setSkipped(true);
  };

  /** Saves whatever this step collected, then moves on. */
  const next = async () => {
    if (step === 2 && name.trim()) await updateSettings({ companyName: name.trim() });
    if (step === 3 && mission.trim()) await updateProfile({ mission: mission.trim() });
    if (step === 4 && products.trim()) await updateProfile({ products: products.trim() });
    if (step === 5 && audience.trim()) await updateProfile({ audience: audience.trim() });
    if (step === 6 && goals.trim()) await updateProfile({ goals: goals.trim() });
    if (last) {
      setSkipped(true);
      return;
    }
    setStep((n) => n + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Set up your panel"
      className={cx(
        "fixed inset-0 z-[60] grid place-items-center bg-surface/95 backdrop-blur-sm",
        // Scrolls rather than centring something taller than the screen. The
        // last card lists every head, and on a phone in landscape that is
        // taller than the viewport: centred and unscrollable, the buttons end
        // up off both edges and the only way out of the setup is to close the
        // tab.
        "overflow-y-auto p-4",
      )}
    >
      <Card className="measure-read my-auto w-full">
        <p className="md-label-sm text-on-variant">
          Step {step + 1} of {steps.length}
        </p>
        <h1 className="md-title-lg mt-1">{current.title}</h1>
        <p className="md-body mt-2 text-on-variant">{current.blurb}</p>

        <div className="mt-5">
          {step === 1 ? (
            keySet ? (
              <p className="md-body text-primary">A key is set. Nothing to do here.</p>
            ) : (
              <ProviderKey provider={providerInfo(provider)} />
            )
          ) : null}

          {step === 2 ? (
            <TextInput
              autoFocus
              value={name}
              placeholder={settings.companyName}
              onChange={(event) => setName(event.target.value)}
            />
          ) : null}

          {step === 3 ? (
            <TextArea autoFocus rows={4} value={mission} onChange={(e) => setMission(e.target.value)} />
          ) : null}
          {step === 4 ? (
            <TextArea autoFocus rows={4} value={products} onChange={(e) => setProducts(e.target.value)} />
          ) : null}
          {step === 5 ? (
            <TextArea autoFocus rows={4} value={audience} onChange={(e) => setAudience(e.target.value)} />
          ) : null}
          {step === 6 ? (
            <TextArea autoFocus rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} />
          ) : null}

          {last ? (
            <ul className="flex flex-col gap-2">
              {[ceo, ...departments.filter((d) => !d.isCeo && !d.personal)]
                .filter(Boolean)
                .slice(0, 7)
                .map((head) =>
                  head ? (
                    <li key={head.id} className="flex items-center gap-3">
                      <DepartmentAvatar department={head} size={32} />
                      <span className="min-w-0">
                        <span className="md-body block truncate">
                          {head.personaName || head.name}
                        </span>
                        <span className="md-label-sm block truncate text-on-variant/75">
                          {head.roleTitle}
                        </span>
                      </span>
                    </li>
                  ) : null,
                )}
            </ul>
          ) : null}
        </div>

        {/*
          * Two rows rather than three buttons on one.
          *
          * On one row at a phone's width the three of them do not fit: the
          * primary action ran off the right edge and the skip wrapped onto two
          * lines inside a fixed height button. Back and Next keep a row to
          * themselves at every width, and the way out sits under them where it
          * is reachable without being the thing your thumb lands on.
          */}
        <div className="mt-6 flex items-center justify-end gap-2">
          {step > 0 ? (
            <Button variant="outlined" onClick={() => setStep((n) => n - 1)}>
              Back
            </Button>
          ) : null}

          <Button
            onClick={(event) => {
              createRipple(event);
              void next();
            }}
          >
            {last ? "Start" : step === 0 ? "Begin" : "Next"}
          </Button>
        </div>

        <div className="mt-2 flex justify-center">
          <Button variant="text" size="sm" onClick={skip}>
            {last ? "Close" : "Skip for now"}
          </Button>
        </div>

        <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
          {steps.map((_, index) => (
            <span
              key={index}
              className={cx(
                "h-1.5 rounded-full transition-all",
                index === step ? "w-5 bg-primary" : "w-1.5 bg-outline-variant",
              )}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
