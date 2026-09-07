import { redirect } from "next/navigation";

/**
 * Integrations lives in Settings now, as a tab. See the profile route beside
 * this one for why the address is kept rather than removed.
 */
export default function IntegrationsPage() {
  redirect("/settings?tab=integrations");
}
