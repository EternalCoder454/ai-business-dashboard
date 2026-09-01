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

export const ALLOWED_EMAILS = parseEmailList(
  process.env.ALLOWED_EMAILS,
  "eternalhell@eterneon.net",
);

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
      if (ALLOWED_EMAILS.includes(email)) return true;

      const { isAllowed, markSignedIn } = await import("@/db/access");
      if (!(await isAllowed(email))) return false;
      await markSignedIn(email);
      return true;
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
