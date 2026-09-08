/**
 * That colours the interface asks people to tell apart stay apart when they
 * cannot see the difference between red and green.
 *
 * Roughly one man in twelve has a red-green deficiency. contrast-test covers
 * the other half of this, which is whether text can be read against what is
 * behind it; this covers the half it cannot, which is whether two colours used
 * to mean two different things are still two colours.
 *
 * Simulated with the Brettel/Vienot dichromat transform on linear light rather
 * than on the sRGB values, because averaging gamma-encoded numbers gives a
 * colour nobody sees. Three deficiencies: protanopia (no red cone), deuteranopia
 * (no green cone), tritanopia (no blue cone).
 *
 * The thresholds below are not one number, and that is the point of the file.
 * How far apart two colours have to stay depends on what else is there to tell
 * them apart, and a single strict number would have demanded a palette that the
 * light theme's contrast budget cannot produce: three text colours cannot be
 * both widely separated in lightness and all above 4.5:1 on a near-white page.
 * So each pair is asserted at the level its other cues justify, and the ones
 * carrying no other cue are the strict ones.
 *
 *   npm run colourblind-test
 */
import { readFileSync } from "node:fs";

const CSS = readFileSync("src/app/globals.css", "utf8");

/**
 * Pairs where confusing the two changes what somebody does, and where nothing
 * but the colour says which is which.
 */
const CRITICAL = 20;

/**
 * Pairs that also carry a word beside them or a shape of their own. They still
 * have to be visibly different; they do not have to carry the meaning alone.
 */
const SUPPORTED = 15;

/** A sequential scale is read by its lightness, so that is what is checked. */
const RAMP_STEP = 4;

/**
 * The nine head accents, against each other.
 *
 * Lower than SUPPORTED on purpose, and the reason is arithmetic rather than
 * indulgence. Nine colours that must also each clear 4.5:1 against the page
 * cannot all sit fifteen points apart once a deficiency has flattened two of
 * the three axes they differ on; five is about the ceiling. So this is not
 * asking the colour to identify the head. The name is written beside every one
 * of these and the disc carries the head's initial, so what the colour has to
 * do is stop two heads reading as the same head at a glance.
 *
 * It is here because both halves of that were broken and nothing caught it. The
 * accents were nine hues at one lightness, which is the one thing a dichromat
 * cannot see, so the wheel collapsed: rose and orchid measured 0.0 apart on the
 * light theme, meaning identical. They differ in lightness as well now, which is
 * what this number is really guarding.
 */
const ACCENTS_APART = 6;

const ACCENTS = [
  "amber",
  "rose",
  "cyan",
  "violet",
  "lime",
  "slate",
  "teal",
  "blue",
  "orchid",
];

function themeBlock(selector: RegExp): Record<string, string> {
  const match = selector.exec(CSS);
  if (!match) throw new Error(`cannot find a rule for ${selector}`);
  const open = CSS.indexOf("{", match.index + match[0].length - 1);
  const close = CSS.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const m of CSS.slice(open, close).matchAll(
    /--(md-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    out[m[1]] = m[2];
  }
  if (!out["md-surface"]) throw new Error(`no tokens in the rule for ${selector}`);
  return out;
}

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/**
 * Dichromat simulation, in LMS.
 *
 * The Hunt-Pointer-Estevez transform, then the Brettel replacement rows: a
 * missing cone's response is reconstructed from the two that remain, which is
 * what the eye is left doing.
 */
function simulate(colour: RGB, kind: "protan" | "deutan" | "tritan"): RGB {
  const [r, g, b] = colour.map(toLinear) as RGB;

  const l = 0.31399022 * r + 0.63951294 * g + 0.04649755 * b;
  const m = 0.15537241 * r + 0.75789446 * g + 0.08670142 * b;
  const s = 0.01775239 * r + 0.10944209 * g + 0.87256922 * b;

  let l2 = l;
  let m2 = m;
  let s2 = s;
  if (kind === "protan") l2 = 1.05118294 * m - 0.05116099 * s;
  else if (kind === "deutan") m2 = 0.9513092 * l + 0.04866992 * s;
  else s2 = -0.86744736 * l + 1.86727089 * m;

  return [
    toSrgb(5.47221206 * l2 - 4.6419601 * m2 + 0.16963708 * s2),
    toSrgb(-1.1252419 * l2 + 2.29317094 * m2 - 0.1678952 * s2),
    toSrgb(0.02980165 * l2 - 0.19318073 * m2 + 1.16364789 * s2),
  ];
}

function lab(colour: RGB): [number, number, number] {
  const [r, g, b] = colour.map(toLinear) as RGB;
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const lightness = (hex: string) => lab(rgb(hex))[0];

function distance(a: RGB, b: RGB): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const KINDS = ["protan", "deutan", "tritan"] as const;

/** The worst any deficiency makes one pair look. */
function apart(theme: Record<string, string>, one: string, two: string) {
  const a = rgb(theme[one]);
  const b = rgb(theme[two]);
  let worst = { kind: "", d: Infinity };
  for (const kind of KINDS) {
    const d = distance(simulate(a, kind), simulate(b, kind));
    if (d < worst.d) worst = { kind, d };
  }
  return worst;
}

function mustDiffer(
  theme: Record<string, string>,
  label: string,
  one: string,
  two: string,
  floor: number,
): void {
  const worst = apart(theme, one, two);
  check(label, worst.d >= floor, `${worst.d.toFixed(1)} under ${worst.kind}, needs ${floor}`);
}

for (const [themeName, selector] of [
  ["dark", /:root,\s*\[data-theme="dark"\]\s*\{/],
  ["light", /\[data-theme="light"\]\s*\{/],
] as const) {
  const theme = themeBlock(selector);
  console.log(`\n${themeName}`);

  /*
   * The one pair nobody may confuse.
   *
   * Both appear as a bare coloured word and as a filled banner, and they mean
   * opposite things. This was the failure that started the file: all three
   * semantics sat within two points of lightness of each other, so hue was
   * carrying the whole distinction, and hue is exactly what goes. Error is
   * decisively darker than success in both themes now.
   */
  mustDiffer(theme, "success is not error", "md-success", "md-error", CRITICAL);

  /*
   * Warning against either of them, at the lower bar.
   *
   * Warning is advisory and never appears alone: it is always attached to a
   * sentence saying what to revisit or what is nearly full. It cannot be pushed
   * further from success on the light theme without going lighter than 4.5:1
   * against a near-white page, which would trade a rare confusion for a
   * guaranteed one.
   */
  mustDiffer(theme, "warning is not error", "md-warning", "md-error", SUPPORTED);
  mustDiffer(theme, "warning is not success", "md-warning", "md-success", SUPPORTED);

  /*
   * The status dots. Busy is a ring rather than a disc, so it has a shape of
   * its own; online against offline has only the colour and the hover, which is
   * why it is here at all.
   */
  mustDiffer(theme, "online is not offline", "md-success", "md-outline", SUPPORTED);

  /*
   * The composition bar, checked the way a sequential scale is actually read.
   *
   * Seven bands of one hue cannot all be far apart in Lab, and they do not need
   * to be: order carries the meaning, the legend maps by position, and what
   * separates one band from the next is lightness, which every deficiency
   * leaves alone. A Lab distance check here failed a ramp that was already
   * correct, which is a test being wrong about a design rather than the other
   * way round.
   */
  /*
   * Every head against every other head. Reported as the closest pair rather
   * than as thirty six lines, because the closest pair is the whole answer.
   */
  let closest = { d: Infinity, a: "", b: "", kind: "" };
  for (let i = 0; i < ACCENTS.length; i += 1) {
    for (let j = i + 1; j < ACCENTS.length; j += 1) {
      const worst = apart(theme, `md-accent-${ACCENTS[i]}`, `md-accent-${ACCENTS[j]}`);
      if (worst.d < closest.d) {
        closest = { d: worst.d, a: ACCENTS[i], b: ACCENTS[j], kind: worst.kind };
      }
    }
  }
  check(
    "no two heads collapse into one colour",
    closest.d >= ACCENTS_APART,
    `${closest.a} and ${closest.b} are ${closest.d.toFixed(1)} apart under ${closest.kind}, needs ${ACCENTS_APART}`,
  );

  /*
   * The brand against everything it shares a screen with.
   *
   * This is the check that would have caught the defect the palette was built
   * to fix, and it did not exist while that defect shipped: the primary was on
   * the same hue as the cyan head, so a link and a head were one colour. It
   * came back a second time in a different disguise, an amber brand measuring
   * 0.8 from the lime head on the light theme, which is what put this here.
   *
   * The brand is not an accent and is not a status colour, but it is drawn
   * beside both, and it is the one colour on the page that means "you can press
   * this" rather than naming a thing.
   */
  let nearest = { d: Infinity, other: "", kind: "" };
  for (const other of [
    ...ACCENTS.map((name) => `md-accent-${name}`),
    "md-warning",
    "md-error",
    "md-success",
  ]) {
    const worst = apart(theme, "md-primary", other);
    if (worst.d < nearest.d) nearest = { d: worst.d, other, kind: worst.kind };
  }
  check(
    "the brand is not mistakable for a head or a status",
    nearest.d >= ACCENTS_APART,
    `nearest is ${nearest.other} at ${nearest.d.toFixed(1)} under ${nearest.kind}, needs ${ACCENTS_APART}`,
  );

  const ramp = [1, 2, 3, 4, 5, 6, 7].map((n) => lightness(theme[`md-chart-${n}`]));
  const steps = ramp.slice(1).map((value, i) => value - ramp[i]);
  check(
    "the context bar steps through lightness, in one direction",
    steps.every((step) => step >= RAMP_STEP),
    `smallest step ${Math.min(...steps).toFixed(1)}, needs ${RAMP_STEP}`,
  );
}

/*
 * Every brand a workspace may choose, against every head and every status.
 *
 * The default is checked above with the rest of the palette. These are the
 * other six, and they need the same check for the same reason: each is a tenth
 * colour dropped onto a circle that is already full, and a business picking
 * plum must not end up with a link that looks like its Design head.
 *
 * Read out of the stylesheet rather than from a list here, so a colour added to
 * the CSS and forgotten about is still checked.
 */
function brandBlock(selector: RegExp): Record<string, string> {
  const match = selector.exec(CSS);
  if (!match) throw new Error(`cannot find a rule for ${selector}`);
  const open = CSS.indexOf("{", match.index + match[0].length - 1);
  const close = CSS.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const m of CSS.slice(open, close).matchAll(
    /--(md-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    out[m[1]] = m[2];
  }
  return out;
}

for (const themeName of ["dark", "light"] as const) {
  const base = themeBlock(
    themeName === "dark"
      ? /:root,\s*\[data-theme="dark"\]\s*\{/
      : /\[data-theme="light"\]\s*\{/,
  );
  const brands = [
    ...CSS.matchAll(new RegExp(`\\[data-theme="${themeName}"\\]\\[data-brand="([a-z]+)"\\]`, "g")),
  ].map((m) => m[1]);

  console.log(`\n${themeName} brands`);
  for (const brand of brands) {
    // A brand block carries only what it overrides, so it is laid over the
    // theme underneath exactly as the cascade lays it.
    const merged = {
      ...base,
      ...brandBlock(
        new RegExp(`\\[data-theme="${themeName}"\\]\\[data-brand="${brand}"\\]\\s*\\{`),
      ),
    };

    let nearest = { d: Infinity, other: "", kind: "" };
    for (const other of [
      ...ACCENTS.map((name) => `md-accent-${name}`),
      "md-warning",
      "md-error",
      "md-success",
    ]) {
      const worst = apart(merged, "md-primary", other);
      if (worst.d < nearest.d) nearest = { d: worst.d, other, kind: worst.kind };
    }
    check(
      `${brand} is not mistakable for a head or a status`,
      nearest.d >= ACCENTS_APART,
      `nearest is ${nearest.other} at ${nearest.d.toFixed(1)} under ${nearest.kind}, needs ${ACCENTS_APART}`,
    );

    const ramp = [1, 2, 3, 4, 5, 6, 7].map((n) => lightness(merged[`md-chart-${n}`]));
    const steps = ramp.slice(1).map((value, i) => value - ramp[i]);
    check(
      `${brand} steps its context bar through lightness`,
      steps.every((step) => step >= RAMP_STEP),
      `smallest step ${Math.min(...steps).toFixed(1)}, needs ${RAMP_STEP}`,
    );
  }
}

console.log(
  failures === 0
    ? "\nall checks passed"
    : `\n${failures} FAILURES ABOVE. A pair that cannot be separated needs a second cue, not only a new colour.`,
);
process.exit(failures === 0 ? 0 : 1);
