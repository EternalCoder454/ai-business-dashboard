/**
 * What a conversation gets called before anybody asks a model.
 *
 * The old version harvested words and joined them, so every title was a phrase
 * nobody wrote. These are real shapes of first message: the check is that each
 * one reads as English and says what the conversation is about.
 *
 * Run with: npm run title-test
 */
import { deriveConversationTitle, tidyTitle } from "../src/lib/prompts";

const CASES: [string, string][] = [
  ["I need pricing for websites to sell", "Pricing for websites to sell"],
  ["can you help me write a job ad for a receptionist", "Write a job ad for a receptionist"],
  ["what should we charge for a 5 page site?", "What should we charge for a 5 page site"],
  ["hey, could you look at the Q3 numbers", "Look at the Q3 numbers"],
  ["how do i handle a client who won't pay", "How do I handle a client who won't pay"],
  ["draft an email to the landlord about the lease", "Draft an email to the landlord about the lease"],
  ["", "New conversation"],
  ["i", "I"],
  ["please", "Please"],
  ["Our margins are down. I think it is the supplier.", "Margins are down"],
];

let failures = 0;
for (const [input, expected] of CASES) {
  const got = deriveConversationTitle(input);
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${JSON.stringify(input)}\n       -> ${JSON.stringify(got)}${ok ? "" : `\n       want ${JSON.stringify(expected)}`}`);
}

console.log("\nlong ones are cut at a word:");
const long = deriveConversationTitle(
  "I want a plan for moving our whole customer list off the old system and onto the new one before the end of the quarter",
);
console.log(`  ${JSON.stringify(long)} (${long.length} characters)`);
if (long.length > 50) failures += 1;
if (/\s\S{1,2}…$/.test(long)) failures += 1;

console.log("\nwhat comes back from the model, tidied:");
const TIDY: [string, string][] = [
  ['"Pricing the rebuild"', "Pricing the rebuild"],
  ["Pricing the rebuild.", "Pricing the rebuild"],
  ["Here is a title:\nPricing the rebuild", "Pricing the rebuild"],
  ["  pricing the rebuild  ", "Pricing the rebuild"],
  ["Unclear", ""],
  ["unclear", ""],
  ["", ""],
  ["A title with far too many words in it to be a label at all", "A title with far too many"],
  ["\n\nQ3 margins", "Q3 margins"],
];
for (const [input, expected] of TIDY) {
  const got = tidyTitle(input);
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${JSON.stringify(input)} -> ${JSON.stringify(got)}${ok ? "" : ` want ${JSON.stringify(expected)}`}`,
  );
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
