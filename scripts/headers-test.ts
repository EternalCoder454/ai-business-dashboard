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

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
