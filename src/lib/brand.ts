/**
 * The brand colours a workspace may choose.
 *
 * Its own module, importing nothing, because it is a value rather than a type
 * and it is needed on both sides of the wire: the settings page offers it, and
 * the repository checks a stored value against it before handing it back. Put
 * in types.ts it was the one runtime export in a file everything imports for
 * types alone, which turns a type-only import into a real edge in the module
 * graph and moves the order everything else evaluates in.
 *
 * Seven, and not a picker. The brand is a tenth colour on a circle that already
 * holds nine head accents and three status colours, and the defect the palette
 * was rebuilt to fix was the brand sitting on top of one of the heads. A free
 * hue would put that back and nothing would notice. Each of these is checked by
 * colourblind-test against every head and every status colour in both themes,
 * and the values themselves are in globals.css.
 */
export const BRAND_COLOURS = [
  "amber",
  "coral",
  "moss",
  "teal",
  "indigo",
  "violet",
  "plum",
] as const;

export type BrandColour = (typeof BRAND_COLOURS)[number];

/** What a workspace gets when it has never chosen, or chose something gone. */
export const DEFAULT_BRAND: BrandColour = "amber";

/** Whether a stored string is still one of the colours on offer. */
export function isBrandColour(value: unknown): value is BrandColour {
  return BRAND_COLOURS.includes(value as BrandColour);
}
