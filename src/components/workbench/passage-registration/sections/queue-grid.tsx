"use client";

import { PassageQueueCard } from "@/components/workbench/passage-queue-card";
import type { QueuedPassage } from "@/hooks/use-passage-queue";

export type QueueGridCols = "grid3" | "grid2" | "list";

interface QueueGridProps {
  filteredQueue: QueuedPassage[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onViewDetail: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  gridCols?: QueueGridCols;
}

const GRID_CLASS: Record<QueueGridCols, string> = {
  grid3: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
  grid2: "grid grid-cols-1 gap-4 sm:grid-cols-2",
  list: "grid grid-cols-1 gap-3",
};

export function QueueGrid({
  filteredQueue,
  selectedIds,
  onToggleSelect,
  onViewDetail,
  onRetry,
  onRemove,
  gridCols = "grid3",
}: QueueGridProps) {
  return (
    <div className={GRID_CLASS[gridCols]}>
      {filteredQueue.map((passage) => (
        <PassageQueueCard
          key={passage.id}
          passage={passage}
          selected={selectedIds.has(passage.id)}
          onToggleSelect={onToggleSelect}
          onViewDetail={onViewDetail}
          onRetry={onRetry}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
