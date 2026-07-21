"use client";

// 시험 탭 — 응시 기록 테이블 카드 (v3 대개편 A-1, v3 design §D1-3 시험 와이어 [D] 2행 좌)
//
// 구 student-exam-history-tab.tsx SittingsTable 이식. 변경분:
//  - 카드 셸 kit AnalyticsCard(R2) + 테이블 관용구는 assignment-detail-parts
//    헤더/행 클래스 미러(bg-slate-50 헤더 · border-slate-50 행).
//  - 토스 hex 전량 제거 → slate/blue 토큰. 구분 배지는 EXAM_SCOPE_LABELS
//    (「배포 시험/내신 분석」 — 스코프 칩과 같은 말, 구 「자체/외부」 폐기).
//  - 행 클릭: INTERNAL → ReviewDrawer(셸 소유 — onReview 콜백만) /
//    EXTERNAL → 내신 분석 워크스페이스 딥링크 새 탭(구 로직 이식).
//  - highlightRefId: 점수율 추이 점 클릭 연동 — 해당 행 강조 + 가시 스크롤.
// 미확인>0 행은 rose 강조 + 「확정 필요」 라벨(UNKNOWN 불변식 표출) 유지.

import { useEffect, useRef } from "react";
import { ClipboardList, ExternalLink } from "lucide-react";
import type { TrendSitting } from "@/lib/exam-scoring/trend";
import { EXAM_SCOPE_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { AnalyticsCard, CardEmpty } from "../analytics/kit";

/** EXTERNAL 행의 리포트 워크스페이스 딥링크 — analysisId 미동봉(구 스냅샷)이면 null.
 *  분석 탭(?step=analysis)에 곧장 착지 — 채점 도구가 아니라 결과를 보러 가는 맥락. */
function externalReportHref(sitting: TrendSitting): string | null {
  if (sitting.source !== "EXTERNAL" || !sitting.examAnalysisId) return null;
  return `/director/workbench/exam-report/${sitting.examAnalysisId}/students/${sitting.refId}?step=analysis`;
}

/** 정오 요약 — 미확인>0 이면 rose 강조 + 「확정 필요」 마이크로 라벨(UNKNOWN 불변식) */
function VerdictSummaryCell({ sitting }: { sitting: TrendSitting }) {
  const base = [`정답 ${sitting.correct}`, `오답 ${sitting.wrong}`];
  if (sitting.partial > 0) base.push(`부분 ${sitting.partial}`);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span>{base.join(" · ")}</span>
      {sitting.unknown > 0 && (
        <>
          <span className="font-semibold text-rose-600">미확인 {sitting.unknown}</span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
            확정 필요
          </span>
        </>
      )}
    </span>
  );
}

const ROW_ACTION_CLASS =
  "inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50";

export function SittingsTableCard({
  sittings,
  highlightRefId,
  onReview,
  className,
}: {
  /** 스코프 필터 적용 후 시계열(날짜 오름차순) — 회차 번호는 이 배열 순서(차트와 동일 축) */
  sittings: TrendSitting[];
  /** 점수율 추이 점 클릭 연동 — 강조할 응시 refId(셸 리프트 상태) */
  highlightRefId: string | null;
  /** INTERNAL 행 드릴다운 — ExamSubmission.id 로 ReviewDrawer 오픈(셸 소유) */
  onReview: (submissionId: string) => void;
  className?: string;
}) {
  // 시계열(오름차순) 인덱스가 회차 번호 — 표는 최신부터 보여준다.
  const rows = sittings.map((sitting, i) => ({ sitting, round: i + 1 })).reverse();

  // 하이라이트 행을 카드 내부 스크롤에서 가시 범위로 — 점 클릭의 시선 유도
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  useEffect(() => {
    if (!highlightRefId) return;
    rowRefs.current
      .get(highlightRefId)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightRefId]);

  return (
    <AnalyticsCard
      className={className}
      icon={<ClipboardList className="size-4 text-blue-600" aria-hidden />}
      title="응시 기록"
      aside={
        sittings.length > 0 ? (
          <span className="text-[12px] tabular-nums text-slate-400">
            총 {sittings.length}회 · 채점 완료 응시만 표시
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <CardEmpty text="이 구분의 응시 기록이 없습니다." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[12px] text-slate-500">
                <th className="px-3 py-2 font-medium">회차</th>
                <th className="px-3 py-2 font-medium">시험명</th>
                <th className="px-3 py-2 font-medium">구분</th>
                <th className="px-3 py-2 font-medium">일자</th>
                <th className="px-3 py-2 text-right font-medium">점수</th>
                <th className="px-3 py-2 font-medium">정오 요약</th>
                <th className="px-3 py-2" aria-label="상세 열기" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sitting, round }) => {
                const reportHref = externalReportHref(sitting);
                const clickable = sitting.source === "INTERNAL" || reportHref != null;
                const highlighted = sitting.refId === highlightRefId;
                const openRow = () => {
                  if (sitting.source === "INTERNAL") onReview(sitting.refId);
                  else if (reportHref)
                    window.open(reportHref, "_blank", "noopener,noreferrer");
                };
                return (
                  <tr
                    key={sitting.refId}
                    ref={(el) => {
                      if (el) rowRefs.current.set(sitting.refId, el);
                      else rowRefs.current.delete(sitting.refId);
                    }}
                    onClick={clickable ? openRow : undefined}
                    className={cn(
                      "border-b border-slate-50 transition-colors last:border-0",
                      clickable && "cursor-pointer hover:bg-blue-50/40",
                      highlighted && "bg-blue-50/70",
                    )}
                  >
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-400">
                      {round}회
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <span
                        className="block truncate font-medium text-slate-900"
                        title={sitting.title}
                      >
                        {sitting.title}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {sitting.source === "INTERNAL" ? (
                        <span className="inline-flex whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          {EXAM_SCOPE_LABELS.INTERNAL}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {EXAM_SCOPE_LABELS.EXTERNAL}
                          </span>
                          {sitting.examTypeLabel && (
                            <span className="text-[11px] text-slate-400">
                              {sitting.examTypeLabel}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                      {sitting.date.slice(0, 10)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                      {sitting.scorePct == null ? "—" : `${sitting.scorePct}%`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                      <VerdictSummaryCell sitting={sitting} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {sitting.source === "INTERNAL" ? (
                        <button
                          type="button"
                          className={ROW_ACTION_CLASS}
                          onClick={(e) => {
                            e.stopPropagation();
                            onReview(sitting.refId);
                          }}
                        >
                          답안 보기
                        </button>
                      ) : reportHref ? (
                        <a
                          href={reportHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={ROW_ACTION_CLASS}
                          onClick={(e) => e.stopPropagation()}
                        >
                          리포트 열기
                          <ExternalLink className="size-3.5 text-slate-400" />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AnalyticsCard>
  );
}
