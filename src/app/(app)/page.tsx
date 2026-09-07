import { DashboardPage } from "@/components/DashboardPage";
import { loadDashboardPreview } from "@/lib/dashboardPreview";

/**
 * The dashboard.
 *
 * A server component whose only job is to read the two panes that were the last
 * thing on the screen to fill in, so they go out with the markup rather than
 * arriving a second and a half later. Everything else is the client component
 * below, which is what this whole file used to be.
 */
export default async function Page() {
  const preview = await loadDashboardPreview();
  return <DashboardPage preview={preview} />;
}
