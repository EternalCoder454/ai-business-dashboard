"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, cx } from "./ui";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { createRipple } from "./ui/ripple";
import { useStore } from "@/lib/store";

/**
 * A short walk around the panel, once, that walks with you.
 *
 * Next takes you to the screen the card is describing, so the tour is the app
 * with a card on it rather than a slideshow about the app. Which is why this
 * is a small card docked at the bottom instead of the full screen overlay it
 * started as: an overlay pointing at a page you cannot see is a leaflet.
 *
 * It explains and points. It asks for nothing. The version before this one was
 * a form, and a form is a wall in front of somebody who came to look around.
 *
 * Pointing is most of the value here. Across every business on the deployment
 * there are zero schedules, zero briefings, zero deliverables, zero tasks and
 * zero uploaded files: nothing beyond chat has ever been used by anybody. That
 * is not a sign those features are unwanted, it is a sign nobody knows they are
 * there, which a tour fixes and a form does not.
 *
 * The Settings card is last and is for administrators only, along with anything
 * else that belongs to whoever runs the business rather than to whoever works
 * in it. An employee gets the same walk without the parts they cannot act on,
 * because a tour of buttons you are not allowed to press is worse than no tour.
 */

interface Slide {
  title: string;
  body: string;
  /** Where this lives. Next goes there before showing the next card. */
  href: string;
  /** Only for whoever runs the business. */
  adminOnly?: boolean;
}

export function Setup() {
  const { ready, storage, settings, departments, ceo, workspaceRole } = useStore();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);

  const dismissed = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      // The key carries a version, so this can be shown again later by bumping
      // it rather than by hunting for who has already seen what.
      return window.localStorage.getItem("eterneon:tour-v1") === "done";
    } catch {
      // A browser with storage blocked simply gets asked again, which is a
      // better failure than a crash on the first screen anybody sees.
      return false;
    }
  }, []);

  const heads = [ceo, ...departments.filter((d) => !d.isCeo && !d.personal)]
    .filter(Boolean)
    .slice(0, 6);

  const who = ceo?.personaName || "your Chief of Staff";

  const slides: Slide[] = useMemo(() => {
    const all: Slide[] = [
      {
        title: `Welcome to ${settings.companyName || "your panel"}`,
        body: "A room of department heads, each answering in its own area from the same picture of the company. Two minutes on what is where.",
        href: "/",
      },
      {
        title: "Your heads",
        body: "Pick one from the sidebar and ask. Each keeps its own conversations, so what you asked in March is still here in June.",
        href: "/ceo",
      },
      {
        title: "Meetings",
        body: `One question to the whole room, every head answering from its own corner, and ${who} reading across the lot. For decisions that touch more than one area.`,
        href: "/all-hands",
      },
      {
        title: "The Library",
        body: "Anything a head writes can be kept here and exported as Word, Markdown or text. Files you upload live here too, and the heads can read them.",
        href: "/library",
      },
      {
        title: "Tasks, and briefings on a rhythm",
        body: "What is outstanding, and the decisions the heads reason from. Set a question to repeat and the answer is waiting under Briefings rather than something you remember to ask for.",
        href: "/tasks",
      },
      {
        title: "The Company Profile",
        body: "Everything the heads know about the business: what it sells, who buys it, what is off the table. While this is empty they answer like a search engine, because there is nothing here to answer from. It is the single thing that most changes how good the replies are.",
        href: "/profile",
      },
      {
        title: settings.wikiTitle || "Internal Wiki",
        body: "How this business works, written for whoever joins next. An administrator can rewrite every page, so it says what your people need rather than anything about the panel.",
        href: "/onboarding",
      },
      {
        title: "Your key, and everything else",
        body: "The panel runs on your own API key, so the conversations and the bill stay yours. Settings also holds the heads themselves, the theme, and the house writing rules.",
        href: "/settings",
        adminOnly: true,
      },
    ];
    return workspaceRole === "admin" ? all : all.filter((slide) => !slide.adminOnly);
  }, [settings.companyName, settings.wikiTitle, who, workspaceRole]);

  const current = slides[step];
  const last = step === slides.length - 1;

  if (!ready || storage !== "hosted") return null;
  if (dismissed || closed || !current) return null;

  const done = () => {
    try {
      window.localStorage.setItem("eterneon:tour-v1", "done");
    } catch {
      // Then it appears again next time, which is the whole consequence.
    }
    setClosed(true);
  };

  /** Moves the card and the page together. */
  const goTo = (index: number) => {
    const slide = slides[index];
    if (!slide) return;
    setStep(index);
    router.push(slide.href);
  };

  return (
    <div
      role="dialog"
      aria-label="A quick tour"
      className={cx(
        // Docked rather than covering, so the screen being described is the
        // thing you are looking at. No backdrop for the same reason.
        "safe-bottom safe-x fixed inset-x-0 bottom-0 z-[55] flex justify-center p-3",
        // The page underneath stays usable; only the card itself takes clicks.
        "pointer-events-none",
      )}
    >
      <Card className="measure-read pointer-events-auto w-full shadow-e3">
        <p className="md-label-sm text-on-variant">
          {step + 1} of {slides.length}
        </p>
        <h1 className="md-title mt-1">{current.title}</h1>
        <p className="md-body mt-1.5 text-on-variant">{current.body}</p>

        {step === 1 && heads.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {heads.map((head) =>
              head ? (
                <li key={head.id} className="flex min-w-0 items-center gap-2">
                  <DepartmentAvatar department={head} size={24} />
                  <span className="md-label-sm truncate text-on-variant">
                    {head.personaName || head.name}
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        ) : null}

        {/*
          * Two rows rather than three buttons on one. At a phone's width the
          * three of them do not fit: the primary action ran off the right edge
          * and the way out wrapped onto two lines inside a fixed height button.
          */}
        <div className="mt-5 flex items-center justify-end gap-2">
          {step > 0 ? (
            <Button variant="outlined" onClick={() => goTo(step - 1)}>
              Back
            </Button>
          ) : null}

          <Button
            onClick={(event) => {
              createRipple(event);
              if (last) done();
              else goTo(step + 1);
            }}
          >
            {last ? "Done" : "Next"}
          </Button>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {slides.map((_, index) => (
              <span
                key={index}
                className={cx(
                  "h-1.5 rounded-full transition-all",
                  index === step ? "w-5 bg-primary" : "w-1.5 bg-outline-variant",
                )}
              />
            ))}
          </div>
          <Button variant="text" size="sm" onClick={done}>
            Skip
          </Button>
        </div>
      </Card>
    </div>
  );
}
