import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div>
        <p className="md-label-sm text-primary">404</p>
        <h1 className="md-headline mt-1">That page does not exist</h1>
        <p className="md-body mx-auto mt-2 max-w-sm text-on-variant">
          The department may have been renamed or removed in Settings.
        </p>
        <Link
          href="/"
          className="md-label mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-on-primary"
        >
          Back to the org chart
        </Link>
      </div>
    </div>
  );
}
