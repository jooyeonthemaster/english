"use client";

// ============================================================================
// /g/q/[taskId] — 문제 세트 결과 화면 (표시 전용 + 문항 드릴다운 + 오답 리뷰)
//
// 서버 채점 요약(score/maxScore·정답 수·서술형 확인 중)과 문항별 판정 그리드를
// 렌더하고, items/inputs 가 오면(완료 태스크 재방문 — 서버가 student-safe 문항과
// 내 답 input 화이트리스트를 내려줌) 타일 탭 → 아코디언으로 문항 본문
// (TabletQuestionView, 정답성 0)과 내 응답 에코(AnswerLayer disabled)를 펼친다.
// 필터 칩(전체/오답/확인 중)과 "오답 차례로 보기"(이전/다음 오답 내비)로 오답
// 복기를 돕는다. 정답 텍스트·해설은 서버가 내려주지 않으며 이 화면도 절대
// 표시하지 않는다(§6-1). 판정 톤: CORRECT=emerald, WRONG=rose, PARTIAL=blue,
// NEEDS_REVIEW=slate("확인 중"). 학생 노출 문구는 전부 합니다체.
// items 미제공(제출 직후 인세션 결과) 시 그리드+필터 전용으로 동작한다.
// embedded: 상위에서 h-10 헤더를 얹는 경로(/g/q 결과·DONE·/g/x)용 — 루트를
// min-h-dvh 대신 flex-1 로 두어 헤더만큼의 과잉 스크롤(이중 뷰포트)을 없앤다.
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { AnswerLayer } from "@/app/t/[token]/taking-parts/answer-layer";
import { TabletQuestionView } from "@/app/t/[token]/taking-parts/question-view";
import { clearQDraft } from "./use-q-draft";
import type { QGradeStatus, QPlayerItem, QTaskResultPayload } from "./q-shared";

const STATUS_META: Record<
  QGradeStatus,
  { label: string; fg: string; bg: string; border: string }
> = {
  CORRECT: {
    label: "정답",
    fg: "var(--gd-good)",
    bg: "var(--gd-good-soft)",
    border: "var(--gd-good-line)",
  },
  WRONG: {
    label: "오답",
    fg: "var(--gd-bad)",
    bg: "var(--gd-bad-soft)",
    border: "var(--gd-bad-line)",
  },
  PARTIAL: {
    label: "부분 정답",
    fg: "var(--gd-blue)",
    bg: "var(--gd-blue-soft)",
    border: "var(--gd-blue-line)",
  },
  NEEDS_REVIEW: {
    label: "확인 중",
    fg: "var(--gd-ink-2)",
    bg: "var(--gd-paper)",
    border: "var(--gd-line-strong)",
  },
};

const STATUS_ORDER: QGradeStatus[] = ["CORRECT", "WRONG", "PARTIAL", "NEEDS_REVIEW"];

type ResultFilter = "ALL" | "WRONG" | "REVIEW";

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 점수 rAF 카운트업(400ms, easeOutCubic) — prefers-reduced-motion 은 즉시 확정값 */
function useCountUp(target: number | null): number | null {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    if (target <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 400);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function ResultFilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="gd-t-2xs rounded-full border px-2.5 py-1 font-semibold"
      style={
        active
          ? { borderColor: "var(--gd-blue)", background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
          : { borderColor: "var(--gd-line)", color: "var(--gd-ink-3)" }
      }
    >
      {children}
    </button>
  );
}

/** AnswerLayer 재사용(표시 전용) — disabled 이므로 절대 호출되지 않는다 */
function noopChange() {}

export function QResultScreen({
  title,
  result,
  items,
  inputs,
  heading = "문제 세트 결과",
  embedded = false,
  purgeDraftTaskId,
}: {
  title: string;
  result: QTaskResultPayload;
  /** 드릴다운용 student-safe 문항(정답성 0, §6-1) — 미제공 시 그리드 전용 */
  items?: QPlayerItem[];
  /** questionId → 내가 제출한 답(input 화이트리스트만 — 판정·정답 필드 없음) */
  inputs?: Record<string, StudentInput | null>;
  /** 점수 카드 상단 라벨 — 기본 "문제 세트 결과", 시험 결과(/g/x) 재사용 시 교체 */
  heading?: string;
  /** 상위에서 헤더를 얹는 경로용 — 루트를 flex-1 로(이중 뷰포트 방지) */
  embedded?: boolean;
  /** 결과 진입 = 초안 용도 종료 — 플레이어 미경유(DONE 재방문) 잔존 초안 청소 */
  purgeDraftTaskId?: string;
}) {
  const { summary, perQuestion } = result;
  const present = new Set(perQuestion.map((q) => q.status));
  const legend = STATUS_ORDER.filter((s) => present.has(s));

  useEffect(() => {
    if (purgeDraftTaskId) clearQDraft(purgeDraftTaskId);
  }, [purgeDraftTaskId]);

  // 드릴다운(아코디언) — 한 번에 한 문항만 펼친다. 타일 재탭 = 닫기.
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResultFilter>("ALL");
  const itemById = useMemo(
    () => new Map((items ?? []).map((it) => [it.question.id, it])),
    [items],
  );
  const canDrill = (items?.length ?? 0) > 0;
  const openEntry = openId
    ? (perQuestion.find((q) => q.questionId === openId) ?? null)
    : null;
  const openItem = openId ? (itemById.get(openId) ?? null) : null;
  const openInput = openId ? (inputs?.[openId] ?? null) : null;
  const openMeta = openEntry ? STATUS_META[openEntry.status] : null;

  // 오답 리뷰 — 필터·차례 내비의 공용 축
  const wrongEntries = perQuestion.filter((q) => q.status === "WRONG");
  const reviewCount = perQuestion.filter((q) => q.status === "NEEDS_REVIEW").length;
  const visibleQuestions =
    filter === "ALL"
      ? perQuestion
      : perQuestion.filter((q) =>
          filter === "WRONG" ? q.status === "WRONG" : q.status === "NEEDS_REVIEW",
        );
  const wrongPos = openId ? wrongEntries.findIndex((q) => q.questionId === openId) : -1;

  // 필터 변경 시 펼친 문항이 그리드에서 사라지면 닫는다(고아 아코디언 방지)
  const applyFilter = (next: ResultFilter) => {
    setFilter(next);
    if (!openEntry) return;
    const stillVisible =
      next === "ALL" ||
      (next === "WRONG" ? openEntry.status === "WRONG" : openEntry.status === "NEEDS_REVIEW");
    if (!stillVisible) setOpenId(null);
  };

  // 펼침 전환 시 아코디언을 뷰포트 안으로(오답 차례 내비의 위치 상실 방지)
  const openPanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (openId) openPanelRef.current?.scrollIntoView({ block: "nearest" });
  }, [openId]);

  // 만점(전 문항 정답·확인 중 0) — 점수 숫자를 gd-good 으로 강조
  const perfect =
    !!summary &&
    summary.total > 0 &&
    summary.correct === summary.total &&
    summary.needsReview === 0;

  const animatedScore = useCountUp(summary ? summary.score : null);
  const scoreShown =
    summary === null
      ? 0
      : animatedScore === null
        ? summary.score
        : Number.isInteger(summary.score)
          ? Math.round(animatedScore)
          : Math.round(animatedScore * 10) / 10;
  const accuracyPct =
    summary && summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : null;

  const stats = summary
    ? [
        { label: "정답", value: `${summary.correct}/${summary.total}` },
        { label: "오답", value: String(summary.wrong) },
        ...(summary.partial > 0
          ? [{ label: "부분 정답", value: String(summary.partial) }]
          : []),
        ...(summary.needsReview > 0
          ? [{ label: "확인 중", value: String(summary.needsReview) }]
          : []),
      ]
    : [];

  return (
    <div
      className={cn(
        "gd-page flex flex-col justify-center gap-4 px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]",
        embedded ? "flex-1" : "min-h-dvh",
      )}
    >
      {/* 점수 카드 */}
      <div className="gd-card gd-pop p-6 text-center">
        <p className="gd-label">{heading}</p>
        <p className="gd-t-md mt-1 font-semibold">{title}</p>

        {summary ? (
          <>
            <p
              className="gd-mono gd-t-4xl mt-4 font-bold"
              style={perfect ? { color: "var(--gd-good)" } : undefined}
            >
              {formatScore(scoreShown)}
              <span className="gd-t-lg font-semibold" style={{ color: "var(--gd-ink-3)" }}>
                /{formatScore(summary.maxScore)}점
              </span>
            </p>
            {perfect && (
              <p className="gd-t-xs mt-1.5 font-semibold" style={{ color: "var(--gd-good)" }}>
                만점입니다
              </p>
            )}
            {accuracyPct !== null && (
              <div className="mx-auto mt-3 w-44">
                <div
                  className="gd-meter"
                  data-tone={perfect ? "good" : undefined}
                  role="img"
                  aria-label={`정답률 ${accuracyPct}%`}
                >
                  <span style={{ width: `${accuracyPct}%` }} />
                </div>
                <p className="gd-mono gd-t-3xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
                  정답률 {accuracyPct}%
                </p>
              </div>
            )}
            <div
              className="gd-hairline-t mt-5 grid gap-2 pt-4"
              style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
            >
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="gd-mono gd-t-lg font-bold">{s.value}</p>
                  <p className="gd-t-3xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
            {summary.needsReview > 0 && (
              <p
                className="gd-t-xs mt-4 rounded-lg px-3 py-2 leading-relaxed"
                style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
              >
                서술형 답안 {summary.needsReview}문항은 선생님이 확인한 뒤 점수에
                반영합니다.
              </p>
            )}
          </>
        ) : (
          <p className="gd-t-sm mt-4 leading-relaxed" style={{ color: "var(--gd-ink-2)" }}>
            채점 결과 정보를 불러오지 못했습니다. 과제 목록에서 다시 확인해
            주세요.
          </p>
        )}
      </div>

      {/* 문항별 판정 그리드 (+타일 탭 드릴다운 아코디언) */}
      {perQuestion.length > 0 && (
        <div className="gd-card p-4">
          <p className={canDrill ? "gd-label mb-1" : "gd-label mb-2.5"}>문항별 결과</p>
          {canDrill && (
            <p className="gd-t-3xs mb-2.5" style={{ color: "var(--gd-ink-3)" }}>
              번호를 누르면 문항과 제출한 답을 확인할 수 있습니다.
            </p>
          )}

          {/* 오답 리뷰 필터 + 차례 보기 — 오답/확인 중이 있을 때만 노출 */}
          {(wrongEntries.length > 0 || reviewCount > 0) && (
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              <ResultFilterChip active={filter === "ALL"} onClick={() => applyFilter("ALL")}>
                전체 {perQuestion.length}
              </ResultFilterChip>
              {wrongEntries.length > 0 && (
                <ResultFilterChip active={filter === "WRONG"} onClick={() => applyFilter("WRONG")}>
                  오답 {wrongEntries.length}
                </ResultFilterChip>
              )}
              {reviewCount > 0 && (
                <ResultFilterChip active={filter === "REVIEW"} onClick={() => applyFilter("REVIEW")}>
                  확인 중 {reviewCount}
                </ResultFilterChip>
              )}
              {canDrill && wrongEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (filter === "REVIEW") setFilter("ALL");
                    setOpenId(wrongEntries[0].questionId);
                  }}
                  className="gd-t-2xs ml-auto rounded-full border px-2.5 py-1 font-semibold"
                  style={{
                    borderColor: "var(--gd-blue-line)",
                    background: "var(--gd-blue-soft)",
                    color: "var(--gd-blue)",
                  }}
                >
                  오답 차례로 보기
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-5 gap-1.5">
            {visibleQuestions.map((q) => {
              const meta = STATUS_META[q.status];
              const isOpen = canDrill && q.questionId === openId;
              const tileStyle = {
                background: meta.bg,
                borderColor: meta.border,
                color: meta.fg,
                boxShadow: isOpen ? `inset 0 0 0 1.5px ${meta.fg}` : undefined,
              };
              if (!canDrill) {
                return (
                  <div
                    key={q.questionId}
                    aria-label={`${q.orderNum}번 문항 ${meta.label}`}
                    className="gd-mono gd-t-xs flex h-9 items-center justify-center rounded-lg border font-bold"
                    style={tileStyle}
                  >
                    {q.orderNum}
                  </div>
                );
              }
              return (
                <button
                  key={q.questionId}
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : q.questionId)}
                  aria-expanded={isOpen}
                  aria-label={`${q.orderNum}번 문항 ${meta.label} — 상세 ${isOpen ? "닫기" : "보기"}`}
                  className="gd-mono gd-t-xs flex h-9 items-center justify-center rounded-lg border font-bold"
                  style={tileStyle}
                >
                  {q.orderNum}
                </button>
              );
            })}
          </div>

          {/* 펼친 문항 — student-safe 본문 + 내 응답 에코(정답·해설 미포함, §6-1) */}
          {openEntry && openMeta && (
            <div ref={openPanelRef} className="gd-hairline-t mt-3 pt-3">
              <div className="flex items-center gap-2">
                <span
                  className="gd-mono gd-t-sm flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 font-bold text-white"
                  style={{ background: "var(--gd-blue)" }}
                >
                  {openEntry.orderNum}
                </span>
                <span
                  className="gd-t-2xs inline-flex items-center rounded-full border px-2 py-0.5 font-semibold"
                  style={{
                    background: openMeta.bg,
                    borderColor: openMeta.border,
                    color: openMeta.fg,
                  }}
                >
                  {openMeta.label}
                </span>
                {openItem && (
                  <span
                    className="gd-mono gd-t-2xs ml-auto font-semibold"
                    style={{ color: "var(--gd-ink-3)" }}
                  >
                    {openItem.points}점
                  </span>
                )}
              </div>

              {openItem ? (
                <>
                  <div className="mt-3">
                    <TabletQuestionView safe={openItem.question} variant="card" />
                  </div>
                  <div className="mt-4">
                    {openInput ? (
                      <AnswerLayer
                        questionOrderNum={openEntry.orderNum}
                        subType={openItem.question.subType}
                        answerUi={openItem.answerUi}
                        options={openItem.question.options}
                        blanks={openItem.question.safeData?.blanks}
                        input={openInput}
                        disabled
                        onChange={noopChange}
                      />
                    ) : (
                      <p
                        className="gd-t-xs rounded-lg px-3 py-2 leading-relaxed"
                        style={{ background: "var(--gd-paper)", color: "var(--gd-ink-2)" }}
                      >
                        이 문항에 제출한 답안이 없습니다.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p
                  className="gd-t-sm mt-3 leading-relaxed"
                  style={{ color: "var(--gd-ink-2)" }}
                >
                  이 문항은 지금 열람할 수 없습니다. 궁금한 점은 선생님께 문의해
                  주세요.
                </p>
              )}

              {/* 오답 차례 내비 — 펼친 문항이 오답일 때 이전/다음 오답 이동 */}
              {canDrill && wrongPos >= 0 && wrongEntries.length > 1 && (
                <div className="gd-hairline-t mt-3 flex items-center justify-between pt-2.5">
                  <button
                    type="button"
                    disabled={wrongPos <= 0}
                    onClick={() => setOpenId(wrongEntries[wrongPos - 1].questionId)}
                    className="gd-t-2xs flex items-center gap-0.5 rounded-full border px-2.5 py-1 font-semibold disabled:opacity-40"
                    style={{ borderColor: "var(--gd-line-strong)", color: "var(--gd-ink-2)" }}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    이전 오답
                  </button>
                  <span className="gd-mono gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
                    {wrongPos + 1} / {wrongEntries.length}
                  </span>
                  <button
                    type="button"
                    disabled={wrongPos >= wrongEntries.length - 1}
                    onClick={() => setOpenId(wrongEntries[wrongPos + 1].questionId)}
                    className="gd-t-2xs flex items-center gap-0.5 rounded-full border px-2.5 py-1 font-semibold disabled:opacity-40"
                    style={{ borderColor: "var(--gd-line-strong)", color: "var(--gd-ink-2)" }}
                  >
                    다음 오답
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {legend.map((s) => (
              <span
                key={s}
                className="gd-t-2xs inline-flex items-center gap-1"
                style={{ color: "var(--gd-ink-2)" }}
              >
                <span
                  className="h-2 w-2 rounded-full border"
                  style={{ background: STATUS_META[s].bg, borderColor: STATUS_META[s].fg }}
                  aria-hidden
                />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link href="/g/tasks" className="gd-btn gd-btn-primary w-full">
        과제 목록으로
      </Link>
    </div>
  );
}
