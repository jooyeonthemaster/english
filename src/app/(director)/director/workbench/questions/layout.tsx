import type { ReactNode } from "react";

import { TaskQueueHost } from "@/components/workbench/task-queue";

export default function QuestionGenerationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TaskQueueHost defaultDomain="question-generation">{children}</TaskQueueHost>
  );
}
