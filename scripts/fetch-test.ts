/**
 * What the page reader refuses, and what it makes of what it gets.
 *
 * The refusals are the point. Searching finds pages a search engine chose;
 * this opens an address, and the address can arrive from anywhere: a document
 * somebody uploaded, an email, a search result, a head's own guess. So the
 * question worth testing is not whether a good address works but whether a bad
 * one is stopped before a socket opens.
 *
 * No test here reaches the network. Everything that would is either refused
 * before the request or is the tag stripper, which is a pure function.
 *
 *   npm run fetch-test
 */
import { isPublicAddress } from "../src/lib/addons/outbound";
import { readPage, textFromHtml } from "../src/lib/readPage";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

void (async () => {
  console.log("\nan address that is not a public web page is refused");
  {
    const cases: [string, string][] = [
      ["http://example.com", "plain http"],
      ["ftp://example.com", "another scheme entirely"],
      ["https://user:pass@example.com", "credentials in the address"],
      ["https://example.com:8443", "a port that is not 443"],
      ["not a url at all", "not an address"],
    ];
    for (const [address, why] of cases) {
      const result = await readPage(address);
      check(`refused: ${why}`, !result.ok, result.ok ? "opened" : result.detail);
    }
  }

  console.log("\nnothing on this machine or the private network is reachable");
  {
    /*
     * Checked through readPage rather than only through isPublicAddress, so the
     * test covers the path an address actually takes rather than the helper it
     * happens to call. A literal address skips DNS, which is exactly how a
     * checker that only guarded the lookup would be walked past.
     */
    const local = [
      "https://127.0.0.1",
      "https://localhost",
      "https://10.0.0.1",
      "https://192.168.1.1",
      "https://172.16.0.1",
      // The metadata endpoint, which is the one that matters on a cloud host.
      "https://169.254.169.254",
      // An IPv4 address wearing an IPv6 hat.
      "https://[::ffff:127.0.0.1]",
    ];
    for (const address of local) {
      const result = await readPage(address);
      check(`refused: ${address}`, !result.ok, result.ok ? "opened" : result.detail);
    }
  }

  console.log("\nthe address check itself");
  {
    check("a public address passes", isPublicAddress("93.184.216.34"));
    check("loopback does not", !isPublicAddress("127.0.0.1"));
    check("link local does not", !isPublicAddress("169.254.169.254"));
    check("ipv6 loopback does not", !isPublicAddress("::1"));
  }

  console.log("\nmarkup becomes prose");
  {
    const html = `<!doctype html><html><head><title>  Eterneon &amp; Co  </title>
      <style>body { color: red }</style>
      <script>var secret = "do not read me";</script>
      </head><body>
      <h1>What we do</h1><p>We build things.</p><p>And other things.</p>
      <ul><li>One</li><li>Two</li></ul>
      <a href="/x">A link</a>
      </body></html>`;
    const { title, text } = textFromHtml(html);

    check("the title is read and tidied", title === "Eterneon & Co", title);
    check("script contents never appear", !text.includes("do not read me"), text.slice(0, 60));
    check("style contents never appear", !text.includes("color: red"));
    check("the prose survives", text.includes("We build things."));
    check(
      "blocks do not run together into one sentence",
      !text.includes("We build things.And other things."),
      text.replace(/\n/g, " | ").slice(0, 90),
    );
    check("entities are decoded", !text.includes("&amp;"));
    check("tags are gone", !text.includes("<"));
  }

  console.log("\na page with nothing readable is not a success");
  {
    const { text } = textFromHtml("<html><head><script>var a=1</script></head><body></body></html>");
    check("empty after stripping", text === "", JSON.stringify(text).slice(0, 40));
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILURES ABOVE`);
  process.exit(failures === 0 ? 0 : 1);
})();
