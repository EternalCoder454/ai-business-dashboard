import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Only these addresses may sign in. Google authenticates the person; this
 * decides whether that person is allowed in at all, which is what makes a
 * public deployment safe to leave on the internet.
 */
/**
 * Splits an address list on commas, newlines, semicolons, or spaces.
 *
 * A dashboard's environment field is a textarea, so writing one address a line
 * is the obvious guess. Accepting only commas would turn that guess into a
 * lockout, or worse, into an allowlist that silently matches nobody.
 */
export function parseEmailList(value: string | undefined, fallback = ""): string[] {
  return (value ?? fallback)
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The operator's own addresses, which are also the only ones that can sign in
 * without an invitation.
 *
 * There used to be a second list, ALLOWED_EMAILS, from when a workspace was a
 * person and getting in and being in charge were the same act. Everybody else
 * now arrives through a row in the access table that names the workspace they
 * belong to, so a separate allowlist was two answers to one question.
 *
 * No default. It used to fall back to one hardcoded address, which is a
 * stranger's deployment quietly trusting the person who wrote it.
 */
export const OPERATOR_EMAILS = parseEmailList(process.env.OPERATOR_EMAILS);

/**
 * Auth turns itself on only once it is configured. Without the Google
 * credentials the app runs exactly as it does today, so local development does
 * not need an OAuth client just to open a chat.
 */
export const authEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: authEnabled ? [Google] : [],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    /**
     * Two allowlists, and the environment one wins.
     *
     * The table is how people are actually invited, from Admin, without a
     * redeploy. ALLOWED_EMAILS stays because it is the way back in: if the
     * table is empty, someone revokes the wrong row, or Neon is unreachable at
     * the moment you try to sign in, an address in the environment still gets
     * through. Checking it first also means the owner's sign-in never waits on
     * a query.
     *
     * The database module is imported here rather than at the top of the file
     * so that the proxy, which imports this on every request, does not pull a
     * Postgres client into a check it never performs.
     */
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      // Google verifies the address; an unverified one is not an identity.
      if (!email || profile?.email_verified === false) return false;
      const { isAllowed, markSignedIn, nobodyHasAccess } = await import("@/db/access");

      if (OPERATOR_EMAILS.includes(email)) {
        // Recorded for the operator too. Their row said "never signed in"
        // while they were reading it, which is a confusing thing for a screen
        // to tell you about yourself.
        await markSignedIn(email);
        return true;
      }

      if (await isAllowed(email)) {
        await markSignedIn(email);
        return true;
      }

      /*
       * First run: an install with no operator configured and nobody in the
       * access table belongs to whoever signs in first, and they become its
       * operator.
       *
       * Without this, a deployment with OPERATOR_EMAILS unset can be signed
       * in to by nobody at all, which is a locked door with the key inside.
       * The window closes the moment the first row exists.
       */
      if (OPERATOR_EMAILS.length === 0 && (await nobodyHasAccess())) {
        await markSignedIn(email);
        return true;
      }

      return false;
    },
    jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email;
      // Kept so the account page can show a name and avatar without a second
      // call to Google on every load.
      if (profile?.name) token.name = profile.name;
      if (typeof profile?.picture === "string") token.picture = profile.picture;
      if (typeof profile?.given_name === "string") {
        token.givenName = profile.given_name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.email) session.user.email = token.email;
        if (token.name) session.user.name = token.name;
        if (token.picture) session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
