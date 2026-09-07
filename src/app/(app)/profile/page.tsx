import { redirect } from "next/navigation";

/**
 * The Company Profile lives in Settings now, as a tab.
 *
 * Kept as a route rather than deleted: it was in the account menu, the tour,
 * the command palette and the documentation, and anybody who bookmarked it
 * should land where it went rather than on a 404.
 */
export default function CompanyProfilePage() {
  redirect("/settings?tab=profile");
}
