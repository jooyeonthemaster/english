"use client";

// ============================================================================
// 문항 분석 우측 패널(시안 B) — 424px sticky.
//
// 기존엔 문항 22장이 세로 아코디언으로 깔려 있고, 유형 칩 벽(AI 생성 라벨이라
// 문항마다 거의 고유 → count 1 짜리 칩 15~20개)이 그 위를 덮고 있었다.
// 시안 B 는 그 리스트를 통째로 걷어내고, 표에서 고른 문항 하나만 이 패널에 띄운다:
//   [문항 분석 | 총평]
// - 문항 분석: 6필드 편집 + 「이 문항 분석 검수 완료」(초록). **게이트 조건 아님**
//   (게이트는 정답·배점 확인뿐 — 이건 리포트 문구용).
// - 총평: 읽기전용이던 AI 총평을 **편집 가능**하게 바꾼다(검수가 목적인 화면에서
//   유일하게 손댈 수 없던 산출물이었다).
// ※ '원본 사진' 탭은 제거 — 워크스페이스 헤더의 「시험지 원본」 시트(화면 절반)가
//   같은 자료를 더 크게 띄우므로 424px 패널 안의 축소판은 중복이었다.
// ============================================================================

import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  RotateCw,
  X,
} from "lucide-react";
import type {
  ExamMapEntry,
  QuestionAnalysis,
} from "@/lib/exam-report/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EditableAnalysisField } from "./analysis-edit-panel";

const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

interface QuestionSidePanelProps {
  /** 표에서 선택된 문항(없으면 안내 표시) */
  entry: ExamMapEntry | null;
  analysis: QuestionAnalysis | null;
  isConfirmed: boolean;
  /** 분석 검수 진행률(선택 사항 — 게이트 조건 아님) */
  reviewedCount: number;
  reviewableCount: number;
  disabled: boolean;
  busy?: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onToggleConfirm: () => void;
  onReanalyze: () => void;
  onEditField: (patch: Partial<QuestionAnalysis>) => void;
}

export function QuestionSidePanel({
  entry,
  analysis,
  isConfirmed,
  reviewedCount,
  reviewableCount,
  disabled,
  busy = false,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onToggleConfirm,
  onReanalyze,
  onEditField,
}: QuestionSidePanelProps) {
  const failed = analysis?.analysisStatus === "FAILED";

  return (
    <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      {/* 헤더 — 번호칩 + 유형/발문 + 이전·다음 + 닫기 */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        {entry ? (
          <>
            {/* 번호 칩 nowrap + 자동폭 — "서답형 3" 류 다글자 번호 대응(전역 원칙) */}
            <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 text-[11.5px] font-bold tabular-nums text-slate-700">
              {entry.number}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-extrabold text-slate-900">
                {entry.typeLabel || "유형 미상"}
              </p>
              {entry.brief && (
                <p
                  className="truncate text-[11px] text-slate-400"
                  style={{ fontFamily: EXAM_FONT }}
                  title={entry.brief}
                >
                  {entry.brief}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="이전 문항"
              disabled={!hasPrev}
              onClick={onPrev}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="다음 문항"
              disabled={!hasNext}
              onClick={onNext}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </>
        ) : (
          // 문항 미선택 시 — 이 패널은 문항 분석 전용이다(총평은 헤더 시트로 분리).
          <p className="flex-1 text-[13.5px] font-extrabold text-slate-900">
            문항 분석
          </p>
        )}
        {entry && (
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* (탭 제거) 총평은 헤더 「시험지 총평」 시트로 분리 → 이 패널은 문항 분석 전용. */}

      {/* 본문 — 이 영역만 스크롤(스크롤 축 1개) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        {!entry ? (
            <EmptyHint text="표에서 문항을 선택하면 분석이 열려요." />
          ) : failed ? (
            <div className="py-10 text-center">
              <p className="text-[12.5px] font-medium text-slate-600">
                이 문항은 분석에 실패했어요.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                다시 분석해도 추가 크레딧이 들지 않습니다.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={onReanalyze}
                className="mt-3 border-blue-300/45 text-blue-600 hover:bg-blue-50"
              >
                <RotateCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
                {busy ? "재분석 중" : "재분석 · 무료"}
              </Button>
            </div>
          ) : !analysis ? (
            <EmptyHint text="아직 이 문항의 분석이 없습니다." />
          ) : (
            <div className="flex flex-col gap-3">
              <EditableAnalysisField
                label="상세 해설"
                value={analysis.explanation}
                onCommit={(next) => onEditField({ explanation: next })}
                disabled={disabled}
                minRows={4}
              />
              <EditableAnalysisField
                label="출제 의도"
                value={analysis.intent}
                onCommit={(next) => onEditField({ intent: next })}
                disabled={disabled}
              />
              <EditableAnalysisField
                label="출제 포인트"
                value={analysis.examPoint}
                onCommit={(next) => onEditField({ examPoint: next })}
                disabled={disabled}
              />
              <EditableAnalysisField
                label="접근 전략"
                value={analysis.solvingStrategy}
                onCommit={(next) => onEditField({ solvingStrategy: next })}
                disabled={disabled}
                minRows={3}
              />
              <EditableAnalysisField
                label="난이도 판단 근거"
                value={analysis.difficultyRationale}
                onCommit={(next) => onEditField({ difficultyRationale: next })}
                disabled={disabled}
              />
              {analysis.keyConcepts.length > 0 && (
                <ReadOnlyBlock label="핵심 개념">
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.keyConcepts.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </ReadOnlyBlock>
              )}
              {analysis.trapDesign && analysis.trapDesign.length > 0 && (
                <ReadOnlyBlock label="오답 설계">
                  <ul className="flex flex-col gap-1.5">
                    {analysis.trapDesign.map((t, i) => (
                      <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed">
                        <span className="shrink-0 font-bold text-slate-500">
                          {t.choice}
                        </span>
                        <span className="text-slate-500">{t.why}</span>
                      </li>
                    ))}
                  </ul>
                </ReadOnlyBlock>
              )}
            </div>
          )}
      </div>

      {/* 푸터 — 문항 분석 검수(선택 사항, 게이트 조건 아님) */}
      {entry && analysis && !failed && (
        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          {/* 문제 은행 카드의 검수완료 버튼과 동일 규격(라벨형): 배경 흰색 고정,
              검수완료=초록 테두리 / 미검수=분홍, hover 시 초록 미리보기. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={isConfirmed}
            title={
              isConfirmed
                ? "검수완료 — 누르면 검수를 취소합니다"
                : "검수필요 — 누르면 검수완료로 표시합니다"
            }
            disabled={disabled}
            onClick={onToggleConfirm}
            className={cn(
              "h-9 flex-1 justify-center gap-1.5 bg-white px-2 text-[12px] font-semibold",
              isConfirmed
                ? "border border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                : "border border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600",
            )}
          >
            <CircleCheck className="h-3.5 w-3.5" />
            {isConfirmed ? "검수완료" : "이 문항 분석 검수"}
          </Button>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
            분석 검수 {reviewedCount}/{reviewableCount} · 선택 사항
          </span>
        </div>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="py-12 text-center text-[12px] text-slate-400">{text}</p>
  );
}

function ReadOnlyBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <p className="border-b border-slate-100 bg-slate-50 px-2.5 py-2 text-[11.5px] font-bold text-slate-700">
        {label}
      </p>
      <div className="px-2.5 py-2">{children}</div>
    </div>
  );
}
