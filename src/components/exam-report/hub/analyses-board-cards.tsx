"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 카드 렌더러
//
// 진행 중 카드(ANALYZING · v4 boost RUNNING)는 analyses-board-progress-cards 의
// 공용 WorkbenchLoadingCard 분기로 조기 이탈한다. 터미널 상태(완료=학생 추가
// CTA+학생·리포트·미분석 칩, 실패=다시 분석, DRAFT=이어서 분석/이어서 등록)는
// 이 파일의 카드 셸. 완료 카드의 최우선 CTA 는 "학생 추가"(플로우 개편) — 학생
// 0명이면 프라이머리로 강하게, 이미 있으면 아웃라인으로 유지한다.
// v4(26-09-02, docs/exam-analysis-v4-spec.md §3 U4-2): INTERNAL 깊이 칩·심층 분석
// 글로우는 `showFunnel`, 하단 힌트 줄은 `renderHint` — 둘 다 additive 라 허브는
// funnel 을 받아도 무시한다(§2.5 U2 「허브도 받되 무시」).
// 페치·필터·삭제 상태는 analyses-board(컨테이너)가 소유한다. 칩은 nowrap(§1-3).
// ============================================================================

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  FileClock,
  Play,
  RotateCw,
  Trash2,
  Upload,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { cn, formatDateTime } from "@/lib/utils";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import {
  ANALYSIS_STATE_CHIP,
  BOARD_CHIP_CLASS,
  isOrphanDraft,
} from "./board-shared";
import { SourceColumn, statusVisual } from "./analyses-board-source-column";
import {
  AnalyzingBoardCard,
  BoostRunningBoardCard,
  MetaChipsRow,
  metaLine,
} from "./analyses-board-progress-cards";

export interface BoardCardProps {
  row: ExamReportSummaryRow;
  /** 다시 분석/이어서 분석 발사 직후 비활성 표시 */
  restarting: boolean;
  onOpen: (row: ExamReportSummaryRow) => void;
  onRestart: (row: ExamReportSummaryRow) => void;
  onResumeDraft: (row: ExamReportSummaryRow) => void;
  /** 분석 완료 카드 "학생 추가" — 워크스페이스 학생 추가 딥링크로 이동 */
  onAddStudent: (row: ExamReportSummaryRow) => void;
  onRequestDelete: (row: ExamReportSummaryRow) => void;
  /**
   * 상세보기(우하단 확대 아이콘) 분리 핸들러(additive, 26-09-01 스튜디오
   * 「시험 분석」 뷰) — 스튜디오에서 카드 클릭=우측 레일 선택 / 확대 아이콘=
   * 워크스페이스 모달로 역할이 갈린다. 미전달 = 기존(onOpen 과 동일) 그대로.
   */
  onExpand?: (row: ExamReportSummaryRow) => void;
  /**
   * 좌측 시험지 썸네일 열 숨김(additive) — 스튜디오 중앙 열은 좁아 사진 열이
   * 본문을 압착한다(26-09-01 사용자 지시 "이 이미지 안 보이게"). true 면 상태
   * 표시는 제목 좌측 아이콘 칩으로 대체되고 카드 최소 높이도 낮아진다.
   */
  hideThumbnail?: boolean;
  /** 선택 카드 하이라이트(additive) — 우측 레일에 열린 분석 표시. */
  active?: boolean;
  /**
   * 하단 액션 행 전체 숨김(additive, 26-09-01 사용자 지시 "버튼들 싹다 오른쪽에")
   * — 스튜디오에서는 학생 추가·시험지 열기·다시 분석·확대 아이콘이 전부 우측
   * 레일로 이사했다. 카드는 순수 선택 리스트 행이 된다(제목 행 삭제 아이콘은
   * 유지 — 목록 관리 동작이라 레일 이사 대상이 아니다). 미전달 = 허브 그대로.
   */
  hideActions?: boolean;
  /**
   * v4 퍼널 어휘(additive, 26-09-02 스펙 §3 U4-2) — INTERNAL 깊이 칩(SHALLOW=
   * 「분석 전」 amber / DEEP=「분석 완료」 emerald — 26-09-04 자구 통일)과 boost
   * RUNNING 글로우 카드를 켠다. 「문항 N」 메타도 이 플래그가 켠다(후보 카드 미러).
   * 미전달(허브) = funnel 을 받아도 무시(§2.5 「허브도 받되 무시」).
   */
  showFunnel?: boolean;
  /**
   * 카드 하단 힌트 줄(additive) — 터미널 카드에만 그린다(진행 카드는 진행 라벨이
   * 그 자리). 스튜디오는 deriveExamNextStep(row).title 을 넣는다(계기판 단일 소스).
   * null/undefined 반환이면 줄 자체를 그리지 않는다.
   */
  renderHint?: (row: ExamReportSummaryRow) => ReactNode;
  /**
   * 「자체 시험지」 칩 숨김(additive) — 2그룹 밴드(groupBySource)가 이미 소속을
   * 말하므로 스튜디오는 생략. 미전달(허브 단일 그리드) = 칩 유지.
   */
  hideSourceChip?: boolean;
}

/**
 * INTERNAL 분석 전 상태 아이콘 — 깊이 칩·힌트와 **같은 amber 어휘·같은 자구**.
 * 자구 계보: 「기본 분석」(내부 용어라 폐기) → 「심층 분석 전」 → **「분석 전」**
 * (26-09-04 사용자 지시 "그냥 분석 전으로 통일"). 자구 정본은 board-shared
 * ANALYSIS_STATE_CHIP — 아이콘·칩·힌트가 서로 다른 이름을 쓰면 같은 상태가
 * 셋으로 보인다. 여기에 자구를 다시 쓰지 말고 그 토큰을 읽는다.
 */
const BASIC_ANALYSIS_VISUAL = {
  Icon: FileClock as LucideIcon,
  tint: "text-amber-600",
  bg: "bg-amber-50",
  label: ANALYSIS_STATE_CHIP.SHALLOW.label,
};

// ── 액션 버튼(카드 내부 — 클릭 버블 차단) ────────────────────────────────────
function ActionButton({
  tone,
  disabled,
  onClick,
  className,
  children,
}: {
  tone: "primary" | "outline" | "rose" | "ghost";
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-50",
        tone === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
        tone === "outline" &&
          "border border-blue-200 bg-white text-blue-700 hover:bg-blue-50",
        tone === "rose" &&
          "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
        tone === "ghost" &&
          "border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ── 카드 본체 ────────────────────────────────────────────────────────────────
// 좌측 열(썸네일/상태 패널)과 statusVisual 은 analyses-board-source-column 으로
// 이사(26-09-02, 500줄 상한) — 동작 무변경.
export function BoardCard({
  row,
  restarting,
  onOpen,
  onRestart,
  onResumeDraft,
  onAddStudent,
  onRequestDelete,
  onExpand,
  hideThumbnail = false,
  active = false,
  hideActions = false,
  showFunnel = false,
  renderHint,
  hideSourceChip = false,
}: BoardCardProps) {
  // 분석 중 — 생성 페이지들과 동일한 공용 로딩 카드로 조기 분기(UI 통일).
  if (row.status === "ANALYZING") {
    return (
      <AnalyzingBoardCard
        row={row}
        onOpen={onOpen}
        onRequestDelete={onRequestDelete}
        active={active}
      />
    );
  }
  // v4: INTERNAL 심층 분석 진행 중 — 같은 글로우 어휘(스펙 §1-2 「은은한 푸른 빛」).
  // showFunnel 게이트라 허브는 boost 가 돌아도 기존 터미널 카드 그대로.
  if (showFunnel && row.funnel?.boost?.status === "RUNNING") {
    return (
      <BoostRunningBoardCard
        row={row}
        onOpen={onOpen}
        onRequestDelete={onRequestDelete}
        active={active}
        // 스튜디오(액션 레일 이사)에서는 심층 분석 중 삭제 금지(과금 잔존·후보
        // 재등재 → 2차 과금). 허브는 그대로.
        hideDelete={hideActions}
      />
    );
  }

  // INTERNAL 은 사진이 원래 없으므로 고아 DRAFT(사진 이어서 등록 유도) 분류에서
  // 제외 — CardBadge 의 동일 가드와 짝(있을 수 없는 상태지만 방어).
  const orphan = row.sourceType !== "INTERNAL" && isOrphanDraft(row);
  const failed = row.status === "FAILED";
  // DRAFT + 사진 있음 = 중단된 분석 — 이어서 분석(무료 재개) 가능.
  const resumableDraft =
    row.status === "DRAFT" && !orphan && row.hasSourceFiles === true;
  // 메타 줄 — INTERNAL 스튜디오 카드는 후보 카드와 **같은 구성**(「중간고사 · 문항 6」)
  // 으로 맞춘다(26-09-04). 후보를 열면 그 자리에서 무과금 승격돼 이 카드로 바뀌는데,
  // 그때 「문항 N」이 사라지면 같은 시험지가 다른 물건으로 보인다.
  const questionCount = showFunnel ? (row.funnel?.questionCount ?? 0) : 0;
  const meta = [
    metaLine(row),
    row.sourceType === "INTERNAL" && questionCount > 0
      ? `문항 ${questionCount}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // V7: 자체 시험지 합성 분석(INTERNAL) — 사진 업로드 없이 시험지(Exam)에서
  // 합성된 분석. 배지로 구분하고, sourceExamId 가 있으면 원본 시험지 배포 탭
  // 딥링크를 보조 링크로 노출한다(배포 기능 플래그 게이트).
  const internalExam =
    FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT && row.sourceType === "INTERNAL";
  const sourceExamHref =
    internalExam && row.sourceExamId
      ? `/director/exams/${row.sourceExamId}?tab=deployment`
      : null;
  // v4 깊이 칩 — INTERNAL 행에만(비INTERNAL 의 depth 는 상태 뱃지가 이미 말한다).
  // funnel 미포함(구버전 API·낙관 행)이면 칩 없음. 색은 신호등 어휘(§4):
  // SHALLOW=amber(다음 행동 있음) / DEEP=emerald(완료).
  const depth =
    showFunnel && row.sourceType === "INTERNAL" ? row.funnel?.depth : undefined;
  // 상태 아이콘 칩 — INTERNAL 완료 행이 아직 심층(DEEP) 전이면 emerald 체크 대신
  // amber FileClock 「기본 분석」: 아이콘·깊이 칩·힌트 줄이 같은 말을 한다.
  const visual =
    showFunnel &&
    row.sourceType === "INTERNAL" &&
    row.status === "ANALYZED" &&
    !orphan &&
    depth !== "DEEP"
      ? BASIC_ANALYSIS_VISUAL
      : statusVisual(row.status, orphan);
  const showSourceChip = internalExam && !hideSourceChip;
  // 칩 자구·색은 후보 카드와 **공용 토큰**(board-shared ANALYSIS_STATE_CHIP) —
  // 26-09-04 「둘 다 심층 분석 전인데 왜 생긴 게 다르지?」의 수리. 여기에 색을
  // 다시 쓰지 마라(두 카드의 표기 문법이 갈리던 지점이다).
  const depthChip =
    depth === "SHALLOW" || depth === "DEEP" ? ANALYSIS_STATE_CHIP[depth] : null;
  const hint = renderHint ? renderHint(row) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (orphan ? onResumeDraft(row) : onOpen(row))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (orphan) onResumeDraft(row);
          else onOpen(row);
        }
      }}
      className={cn(
        // 시험지 관리 카드와 동일한 가로 분할 레이아웃 + 동일 치수(표준 규약).
        // 좌측 열 md 164px × A4(297/210) = 232px 라 md:min-h-[232px] 에서 A4 박스가
        // 열을 정확히 채운다(시험지 카드가 232 를 쓰는 이유와 동일).
        // hideThumbnail(스튜디오): A4 열이 없으니 min-h 강제도 함께 푼다 —
        // 높이는 본문이 결정(콘텐츠 그대로, 빈 공백 없음).
        "group relative flex w-full min-w-0 max-w-full cursor-pointer flex-row overflow-hidden rounded-xl border bg-white text-left transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        !hideThumbnail && "min-h-[128px] md:min-h-[232px]",
        failed
          ? "border-rose-200 hover:border-rose-300"
          : active
            ? "border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.55)]"
            : "border-slate-200 hover:border-slate-300",
      )}
    >
      {/* 좌측: 업로드 사진 썸네일(없으면 상태 패널) — 스튜디오는 숨김 */}
      {!hideThumbnail && <SourceColumn row={row} orphan={orphan} />}

      {/* 우측: 본문 */}
      <div className="flex min-w-0 flex-1 flex-col p-4">
        {/* 제목 + 삭제(우측 상단 아이콘 — 시험지 관리 카드와 동일 규격) */}
        <div className="flex items-start gap-1.5 min-w-0">
          {/* 썸네일 열이 없을 때: 상태 아이콘 칩이 그 시각 정보를 승계한다 */}
          {hideThumbnail && (
            <span
              className={cn(
                "mt-px flex size-6 shrink-0 items-center justify-center rounded-md",
                visual.bg,
                visual.tint,
              )}
              title={visual.label}
              aria-label={visual.label}
            >
              <visual.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
          <h4
            className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-800 line-clamp-2 break-words transition-colors group-hover:text-blue-600"
            title={row.title}
          >
            {row.title}
          </h4>
          <button
            type="button"
            aria-label="삭제"
            title="삭제"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(row);
            }}
            // 카드가 role=button — 포커스된 휴지통에서 Enter 가 버블되면 레일까지
            // 열린다. 키 이벤트도 끊는다.
            onKeyDown={(e) => e.stopPropagation()}
            // 고스트 아이콘(26-09-05) — 구 테두리 상자(border + bg-white)는 카드
            // 10장이면 빈 상자 10개가 목록을 어지럽혔다. 진행 카드(progress-cards
            // DeleteIconAction)와 같은 고스트 문법으로 통일: 호버에 rose 바탕.
            className="-mr-1.5 -mt-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 시험 종류 + 자체 시험지 태그 + v4 깊이 칩 + 우측 날짜(26-09-05).
            nowrap 한 줄: 메타 문자열만 truncate(min-w-0 flex-1)하고 칩·날짜는 자리를
            지킨다 — 구 flex-wrap 은 학교명이 길면 칩이 다음 줄로 떨어졌다. */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {meta && (
            <span
              className="min-w-0 truncate text-[11px] text-slate-500"
              title={meta}
            >
              {meta}
            </span>
          )}
            {showSourceChip && (
              // 자구는 그룹 탭과 **한 벌**이다(26-09-03 사용자 지시 "자체 시험지가
              // 아니라 스모트 시험지야") — analyses-board-groups GROUP_LABEL.internal.
              <span className="shrink-0 whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                스모트 시험지
              </span>
            )}
            {depthChip && (
              <span
                data-analysis-depth={depth}
                className={cn(BOARD_CHIP_CLASS, depthChip.className)}
              >
                {depthChip.label}
              </span>
            )}
        </div>

        {/* 고아 DRAFT 안내 */}
        {orphan && (
          <p className="mt-1 text-[11px] text-slate-400">
            시험지 사진이 업로드되지 않았습니다. 이어서 등록하거나 삭제해 주세요.
          </p>
        )}

        {/* 집계 칩 줄(분석 중 카드와 공용) — 타임스탬프는 아래 마지막 줄(힌트
            아래 왼쪽 정렬 <p>)로 이사했으므로 여기서는 끈다(두 번 그리지 않는다). */}
        <MetaChipsRow row={row} className="mt-2" showTimestamp={false} />

        {/* v4 힌트 줄 — 「다음 단계」 1줄(호출부가 11px slate-500 truncate 로 조판).
            계기판 단일 소스 deriveExamNextStep — 카드에서 판정을 복제하지 않는다. */}
        {hint ? (
          <div data-analysis-hint className="mt-2 min-w-0">
            {hint}
          </div>
        ) : null}

        {/* 마지막 수정일 — 힌트 아래 **왼쪽 정렬** 한 줄(26-09-05 사용자 지시 "시험지
            이름이 2줄로 나뉘는 게 마음에 안 들어"). 제목 줄 우측에 두면 날짜 폭만큼
            제목이 접혀 2줄이 됐고, 메타 줄 우측도 좁은 열에선 같은 압착이다. 본문
            왼쪽 끝선(메타·집계 줄과 같은 x)에 맞춰 마지막 줄로 내리면 제목·메타가
            폭을 온전히 쓴다. 연월일 시:분 전문(툴팁 불필요). 후보(analyses-board-candidate-card) 카드와 동일. */}
        <p
          title="마지막 수정일"
          className="mt-2 whitespace-nowrap text-[10.5px] leading-none tabular-nums text-slate-400"
        >
          {formatDateTime(row.updatedAt)}
        </p>

        {/* 하단 액션 — 상태별 CTA + 상세보기(시험지 관리 카드 파리티).
            flex-wrap(26-09-01): 좁은 열에서 보조 링크·아이콘이 프라이머리를
            압착하는 대신 다음 줄로 내려간다 — 라벨 절단 0 원칙.
            hideActions(스튜디오): 행 통째 미렌더 — 액션은 우측 레일이 정본. */}
        {hideActions ? null : (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {/* 분석 완료 — 최우선 CTA "학생 추가"(딥링크로 다이얼로그 즉시 오픈).
                학생 0명이면 프라이머리로 다음 행동을 못박고, 이미 있으면 아웃라인. */}
            {row.status === "ANALYZED" && (
              <ActionButton
                tone={row.studentCount === 0 ? "primary" : "outline"}
                className="min-w-0 flex-1 basis-[120px] justify-center"
                onClick={() => onAddStudent(row)}
              >
                <UserRoundPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">학생 추가</span>
              </ActionButton>
            )}
            {failed && (
              <ActionButton
                tone="rose"
                className="min-w-0 flex-1 basis-[120px] justify-center"
                disabled={restarting}
                onClick={() => onRestart(row)}
              >
                <RotateCw
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    restarting && "animate-spin",
                  )}
                />
                <span className="truncate">
                  {restarting ? "재시작 중" : "다시 분석"}
                </span>
              </ActionButton>
            )}
            {resumableDraft && (
              <ActionButton
                tone="primary"
                className="min-w-0 flex-1 basis-[120px] justify-center"
                disabled={restarting}
                onClick={() => onRestart(row)}
              >
                <Play className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {restarting ? "시작 중" : "이어서 분석"}
                </span>
              </ActionButton>
            )}
            {orphan && (
              <ActionButton
                tone="primary"
                className="min-w-0 flex-1 basis-[120px] justify-center"
                onClick={() => onResumeDraft(row)}
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">이어서 등록</span>
              </ActionButton>
            )}
            {/* INTERNAL — 원본 시험지 배포 탭 보조 링크. 카드 자체가 role=button
                이므로 click/keydown 버블을 끊어 카드 열기와 충돌하지 않게 한다. */}
            {sourceExamHref && (
              <Link
                href={sourceExamHref}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                시험지 열기
              </Link>
            )}
          </div>

          {/* 상세보기 — 미전달이면 카드 열기와 동일(허브), 스튜디오는 onExpand
              (워크스페이스 모달)로 갈라진다. orphan 은 양쪽 다 이어서 등록. */}
          <CardDetailIconButton
            className="size-7 shrink-0 rounded-md shadow-none"
            iconClassName="size-3.5"
            onClick={(e) => {
              e.stopPropagation();
              if (orphan) onResumeDraft(row);
              else (onExpand ?? onOpen)(row);
            }}
          />
        </div>
        )}
      </div>
    </div>
  );
}
