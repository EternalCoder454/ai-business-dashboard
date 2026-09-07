"use client";

import { PageHeader } from "@/components/PageHeader";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import {
  Button,
  PlusIcon,
  UsersIcon,
} from "@/components/ui";
import { conversationHref } from "@/lib/routes";
import { ORCHESTRATOR_ID } from "@/lib/seed";
import { useStore } from "@/lib/store";

export default function DashboardPage() {
  const router = useRouter();
  const { createConversation, settings } = useStore();


  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Dashboard"
        title={settings.companyName}
        actions={
          /*
           * Not on a phone.
           *
           * These are the third way to the same two places. The bottom bar has
           * Heads, whose sheet opens a head, and Meetings, whose list has "New
           * meeting" as its first row, so both are one tap away already. In
           * return they were taking a fifth of an 812px screen above the fold,
           * and the comment they replaced is a record of how much work it took
           * to make them fit at all: an icon that hid itself, a minimum width,
           * and flex-wrap, because half of a 320px phone will not hold "New
           * conversation" and the pair sat at different heights when it broke.
           * None of that is needed for a row that is simply not there.
           */
          <div className="hidden gap-2 medium:flex">
            <Button
              variant="outlined"
              icon={<UsersIcon className="h-4 w-4" />}
              className="whitespace-nowrap"
              onClick={() => router.push("/meetings")}
            >
              New meeting
            </Button>
            <Button
              icon={<PlusIcon className="h-4 w-4" />}
              className="whitespace-nowrap"
              onClick={async () => {
                const conversation = await createConversation(ORCHESTRATOR_ID);
                router.push(conversationHref(ORCHESTRATOR_ID, conversation.id));
              }}
            >
              New conversation
            </Button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Dashboard />
      </div>
    </div>
  );
}
