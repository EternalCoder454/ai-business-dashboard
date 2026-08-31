"use client";

import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { Button, PageHeader, PlusIcon, UsersIcon } from "@/components/ui";
import { conversationHref } from "@/lib/routes";
import { CEO_ID } from "@/lib/seed";
import { useStore } from "@/lib/store";

export default function DashboardPage() {
  const router = useRouter();
  const { ready, createConversation, settings, memory } = useStore();

  const live = memory.filter((entry) => !entry.archived).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Dashboard"
        title={settings.companyName}
        description={
          // Counting before the workspace has loaded reads as zero for the
          // length of one fetch, on the page most refreshes land on.
          ready
            ? live > 0
              ? `Working from ${live} recorded fact${live === 1 ? "" : "s"} about the business.`
              : "Nothing recorded about the business yet, so every head is answering from the Company Profile alone."
            : " "
        }
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
              New conversation
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Dashboard />
      </div>
    </div>
  );
}
