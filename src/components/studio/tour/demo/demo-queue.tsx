"use client";

// ============================================================================
// 생성 큐 데모 (견본 데모 — 다른 데모의 품질 기준선)
//
// 우측 현황판(aside[data-panel-key="dossier"]) 위 오버레이로 뜨는 목업.
// 실 화면 미러 원장:
// - 행 구성·스피너·배지: passage-dossier-pane.tsx QueueStripRow(:510-604)
// - 스트림 라인 `[stage] tail▍` · 경과 mm:ss: queue-stream-line.tsx(:29-96)
// - 라벨 「기본 학습지 생성 중」 계열: studio-home-client.tsx analysisRunningLabel
// - 완료 넛지 자구: studio-home-client.tsx(:2943-2950) — 실 UI 자구 그대로 인용
// 서버 액션 0 · 스토어 쓰기 0 — setInterval 로만 진행감을 연출한다.
// ============================================================================

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { DemoBadge, DemoFrame, DemoLines } from "./demo-stage";
import {
  DEMO_PASSAGE_TITLE,
  DEMO_QUEUE_STREAM,
  demoFmtElapsed,
} from "./demo-data";

export type DemoQueueVariant = "sheet-running" | "sheet-done" | "questions-running";

function useTicker(intervalMs: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((v) => v + 1), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return n;
}

function StreamLine({ tick }: { tick: number }) {
  // 첫 바퀴는 순서대로, 이후에는 준비 단계를 건너뛰고 순환한다.
  const n = DEMO_QUEUE_STREAM.length;
  const idx = tick < n ? tick : 1 + ((tick - n) % (n - 1));
  const cur = DEMO_QUEUE_STREAM[idx];
  return (
    <div className="flex h-4 min-w-0 items-center gap-1.5 overflow-hidden">
      <span className="truncate text-[11px] text-slate-400">
        <span className="font-semibold text-slate-500">[{cur.stage}]</span> {cur.tail}
        <span className="line-gap-caret">▍</span>
      </span>
    </div>
  );
}

function RunningRow({
  label,
  badges,
  tick,
  seconds,
}: {
  label: string;
  badges: React.ReactNode;
  tick: number;
  seconds: number;
}) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
        <span className="min-w-0 truncate text-[12px] font-semibold text-slate-700">
          {label}
        </span>
        {badges}
        <span className="ml-auto shrink-0 text-[10.5px] font-medium tabular-nums text-slate-400">
          {demoFmtElapsed(seconds)}
        </span>
      </div>
      <div className="mt-1 pl-5">
        <StreamLine tick={tick} />
      </div>
    </div>
  );
}

/** variant 별 캡션 — 완료 상태에 「시작되면」 캡션이 뜨던 시점 불일치 수리. */
const CAPTIONS: Record<DemoQueueVariant, string> = {
  "sheet-running": "예시 화면 — 생성이 시작되면 오른쪽 현황판이 이렇게 움직입니다",
  "questions-running": "예시 화면 — 문제 생성도 오른쪽 현황판에서 이렇게 진행됩니다",
  "sheet-done": "예시 화면 — 생성이 끝나면 오른쪽 현황판에 이렇게 도착합니다",
};

export function DemoQueue({ variant }: { variant: DemoQueueVariant }) {
  const tick = useTicker(1400);
  const seconds = useTicker(1000) + 7; // 방금 시작한 느낌의 오프셋

  return (
    <DemoFrame caption={CAPTIONS[variant]}>
      <div className="space-y-2">
        {/* 지문 카드 헤더 미러 */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0 truncate text-[12px] font-bold text-slate-800">
            {DEMO_PASSAGE_TITLE}
          </span>
          <DemoBadge tone="slate">지문</DemoBadge>
        </div>

        {variant === "sheet-running" ? (
          <>
            <RunningRow
              label="기본 학습지 생성 중"
              badges={<DemoBadge tone="blue">기본 학습지</DemoBadge>}
              tick={tick}
              seconds={seconds}
            />
            <p className="px-1 text-[11px] leading-relaxed text-slate-400 break-keep">
              창을 닫거나 다른 지문을 골라도 생성은 계속됩니다.
            </p>
          </>
        ) : null}

        {variant === "questions-running" ? (
          <>
            {/* CH4 서사 정합(적대검수): 유형 데모 프리셋(객관식 4 + 서술형 2 ·
                난이도 중급)과 수치·난이도를 일치시킨다. 난이도 톤은 실 팔레트
                (lib/difficulty.ts — 기본 blue · 중급 amber · 킬러 rose) 미러. */}
            <RunningRow
              label="수능·모의고사 객관식"
              badges={
                <>
                  <DemoBadge tone="amber">중급</DemoBadge>
                  <DemoBadge tone="slate">4문항</DemoBadge>
                </>
              }
              tick={tick}
              seconds={seconds}
            />
            {/* 둘째 잡은 실 세션 큐처럼 「대기 중」 — 스트림 없이 시계만. */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
                <span className="min-w-0 truncate text-[12px] font-semibold text-slate-600">
                  내신 서술형
                </span>
                <DemoBadge tone="amber">중급</DemoBadge>
                <DemoBadge tone="slate">2문항</DemoBadge>
                <span className="ml-auto shrink-0 text-[10.5px] font-medium text-slate-400">
                  대기 중
                </span>
              </div>
            </div>
          </>
        ) : null}

        {variant === "sheet-done" ? (
          <>
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="min-w-0 truncate text-[12px] font-semibold text-slate-700">
                기본 학습지
              </span>
              <DemoBadge tone="emerald">도착</DemoBadge>
              <span className="ml-auto shrink-0 text-[10.5px] font-medium text-emerald-600">
                방금 완성
              </span>
            </div>
            {/* 완성 학습지 미리보기 목업 */}
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="flex items-center gap-2">
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded border border-slate-200 bg-white p-1">
                  <div className="mb-1 h-1.5 rounded-sm bg-blue-200" />
                  <DemoLines count={6} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-slate-800">
                    {DEMO_PASSAGE_TITLE}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    학습지 · 기본 학습지 · 방금 전
                  </p>
                </div>
              </div>
            </div>
            {/* 실 화면 넛지 미러. ⚠ 실 UI 자구는 「끝났어요」(studio-home-client
                :2947, 선재 §10 위반)지만 투어 표면은 §10 합니다체 계약을 우선한다
                (적대검수 3렌즈 합치 — 실 UI 자구가 개정되면 재동기할 것). */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-2">
              <p className="text-[11.5px] font-bold text-blue-700">학습지 생성이 끝났습니다</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-blue-600/80 break-keep">
                왼쪽 목록에서 학습지를 체크하면 바로 학습지 조판으로 이어집니다
              </p>
            </div>
          </>
        ) : null}
      </div>
    </DemoFrame>
  );
}
