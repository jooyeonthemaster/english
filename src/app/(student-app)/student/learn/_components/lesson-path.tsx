"use client";

import { cn } from "@/lib/utils";
import type { LessonItem } from "@/lib/learning-types";
import { LessonNode } from "./lesson-node";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface LessonPathProps {
  lessons: LessonItem[];
  seasonId: string;
}

// ---------------------------------------------------------------------------
// SVG Connector between two nodes
// ---------------------------------------------------------------------------
function Connector({ completed }: { completed: boolean }) {
  return (
    <div className="flex justify-center w-full h-8 -my-1">
      <svg width="60" height="32" viewBox="0 0 60 32" fill="none">
        <path
          d="M30 0 C30 12, 30 20, 30 32"
          stroke={completed ? "var(--student-success)" : "var(--student-locked)"}
          strokeWidth={completed ? 3 : 2}
          strokeDasharray={completed ? "none" : "6 4"}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main path
// ---------------------------------------------------------------------------
export function LessonPath({ lessons, seasonId }: LessonPathProps) {
  if (lessons.length === 0) return null;

  return (
    <div className="relative flex flex-col items-center py-[var(--space-md)]">
      {lessons.map((lesson, i) => (
        <div key={lesson.passageId} className="w-full">
          {/* Connector line */}
          {i > 0 && <Connector completed={!lesson.isLocked} />}

          {/* Node — S-curve offset */}
          <div
            className={cn(
              "flex w-full",
              i % 3 === 0
                ? "justify-center"
                : i % 3 === 1
                  ? "justify-start pl-[18%]"
                  : "justify-end pr-[18%]",
            )}
          >
            <LessonNode lesson={lesson} index={i} seasonId={seasonId} />
          </div>
        </div>
      ))}
    </div>
  );
}
