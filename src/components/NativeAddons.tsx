"use client";

import { Chip } from "@/components/ui";
import { GoogleCalendarCard } from "@/components/GoogleCalendarCard";
import { WebSearchCard } from "@/components/WebSearchCard";

/**
 * The addons that came with the panel.
 *
 * The Engineering head can build one on request, and that is the powerful half
 * of the feature and the half most people will never use: knowing what to ask
 * for is its own skill, and a business owner who has never written an
 * automation does not know that "post to a webhook when a task is done" is a
 * sentence they are allowed to say.
 *
 * So the ones worth having are built here and listed as connections rather than
 * recipes. They are marked Native to say plainly that these came from us and
 * are maintained by us, which is a different promise from one a model wrote at
 * somebody's request last Tuesday.
 *
 * Adding one means writing it, not describing it. There is no registry of
 * capabilities a native addon draws from, on purpose: these are ordinary
 * features that happen to be listed in one place, and the moment they are a
 * plugin system they need everything the recipe language has, which is the
 * thing that exists next door.
 */
export function NativeAddons() {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="md-title-lg">Built in</h2>
        <Chip tone="primary">Native</Chip>
      </div>

      <ul className="flex flex-col gap-3">
        <li>
          <WebSearchCard />
        </li>
        <li>
          {/*
            Moved here from Settings. It was filed under Appearance and model
            keys, which is where somebody looking for what the panel connects to
            would never think to look. It is a connection to an outside service,
            which is what this screen is.
          */}
          <GoogleCalendarCard />
        </li>
      </ul>
    </section>
  );
}
