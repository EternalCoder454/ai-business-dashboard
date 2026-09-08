"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, cx } from "./ui";
import { DepartmentAvatar } from "./DepartmentAvatar";
import { createRipple } from "./ui/ripple";
import { departmentHref } from "@/lib/routes";
import { useStore } from "@/lib/store";
import { TOUR_KEY } from "@/lib/tour";

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
  const { ready, storage, settings, departments, orchestrator, workspaceRole } = useStore();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);

  const dismissed = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(TOUR_KEY) === "done";
    } catch {
      // A browser with storage blocked simply gets asked again, which is a
      // better failure than a crash on the first screen anybody sees.
      return false;
    }
  }, []);

  const heads = [orchestrator, ...departments.filter((d) => !d.isOrchestrator && !d.personal)]
    .filter(Boolean)
    .slice(0, 6);

  const who = orchestrator?.personaName || "your Chief of Staff";

  const slides: Slide[] = useMemo(() => {
    const all: Slide[] = [
      {
        title: `Welcome to ${settings.companyName || "your panel"}`,
        body: "Eight heads, one for each part of a business. Two minutes on what is where.",
        href: "/",
      },
      {
        title: "Your account",
        body: "Your name, your role, when you are available and how you like answers written. Every head reads this before it replies, so the answer is written for you rather than for anybody.",
        href: "/account",
      },
      {
        title: "Your heads",
        body: "Open one below and ask it something, the way you would ask a colleague. Each keeps its own conversations, so Finance and Legal never get mixed up.",
        href: "/orchestrator",
      },
      {
        title: "Meetings",
        body: `Ask every head the same question and read the answers side by side. ${who} pulls them together at the end. Good for decisions that cross departments: should we raise prices, what would it take to hire somebody.`,
        href: "/meetings",
      },
      {
        title: "The Library",
        body: "Upload your real documents: a price list, a contract, last month's numbers. The heads answer from those instead of guessing what a business like yours probably charges. Their finished work is kept here too, and exports as Word, Markdown or text.",
        href: "/library",
      },
      {
        title: "Tasks and schedules",
        body: "The board is what is outstanding, one card per job. Move a card across as it gets done. The tab beside it is Schedules, for a question you want asked every week: the answer is waiting on Monday instead of being something you remember to ask for.",
        href: "/tasks",
      },
      {
        title: "The Company Profile",
        body: "What the heads know about your business. Fill it in and the advice is about you. Leave it empty and they answer like any other chatbot.",
        href: "/profile",
      },
      {
        title: settings.wikiTitle || "Internal Wiki",
        body: "Your own pages, about how this business works, for whoever joins next. An administrator can rewrite any of them.",
        href: "/wiki",
      },
      {
        title: "Settings",
        body: "The panel runs on your own API key, which is added here. Settings also holds the heads, the theme and the house writing rules.",
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
      window.localStorage.setItem(TOUR_KEY, "done");
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
        /*
         * A row in the column rather than a card floating over it, so the page
         * is pushed up by exactly the height of this and nothing is hidden
         * behind it.
         *
         * Fixed to the bottom of the viewport, it landed on the composer: step
         * two says to pick a head and ask it something, and step three opens
         * Meetings, and on both of those the box you type into is at the bottom
         * of the screen. The tour covered the one control it was telling you to
         * use. WriteError above has the same note for the same reason, about
         * the navigation bar.
         */
        /*
         * Darker than the page, with a lift above it, so it reads as a thing
         * sitting on the screen rather than as more screen. Flat and the same
         * colour as everything else, it was easy to scroll straight past the
         * one part of the app that is talking to you.
         */
        "safe-bottom safe-pb-3 safe-x safe-px-3 flex flex-none justify-center border-t border-outline bg-highest pt-3 shadow-[0_-10px_28px_-14px_rgba(0,0,0,0.5)]",
      )}
    >
            <div className="measure-read w-full">
        <p className="md-label-sm text-on-variant/70">
          {step + 1} of {slides.length}
        </p>
        <h1 className="md-title mt-1">{current.title}</h1>
        <p className="md-body mt-1.5 text-on-surface">{current.body}</p>

        {step === 1 && heads.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {heads.map((head) =>
              head ? (
                <li key={head.id} className="min-w-0">
                  {/*
                    * Openable from here, rather than described as being
                    * somewhere. This step used to say "pick one from the
                    * sidebar", which is wrong on a phone, where there is no
                    * sidebar and the button is called Heads, and imprecise on a
                    * desktop, where the section is called Departments. Pointing
                    * at a place that changes with the width is worse than
                    * putting the thing itself within reach.
                    */}
                  <Link
                    href={departmentHref(head)}
                    className="md-state flex min-w-0 items-center gap-2 rounded-full px-2 py-1"
                  >
                    <DepartmentAvatar department={head} size={24} />
                  {/*
                    * The department first, because that is the word in the
                    * sidebar this step has just told them to look at. It used
                    * to show only the persona name, so the tour said "pick one
                    * from the sidebar" beside a list of Ruth and Marisol and
                    * the sidebar said Marketing and Social Media. Nothing on
                    * screen connected the two.
                    */}
                    <span className="md-label-sm min-w-0 truncate text-on-surface">
                      {head.name}
                    </span>
                    {head.personaName && head.personaName !== head.name ? (
                      <span className="md-label-sm flex-none text-on-variant/70">
                        {head.personaName}
                      </span>
                    ) : null}
                  </Link>
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
      </div>
    </div>
  );
}
