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
import { CEO_ID } from "@/lib/seed";
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
           * One row on a phone rather than two. Both labels plus both icons
           * are wider than 375px, so on compact the pair splits the full width
           * and the icons stand down: the words identify the button.
           *
           * They wrap onto separate lines rather than splitting evenly when the
           * width will not take both. Half of a 320px phone is not enough for
           * "New conversation", which used to break onto a second line inside
           * the button while the shorter one beside it stayed on one, so the
           * pair sat at different heights and read as a mistake. A minimum
           * width and flex-wrap lets the row decide by what actually fits
           * rather than by a breakpoint that has to guess.
           */
          <div className="flex w-full flex-wrap gap-2 medium:w-auto medium:flex-nowrap">
            <Button
              variant="outlined"
              icon={<UsersIcon className="hidden h-4 w-4 medium:block" />}
              className="min-w-[10rem] flex-1 whitespace-nowrap medium:min-w-0 medium:flex-none"
              onClick={() => router.push("/all-hands")}
            >
              New meeting
            </Button>
            <Button
              icon={<PlusIcon className="hidden h-4 w-4 medium:block" />}
              className="min-w-[10rem] flex-1 whitespace-nowrap medium:min-w-0 medium:flex-none"
              onClick={async () => {
                const conversation = await createConversation(CEO_ID);
                router.push(conversationHref(CEO_ID, conversation.id));
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
