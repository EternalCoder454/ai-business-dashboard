"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "@/components/ChatView";

export default function DepartmentChatPage() {
  const params = useParams<{ id: string }>();
  const departmentId = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <Suspense fallback={<div className="flex-1" />}>
      <ChatView key={departmentId} departmentId={departmentId} />
    </Suspense>
  );
}
