import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ALLOWED_EMAILS, auth, authEnabled, signIn } from "@/auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;

  // Nothing to sign in to when auth is not configured.
  if (!authEnabled) redirect("/");

  const session = await auth();
  if (session?.user) redirect(from || "/");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-primary-container text-on-primary-container shadow-e2">
          <span className="text-lg font-semibold tracking-tight">HQ</span>
        </div>

        <h1 className="md-headline">Eterneon</h1>
        <p className="md-body mt-2 text-on-variant">
          This is a private workspace. Sign in with the Google account it belongs to.
        </p>

        {error ? (
          <p className="md-label mt-5 rounded-xl border border-error/30 bg-error-container/20 px-4 py-3 text-error">
            {error === "AccessDenied"
              ? "That account is not on the allowlist for this workspace."
              : "Sign in did not complete. Try again."}
          </p>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: from || "/" });
          }}
        >
          <button
            type="submit"
            className="md-state mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-primary px-6 text-on-primary shadow-e1"
          >
            <GoogleMark />
            <span className="md-label">Continue with Google</span>
          </button>
        </form>

        <p className="md-label-sm mt-6 text-on-variant/75">
          {ALLOWED_EMAILS.length === 1
            ? `Only ${ALLOWED_EMAILS[0]} can get in.`
            : `${ALLOWED_EMAILS.length} accounts are allowed.`}
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.98h5.35c-.23 1.5-1.72 4.4-5.35 4.4a6.2 6.2 0 0 1 0-12.4c1.77 0 2.96.76 3.64 1.41l2.48-2.39C16.53 3.6 14.48 2.7 12 2.7a9.3 9.3 0 1 0 0 18.6c5.37 0 8.92-3.77 8.92-9.08 0-.61-.07-1.07-.16-1.53Z"
      />
    </svg>
  );
}
