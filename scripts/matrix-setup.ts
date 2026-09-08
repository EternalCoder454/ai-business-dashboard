/**
 * Everything the homeserver needs from the panel, and a check that it worked.
 *
 * Two jobs, because they are the two halves of standing this up and doing
 * either without the other is where the afternoon goes:
 *
 *   npm run matrix-setup            prints the registration file to paste onto
 *                                   the server, with fresh tokens
 *   npm run matrix-setup -- check   asks the homeserver who the panel is
 *
 * The tokens are generated here rather than typed, because they are the whole
 * security of the arrangement: as_token lets the holder speak as anybody in the
 * namespace, and hs_token lets the holder feed the panel events claiming to be
 * from anybody. Two lines of a config file is not a place to be creative.
 */
import { randomBytes } from "node:crypto";
import {
  appserviceToken,
  botLocalpart,
  homeserverToken,
  homeserverUrl,
  matrixConfigured,
  serverName,
} from "../src/lib/matrix/config";
import { userNamespaceRegex } from "../src/lib/matrix/ids";
import { failed, whoami } from "../src/lib/matrix/client";

const token = () => randomBytes(32).toString("hex");

function registration(): void {
  const server = serverName() || "example.com";
  const url = process.env.PANEL_URL?.trim() || "https://business.eterneon.net";

  const as = appserviceToken() || token();
  const hs = homeserverToken() || token();

  console.log(`
# ------------------------------------------------------------------
# eterneon.yaml
#
# Put this on the homeserver, then name it in homeserver.yaml:
#
#   app_service_config_files:
#     - /data/eterneon.yaml
#
# and restart Synapse. Registration is a file rather than an API call
# on purpose: it hands out the right to act as every user in the
# namespace, so it is meant to cost somebody an ssh session.
# ------------------------------------------------------------------

id: eterneon-panel
url: ${url}/api/matrix
as_token: "${as}"
hs_token: "${hs}"
sender_localpart: ${botLocalpart()}

namespaces:
  users:
    # Exclusive: nobody but the panel may register a user that looks like
    # this, which is what stops somebody claiming a colleague's id.
    - exclusive: true
      regex: "${userNamespaceRegex(server)}"
  aliases: []
  rooms: []

# The panel makes its rooms itself and never publishes an alias, so it
# does not need to answer for a namespace of them.

# ------------------------------------------------------------------
# And the panel's own side. These belong in .env.local, and the two
# tokens must match the file above exactly.
# ------------------------------------------------------------------

MATRIX_HOMESERVER_URL=${homeserverUrl() || "https://matrix.example.com"}
MATRIX_SERVER_NAME=${server}
MATRIX_AS_TOKEN=${as}
MATRIX_HS_TOKEN=${hs}
MATRIX_BOT_LOCALPART=${botLocalpart()}
# Off until the round trip is proven. See matrix-setup -- check.
MATRIX_DUAL_WRITE=off
`);

  if (!matrixConfigured()) {
    console.log(
      "Nothing is set yet, so the tokens above are new. Setting them and running\n" +
        "this again prints the same file, which is what you want when the server\n" +
        "has one copy and .env.local has the other.\n",
    );
  }
}

async function check(): Promise<void> {
  if (!matrixConfigured()) {
    console.log(
      "\nNot configured. MATRIX_HOMESERVER_URL, MATRIX_SERVER_NAME, MATRIX_AS_TOKEN\n" +
        "and MATRIX_HS_TOKEN all have to be set before there is anything to check.\n",
    );
    process.exit(1);
  }

  console.log(`\nasking ${homeserverUrl()} who we are`);
  const said = await whoami();

  if (failed(said)) {
    console.log(`  FAIL ${said.error}${said.status ? ` (${said.status})` : ""}`);
    console.log(
      "\nThe usual three, in the order they go wrong:\n" +
        "  the panel is not reachable from the homeserver, so registration failed\n" +
        "  as_token in .env.local does not match the one in the registration file\n" +
        "  Synapse was not restarted after the file was added\n",
    );
    process.exit(1);
  }

  console.log(`  ok   the homeserver knows us as ${said.user_id}`);
  console.log("\nThe outbound half works. The inbound half is proven by a real");
  console.log("message, since the homeserver only pushes when there is something");
  console.log("to push.\n");
}

const mode = process.argv[2];
if (mode === "check") void check();
else registration();
