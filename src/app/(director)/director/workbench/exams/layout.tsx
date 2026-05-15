import type { ReactNode } from "react";

import { TaskQueueHost } from "@/components/workbench/task-queue";

export default function ExamGenerationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TaskQueueHost defaultDomain="exam-generation">{children}</TaskQueueHost>
  );
}
