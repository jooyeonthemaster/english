import type { ReactNode } from "react";

import { TaskQueueHost } from "@/components/workbench/task-queue";

export default function PassageAnalysisLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TaskQueueHost defaultDomain="passage-analysis">{children}</TaskQueueHost>
  );
}
