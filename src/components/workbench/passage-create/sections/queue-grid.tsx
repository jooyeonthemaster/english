"use client";

import { PassageQueueCard } from "@/components/workbench/passage-queue-card";
import type { QueuedPassage } from "@/hooks/use-passage-queue";

interface QueueGridProps {
  filteredQueue: QueuedPassage[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onViewDetail: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

export function QueueGrid({
  filteredQueue,
  selectedIds,
  onToggleSelect,
  onViewDetail,
  onRetry,
  onRemove,
}: QueueGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
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
