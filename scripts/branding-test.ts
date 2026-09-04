/**
 * What a settings save is allowed to change, and how a logo is removed.
 *
 * The removal is the reason this file exists. Clearing a logo was sent as
 * undefined, JSON.stringify drops undefined, so the server was handed an empty
 * row and wrote nothing. The interface cleared, the reload brought the logo
 * back, and nothing anywhere reported an error. The same shape of bug had
 * already cost a profile picture, which is why the rule now lives in one place
 * and is checked here.
 *
 * Run with: npm run branding-test
 */
import { WRITABLE_SETTINGS, logoOrNothing, writableSettings } from "../src/lib/settingsWrite";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}

console.log("removing a logo");
{
  const sent = writableSettings({ companyLogoUrl: null });
  check("null reaches the column", sent.companyLogoUrl === null, String(sent.companyLogoUrl));
  check("and it is the only field written", Object.keys(sent).length === 1);

  // The bug itself. Sent this way the key is gone before the request is built.
  const overWire = JSON.parse(JSON.stringify({ companyLogoUrl: undefined })) as Record<
    string,
    unknown
  >;
  check("undefined does not survive JSON", !("companyLogoUrl" in overWire));
  check("so it writes nothing", Object.keys(writableSettings(overWire)).length === 0);
}

console.log("\nsetting a logo");
{
  const url = "data:image/png;base64,abc";
  check("a data URL is written", writableSettings({ companyLogoUrl: url }).companyLogoUrl === url);
}

console.log("\nnothing else can be cleared");
{
  // A null in any other column would blank a name or a theme the interface
  // always has a value for, so it is a bug on the way in rather than a wish.
  for (const field of WRITABLE_SETTINGS) {
    if (field === "companyLogoUrl") continue;
    const sent = writableSettings({ [field]: null });
    if (Object.keys(sent).length !== 0) {
      check(`${field} refuses null`, false, JSON.stringify(sent));
    }
  }
  check("every other field refuses null", true, `${WRITABLE_SETTINGS.length - 1} checked`);
}

console.log("\na partial save leaves the rest alone");
{
  // This is the line that once turned a theme change into a rename.
  const sent = writableSettings({ theme: "dark" });
  check("only theme is written", Object.keys(sent).join(",") === "theme", Object.keys(sent).join(","));
}

console.log("\nthe row cannot choose what it writes into");
{
  const sent = writableSettings({
    workspaceId: "someone-else",
    id: "1",
    apiKey: "sk-live",
    openaiKey: "sk-live",
    googleKey: "sk-live",
    companyName: "Acme",
  });
  check("the workspace cannot be redirected", !("workspaceId" in sent));
  check("an id cannot be forced", !("id" in sent));
  // /api/workspace/keys is the only writer, because it encrypts on the way in.
  check("no model key can be smuggled through settings", !Object.keys(sent).some((k) => k.endsWith("Key")), Object.keys(sent).join(","));
  check("the real field still lands", sent.companyName === "Acme");
}

console.log("\nwrong types are refused rather than stored");
{
  const sent = writableSettings({ companyName: 42, companyMark: { a: 1 }, theme: ["dark"] });
  check("nothing that is not a string is written", Object.keys(sent).length === 0, JSON.stringify(sent));
}

console.log("\nwhich image a tab and a mark should show");
{
  check("a set logo wins", logoOrNothing("data:image/png;base64,abc") !== "");
  check("undefined means letters", logoOrNothing(undefined) === "");
  check("null means letters", logoOrNothing(null) === "");
  check("empty means letters", logoOrNothing("") === "");
  // A blank data URL renders as a broken square, which is worse than letters.
  check("whitespace means letters", logoOrNothing("   \n ") === "");
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
