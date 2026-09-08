"use client";

// ============================================================================
// 레일 S1 「정답·배점 검수」 — 게이트 배너 + **인라인 검수 에디터**(26-09-02).
//
// 사용자 재재지시: "저 오른쪽 섹션 내에서 다 해결이 되어야 한다" — 검수하기가
// 새 탭으로 나가는 것 자체가 위반. 미확인 문항을 레일 안에서 직접 확인한다:
// 행마다 정답(MC 5선지 버튼 / 서답형 텍스트)·배점 수정 + [확인], 상단 [전체 확인].
//
// 변이 계약(전부 분석 version CAS — 실측 crud.ts):
// · 값 수정 → updateExamMap(전체 맵 교체) — 서버가 변경 문항의 확인을 자동
//   해제하고 소속 학생 점수를 재집계, totalPoints 는 전 문항 배점 존재 시에만
//   합계 신뢰(부분 입력의 총점 파괴 차단 — 서버 B1 규칙에 맞춰 클라도 동일 산식).
// · 확인 → setMapQuestionConfirmed(번호 배열) — 게이트(map-gate)의 유일한 기록
//   경로. [전체 확인]은 pendingNumbers 일괄 1콜(수정 중인 행이 있으면 잠금 —
//   저장 안 된 값을 확인 도장으로 봉인하는 사고 차단).
// · CAS 버전 체인: 성공마다 서버가 +1 — 로컬 versionRef 를 따라 올려 연속
//   확인이 refetch 를 기다리지 않게 한다. VERSION_CONFLICT = 다른 표면에서
//   수정 → 재조회로 수렴.
// 2중 마운트 안전: 모든 페치는 클릭 구동(effect 페치 0).
// v4(26-09-02): 펼침 토글은 콘솔 소유(api.reviewOpen) — 「다음 단계」 review-gate
// CTA 가 원격으로 펼친다. 분석 변경 시 리셋도 콘솔이 한다.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ExamAnalysisDetail } from "@/components/exam-report/ui-contracts";
import type { MapGateStatus } from "@/lib/exam-report/map-gate";
import type { ExamMap, ExamMapEntry } from "@/lib/exam-report/types";
import {
  setMapQuestionConfirmed,
  updateExamMap,
} from "@/actions/exam-report";
import { cn } from "@/lib/utils";
import { RailConfirmButton } from "./rail-confirm-button";
import type { AnalysisConsoleApi } from "./use-analysis-console";

const KIND_LABEL: Record<ExamMapEntry["kind"], string> = {
  MC: "객관식",
  SHORT: "단답형",
  ESSAY: "서술형",
};

interface RowDraft {
  correctAnswer: string;
  points: string;
}

function draftFromEntry(q: ExamMapEntry): RowDraft {
  return {
    correctAnswer: q.correctAnswer ?? "",
    points: q.points != null ? String(q.points) : "",
  };
}

function parsePoints(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function rowDirty(q: ExamMapEntry, d: RowDraft): boolean {
  return (
    (q.correctAnswer ?? "") !== d.correctAnswer.trim() ||
    (q.points ?? null) !== parsePoints(d.points)
  );
}

export function RailReviewSection({
  detail,
  gate,
  console: api,
}: {
  detail: ExamAnalysisDetail;
  gate: MapGateStatus;
  console: AnalysisConsoleApi;
}) {
  const open = api.reviewOpen;
  const setOpen = api.setReviewOpen;
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [busyNumber, setBusyNumber] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  // CAS 버전 체인 — 서버 성공마다 +1 로 따라간다(연속 확인의 스퓨리어스 충돌 차단).
  const versionRef = useRef(detail.version);
  useEffect(() => {
    versionRef.current = detail.version;
  }, [detail.version]);
  // 분석이 바뀌면 초안 청산(펼침 리셋은 콘솔 소관).
  useEffect(() => {
    setDrafts({});
  }, [detail.id]);

  const examMap = detail.examMap;
  if (!examMap) return null;

  // 완료 상태는 여기서 그리지 않는다 — emerald 칩은 [정보] 탭 소관
  // (탭바 전환으로 배너가 전 탭 공통 상단이 되면서, 완료 1줄 상시 점유 제거).
  if (gate.open) return null;

  const pendingSet = new Set(gate.pendingNumbers);
  const pending = examMap.questions.filter((q) => pendingSet.has(q.number));
  const hasDirty = pending.some((q) =>
    rowDirty(q, drafts[q.number] ?? draftFromEntry(q)),
  );

  const conflict = () => {
    toast.error("다른 곳에서 수정됐어요 — 최신 상태로 새로고침합니다.");
    api.refreshDetail();
  };

  /** 초안 반영 전체 맵 구성 — 서버 B1 총점 규칙과 동일 산식. */
  const buildMap = (q: ExamMapEntry, d: RowDraft): ExamMap => {
    const questions = examMap.questions.map((entry) =>
      entry.number === q.number
        ? {
            ...entry,
            correctAnswer: d.correctAnswer.trim() || undefined,
            points: parsePoints(d.points),
          }
        : entry,
    );
    const allPoints = questions.every((entry) => entry.points != null);
    return {
      ...examMap,
      questions,
      totalPoints: allPoints
        ? questions.reduce((sum, entry) => sum + (entry.points ?? 0), 0)
        : examMap.totalPoints,
    };
  };

  const confirmOne = async (q: ExamMapEntry) => {
    if (busyNumber || bulkBusy) return;
    setBusyNumber(q.number);
    try {
      const d = drafts[q.number] ?? draftFromEntry(q);
      if (rowDirty(q, d)) {
        const saved = await updateExamMap(detail.id, buildMap(q, d), versionRef.current);
        if (!saved.ok) return conflict();
        versionRef.current += 1;
      }
      const res = await setMapQuestionConfirmed(
        detail.id,
        versionRef.current,
        [q.number],
        true,
      );
      if (!res.ok) return conflict();
      versionRef.current += 1;
      api.refreshDetail();
    } catch {
      toast.error("확인 처리에 실패했습니다.");
    } finally {
      setBusyNumber(null);
    }
  };

  const confirmAll = async () => {
    if (busyNumber || bulkBusy || hasDirty) return;
    setBulkBusy(true);
    try {
      const res = await setMapQuestionConfirmed(
        detail.id,
        versionRef.current,
        gate.pendingNumbers,
        true,
      );
      if (!res.ok) return conflict();
      versionRef.current += 1;
      toast.success(`${gate.pendingNumbers.length}문항의 정답·배점을 확인했어요.`);
      api.refreshDetail();
    } catch {
      toast.error("전체 확인에 실패했습니다.");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      {/* ── 게이트 배너 — [검수하기]가 인라인 패널을 연다(레일 밖 이동 0) ── */}
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <CircleAlert className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-keep text-[12px] font-semibold leading-snug text-amber-700">
          정답·배점 확인이 필요합니다
        </span>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-amber-600">
          {gate.confirmedCount}/{gate.totalCount}
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-amber-300 bg-white px-2.5 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
        >
          {open ? "접기" : "검수하기"}
          <ChevronDown
            className={cn(
              "size-3 shrink-0 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* ── 인라인 검수 패널 ─────────────────────────────────────────────── */}
      {open ? (
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 break-keep text-[11px] leading-relaxed text-slate-400">
              미확인 {pending.length}문항 — 정답·배점을 고친 뒤 [확인]을 누르세요
            </p>
            <RailConfirmButton
              label={`전체 확인 ${pending.length}`}
              confirmLabel={`한 번 더 → ${pending.length}문항 확인`}
              tone="charge"
              busy={bulkBusy}
              disabled={hasDirty || busyNumber !== null}
              onConfirm={() => void confirmAll()}
            />
          </div>
          {hasDirty ? (
            <p className="break-keep text-[10.5px] leading-relaxed text-amber-600">
              수정 중인 문항이 있어요 — 해당 행의 [확인]으로 저장과 확인이 함께
              처리됩니다
            </p>
          ) : null}
          <div className="space-y-2">
            {pending.map((q) => {
              const d = drafts[q.number] ?? draftFromEntry(q);
              const busy = busyNumber === q.number;
              const low = q.correctAnswer && q.answerConfidence === "LOW";
              const setDraft = (partial: Partial<RowDraft>) =>
                setDrafts((prev) => ({
                  ...prev,
                  [q.number]: { ...d, ...partial },
                }));
              return (
                <div
                  key={q.number}
                  className="min-w-0 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-7 shrink-0 rounded bg-slate-100 px-1 py-0.5 text-center text-[10.5px] font-semibold tabular-nums text-slate-600">
                      {q.number}
                    </span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10.5px] font-medium text-slate-500">
                      {KIND_LABEL[q.kind]}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[11px] text-slate-500"
                      title={q.brief || q.typeLabel}
                    >
                      {q.brief || q.typeLabel}
                    </span>
                    {low ? (
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200/60">
                        AI 확신 낮음
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {q.kind === "MC" ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {["1", "2", "3", "4", "5"].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setDraft({ correctAnswer: v })}
                            title={`정답 ${v}번`}
                            className={cn(
                              "flex size-6 cursor-pointer items-center justify-center rounded text-[11px] font-semibold tabular-nums transition-colors",
                              d.correctAnswer.trim() === v
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:ring-slate-300",
                            )}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        value={d.correctAnswer}
                        onChange={(e) => setDraft({ correctAnswer: e.target.value })}
                        placeholder="모범답안"
                        className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-300"
                      />
                    )}
                    <label className="flex shrink-0 items-center gap-1 text-[10.5px] text-slate-400">
                      배점
                      <input
                        value={d.points}
                        onChange={(e) => setDraft({ points: e.target.value })}
                        inputMode="decimal"
                        placeholder="—"
                        className="h-7 w-12 rounded-md border border-slate-200 bg-white px-1.5 text-center text-[12px] tabular-nums text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-300"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || bulkBusy}
                      onClick={() => void confirmOne(q)}
                      className="ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-emerald-200 bg-white px-2.5 text-[11.5px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-3 shrink-0" aria-hidden="true" />
                      )}
                      확인
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
