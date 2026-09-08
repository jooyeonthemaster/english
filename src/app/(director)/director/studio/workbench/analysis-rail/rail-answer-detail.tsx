"use client";

// ============================================================================
// 답안지 2차 화면 — 번호를 눌렀을 때만 펴는 **판정 근거 + 예외 처리**
// (rail-answer-sheet.tsx 에서 분리, 500줄 상한).
//
// 1차 화면(답안지 한 줄)은 「학생이 고른 답」만 받는다. 여기가 드는 것은 **버블로
// 표현할 수 없는 것뿐**이다(26-09-05 정리):
//   · 서답형의 모범답안·허용 변형 — 객관식 정답은 격자에 옅은 초록으로 이미 있다.
//   · △부분일 때의 부분점수 입력.
// 유형·배점 칩, 발문, 정오 4상태 토글은 전부 걷어냈다(사용자 지시) — 유형/발문은
// 채점에 쓰이지 않았고, 정오는 버블(객관식)과 행 토글(서답형)이 이미 정한다.
// ============================================================================

import type { ExamReviewQuestion } from "@/components/exam-report/ui-contracts";
import type { ExamMapEntry, StudentResponse } from "@/lib/exam-report/types";

/** 판정 근거(발문·정답·허용 변형) + 수동 정오·부분점수. */
export function RailAnswerDetail({
  response,
  entry,
  review,
  hasReviewItems,
  editable,
  onPatch,
}: {
  response: StudentResponse;
  entry: ExamMapEntry | null;
  review: ExamReviewQuestion | null;
  hasReviewItems: boolean;
  editable: boolean;
  onPatch: (number: string, partial: Partial<StudentResponse>) => void;
}) {
  // 정답 2소스: examMap 우선, 없으면 INTERNAL 문항 원문(서술형은 examMap 이
  // 정답을 의도적으로 비워 두므로 원문 폴백이 유일한 소스다).
  const answer =
    entry?.correctAnswer?.trim() || review?.correctAnswer?.trim() || "";
  const answerIsModel = !entry?.correctAnswer && !!review?.correctAnswer;
  const variants = review ? acceptableVariantsOf(review) : [];
  const isMC = (entry?.kind ?? "MC") === "MC";
  return (
    <div className="min-w-0 space-y-1.5 border-t border-slate-100 px-2.5 py-2">
      {/* 【26-09-05】 정답 카드는 **서답형에만** 남긴다. 객관식은 답안지 격자에서
          정답 자리가 옅게 칠해져 있으므로(선생님용 OMR) 같은 말을 두 번 하지 않는다.
          서답형은 버블로 표시할 수 없어 모범답안·허용 변형이 유일한 근거다. */}
      {isMC ? null : (
      <div className="min-w-0 rounded-md border border-emerald-200 border-l-[3px] border-l-emerald-400 bg-emerald-50/60 px-2 py-1.5">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600">
          {answerIsModel ? "모범답안" : "정답"}
        </span>
        {answer ? (
          <span className="mt-0.5 block break-all text-[11.5px] font-semibold leading-snug text-emerald-800">
            {answer}
          </span>
        ) : (
          <span className="mt-0.5 block text-[11.5px] leading-snug text-emerald-700/40">
            {hasReviewItems ? "등록된 정답이 없습니다" : "불러오는 중…"}
          </span>
        )}
        {variants.length > 0 ? (
          <div className="mt-1.5 min-w-0 border-t border-emerald-200/70 pt-1.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600/70">
              허용 변형
            </span>
            <ul className="mt-0.5 min-w-0 space-y-0.5">
              {variants.map((v) => (
                <li
                  key={v}
                  className="break-all text-[11px] leading-snug text-emerald-700/80"
                >
                  · {v}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      )}

      {/* 【26-09-05】 정오 4상태 토글(○정답/✕오답/△부분/·미상)을 걷어냈다 —
          객관식은 버블이 정오를 **자동으로** 정하고(정답 자리도 옅게 보인다),
          서답형은 행에 이미 ○✕△ 가 붙어 있다. 같은 판정을 세 곳에서 받을 이유가
          없다. 남는 건 △부분일 때의 **부분점수 입력** 하나뿐이다. */}
      {editable && response.status === "PARTIAL" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <label className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-500">
            부분점수
            <input
              value={response.earnedPoints ?? ""}
              inputMode="decimal"
              autoFocus
              onChange={(e) => {
                const n = Number(e.target.value);
                onPatch(response.number, {
                  earnedPoints:
                    e.target.value.trim() === "" || !Number.isFinite(n)
                      ? undefined
                      : n,
                });
              }}
              className="h-6 w-14 rounded border border-slate-200 bg-white px-1.5 text-center text-[11px] tabular-nums text-slate-700 outline-none focus:border-blue-300"
            />
          </label>
          {entry?.points != null ? (
            <span className="text-[10.5px] tabular-nums text-slate-400">
              / 배점 {entry.points}점
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** INTERNAL 문항 원문 structuredData 에서 허용 변형 답안을 뽑는다(서술형 채점 재료).
 *  형태: { blanks: [{ acceptableVariants: string[] }] } — 스키마 밖 자유 JSON 이라
 *  전 구간 방어적으로 읽는다(모양이 다르면 빈 배열). */
function acceptableVariantsOf(item: ExamReviewQuestion): string[] {
  const data = item.structuredData;
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const blanks = (data as Record<string, unknown>).blanks;
  if (!Array.isArray(blanks)) return [];
  const out: string[] = [];
  for (const b of blanks) {
    if (!b || typeof b !== "object") continue;
    const vs = (b as Record<string, unknown>).acceptableVariants;
    if (!Array.isArray(vs)) continue;
    for (const v of vs) {
      const text = typeof v === "string" ? v.trim() : "";
      if (text.length > 0 && !out.includes(text)) out.push(text);
    }
  }
  return out.slice(0, 4);
}
