"use client";

import type { CompiledCustomType } from "@/lib/custom-question-types/types";

import { AiAssistant } from "./ai-assistant";
import { LivePreview } from "./live-preview";
import { SpecControls } from "./spec-controls";

// 스튜디오 — 좌: 스펙 컨트롤 / 중앙: 라이브 미리보기 / 우: AI 어시스턴트.
// 좁은 화면(lg 미만)은 세로 스택으로 떨어진다.

export function StudioView({
  typeId,
  spec,
  onSpecChange,
}: {
  typeId: string;
  spec: CompiledCustomType;
  onSpecChange: (next: CompiledCustomType) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:h-full lg:w-[340px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <SpecControls spec={spec} onChange={onSpecChange} />
      </aside>

      <main className="min-h-[480px] min-w-0 flex-1 bg-slate-100/60 lg:h-full lg:overflow-y-auto">
        <LivePreview typeId={typeId} spec={spec} />
      </main>

      <aside className="flex h-[440px] w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:h-full lg:w-[320px] lg:border-l lg:border-t-0">
        <AiAssistant typeId={typeId} spec={spec} onSpecChange={onSpecChange} />
      </aside>
    </div>
  );
}
