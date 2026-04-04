"use client";

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
// 지문 카드 리스트 (기존 S-커브 → 카드 그리드)
// ---------------------------------------------------------------------------
export function LessonPath({ lessons, seasonId }: LessonPathProps) {
  if (lessons.length === 0) return null;

  return (
    <div className="space-y-3 px-4 py-4">
      {lessons.map((lesson, i) => (
        <LessonNode key={lesson.passageId} lesson={lesson} index={i} seasonId={seasonId} />
      ))}
    </div>
  );
}
