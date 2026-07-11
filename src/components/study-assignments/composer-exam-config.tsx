"use client";

// ============================================================================
// 과제 컴포저 — EXAM 응시 설정 (응시 모드 + 제한시간 오버라이드)
//
// 제한시간(분)은 비워 두면 오버라이드 없음(시험지 duration 그대로), 입력 시
// 1~600 클램프 후 createStudyAssignment input.exam.durationMin 으로 전달된다
// (payload.durationMin — /t 응시면이 taking-bridge 로 읽어 세션을 패치).
// 기본값 표시는 getExamAssignPreview 의 duration 을 재사용한다 — 실물
// 미리보기 패널과 같은 액션이라 쿼리가 중복되지만, 모듈 캐시로 같은
// 시험지는 세션당 1회만 조회한다(전용 경량 액션 신설은 소유권 밖).
// ============================================================================

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { getExamAssignPreview } from "@/actions/study-assignments";
import { cn } from "@/lib/utils";

/** examId → 시험지 기본 제한시간(분) 캐시 — 컴포저 재오픈 시 재조회 방지 */
const examDurationCache = new Map<string, number | null>();

export function ComposerExamConfig({
  examId,
  examMode,
  onExamModeChange,
  durationMin,
  onDurationMinChange,
}: {
  /** 선택된 시험지 id — 없으면 기본 제한시간 표시 생략 */
  examId: string | null;
  examMode: "TABLET" | "OMR";
  onExamModeChange: (mode: "TABLET" | "OMR") => void;
  /** 입력 원문(string) — 빈 문자열 = 오버라이드 없음, 제출 시 부모가 클램프 */
  durationMin: string;
  onDurationMinChange: (value: string) => void;
}) {
  const [baseDuration, setBaseDuration] = useState<number | null>(
    examId ? (examDurationCache.get(examId) ?? null) : null,
  );

  useEffect(() => {
    if (!examId) {
      setBaseDuration(null);
      return;
    }
    if (examDurationCache.has(examId)) {
      setBaseDuration(examDurationCache.get(examId) ?? null);
      return;
    }
    let alive = true;
    getExamAssignPreview(examId)
      .then((res) => {
        const d = res.success && res.data ? res.data.duration : null;
        examDurationCache.set(examId, d);
        if (alive) setBaseDuration(d);
      })
      .catch(() => {
        // 기본값 표시는 보조 정보 — 실패해도 입력 자체는 유효하다.
      });
    return () => {
      alive = false;
    };
  }, [examId]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-slate-500">응시 모드</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["TABLET", "태블릿 응시", "화면에서 문제를 보고 풉니다"],
              ["OMR", "OMR 입력", "종이로 풀고 답만 입력합니다"],
            ] as const
          ).map(([mode, label, desc]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={examMode === mode}
              onClick={() => onExamModeChange(mode)}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                examMode === mode
                  ? "border-blue-600 bg-blue-50/60 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "text-[12.5px] font-semibold",
                  examMode === mode ? "text-blue-700" : "text-slate-700",
                )}
              >
                {label}
              </span>
              <span className="text-[11px] text-slate-400">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
          <Timer className="size-3.5" aria-hidden /> 제한시간(분)
          <span className="font-normal text-slate-400">— 비워 두면 시험지 기본값</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={600}
            value={durationMin}
            onChange={(e) => onDurationMinChange(e.target.value)}
            onBlur={() => {
              const raw = durationMin.trim();
              if (raw === "") return;
              const n = Math.round(Number(raw));
              if (!Number.isFinite(n)) {
                onDurationMinChange("");
                return;
              }
              onDurationMinChange(String(Math.max(1, Math.min(600, n))));
            }}
            placeholder={baseDuration ? String(baseDuration) : "제한 없음"}
            aria-label="제한시간(분)"
            className="h-9 w-24 rounded-md border border-slate-200 bg-white px-2 text-center text-[13px] tabular-nums text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
          />
          <p className="text-[11px] text-slate-400">
            {baseDuration
              ? `시험지 기본 ${baseDuration}분`
              : "시험지에 설정된 제한시간 없음"}
            {" · 1~600분"}
          </p>
        </div>
      </div>
    </div>
  );
}
