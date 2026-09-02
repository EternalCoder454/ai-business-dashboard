/**
 * What a message says about itself after you press send.
 *
 * The states are sending, not sent, not seen, seen. The one that needed a test
 * is the third: read state arrives through a watermark rather than a field per
 * message, because the thread poll asks for `sent_at > since` and a message
 * that was already fetched and is then read never appears in that answer
 * again. Get the comparison wrong by one and everything you sent reads as
 * unseen forever, silently, with no error anywhere.
 *
 * Run with: npm run delivery-test
 */
import { deliveryOf, type DirectMessage } from "../src/lib/types";

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures += 1;
}

const ME = "me@example.com";
const THEM = "them@example.com";

const mine = (patch: Partial<DirectMessage> = {}): DirectMessage => ({
  id: "m1",
  fromEmail: ME,
  toEmail: THEM,
  body: "hello",
  sentAt: 1_000,
  ...patch,
});

console.log("receipts are for my own messages only");
check("nothing on theirs", deliveryOf(mine({ fromEmail: THEM, toEmail: ME }), ME, 0) === undefined);
check("nothing when signed out", deliveryOf(mine(), undefined, 0) === undefined);

console.log("in flight");
check("sending", deliveryOf(mine({ local: "sending" }), ME, 0) === "sending");
check("failed", deliveryOf(mine({ local: "failed" }), ME, 0) === "failed");
check(
  "a failure outranks a stale watermark",
  deliveryOf(mine({ local: "failed" }), ME, 9_999) === "failed",
);

console.log("the watermark");
check("nothing read yet", deliveryOf(mine(), ME, 0) === "sent");
check("read up to an older message", deliveryOf(mine({ sentAt: 1_000 }), ME, 999) === "sent");
// The boundary. markThreadRead sets read_at on the row itself, so the newest
// read message has sentAt exactly equal to the watermark: a strict < here
// would leave the most recent one permanently unseen.
check("read up to this exact message", deliveryOf(mine({ sentAt: 1_000 }), ME, 1_000) === "seen");
check("read past it", deliveryOf(mine({ sentAt: 1_000 }), ME, 1_001) === "seen");
check("sent after the mark", deliveryOf(mine({ sentAt: 2_000 }), ME, 1_000) === "sent");

console.log("readAt on the row, for a thread fetched fresh rather than polled");
check("read", deliveryOf(mine({ readAt: 5_000 }), ME, 0) === "seen");
check("unread is null, not zero", deliveryOf(mine({ readAt: undefined }), ME, 0) === "sent");

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
