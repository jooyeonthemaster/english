"use client";

// ============================================================================
// 문항 분석 — 모바일 전용 스텝 플로우(시안 A). **PC 화면은 절대 건드리지 않는다**:
// 이 트리는 전부 `lg:hidden` 이고, 데스크톱 트리는 `hidden lg:*` 로 분기한다.
//
// 데스크톱(시안 B)은 표가 주인공이지만, 모바일에서 같은 표를 쓰면 가로스크롤 +
// 표 내부 세로스크롤 + 페이지 스크롤로 **스크롤 축이 3개**가 된다(이 페이지의 최대
// 모바일 부채였다). 그래서 모바일은 "한 화면 한 기능" 방침대로 분해한다:
//   ① 정답·배점(확인 게이트) → ② 분석 검수(선택) → ③ 학생 관리
// 문항은 카드 1장씩만 펼쳐 한 문항씩 확인하며 내려간다.
// ============================================================================

import { ChevronDown, Image as ImageIcon, Check, RotateCw } from "lucide-react";
import type {
  ExamMapEntry,
  ExamQuestionKind,
  QuestionAnalysis,
} from "@/lib/exam-report/types";
import { cn } from "@/lib/utils";

const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

const KIND_LABEL: Record<ExamQuestionKind, string> = {
  MC: "객관식",
  SHORT: "단답형",
  ESSAY: "서술형",
};

/** 배점 프리셋 — 내신 배점은 2~5점이 대부분이라 탭 한 번으로 끝내게 한다. */
const POINT_PRESETS = [2, 3, 4, 5];

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

interface MobileMapFlowProps {
  entries: ExamMapEntry[];
  confirmedNumbers: string[];
  grandfathered: boolean;
  failedNumbers: string[];
  analysisByNumber: Map<string, QuestionAnalysis>;
  disabled: boolean;
  /** 현재 펼쳐진 문항(없으면 첫 미확인) */
  openNumber: string | null;
  onOpenNumber: (number: string | null) => void;
  onEdit: (number: string, patch: Partial<ExamMapEntry>) => void;
  onToggleConfirm: (numbers: string[], confirmed: boolean) => void;
  onOpenSource: () => void;
  onReanalyze: (number: string) => void;
}

/** ① 정답·배점 — 카드 1장씩 확인하며 내려간다. */
export function MobileMapFlow({
  entries,
  confirmedNumbers,
  grandfathered,
  failedNumbers,
  disabled,
  openNumber,
  onOpenNumber,
  onEdit,
  onToggleConfirm,
  onOpenSource,
  onReanalyze,
}: MobileMapFlowProps) {
  const confirmedSet = new Set(confirmedNumbers.map(numberKey));
  const failedSet = new Set(failedNumbers.map(numberKey));
  const isConfirmed = (e: ExamMapEntry) =>
    grandfathered || confirmedSet.has(numberKey(e.number));

  const sorted = [...entries].sort((a, b) => a.order - b.order);
  const entered = sorted.filter((e) => e.points != null);
  const partialSum = round2(entered.reduce((s, e) => s + (e.points ?? 0), 0));
  const missing = sorted.length - entered.length;

  // 열린 카드가 없으면 첫 미확인 문항을 연다.
  const effectiveOpen =
    openNumber ?? sorted.find((e) => !isConfirmed(e))?.number ?? null;

  const confirmAndNext = (e: ExamMapEntry) => {
    if (!isConfirmed(e)) onToggleConfirm([e.number], true);
    const idx = sorted.findIndex((x) => x.number === e.number);
    const next = sorted.slice(idx + 1).find((x) => !isConfirmed(x));
    onOpenNumber(next?.number ?? null);
  };

  return (
    <div className="flex flex-col gap-2.5 lg:hidden">
      {/* 합계 스트립 — 입력분만 먼저 합산(표시 전용) */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <span className="text-[14px] font-extrabold tabular-nums text-slate-900">
          합계 {partialSum}점
        </span>
        {missing > 0 && (
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-blue-700">
            미입력 {missing}
          </span>
        )}
        <span className="ml-auto text-[11px] text-slate-400">
          한 문항씩 검수하며 진행
        </span>
      </div>

      {sorted.map((e) => {
        const open = effectiveOpen === e.number;
        const confirmed = isConfirmed(e);
        const failed = failedSet.has(numberKey(e.number));
        return (
          <div
            key={e.number}
            data-map-card={e.number}
            className={cn(
              "overflow-hidden rounded-xl border bg-white shadow-sm",
              open
                ? "border-blue-400 ring-2 ring-blue-200"
                : "border-slate-200",
            )}
          >
            {/* 헤더 — 접힘 상태에선 요약, 탭하면 펼침 */}
            <button
              type="button"
              onClick={() => onOpenNumber(open ? null : e.number)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  failed
                    ? "bg-rose-500"
                    : confirmed
                      ? "bg-emerald-500"
                      : "bg-blue-500",
                )}
              />
              {/* 번호 칩 nowrap + 자동폭 — "서답형 3" 류 다글자 번호 대응 */}
              <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 text-[11.5px] font-bold tabular-nums text-slate-700">
                {e.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold text-slate-800">
                  {e.typeLabel || "유형 미상"}
                </span>
                <span className="block truncate text-[10.5px] text-slate-400">
                  {open ? (
                    <span style={{ fontFamily: EXAM_FONT }}>{e.brief}</span>
                  ) : (
                    <>
                      배점 {e.points ?? "—"} · 정답 {e.correctAnswer || "—"}
                    </>
                  )}
                </span>
              </span>
              {failed && (
                <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-700">
                  실패
                </span>
              )}
              {!open && (
                <ChevronDown className="size-4 shrink-0 text-slate-400" />
              )}
            </button>

            {open && (
              <div className="border-t border-slate-100 p-3">
                {failed ? (
                  <div className="py-2 text-center">
                    <p className="text-[12px] text-slate-500">
                      분석에 실패한 문항이에요. 다시 분석해도 추가 크레딧이 들지
                      않습니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => onReanalyze(e.number)}
                      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-300/45 bg-white px-3 text-[12px] font-bold text-blue-600"
                    >
                      <RotateCw className="size-3.5" />
                      재분석 · 무료
                    </button>
                  </div>
                ) : (
                  <>
                    {/* 종류 — 세그먼트(white-active) */}
                    <Row label="종류">
                      <div className="flex h-9 flex-1 gap-0.5 rounded-lg bg-slate-100 p-0.5">
                        {(["MC", "SHORT", "ESSAY"] as ExamQuestionKind[]).map(
                          (k) => (
                            <button
                              key={k}
                              type="button"
                              disabled={disabled}
                              aria-pressed={e.kind === k}
                              onClick={() => onEdit(e.number, { kind: k })}
                              className={cn(
                                "flex-1 rounded-md text-[12px] font-semibold transition-colors",
                                e.kind === k
                                  ? "bg-white text-blue-700 shadow-sm"
                                  : "text-slate-500",
                              )}
                            >
                              {KIND_LABEL[k]}
                            </button>
                          ),
                        )}
                      </div>
                    </Row>

                    {/* 배점 — 직접 입력 + 프리셋 칩 */}
                    <Row label="배점">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        disabled={disabled}
                        value={e.points ?? ""}
                        onChange={(ev) => {
                          const v = ev.target.value.trim();
                          const n = v === "" ? null : Math.max(0, Number(v));
                          onEdit(e.number, {
                            points: n != null && Number.isFinite(n) ? n : null,
                          });
                        }}
                        placeholder="0"
                        className={cn(
                          "h-9 w-[76px] shrink-0 rounded-lg border bg-white px-2 text-right text-[13px] font-bold tabular-nums text-slate-800 outline-none focus:border-blue-400",
                          e.points == null
                            ? "border-blue-300 bg-blue-50/50 placeholder:font-semibold placeholder:text-blue-400"
                            : "border-slate-200",
                        )}
                      />
                      <div className="flex flex-1 gap-1.5">
                        {POINT_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            disabled={disabled}
                            onClick={() => onEdit(e.number, { points: p })}
                            className="h-7 flex-1 rounded-full border border-slate-200 bg-white text-[11.5px] font-bold text-slate-600 active:border-blue-400 active:bg-blue-50 active:text-blue-700"
                          >
                            {p}점
                          </button>
                        ))}
                      </div>
                    </Row>

                    {/* 정답 */}
                    <Row label="정답">
                      <input
                        type="text"
                        disabled={disabled}
                        value={e.correctAnswer ?? ""}
                        onChange={(ev) =>
                          onEdit(e.number, {
                            correctAnswer: ev.target.value || undefined,
                          })
                        }
                        placeholder={e.kind === "MC" ? "1~5" : "모범답"}
                        className={cn(
                          "h-9 w-full rounded-lg border bg-white px-2.5 text-[13px] text-slate-800 outline-none focus:border-blue-400",
                          !e.correctAnswer
                            ? "border-blue-300 bg-blue-50/50 placeholder:font-semibold placeholder:text-blue-400"
                            : "border-slate-200",
                        )}
                      />
                    </Row>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={onOpenSource}
                        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600"
                      >
                        <ImageIcon className="size-3.5" />
                        원본
                      </button>
                      {/* 확인 = 초록(검수 액션 색 규칙) → 자동으로 다음 미확인 카드 */}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => confirmAndNext(e)}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-[13px] font-bold text-white active:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="size-3.5" strokeWidth={3} />
                        {confirmed ? "검수됨 · 다음" : "검수하고 다음"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2 last:mb-0">
      <span className="w-8 shrink-0 text-[11px] font-bold text-slate-500">
        {label}
      </span>
      {children}
    </div>
  );
}
