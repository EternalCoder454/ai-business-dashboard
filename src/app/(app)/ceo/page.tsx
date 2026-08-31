"use client";

import { Suspense } from "react";
import { ChatView } from "@/components/ChatView";
import { CEO_ID } from "@/lib/seed";

export default function CeoOfficePage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <ChatView departmentId={CEO_ID} />
    </Suspense>
  );
}
