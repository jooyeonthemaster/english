"use client";

// ============================================================================
// 레일 학생 아코디언 — **OMR 답안지 입력기**(26-09-05 전면 재설계).
//
// 지시 원문: "애초에 선생님이 직접 입력하는 창 자체가 너무 직관적이지 않아. …
//   지금 여기에서 내가 입력해야 할 것은 학생 답이잖아. 그런데 학생 답을 입력해야
//   한다는 것 자체가 화면에 직관적으로 드러나지가 않아. … 그냥 omr이면 당연히
//   직관적으로 뭘 해야 할지 보이는데, 이건 그렇지 않다는 소리야."
//
// 무엇이 잘못됐었나(구 rail-grading-tiles):
//   ① 화면의 주역이 **정오 타일**이었다 — 강사가 실제로 넣어야 하는 값(학생 답)은
//      타일을 누른 **뒤에야** 나타나는 2차 화면에 있었다. 「무엇을 하는 창인가」가
//      첫 화면에 없으니 뭘 눌러야 할지 알 수 없었다.
//   ② 그래서 20문항짜리 시험은 「타일 클릭 → 선지 클릭」 40번이 필요했다.
//   ③ 「채점 필요 20문항 · 1,2,3…20번」 amber 배너처럼 **읽을 필요 없는 나열**이
//      맨 위를 차지했다(어차피 아래 목록이 전부 미입력이다).
//
// 지금 구조 — 실물 OMR 그대로:
//   [번호] ① ② ③ ④ ⑤        ← 한 줄이 한 문항. 누르면 그게 학생 답이다.
//   · 정오는 **자동 파생**(deriveStatusFromChoice) — 고른 선지에 색이 입는다
//     (초록=정답 / 빨강=오답 / 검정=정답 미상). 별도 채점 동작이 없다.
//   · **정답 자리는 옅은 초록**으로 미리 칠해 둔다(26-09-05 "선생님용 omr이니
//     뭐가 정답인지를 옅게 표시를 해줘") — 그래서 2차 화면의 정답 카드는 서답형
//     에만 남는다(객관식은 같은 말을 두 번 하지 않는다).
//   · 서답형은 텍스트 칸 + ○✕△ 토글(자동 채점이 불가능한 유일한 축).
//   · **번호를 누르면** 그 문항의 근거(발문·정답·허용 변형)와 수동 정오/부분점수가
//     아래로 펼쳐진다 — 예외 처리는 2차 화면으로 밀고 1차 화면은 입력만 남긴다.
// 상태(초안 버퍼·저장)는 부모 소유 — 여기는 표시와 패치·저장 통지만 한다.
// 계약 셀렉터: [data-answer-row="<번호>"] · [data-answer-choice] · [data-grading-*]
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import type { ExamReviewQuestion } from "@/components/exam-report/ui-contracts";
import type { ExamMap, ExamMapEntry, StudentResponse } from "@/lib/exam-report/types";
import { STATUS_STYLE } from "@/components/exam-report/grading/grading-shared";
import { deriveStatusFromChoice } from "@/lib/exam-report/grading";
import { normalizeChoiceToken } from "@/lib/exam-report/schemas";
import { cn } from "@/lib/utils";
import { RailAnswerDetail } from "./rail-answer-detail";
import { RailConfirmButton } from "./rail-confirm-button";

const CHOICES = ["1", "2", "3", "4", "5"] as const;

export function RailAnswerSheet({
  responses,
  examMap,
  editable,
  onPatch,
  reviewItems,
  focusNumber,
  focusNonce,
  onConfirm,
  confirmBusy,
  confirmed,
  dirty = false,
  onSave,
}: {
  responses: StudentResponse[];
  examMap: ExamMap | null;
  editable: boolean;
  onPatch: (number: string, partial: Partial<StudentResponse>) => void;
  /** INTERNAL 문항 원문(정답·모범답안 폴백) — 없으면 examMap 만 쓴다. */
  reviewItems?: Record<string, ExamReviewQuestion> | null;
  /** 외부(도크·픽바) 가 지목한 문항 번호 */
  focusNumber?: string | null;
  focusNonce?: number;
  onConfirm?: () => void;
  confirmBusy?: boolean;
  confirmed?: boolean;
  dirty?: boolean;
  onSave?: () => void;
}) {
  /** 근거·수동 정오를 펼친 문항(번호 클릭) — 1차 화면은 입력만 남긴다. */
  const [openNumber, setOpenNumber] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  /** [채점 확정]을 눌렀는데 빈 문항이 남아 있을 때 뜨는 인라인 안내(토스트 아님 —
   *  296px 레일에서 토스트는 글이 접히고 손이 가는 자리에서 멀다). */
  const [guideOpen, setGuideOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 외부 포커스 수신 — **렌더 중 전이 판정**(effect 안 setState 는 1렌더 지연 +
  // 캐스케이드, 레일 관례 react-hooks/set-state-in-effect 위반).
  const [seenFocusNonce, setSeenFocusNonce] = useState(0);
  const nonce = focusNonce ?? 0;
  if (nonce !== seenFocusNonce) {
    setSeenFocusNonce(nonce);
    if (nonce > 0 && focusNumber) {
      setOpenNumber(focusNumber);
      setPulse(focusNumber);
    }
  }
  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(null), 1800);
    return () => window.clearTimeout(t);
  }, [pulse]);

  // 지목된 행을 스크롤러 안으로 — scrollIntoView 금지(조상 하이재킹, E31 관례).
  useLayoutEffect(() => {
    if (!pulse) return;
    // 내부 스크롤러가 생겼으므로 그쪽을 먼저 본다 — 레일 스크롤러를 움직이면
    // 목록은 제자리인 채 아코디언만 흘러가 엉뚱한 곳이 보인다.
    const scroller =
      rootRef.current?.querySelector<HTMLElement>("[data-answer-scroll]") ??
      rootRef.current?.closest<HTMLElement>("[data-analysis-rail-scroll]");
    const rowEl = rootRef.current?.querySelector<HTMLElement>(
      `[data-answer-row="${CSS.escape(pulse)}"]`,
    );
    if (!scroller || !rowEl) return;
    const rowBox = rowEl.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (rowBox.top < box.top + 8 || rowBox.bottom > box.bottom - 8) {
      scroller.scrollTop += rowBox.top - box.top - 48;
    }
  }, [pulse]);

  if (responses.length === 0) {
    return (
      <p className="break-keep rounded-md border border-dashed border-slate-200 px-2.5 py-2.5 text-center text-[11px] leading-relaxed text-slate-400">
        분석이 끝나면 문항 답안지가 여기에 생깁니다
      </p>
    );
  }

  const entryOf = (n: string): ExamMapEntry | null =>
    examMap?.questions.find((q) => q.number === n) ?? null;
  const judged = responses.filter((r) => r.status !== "UNKNOWN").length;
  const pendingNumbers = responses
    .filter((r) => r.status === "UNKNOWN")
    .map((r) => r.number);
  // 선지 머리글은 객관식이 하나라도 있을 때만(서답형 전용지에 1~5 는 거짓말).
  const hasMC = responses.some(
    (r) => (entryOf(r.number)?.kind ?? "MC") === "MC",
  );
  const hasWritten = responses.some(
    (r) => (entryOf(r.number)?.kind ?? "MC") !== "MC",
  );

  return (
    <div ref={rootRef} className="min-w-0">
      {/* ── 이 창이 무엇인지 한 줄로(구 amber 나열 배너 대체) ─────────────────
          "지금 여기서 뭘 입력해야 할지 자체를 모르겠다"의 수리. 문항 번호를 20개
          늘어놓는 대신 **할 일 한 문장 + 진행 숫자**만 남긴다. */}
      {editable ? (
        <div
          data-grading-pending
          className={cn(
            "mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5",
            pendingNumbers.length === 0
              ? "border-emerald-100 bg-emerald-50/60"
              : "border-blue-100 bg-blue-50/60",
          )}
        >
            <span
              className={cn(
                "text-[12px] font-bold",
                pendingNumbers.length === 0 ? "text-emerald-700" : "text-blue-800",
              )}
            >
              {pendingNumbers.length === 0
                ? "답안 입력 완료"
                : "학생이 고른 답을 표시하세요"}
            </span>
            <span
              className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200/70"
              title={`정오가 정해진 문항 ${judged} / 전체 ${responses.length}`}
            >
              {judged}/{responses.length}
            </span>
            {/* 두 번째 어포던스(번호 = 근거 열기)는 아무 표시가 없으면 아무도 못
                찾는다 — 다 끝난 뒤에는 지운다(끝난 화면에 설명은 잡음). */}
            {pendingNumbers.length > 0 ? (
              <p className="flex w-full min-w-0 flex-wrap items-center gap-x-1.5 break-keep text-[10.5px] leading-relaxed text-slate-500">
                <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50" aria-hidden="true" />
                옅은 초록이 정답이에요{hasWritten ? " · 서답형은 번호를 눌러 모범답안을 봅니다" : ""}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ── 답안지 본체 — **열이 세로로 정렬된 격자**(26-09-05 재수리) ─────────
            "왼쪽에 쏠려서 이상하다"의 실체: 선지들이 flex 로 왼쪽에 몰리고 오른쪽이
            통째로 빈 여백이었다. 실물 OMR 처럼 번호 열 + 선지 5열을 **같은 grid
            템플릿**으로 깔아 각 선지 열이 위아래로 일직선이 되게 한다. 머리글 행도
            같은 템플릿을 써서 어느 동그라미가 몇 번인지 한눈에 보인다. */}
        {/* 【26-09-05 사용자 지시】 "omr 안에 내부 스크롤을 만들어서 채점 확정이
            하단에 보이게" — 20문항이면 목록만으로 화면을 다 먹어 [채점 확정]이 한참
            아래로 밀렸다. 목록에만 최대 높이를 주고 그 안에서 스크롤시킨다(액션 바는
            늘 바로 아래). 열 머리글은 스크롤러 안에서 sticky — 내려가도 몇 번 열인지
            보인다. overscroll-contain 은 레일 스크롤러로의 연쇄 스크롤 차단(관례). */}
        {/* ⚠ 카드에 overflow-hidden 을 주지 마라 — 그 순간 이 카드가 스크롤 컨테이너가
          되어 아래 sticky 푸터가 **레일 뷰포트가 아니라 카드 안에** 갇힌다(= 안 붙는다).
          모서리는 자식들이 각자 둥글게 맡는다(머리글 rounded-t / 푸터 rounded-b). */}
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div
            data-answer-scroll
            className="max-h-[min(52vh,420px)] min-w-0 overflow-y-auto overscroll-contain rounded-t-lg"
          >
          {hasMC ? (
              <div className="sticky top-0 z-10 grid grid-cols-[2.25rem_repeat(5,minmax(0,1fr))] items-center rounded-t-lg border-b border-slate-200 bg-slate-50 px-1.5 py-1">
              <span className="text-center text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                번호
              </span>
              {CHOICES.map((v) => (
                <span
                  key={v}
                  className="text-center text-[10px] font-bold tabular-nums text-slate-400"
                >
                  {v}
                </span>
              ))}
            </div>
          ) : null}
          <div className="min-w-0 divide-y divide-slate-100">
            {responses.map((r) => {
              const entry = entryOf(r.number);
              // examMap 이 없으면 객관식으로 본다 — 시험 분석의 절대다수가 MC 이고,
              // 아니면 [근거] 안의 수동 정오·서술 입력으로 언제든 교정 가능하다.
              const isMC = (entry?.kind ?? "MC") === "MC";
              // 【26-09-05 사용자 지시】 "선생님용 omr이니 뭐가 정답인지를 옅게
              //   표시를 해줘." 정답 2소스(examMap → INTERNAL 문항 원문)를 선지
              //   토큰으로 정규화한다. 복수 정답("2, 5")은 첫 토큰만 잡히므로 옅은
              //   표시가 한 칸만 뜬다 — 판정(deriveStatusFromChoice)과는 무관한
              //   **보조 표시**라 그 한계를 감수한다(2차 화면이 원문을 든다).
              const correctChoice = isMC
                ? normalizeChoiceToken(
                    entry?.correctAnswer ?? reviewItems?.[r.number]?.correctAnswer,
                  )
                : undefined;
              const open = openNumber === r.number;
              // 2차 화면에 **볼 것이 있는 행만** 번호가 눌린다(26-09-05 토글 철거 이후):
              // 서답형 = 모범답안·허용 변형 / △부분 = 부분점수 입력. 객관식은 격자가
              // 정오·정답을 이미 다 말하므로 빈 패널을 열 이유가 없다.
              const canOpen = !isMC || r.status === "PARTIAL";
              const style = STATUS_STYLE[r.status];
              return (
                <div
                  key={r.number}
                  data-answer-row={r.number}
                  className={cn(
                    "min-w-0 transition-colors",
                    pulse === r.number && "bg-blue-50",
                    open && "bg-slate-50",
                  )}
                >
                  <div className="grid min-w-0 grid-cols-[2.25rem_repeat(5,minmax(0,1fr))] items-center px-1.5 py-1">
                    {/* 번호 = 근거 펼침 토글(발문·정답·수동 정오는 2차 화면) */}
                    {canOpen ? (
                      <button
                        type="button"
                        data-answer-detail-toggle={r.number}
                        aria-expanded={open}
                        title={`${r.number}번 · ${style.label} — 누르면 상세를 봅니다`}
                        onClick={() => setOpenNumber(open ? null : r.number)}
                        className={cn(
                          "flex h-7 w-full cursor-pointer items-center justify-center rounded text-[11.5px] font-bold tabular-nums transition-colors",
                          open
                            ? "bg-slate-800 text-white"
                            : "text-slate-500 underline decoration-slate-300 decoration-dotted underline-offset-4 hover:bg-slate-100 hover:text-slate-800",
                        )}
                      >
                        <span className="truncate px-0.5">{r.number}</span>
                      </button>
                    ) : (
                      <span
                        title={`${r.number}번 · ${style.label}`}
                        className="flex h-7 w-full items-center justify-center text-[11.5px] font-bold tabular-nums text-slate-500"
                      >
                        <span className="truncate px-0.5">{r.number}</span>
                      </span>
                    )}

                    {isMC ? (
                      CHOICES.map((v) => {
                        const on = r.chosenChoice === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            data-answer-choice={`${r.number}:${v}`}
                            disabled={!editable}
                            aria-pressed={on}
                            aria-label={`${r.number}번 ${v}번 선지${
                              correctChoice === v ? " (정답)" : ""
                            }`}
                            onClick={() =>
                              onPatch(r.number, {
                                chosenChoice: on ? undefined : v,
                                status: on
                                  ? "UNKNOWN"
                                  : entry
                                    ? deriveStatusFromChoice(entry, v)
                                    : "UNKNOWN",
                              })
                            }
                            className={cn(
                              "mx-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 text-[10.5px] font-bold tabular-nums transition-all disabled:cursor-default",
                              on
                                ? r.status === "CORRECT"
                                  ? "border-emerald-600 bg-emerald-600 text-white"
                                  : r.status === "WRONG"
                                    ? "border-rose-500 bg-rose-500 text-white"
                                    : "border-slate-800 bg-slate-800 text-white"
                                : correctChoice === v
                                  ? // 정답 자리 — 고르지 않았어도 옅게 보인다.
                                    "border-emerald-200 bg-emerald-50 text-emerald-500/80 hover:border-blue-400"
                                  : "border-slate-200 bg-white text-transparent hover:border-blue-400 hover:text-blue-300",
                            )}
                          >
                            {v}
                          </button>
                        );
                      })
                    ) : (
                      // 서답형 — 선지 5열 자리를 통째로 쓴다(번호 열 정렬은 유지).
                      <div className="col-span-5 flex min-w-0 items-center gap-1">
                        <input
                          value={r.studentAnswer ?? ""}
                          disabled={!editable}
                          placeholder="학생이 쓴 답"
                          onChange={(e) =>
                            onPatch(r.number, { studentAnswer: e.target.value })
                          }
                          className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400 disabled:bg-slate-50"
                        />
                        {editable
                          ? (["CORRECT", "WRONG", "PARTIAL"] as const).map((vs) => {
                              const st = STATUS_STYLE[vs];
                              const on = r.status === vs;
                              return (
                                <button
                                  key={vs}
                                  type="button"
                                  title={st.label}
                                  aria-label={`${r.number}번 ${st.label}`}
                                  onClick={() =>
                                    onPatch(r.number, { status: on ? "UNKNOWN" : vs })
                                  }
                                  className={cn(
                                    "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-[11px] font-bold transition-colors",
                                    on
                                      ? st.solid
                                      : cn(
                                          "bg-white ring-1 ring-inset ring-slate-200",
                                          st.text,
                                        ),
                                  )}
                                >
                                  {st.symbol}
                                </button>
                              );
                            })
                          : null}
                        {!editable ? (
                          <span className={cn("shrink-0 text-[12px] font-bold", style.text)}>
                            {style.symbol}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {open && canOpen ? (
                    <RailAnswerDetail
                      response={r}
                      entry={entry}
                      review={reviewItems?.[r.number] ?? null}
                      hasReviewItems={reviewItems != null}
                      editable={editable}
                      onPatch={onPatch}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {/* ── 채점 액션 바 — **OMR 창 안에 붙어 늘 보인다**(26-09-05 사용자 지시)
            "이게 omr창 아래에 고정되어서 화면에 보여야 한다고."
            · 목록 카드 **안쪽 푸터**로 넣어 답안지와 한 몸이 되고, sticky bottom-0
              으로 레일을 굴려도 화면 아래에 붙어 있다.
            · [남은 N번으로]는 걷어냈다 — [채점 확정]이 남은 문항으로 데려가는
              역할까지 하므로 같은 일을 하는 버튼이 둘일 이유가 없다. */}
        {editable && (dirty || !confirmed) ? (
          <div className="sticky bottom-0 z-10 min-w-0 space-y-1.5 rounded-b-lg border-t border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur">
            {/* 빈 문항 안내 — **인라인 카드**(26-09-05 재수리). 종전엔 sonner 토스트로
                띄웠는데 296px 레일에서 글이 접히고 버튼이 본문을 덮었다(사용자 지적).
                손이 가 있는 자리(액션 바) 바로 위에서, 접히지 않는 폭으로 말한다. */}
            {guideOpen && pendingNumbers.length > 0 ? (
              <div
                data-grading-guide
                className="min-w-0 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2"
              >
                <div className="flex min-w-0 items-start gap-1.5">
                  <AlertCircle
                    className="mt-px size-3.5 shrink-0 text-amber-500"
                    aria-hidden="true"
                  />
                  <p className="min-w-0 flex-1 break-keep text-[11.5px] font-bold leading-snug text-amber-900">
                    {pendingNumbers[0]}번부터 {pendingNumbers.length}문항이 비어 있어요
                  </p>
                  <button
                    type="button"
                    onClick={() => setGuideOpen(false)}
                    aria-label="안내 닫기"
                    className="-mr-1 -mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-700"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-1 break-keep text-[11px] leading-relaxed text-amber-800/80">
                  학생이 고른 답을 표시하면 채점이 끝나요. 학생이 아무 표시도 하지
                  않은 문항이면 무응답으로 처리하세요.
                </p>
                <button
                  type="button"
                  data-grading-mark-blank
                  onClick={() => {
                    for (const n of pendingNumbers) {
                      onPatch(n, { status: "WRONG", chosenChoice: undefined });
                    }
                    setGuideOpen(false);
                  }}
                  className="mt-1.5 inline-flex h-7 w-full cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md border border-amber-300 bg-white px-2.5 text-[11.5px] font-bold text-amber-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:bg-amber-100"
                >
                  {pendingNumbers.length}문항 무응답 처리
                </button>
              </div>
            ) : null}

            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {pendingNumbers.length > 0 ? (
                <span className="min-w-0 flex-1 break-keep text-[10.5px] leading-relaxed text-slate-500">
                  {pendingNumbers.length}문항이 비어 있어요
                </span>
              ) : (
                <span className="min-w-0 flex-1" aria-hidden="true" />
              )}
              {dirty && onSave ? (
                <button
                  type="button"
                  data-grading-save
                  disabled={confirmBusy}
                  onClick={onSave}
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                >
                  {confirmBusy ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
                  ) : null}
                  저장
                </button>
              ) : null}
              {onConfirm && !confirmed ? (
                pendingNumbers.length > 0 ? (
                  /* 빈 문항이 남았으면 **확정하지 않는다** — 그 문항으로 데려가고
                     위 인라인 안내를 편다. 막다른 길이 되지 않도록 「무응답 처리」
                     탈출구를 그 안내 안에 둔다: 학생이 정말 빈칸으로 낸 경우가
                     실재하고, 그 길이 없으면 채점 확정이 영원히 막힌다(리포트까지
                     연쇄로 막힌다). */
                  <button
                    type="button"
                    data-grading-confirm-inline="true"
                    disabled={confirmBusy}
                    onClick={() => {
                      setOpenNumber(null);
                      setPulse(pendingNumbers[0]);
                      setGuideOpen(true);
                    }}
                    className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 bg-white px-2.5 text-[12px] font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:cursor-default disabled:opacity-50"
                  >
                    채점 확정
                  </button>
                ) : (
                  <RailConfirmButton
                    label="채점 확정"
                    confirmLabel="한 번 더 → 확정"
                    tone="primary"
                    busy={confirmBusy}
                    onConfirm={onConfirm}
                    className="shrink-0"
                    data-grading-confirm-inline="true"
                  />
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
