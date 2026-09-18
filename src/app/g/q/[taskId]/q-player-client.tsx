"use client";

// ============================================================================
// /g/q/[taskId] — 문제 세트 플레이어 (클라이언트)
//
// 학생 앱(gd 디자인 언어) 셸 위에서 시험 문항 본문은 /t 응시면의 정본
// TabletQuestionView(variant "card")로, 응답 위젯은 AnswerLayer 로 렌더한다
// — 마커·밑줄·선지 표시가 시험지와 픽셀 동일(설계 §5, 응시 UI 신규 제작 금지).
// 한 문항씩 이전/다음 + 하단 번호 점프 스트립(응답 완료 = 파랑 점, 다시 보기
// 플래그 = 보라 점). 답안·현재 문항·플래그는 use-q-draft 가 기기 로컬에 자동
// 보존한다(새로고침·백스와이프 유실 방어). 제출은 전 문항 응답 시에만 활성 →
// 최종 확인 시트(재응시 불가 — 409 비가역) → POST /api/g/tasks/{id}/submit
// (서버 결정론 채점) → 결과 화면. 정답 텍스트는 어떤 경로로도 받지도
// 보여주지도 않는다(§6-1). 학생 노출 문구는 전부 합니다체.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardCheck, Flag } from "lucide-react";
import { toast } from "sonner";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { BackBar } from "@/components/grammar-drill/back-bar";
import { AnswerLayer } from "@/app/t/[token]/taking-parts/answer-layer";
import { TabletQuestionView } from "@/app/t/[token]/taking-parts/question-view";
import { QResultScreen } from "./q-result-screen";
import { QInstructionsBlock, QInstructionsSheet, QSubmitSheet } from "./q-submit-sheet";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { hasInput, useNumericChoiceHotkeys, useQDraft } from "./use-q-draft";
import {
  normalizeGradeStatus,
  type QPerQuestionResult,
  type QPlayerItem,
  type QResultSummary,
  type QTaskResultPayload,
} from "./q-shared";

export function QPlayerClient({
  taskId,
  title,
  instructions,
  items,
  initialResult,
}: {
  taskId: string;
  title: string;
  instructions: string | null;
  items: QPlayerItem[];
  initialResult: QTaskResultPayload | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState<QTaskResultPayload | null>(initialResult);
  // 답안·현재 문항·플래그 — 기기 로컬 초안으로 자동 보존/복원(use-q-draft)
  const { inputs, setInputs, currentIdx, setCurrentIdx, flagged, toggleFlag, clearDraft } =
    useQDraft(taskId, items, result !== null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  // 긴 지문에서 응답 위젯이 폴드 아래로 내려간 경우의 1회 안내 힌트.
  // 첫 응답 입력과 동시에 영구 소멸한다.
  const [answerHintDismissed, setAnswerHintDismissed] = useState(false);
  const [mainOverflowing, setMainOverflowing] = useState(false);
  // 가상 키보드가 열리면(서술형·빈칸) 그 높이만큼 하단을 밀어 올려
  // 제출 푸터가 키보드 뒤로 숨지 않게 한다(iOS: 훅 실측, Android: viewport 옵션).
  const kbInset = useKeyboardInset();

  // 409(이미 제출) 후 router.refresh() 로 서버가 결과를 내려주면 동기화
  useEffect(() => {
    if (initialResult) setResult(initialResult);
  }, [initialResult]);

  const answeredMap = items.map((it) => hasInput(inputs[it.question.id]));
  const answeredCount = answeredMap.filter(Boolean).length;
  const allAnswered = items.length > 0 && answeredCount === items.length;

  // 문항 전환 — 본문 상단 스크롤 + 번호 스트립에서 현재 버튼 노출
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-qidx="${currentIdx}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentIdx]);

  // 본문이 폴드를 넘는지(응답 위젯이 화면 밖일 가능성) 판정 — 레이아웃 확정 후 측정
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = mainRef.current;
      if (el) setMainOverflowing(el.scrollHeight > el.clientHeight + 24);
    });
    return () => cancelAnimationFrame(raf);
  }, [currentIdx, items, result]);

  // 미제출 답안이 있을 때 새로고침/닫기 이탈 가드(초안은 남지만 제출은 아님)
  useEffect(() => {
    if (result || answeredCount === 0) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [result, answeredCount]);

  const exit = useCallback(() => {
    if (!result && answeredCount > 0) {
      const ok = window.confirm(
        "아직 제출하지 않았습니다. 작성한 답안은 이 기기에 저장해 두었습니다. 나가시겠습니까?",
      );
      if (!ok) return;
    }
    router.push("/g/tasks");
  }, [result, answeredCount, router]);

  // 숫자키 1~9 = 현재 SINGLE_CHOICE 문항 선지 선택(재탭 해제와 동일 토글)
  const selectChoiceToken = useCallback(
    (questionId: string, token: string) => {
      setAnswerHintDismissed(true);
      setInputs((prev) => {
        const cur = prev[questionId];
        return { ...prev, [questionId]: cur?.choice === token ? null : { choice: token } };
      });
    },
    [setInputs],
  );
  useNumericChoiceHotkeys({
    enabled: !result && !submitting && !confirmOpen && !instructionsOpen,
    item: items.length > 0 ? items[Math.min(currentIdx, items.length - 1)] : null,
    onSelectToken: selectChoiceToken,
  });

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const answers: Record<string, StudentInput> = {};
      for (const it of items) {
        const input = inputs[it.question.id];
        if (input) answers[it.question.id] = input;
      }
      const res = await fetch(`/api/g/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        summary?: QResultSummary;
        perQuestion?: { questionId?: string; orderNum?: number; status?: unknown }[];
        missingOrderNums?: number[];
      } | null;

      if (res.ok && data?.ok && data.summary) {
        const perQuestion: QPerQuestionResult[] = (data.perQuestion ?? []).map(
          (p, idx) => ({
            questionId: typeof p.questionId === "string" ? p.questionId : `q-${idx + 1}`,
            orderNum: typeof p.orderNum === "number" ? p.orderNum : idx + 1,
            status: normalizeGradeStatus(p.status),
          }),
        );
        clearDraft(); // 제출 성공 — 초안 용도 종료
        setResult({ summary: data.summary, perQuestion });
        return;
      }
      if (data?.error === "INCOMPLETE" && Array.isArray(data.missingOrderNums)) {
        setConfirmOpen(false);
        const firstMissing = data.missingOrderNums[0];
        const idx = items.findIndex((it) => it.orderNum === firstMissing);
        if (idx >= 0) setCurrentIdx(idx);
        toast.error("아직 답을 입력하지 않은 문항이 있습니다.");
        return;
      }
      if (res.status === 409) {
        clearDraft(); // 이미 제출됨 — 서버가 정본, 초안 폐기
        toast.error("이미 제출한 과제입니다. 결과를 불러옵니다.");
        router.refresh();
        return;
      }
      if (res.status === 401) {
        router.replace("/g");
        return;
      }
      toast.error("제출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      toast.error("네트워크 오류로 제출하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, items, inputs, taskId, router, clearDraft, setCurrentIdx]);

  // ── 화면 분기 ──
  if (result) {
    // 결과 화면에도 플레이어와 동일한 상단 바(뒤로 + 제목)를 유지한다.
    return (
      <div className="gd-player flex min-h-dvh flex-col">
        <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <BackBar onBack={exit} ariaLabel="과제 목록으로 나가기" title={title} />
        </header>
        <QResultScreen title={title} result={result} embedded />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="gd-t-sm leading-relaxed" style={{ color: "var(--gd-ink-2)" }}>
          출제된 문항을 불러오지 못했습니다. 선생님께 문의해 주세요.
        </p>
        <button
          type="button"
          onClick={() => router.push("/g/tasks")}
          className="gd-btn gd-btn-ghost"
        >
          과제 목록으로
        </button>
      </div>
    );
  }

  const current = items[Math.min(currentIdx, items.length - 1)];
  const currentFlagged = flagged.has(current.question.id);
  const isLast = currentIdx >= items.length - 1;
  const progressPct = (answeredCount / items.length) * 100;
  const showAnswerHint =
    mainOverflowing && !answerHintDismissed && !hasInput(inputs[current.question.id]);

  return (
    <div
      className="gd-player flex h-dvh flex-col"
      style={kbInset ? { paddingBottom: kbInset } : undefined}
    >
      {/* ── 헤더: 뒤로 · 제목 · 진행 n/N ── */}
      <header className="gd-phead shrink-0 px-4 pt-3">
        <BackBar
          onBack={exit}
          ariaLabel="과제 목록으로 나가기"
          title={title}
          right={
            <p className="gd-t-xs shrink-0 font-semibold" style={{ color: "var(--gd-ink-2)" }}>
              <span className="gd-t-3xs mr-1 font-medium" style={{ color: "var(--gd-ink-3)" }}>
                응답
              </span>
              <span className="gd-mono">
                {answeredCount}
                <span style={{ color: "var(--gd-ink-3)" }}>/{items.length}</span>
              </span>
            </p>
          }
        />
        <div
          className="gd-meter mt-1"
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={items.length}
        >
          <span style={{ width: `${progressPct}%` }} />
        </div>
        {/* 스크린리더 문항 전환 알림 */}
        <p className="sr-only" aria-live="polite">
          {current.orderNum}번 문항입니다
        </p>
      </header>

      {/* ── 문항 ── */}
      <div className="relative min-h-0 flex-1">
        <main ref={mainRef} className="gd-scroll h-full px-4 pb-6 pt-3">
        {/* 안내문 — 첫 문항만 전체 노출, 2번부터 12자 칩 + 탭 시 전문 시트 */}
        {instructions ? (
          <QInstructionsBlock
            text={instructions}
            compact={currentIdx > 0}
            onOpenSheet={() => setInstructionsOpen(true)}
          />
        ) : null}

        <div className="gd-card p-4 md:p-5">
          <div className="flex items-center gap-2">
            <span
              className="gd-mono gd-t-base flex h-8 min-w-8 items-center justify-center rounded-full px-2 font-bold text-white"
              style={{ background: "var(--gd-blue)" }}
            >
              {current.orderNum}
            </span>
            <span className="gd-mono gd-t-2xs font-semibold" style={{ color: "var(--gd-ink-3)" }}>
              {current.points}점
            </span>
            {/* 다시 보기 플래그 — 제출 전 재확인할 문항 표시(보라, 초안에 함께 저장) */}
            <button
              type="button"
              onClick={() => toggleFlag(current.question.id)}
              aria-pressed={currentFlagged}
              className="ml-auto flex h-8 items-center gap-1 rounded-full border px-2.5"
              style={
                currentFlagged
                  ? {
                      borderColor: "var(--gd-flag-line)",
                      background: "var(--gd-flag-soft)",
                      color: "var(--gd-flag)",
                    }
                  : { borderColor: "var(--gd-line)", color: "var(--gd-ink-3)" }
              }
            >
              <Flag
                className="h-3.5 w-3.5"
                strokeWidth={2}
                fill={currentFlagged ? "var(--gd-flag)" : "none"}
                aria-hidden
              />
              <span className="gd-t-3xs font-semibold">다시 보기</span>
            </button>
            <span className="gd-mono gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
              {currentIdx + 1} / {items.length}
            </span>
          </div>

          <div className="mt-4">
            <TabletQuestionView safe={current.question} variant="card" />
          </div>

          <div className="mt-5">
            <AnswerLayer
              questionOrderNum={current.orderNum}
              subType={current.question.subType}
              answerUi={current.answerUi}
              options={current.question.options}
              blanks={current.question.safeData?.blanks}
              input={inputs[current.question.id] ?? null}
              disabled={submitting}
              onChange={(input) => {
                setAnswerHintDismissed(true);
                setInputs((prev) => ({ ...prev, [current.question.id]: input }));
              }}
            />
          </div>
        </div>
        {/* 가상 키보드·하단 바 여유 공간 */}
        <div className="h-8" />
        </main>
        {/* 폴드 아래 콘텐츠 암시 — 하단 페이드(지면색으로 소실) */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
          style={{
            background:
              "linear-gradient(to top, var(--gd-paper), rgba(244, 246, 249, 0))",
          }}
          aria-hidden
        />
        {showAnswerHint ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <p
              className="gd-t-2xs gd-pop rounded-full px-3.5 py-1.5 text-center font-semibold shadow-md"
              style={{ background: "var(--gd-scrim)", color: "#fff" }}
              role="status"
            >
              아래에서 답을 선택합니다
            </p>
          </div>
        ) : null}
      </div>

      {/* ── 하단 바: 번호 점프 스트립 + 이전/다음·제출 ── */}
      <footer
        className="gd-pfoot gd-hairline-t gd-safe-b shrink-0 px-4 pt-2.5"
        style={{ background: "var(--gd-card)" }}
      >
        <div
          ref={stripRef}
          className="gd-qstrip mb-2 flex gap-1.5 overflow-x-auto pb-1"
          // 키보드가 열려 있으면 스트립을 숨겨 서술형 입력 공간을 최대로 확보
          // (ref 는 유지 — display 만 끈다)
          style={{ scrollbarWidth: "thin", display: kbInset ? "none" : undefined }}
          role="group"
          aria-label="문항 바로 가기"
        >
          {items.map((it, idx) => {
            const isCurrent = idx === currentIdx;
            const isAnswered = answeredMap[idx];
            const isFlagged = flagged.has(it.question.id);
            return (
              <button
                key={it.question.id}
                type="button"
                data-qidx={idx}
                onClick={() => setCurrentIdx(idx)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`${it.orderNum}번 문항으로 이동${isAnswered ? " (응답 완료)" : ""}${isFlagged ? " (다시 보기 표시)" : ""}`}
                className="relative flex h-11 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border"
                style={{
                  borderColor: isCurrent ? "var(--gd-blue)" : "var(--gd-line)",
                  background: isCurrent ? "var(--gd-blue-soft)" : "var(--gd-card)",
                }}
              >
                {/* 다시 보기 플래그 도트(보라) — 응답 도트(파랑)와 별개 규격 1개 */}
                {isFlagged ? (
                  <span
                    className="absolute right-1 top-1 h-1 w-1 rounded-full"
                    style={{ background: "var(--gd-flag)" }}
                    aria-hidden
                  />
                ) : null}
                <span
                  className="gd-mono gd-t-xs font-semibold"
                  style={{
                    color: isCurrent
                      ? "var(--gd-blue)"
                      : isAnswered
                        ? "var(--gd-ink)"
                        : "var(--gd-ink-3)",
                  }}
                >
                  {it.orderNum}
                </span>
                <span
                  className="h-1 w-1 rounded-full"
                  style={{ background: isAnswered ? "var(--gd-blue)" : "transparent" }}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>

        {isLast && flagged.size > 0 && (
          <p className="gd-t-2xs mb-1.5 text-center font-semibold" style={{ color: "var(--gd-flag)" }}>
            표시한 문항 {flagged.size}개가 있습니다. 제출 전에 다시 확인해 보세요.
          </p>
        )}
        {isLast && !allAnswered && (
          <p className="gd-t-2xs mb-1.5 text-center" style={{ color: "var(--gd-ink-3)" }}>
            모든 문항에 답하면 제출할 수 있습니다. (남은 문항{" "}
            {items.length - answeredCount}개)
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
            disabled={currentIdx === 0}
            className="gd-btn gd-btn-ghost flex-1 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            이전
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!allAnswered || submitting}
              className="gd-btn gd-btn-primary flex-[1.4]"
            >
              <ClipboardCheck className="h-4 w-4" strokeWidth={2} />
              {submitting ? "제출 중…" : "제출하기"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentIdx(Math.min(items.length - 1, currentIdx + 1))}
              className="gd-btn gd-btn-primary flex-[1.4]"
            >
              다음
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
        </div>
      </footer>

      {/* 제출 최종 확인 시트 — 재응시 불가(409 비가역)라 이중 확인 */}
      <QSubmitSheet
        open={confirmOpen}
        items={items}
        inputs={inputs}
        flagged={flagged}
        submitting={submitting}
        onClose={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        onConfirm={() => void submit()}
      />
      {instructions ? (
        <QInstructionsSheet
          open={instructionsOpen}
          text={instructions}
          onClose={() => setInstructionsOpen(false)}
        />
      ) : null}
    </div>
  );
}
