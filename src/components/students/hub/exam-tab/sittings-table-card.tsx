"use client";

// 시험 탭 — 응시 기록 테이블 카드 (v3 대개편 A-1 → 2607 §7.1·§7.2 재배치)
//
// 구 student-exam-history-tab.tsx SittingsTable 이식. 변경분:
//  - 카드 셸 kit AnalyticsCard(R2) + 테이블 관용구는 assignment-detail-parts
//    헤더/행 클래스 미러(bg-slate-50 헤더 · border-slate-50 행).
//  - 토스 hex 전량 제거 → slate/blue 토큰. 구분 배지는 EXAM_SCOPE_LABELS
//    (「배포 시험/내신 분석」 — 스코프 칩과 같은 말, 구 「자체/외부」 폐기).
//  - 행 클릭: INTERNAL → SubmissionDetailModal(셸 소유 — onReview 콜백만) /
//    EXTERNAL → 내신 분석 리포트 딥링크.
//  - highlightRefId: 점수율 추이 점 클릭 연동 — 해당 행 강조 + 가시 스크롤.
// 미확인>0 행은 rose 강조 + 「확정 필요」 라벨(UNKNOWN 불변식 표출) 유지.
//
// 2607 §7.2 수리 3건:
//  1) EXTERNAL 을 새 탭(window.open)으로 던지던 것을 **같은 탭 router.push** 로
//     바꾸고 `from` 에 지금 주소를 실어 리포트에서 되돌아올 수 있게 했다. 새 탭은
//     허브의 스코프·폴링 문맥을 통째로 버려 "왜 돌아올 수 없지"가 반복됐다.
//  2) examAnalysisId 가 없는 EXTERNAL 행은 액션 셀이 **비어 있었다** — 왜 못 여는지
//     화면에 근거가 없다. 비활성 버튼 + 사유 title(glossary)로 노출한다.
//  3) 회차 셀에 날짜를 병기한다. 표는 최신이 위(내림차순)인데 점수율 추이 차트는
//     오름차순이라 「1회」가 어느 쪽 끝인지 매번 헷갈렸다.
//
// 2607 적대 검수 수리 4건:
//  4) [23 critical] 날짜를 `sitting.date.slice()` 로 잘라 쓰던 것을 폐기하고 KST
//     헬퍼(utils.formatDate = kstParts)로 바꿨다. trend.ts 는 UTC ISO 를 싣기
//     때문에 KST 00:00~08:59 응시가 전부 전날로 보였고, 같은 응시를 연 상세
//     모달은 formatDateTime(KST)이라 표와 모달의 날짜가 하루 어긋났다.
//     (정렬축은 trend.ts 소관이라 건드리지 않는다 — 표시층에서만 변환한다.)
//  5) [85·100·119] 같은 날짜가 회차 셀(07.23)과 「일자」 컬럼(2026-07-23)에 두 번
//     찍혔다. §7.2 가 요구한 것은 회차 셀 병기이므로 중복인 「일자」 컬럼을 접고
//     회차 셀 날짜를 전체 표기(2026.07.24)로 승격했다 — 정보 손실 없이 열이
//     하나 줄어 좁은 폭에서 점수·정오 요약이 먼저 밀려나던 것도 완화된다.
//  6) [86] 점수 셀이 무채색(slate-900)이라 12.5% 와 90% 가 같은 무게로 보였다.
//     kit 의 scoreText(50/80 임계)를 적용해 모달·히트맵과 색 언어를 통일한다.
//  7) [141] sticky 액션 셀만 hover 틴트에서 빠져 마지막 열이 떨어져 보이던 것을
//     행 group + group-hover 로 묶었다.
//
// 전폭 배치(§7.1) 전제: 카드 높이를 부모가 h-[420px] 로 고정하지 않고 내부
// 컨테이너가 max-h-[360px] 로 스크롤한다 — 응시가 적으면 카드도 짧아진다.

import { useEffect, useRef } from "react";
import { ClipboardList, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import type { TrendSitting } from "@/lib/exam-scoring/trend";
import {
  EXAM_ROW_DISABLED_REASONS,
  EXAM_SCOPE_LABELS,
} from "@/lib/wording/director-glossary";
import { cn, formatDate } from "@/lib/utils";
import { AnalyticsCard, CardEmpty, scoreText } from "../analytics/kit";

/** EXTERNAL 행의 리포트 워크스페이스 딥링크 — analysisId 미동봉(구 스냅샷)이면 null.
 *  분석 탭(?step=analysis)에 곧장 착지 — 채점 도구가 아니라 결과를 보러 가는 맥락. */
function externalReportHref(sitting: TrendSitting): string | null {
  if (sitting.source !== "EXTERNAL" || !sitting.examAnalysisId) return null;
  return `/director/workbench/exam-report/${sitting.examAnalysisId}/students/${sitting.refId}?step=analysis`;
}

/**
 * 돌아오기 경로(`from`) — 클릭 시점의 실제 주소(?tab=exams 포함).
 * useSearchParams 로 읽으면 이 카드를 품는 페이지 전체가 Suspense 경계를 요구하므로
 * (허브는 그 경계가 없다) 클릭 핸들러 안에서 window.location 으로만 읽는다.
 */
function hrefWithReturn(href: string): string {
  if (typeof window === "undefined") return href;
  const from = `${window.location.pathname}${window.location.search}`;
  return `${href}&from=${encodeURIComponent(from)}`;
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

/** 비활성 액션 — 사유는 title·aria-label 로(§D2-1 관용: 버튼을 지우지 않고 이유를 남긴다).
 *  라벨색은 slate-300(1.5:1)이면 배경과 구분되지 않아 「버튼이 있긴 한가」가 되므로 400. */
const ROW_ACTION_DISABLED_CLASS =
  "inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[12px] font-semibold text-slate-400";

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
  /** INTERNAL 행 드릴다운 — ExamSubmission.id 로 시험 상세 모달 오픈(셸 소유) */
  onReview: (submissionId: string) => void;
  className?: string;
}) {
  const router = useRouter();

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
          // 「최신순」을 명시한다 — 표는 내림차순, 점수율 추이 차트는 오름차순이라
          // 회차 축 방향이 서로 반대다(§7.2 혼동 해소의 나머지 절반)
          <span className="text-[12px] tabular-nums text-slate-500">
            총 {sittings.length}회 · 최신순 · 채점 완료 응시만 표시
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <CardEmpty text="이 구분의 응시 기록이 없습니다." />
      ) : (
        // 전폭 카드라 세로 상한만 두고(§7.1) 그 안에서만 스크롤한다 — 페이지가
        // 응시 수에 따라 무한히 길어지지 않으면서 아래 2열 그리드가 항상 접힘선 근처에 온다.
        <div className="max-h-[360px] overflow-auto">
          {/* 「일자」 컬럼을 접어 6열 → 5열(+액션). 최소 폭도 620 → 560 으로 내려
              900px 뷰포트에서 점수·정오 요약이 가장 먼저 잘려나가던 것을 줄인다. */}
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-slate-100 bg-slate-50 text-[12px] text-slate-500">
                <th className="whitespace-nowrap px-3 py-2 font-medium">회차 · 일자</th>
                <th className="px-3 py-2 font-medium">시험명</th>
                <th className="px-3 py-2 font-medium">구분</th>
                <th className="px-3 py-2 text-right font-medium">점수</th>
                <th className="px-3 py-2 font-medium">정오 요약</th>
                {/* 액션 열은 가로 스크롤 중에도 붙어 있어야 한다 — 「답안 보기」가
                    잘려 보이지 않던 것이 드릴다운을 못 찾는 주된 이유였다 */}
                <th
                  className="sticky right-0 z-10 border-l border-slate-100 bg-slate-50 px-3 py-2"
                  aria-label="상세 열기"
                />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sitting, round }) => {
                const reportHref = externalReportHref(sitting);
                const isInternal = sitting.source === "INTERNAL";
                const clickable = isInternal || reportHref != null;
                const highlighted = sitting.refId === highlightRefId;
                const openRow = () => {
                  if (isInternal) onReview(sitting.refId);
                  else if (reportHref) router.push(hrefWithReturn(reportHref));
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
                      // group: sticky 액션 셀이 행 hover 틴트를 따라오게 하는 앵커
                      "group border-b border-slate-50 transition-colors last:border-0",
                      clickable && "cursor-pointer hover:bg-blue-50/40",
                      highlighted ? "bg-blue-50/70" : "bg-white",
                    )}
                  >
                    {/* 회차 + 날짜 병기 — 표(최신 위)와 추이 차트(오름차순)의 방향 혼동 해소.
                        날짜는 KST 전체 표기(구 「일자」 컬럼을 흡수) — UTC 절단 금지. */}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="flex flex-col leading-tight">
                        <span className="text-xs font-semibold tabular-nums text-slate-500">
                          {round}회
                        </span>
                        <span className="text-[12px] tabular-nums text-slate-500">
                          {formatDate(sitting.date)}
                        </span>
                      </span>
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
                      {isInternal ? (
                        <span className="inline-flex whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          {EXAM_SCOPE_LABELS.INTERNAL}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {EXAM_SCOPE_LABELS.EXTERNAL}
                          </span>
                          {sitting.examTypeLabel && (
                            <span className="text-[12px] text-slate-500">
                              {sitting.examTypeLabel}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    {/* 점수 톤(§1.1 불변 계약) — <50 rose / <80 blue / ≥80 emerald.
                        미확정(null)은 값이 아니므로 톤을 입히지 않고 슬레이트 대시. */}
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums",
                        sitting.scorePct == null
                          ? "text-slate-400"
                          : scoreText(sitting.scorePct),
                      )}
                    >
                      {sitting.scorePct == null ? "—" : `${sitting.scorePct}%`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                      <VerdictSummaryCell sitting={sitting} />
                    </td>
                    <td
                      className={cn(
                        "sticky right-0 z-10 whitespace-nowrap border-l border-slate-100 px-3 py-2.5 text-right",
                        // sticky 셀은 행 배경을 덮으므로 명시적으로 칠한다. hover 틴트도
                        // 행의 group 을 받아 같이 물들여야 마지막 열이 떨어져 보이지 않는다.
                        highlighted
                          ? "bg-blue-50"
                          : clickable
                            ? "bg-white group-hover:bg-blue-50/40"
                            : "bg-white",
                      )}
                    >
                      {isInternal ? (
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
                        // 같은 탭 이동(§7.2). a 로 두어 새 탭 열기·링크 복사는 살리되
                        // 기본 클릭은 router.push 로 가로채 `from` 을 싣는다.
                        <a
                          href={reportHref}
                          className={ROW_ACTION_CLASS}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            router.push(hrefWithReturn(reportHref));
                          }}
                        >
                          리포트 열기
                          <ExternalLink className="size-3.5 text-slate-400" aria-hidden />
                        </a>
                      ) : (
                        // examAnalysisId 미동봉(구 스냅샷) EXTERNAL 행 — 버튼을 지우지
                        // 않고 사유를 남긴다. title 은 hover 전용이라 터치·보조기술에서
                        // 사라지므로 aria-label 로도 같은 사유를 싣는다.
                        <button
                          type="button"
                          disabled
                          title={EXAM_ROW_DISABLED_REASONS.NO_REPORT}
                          aria-label={`리포트 열기 — ${EXAM_ROW_DISABLED_REASONS.NO_REPORT}`}
                          className={ROW_ACTION_DISABLED_CLASS}
                          onClick={(e) => e.stopPropagation()}
                        >
                          리포트 열기
                        </button>
                      )}
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
