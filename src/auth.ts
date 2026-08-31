import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Only these addresses may sign in. Google authenticates the person; this
 * decides whether that person is allowed in at all, which is what makes a
 * public deployment safe to leave on the internet.
 */
export const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "eternalhell@eterneon.net")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

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
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      // Google verifies the address; an unverified one is not an identity.
      if (!email || profile?.email_verified === false) return false;
      return ALLOWED_EMAILS.includes(email);
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
