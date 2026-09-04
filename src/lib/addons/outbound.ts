/**
 * The one place an addon can reach the outside world.
 *
 * Everything here exists because "send an HTTP request to a URL somebody gave
 * us" is, by default, a request forgery tool: our server sits inside a network
 * that a stranger's browser cannot reach, so a URL that resolves to an internal
 * address turns our own server into the attacker's client. The usual targets
 * are a cloud metadata endpoint holding deployment credentials, a database on a
 * private address, and anything else on localhost.
 *
 * The defences, in the order they apply:
 *
 *  1. The host must already be approved by an administrator of that workspace.
 *     Everything below is a second line, because this is the first one.
 *  2. https only, port 443 only, no credentials in the URL.
 *  3. Every address the host resolves to must be a public one. Every address,
 *     not the first: a name that answers with one public and one private
 *     address is an attack, not a misconfiguration.
 *  4. The connection is pinned to an address we checked. Without this, a name
 *     can answer safely for our check and differently for the actual connect,
 *     which is DNS rebinding and is the reason checking alone is not enough.
 *  5. Redirects are never followed. A redirect is a second request to an
 *     address nobody approved.
 *  6. Time, size and method are capped, and the response is thrown away except
 *     for its status. An addon gets to send, not to fetch: nothing that comes
 *     back can be read into the workspace, so this cannot be turned into a way
 *     to pull an internal page out through a task title.
 */
import { lookup as dnsLookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { LookupAddress } from "node:dns";

/** Long enough for a webhook, short enough that a hung host is not our problem. */
const TIMEOUT_MS = 5_000;

/** We do not use the body, so this only has to be enough to not truncate mid-read. */
const MAX_RESPONSE_BYTES = 8_192;

export interface OutboundResult {
  ok: boolean;
  status?: number;
  /** Said plainly, for the run log an owner reads. */
  detail: string;
}

/**
 * Whether an address is one the public internet could have reached anyway.
 *
 * The rule is a deny list of the ranges that are not routable from outside,
 * because that is the set that matters: an addon reaching a public address is
 * doing what it was approved to do, and an addon reaching any of these is
 * reaching something only our server can see.
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicV4(address);
  if (family === 6) return isPublicV6(address);
  return false;
}

function isPublicV4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;

  if (a === 0) return false; // this network
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier grade NAT
  if (a === 169 && b === 254) return false; // link local, and the metadata endpoint
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 0) return false; // protocol assignments, includes 192.0.0.x
  if (a === 192 && b === 168) return false; // private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function isPublicV6(address: string): boolean {
  const lower = address.toLowerCase().split("%")[0];

  if (lower === "::" || lower === "::1") return false; // unspecified, loopback
  if (lower.startsWith("fe8") || lower.startsWith("fe9")) return false; // link local
  if (lower.startsWith("fea") || lower.startsWith("feb")) return false; // link local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false; // unique local
  if (lower.startsWith("ff")) return false; // multicast

  /*
   * An IPv4 address wearing an IPv6 hat. ::ffff:127.0.0.1 is loopback however
   * it is spelled, and a check that only reads the v6 prefixes would wave it
   * through. Both the mapped and the older compatible forms.
   */
  const embedded = lower.match(/(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) return isPublicV4(embedded[1]);

  // 64:ff9b::/96, the well known prefix for translating v4 through v6.
  if (lower.startsWith("64:ff9b:")) return false;
  if (lower.startsWith("2002:")) return false; // 6to4, wraps a v4 address
  if (lower.startsWith("100::")) return false; // discard only

  return true;
}

/**
 * Every address a name answers with, or a reason not to trust it.
 *
 * All of them, because the check is only worth anything if a single private
 * answer among public ones fails the whole thing.
 */
function resolveAll(hostname: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });
}

export interface OutboundRequest {
  url: string;
  /** Already rendered and serialised. This function never builds JSON. */
  body: string;
  /** The hosts an administrator approved for this addon, lowercased. */
  approvedHosts: readonly string[];
}

/**
 * Sends one request, or explains why it did not.
 *
 * Never throws. A failed send is a line in a run log, not an exception that
 * takes an addon run down, because the run may have other steps that should
 * still happen and the owner needs to be told which part failed.
 */
export async function send({ url, body, approvedHosts }: OutboundRequest): Promise<OutboundResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, detail: "That is not a web address." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, detail: "Blocked: an addon may only send over https." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, detail: "Blocked: the address carried a sign-in." };
  }
  if (parsed.port && parsed.port !== "443") {
    return { ok: false, detail: "Blocked: only the standard port is allowed." };
  }

  const host = parsed.hostname.toLowerCase();

  /*
   * Exact match against what was approved. No suffix matching: allowing
   * "hooks.slack.com" to match anything ending in that string would approve
   * "evilhooks.slack.com" and, worse, "hooks.slack.com.attacker.example".
   */
  if (!approvedHosts.includes(host)) {
    return { ok: false, detail: `Blocked: ${host} has not been approved for this addon.` };
  }

  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    return { ok: false, detail: "Blocked: the message is too large to send." };
  }

  // A literal address gets the same treatment as a resolved one, so
  // https://127.0.0.1 cannot skip the check by never needing a lookup.
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await resolveAll(host)).map((entry) => entry.address);
    } catch {
      return { ok: false, detail: `Could not find ${host}.` };
    }
    if (addresses.length === 0) return { ok: false, detail: `Could not find ${host}.` };
  }

  const privateAddress = addresses.find((address) => !isPublicAddress(address));
  if (privateAddress) {
    return {
      ok: false,
      detail: `Blocked: ${host} points at a private address (${privateAddress}).`,
    };
  }

  return sendPinned(parsed, addresses[0], body, host);
}

/**
 * The request itself, pinned to an address that has already been checked.
 *
 * The pin is the point. Resolving, approving, and then handing the hostname to
 * a client that resolves it again leaves a window where the second answer is a
 * private address, which is the whole of DNS rebinding. Passing our own lookup
 * closes it: the socket goes to the address we validated or nowhere.
 */
function sendPinned(
  url: URL,
  address: string,
  body: string,
  host: string,
): Promise<OutboundResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: OutboundResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const requested = httpsRequest(
      {
        protocol: "https:",
        host,
        port: 443,
        path: url.pathname + url.search,
        method: "POST",
        // Set by us, never by the addon. An addon that could add headers could
        // add an Authorization header and reuse an approved host as a proxy.
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body, "utf8"),
          "User-Agent": "Eterneon-Addon/1",
        },
        // TLS still verifies the certificate against the hostname, so pinning
        // the address does not weaken the identity check: a private address
        // cannot answer for a public name without the matching certificate.
        servername: host,
        lookup: (_hostname, options, callback) => {
          const family = isIP(address);
          if (typeof options === "function") {
            (options as (e: null, a: string, f: number) => void)(null, address, family);
          } else {
            callback(null, address, family);
          }
        },
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const status = response.statusCode ?? 0;

        // A redirect is a request to somewhere nobody approved. Not followed,
        // and reported, because an owner watching a webhook fail deserves to
        // know it was us who stopped rather than the service.
        if (status >= 300 && status < 400) {
          requested.destroy();
          done({ ok: false, status, detail: "Blocked: the service redirected elsewhere." });
          return;
        }

        // Read and discard, with a cap. Nothing that comes back is ever
        // returned to the workspace, so an addon cannot read an outside page
        // into a task.
        let seen = 0;
        response.on("data", (chunk: Buffer) => {
          seen += chunk.length;
          if (seen > MAX_RESPONSE_BYTES) response.destroy();
        });
        response.on("end", () =>
          done(
            status >= 200 && status < 300
              ? { ok: true, status, detail: `Sent to ${host}.` }
              : { ok: false, status, detail: `${host} answered ${status}.` },
          ),
        );
        response.on("error", () => done({ ok: true, status, detail: `Sent to ${host}.` }));
      },
    );

    requested.on("timeout", () => {
      requested.destroy();
      done({ ok: false, detail: `${host} did not answer within ${TIMEOUT_MS / 1000} seconds.` });
    });
    requested.on("error", () => done({ ok: false, detail: `Could not reach ${host}.` }));

    requested.end(body);
  });
}
