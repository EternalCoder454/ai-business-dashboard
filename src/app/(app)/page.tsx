"use client";

import { useRouter } from "next/navigation";
import { OrgChart } from "@/components/OrgChart";
import { Button, PageHeader, PlusIcon, UsersIcon } from "@/components/ui";
import { conversationHref } from "@/lib/routes";
import { CEO_ID } from "@/lib/seed";
import { useStore } from "@/lib/store";

export default function OrgChartPage() {
  const router = useRouter();
  const { createConversation, departments, settings } = useStore();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Org chart"
        title={settings.companyName}
        description={`One CEO orchestrator over ${departments.length} department${
          departments.length === 1 ? "" : "s"
        }. Tap a head to open a workspace that already knows its domain.`}
        actions={
          <>
            <Button
              variant="outlined"
              icon={<UsersIcon className="h-4 w-4" />}
              onClick={() => router.push("/all-hands")}
            >
              Ask everyone
            </Button>
            <Button
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={async () => {
                const conversation = await createConversation(CEO_ID);
                router.push(conversationHref(CEO_ID, conversation.id));
              }}
            >
              Brief the CEO
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OrgChart />
      </div>
    </div>
  );
}
