import type { ReactNode } from "react";

import { TaskQueueHost } from "@/components/workbench/task-queue";

export default function ImportLayout({ children }: { children: ReactNode }) {
  return <TaskQueueHost defaultDomain="extraction">{children}</TaskQueueHost>;
}
