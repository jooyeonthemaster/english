"use client";

// ============================================================================
// 채점 지도(ExamMap) 요약 테이블 — 번호/유형/배점/정답 인라인 수정.
//
// 소넷이 도출한 정답·배점을 강사가 한 화면에서 검토·정정한다. answerConfidence
// LOW 행은 blue ring + "확인 필요" 뱃지로 강조(주황/앰버 금지). 저장(version CAS)은
// 상위(analysis-step)가 updateExamMap 으로 담당하고, 이 컴포넌트는 편집 위임만.
// ============================================================================

import { useState } from "react";
import { CheckCheck, ImageIcon } from "lucide-react";
import type { ExamMapEntry, ExamQuestionKind } from "@/lib/exam-report/types";
import { Button } from "@/components/ui/button";
import type { ExamSourceFile } from "../ui-contracts";

const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

const KIND_LABEL: Record<ExamQuestionKind, string> = {
  MC: "객관식",
  SHORT: "단답형",
  ESSAY: "서술형",
};

// 표시 전용 소수 2자리 반올림 — 부동소수 합산이 "99.99999999999999점" 으로
// 새는 것을 화면에서만 정리한다(저장값·집계값은 건드리지 않는다).
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

interface ExamMapTableProps {
  entries: ExamMapEntry[];
  mapConfirmed: boolean;
  /** 분석 중/저장 중 편집 잠금 */
  disabled: boolean;
  /** E1 분석 진행 중 — 정답이 아직 없는 행에 '분석 중' 표시(정답은 E1b 도출). */
  analyzing?: boolean;
  /** 시험지 원본 대조용(정답 확인 필요 행 검토) — 분석 sourceFiles. */
  sourceFiles: ExamSourceFile[];
  /** 시험지 원본 분할 패널 토글 — 패널 자체는 상위(analysis-step)가 렌더. */
  sourcesOpen: boolean;
  onToggleSources: () => void;
  onEdit: (number: string, patch: Partial<ExamMapEntry>) => void;
  onConfirmAll: () => void;
}

export function ExamMapTable({
  entries,
  mapConfirmed,
  disabled,
  analyzing = false,
  sourceFiles,
  sourcesOpen,
  onToggleSources,
  onEdit,
  onConfirmAll,
}: ExamMapTableProps) {
  const sorted = [...entries].sort((a, b) => a.order - b.order);
  const totalPoints = round2(sorted.reduce((sum, e) => sum + (e.points ?? 0), 0));
  const lowCount = sorted.filter((e) => e.answerConfidence === "LOW").length;

  return (
    // h-full: 부모(분석 스텝의 지도+총평 행)가 준 높이를 꽉 채운다 — 좌우 카드
    // 아래 끝선 정렬의 기반. 높이 미지정 부모(모바일)에서는 자연 높이.
    <section className="flex h-full min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        {/* 섹션 헤더 — 워크벤치 표준(볼드 타이틀 + slate-400 보조) 톤 */}
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-bold text-slate-900">채점 지도</h3>
          <span className="text-xs text-slate-400">
            <span className="font-semibold text-slate-600">{sorted.length}문항</span>
            <span className="mx-1 text-slate-300">·</span>
            <span className="tabular-nums">{totalPoints}점</span>
          </span>
          {lowCount > 0 && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10.5px] font-bold text-blue-700">
              확인 필요 {lowCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sourceFiles.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleSources}
              aria-pressed={sourcesOpen}
              className={
                sourcesOpen
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                  : undefined
              }
            >
              <ImageIcon className="h-3.5 w-3.5" />
              시험지 원본
            </Button>
          )}
          {mapConfirmed ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
              <CheckCheck className="h-3.5 w-3.5" />
              정답·배점 확인 완료
            </span>
          ) : (
            // 검수(확인) 버튼 = 초록(워크벤치 버튼 색 규칙)
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onConfirmAll}
              disabled={disabled || sorted.length === 0}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              정답·배점 확인 완료
            </Button>
          )}
        </div>
      </div>

      {/* 내부 스크롤 + sticky 헤더. xl+ 에서는 행 높이(뷰포트 기준)를 flex-1 로 꽉
          채워 7~8행만 보이던 답답함 제거(유저 피드백) — 60vh 고정 캡은 xl 미만
          (행 높이 미지정)에서만 유지한다.
          sticky 는 th 단위 적용(thead 적용 시 브라우저별 배경/보더 유실 방지). */}
      <div className="max-h-[70vh] min-h-0 flex-1 overflow-x-auto overflow-y-auto xl:max-h-none">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500">
              {/* 번호 컬럼 고정폭(w-16) 금지 — "서답형 3" 류 다글자 번호가 한 글자씩
                  세로로 깨지던 원인. 칩 nowrap + 자동폭으로 콘텐츠에 맞춘다. */}
              <th className="sticky top-0 z-10 whitespace-nowrap border-b border-slate-100 bg-slate-50 px-4 py-2.5 font-medium">번호</th>
              <th className="sticky top-0 z-10 w-28 border-b border-slate-100 bg-slate-50 px-3 py-2.5 font-medium">종류</th>
              <th className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-2.5 font-medium">유형 · 발문</th>
              <th className="sticky top-0 z-10 w-20 border-b border-slate-100 bg-slate-50 px-3 py-2.5 font-medium">배점</th>
              <th className="sticky top-0 z-10 w-40 border-b border-slate-100 bg-slate-50 px-3 py-2.5 font-medium">정답</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const low = e.answerConfidence === "LOW";
              return (
                <tr
                  key={e.number}
                  className={
                    "border-b border-slate-50 align-top last:border-0 " +
                    (low ? "bg-blue-50/40 ring-1 ring-inset ring-blue-300" : "")
                  }
                >
                  <td className="px-4 py-2.5">
                    {/* 번호 칩은 반드시 nowrap — 다글자 번호 줄바꿈 깨짐 방지(전역 원칙). */}
                    <span className="inline-flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">
                      {e.number}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={e.kind}
                      disabled={disabled}
                      onChange={(ev) =>
                        onEdit(e.number, {
                          kind: ev.target.value as ExamQuestionKind,
                        })
                      }
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                    >
                      {(["MC", "SHORT", "ESSAY"] as ExamQuestionKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-xs font-medium text-slate-600">
                      {e.typeLabel || <span className="text-slate-400">유형 미상</span>}
                    </div>
                    {e.brief && (
                      <div
                        className="mt-0.5 line-clamp-1 text-xs text-slate-400"
                        style={{ fontFamily: EXAM_FONT }}
                        title={e.brief}
                      >
                        {e.brief}
                      </div>
                    )}
                    {low && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        정답 확인 필요
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <NumberCell
                      value={e.points}
                      disabled={disabled}
                      onCommit={(next) => onEdit(e.number, { points: next })}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {analyzing && !e.correctAnswer ? (
                      // 정답은 E1b 가 도출한다 — 아직 없는 행은 '분석 중'으로 표시.
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" />
                        분석 중
                      </span>
                    ) : (
                      <TextCell
                        value={e.correctAnswer ?? ""}
                        disabled={disabled}
                        placeholder={e.kind === "MC" ? "1~5" : "모범답"}
                        onCommit={(next) =>
                          onEdit(e.number, { correctAnswer: next || undefined })
                        }
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── 인라인 편집 셀(blur 커밋) ────────────────────────────────────────────────

function NumberCell({
  value,
  disabled,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (next: number | null) => void;
}) {
  // 표시 전용 반올림 — 저장값이 부동소수여도 셀에는 정리된 값을 보인다.
  const initial = value == null ? "" : String(round2(value));
  const [draft, setDraft] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    setDraft(initial);
  }
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === synced.trim()) return;
    const parsed = trimmed === "" ? null : Number(trimmed);
    // 배점은 음수가 될 수 없다 — 음수 입력은 0 으로 바닥 처리(총점 오염 방지).
    const next =
      parsed != null && Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    setSynced(next == null ? "" : String(next));
    setDraft(next == null ? "" : String(next));
    onCommit(next);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm tabular-nums text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
    />
  );
}

function TextCell({
  value,
  disabled,
  placeholder,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  placeholder?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const commit = () => {
    const next = draft.trim();
    if (next === synced.trim()) return;
    setSynced(next);
    setDraft(next);
    onCommit(next);
  };
  return (
    <input
      type="text"
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
    />
  );
}
