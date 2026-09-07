/**
 * The security headers, and the one permission the panel actually needs.
 *
 * Written because a header silently switched a feature off. Permissions-Policy
 * denied the microphone for the whole origin, with a comment saying nothing
 * here used any of these, which was true right up until dictation shipped. The
 * button then appeared, asked for the microphone, and was refused by the site it
 * was part of, with a message that reads exactly like the person having denied
 * it themselves.
 *
 * So the microphone is named here as a deliberate exception. Tightening it back
 * to () is then a thing somebody has to do on purpose, in two places, rather
 * than something that looks like housekeeping.
 *
 *   npm run headers-test
 */
import { readFileSync } from "node:fs";
import config from "../next.config.mjs";
import { DICTATION_ENABLED } from "../src/lib/dictation";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

void (async () => {
  const groups = await (config as { headers: () => Promise<unknown[]> }).headers();
  const all = (groups as { headers: { key: string; value: string }[] }[]).flatMap(
    (group) => group.headers ?? [],
  );
  const valueOf = (key: string) =>
    all.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value ?? "";

  console.log("\nthe permissions policy agrees with what the panel actually uses");
  {
    const policy = valueOf("Permissions-Policy");
    check("there is one at all", policy.length > 0);

    /*
     * Both directions, which is the whole point of this check.
     *
     * Dictation shipped asking for a microphone this header denied, so the
     * feature was broken on arrival and the message blamed the browser. The
     * mirror of that is a permission left open for a feature nobody can
     * reach: a smaller problem, and still one worth not having. So the flag
     * and the header have to say the same thing, and changing one without
     * the other fails here rather than in front of somebody.
     */
    const microphone =
      policy.split(", ").find((part) => part.startsWith("microphone")) ?? "absent";
    check(
      DICTATION_ENABLED
        ? "dictation is on, so the microphone is allowed to this origin"
        : "dictation is off, so the microphone is denied",
      microphone === (DICTATION_ENABLED ? "microphone=(self)" : "microphone=()"),
      microphone,
    );
    check("and never to anything embedded", !policy.includes("microphone=*"));

    /*
     * Everything else stays shut. The point of naming them is that opening one
     * should be as deliberate as opening the microphone was, rather than a
     * side effect of editing the line above it.
     */
    for (const feature of ["camera", "geolocation", "payment", "usb"]) {
      check(`${feature} is still denied`, policy.includes(`${feature}=()`), policy);
    }
  }

  console.log("\nthe rest of the headers are still set");
  {
    check("a content security policy", valueOf("Content-Security-Policy").includes("frame-ancestors"));
    check("no sniffing", valueOf("X-Content-Type-Options") === "nosniff");
    check("no framing", valueOf("X-Frame-Options") === "DENY");
    check("a referrer policy", valueOf("Referrer-Policy").length > 0);
  }

  /*
   * A rule in headers() replaces a route handler's Cache-Control rather than
   * merging with it, which is not obvious and was costing a fetch per image per
   * page. /api/files/[id] asked for a year of immutable caching, the blanket
   * no-store on /api overrode it, and every avatar was downloaded again on
   * every screen for as long as that was true.
   *
   * Restating the value in the config would have swapped that for a worse bug,
   * since a rule cannot vary by status and a missing file answers 404, so the
   * fix is an exclusion plus a header on every path out of the route. Both
   * halves are load bearing and neither is visible from the other file, which
   * is what this checks.
   */
  console.log("\nthe file route keeps its own caching, and nothing else lost no-store");
  {
    const groups = (await (config as { headers: () => Promise<unknown[]> }).headers()) as {
      source: string;
      headers: { key: string; value: string }[];
    }[];

    check(
      "the blanket rule excludes the file route",
      groups.some(
        (group) =>
          group.source.startsWith("/api/") &&
          group.source.includes("(?!files/)") &&
          group.headers.some((h) => h.key === "Cache-Control" && h.value.includes("no-store")),
      ),
      groups.map((group) => group.source).join(" "),
    );

    check(
      "and nothing puts a Cache-Control back on it",
      !groups.some(
        (group) =>
          group.source.startsWith("/api/files") &&
          group.headers.some((header) => header.key === "Cache-Control"),
      ),
    );

    check(
      "while the file route still says noindex like the rest of the API",
      groups.some(
        (group) =>
          group.source.startsWith("/api/files") &&
          group.headers.some((header) => header.key === "X-Robots-Tag"),
      ),
    );

    /*
     * The route has to answer every path itself, because nothing upstream does
     * it now. Counting them is crude and it is the property that matters: a
     * return added later without a header is a response with no caching rule at
     * all, which is how the last one of these went unnoticed.
     */
    const route = readFileSync("src/app/api/files/[id]/route.ts", "utf8");
    const returns = route.match(/return (new Response|Response[.]json)/g)?.length ?? 0;
    const headed = route.match(/"Cache-Control": (FOUND|NOT_FOUND)/g)?.length ?? 0;
    check(
      "every path out of the file route names a Cache-Control",
      returns > 0 && returns === headed,
      `${headed} named for ${returns} returns`,
    );
    check(
      "the bytes are cached for a year",
      route.includes('const FOUND = "private, max-age=31536000, immutable"'),
    );
    check(
      "and a miss is not cached at all",
      route.includes('const NOT_FOUND = "no-store, max-age=0"'),
    );
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
