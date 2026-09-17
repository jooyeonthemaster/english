"use client";

// ============================================================================
// 「기출 문제 불러오기」 전폭 진입 버튼 (docs/gichul-question-bank-spec.md §11.2 F-7)
//
// composer-list-pane.tsx 의 분할 파일. 2층 필터 줄 아래 전폭 줄(위치 ①)과 빈 상태
// CTA(위치 ②)가 **같은 모양**을 쓴다 — 같은 화면에서 같은 뜻은 같은 모양. 전에는
// JSX 2벌이 판 안에 복제돼 있었고(C2 검수 minor), 한쪽만 고치면 다른 쪽이 조용히
// 드리프트했다(실제로 짧은 문구 분기가 둘 다에서 빠져 있었다). 여기 한 곳이 정본.
//
// 프로브 계약(변경 금지): 자구 「기출 문제 불러오기」는 버튼의 **텍스트 노드**로
// 남긴다 — 프로브가 `data-tour` 와 텍스트 둘 다로 집는다(보조 문구는 별도 span
// 이라 무관). `data-tour` 값은 호출부가 prop 으로 준다(위치 ① `composer-exam-bank`,
// 위치 ② `composer-exam-bank-empty`).
// ============================================================================

import { BookMarked, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * `@container` 를 버튼 자신에 둔다: 판 루트(`data-tour="composer-list"`)는 컨테이너가
 * 아니고 목록 스크롤 영역의 `@container` 는 이 버튼의 조상이 아니다 — 보조 문구의
 * `@[34rem]` 이 어디 폭을 보는지 버튼 스스로 정해야 뷰포트 유틸 없이 조판 중
 * 420px 에서 짧은 문구로 접히고 넓은 비조판 폭에서 긴 문구가 나타난다.
 */
const EXAM_BANK_CTA_CLS =
  "@container flex w-full cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-3 text-[12px] font-bold text-blue-700 transition-colors hover:border-blue-300 hover:from-blue-100";

const SUMMARY_CLS = "text-[11px] font-medium text-blue-500/80";

export function ExamBankEntryButton({
  onClick,
  summary,
  summaryShort,
  tour,
  className,
}: {
  /** 0인자 함수 — 호스트의 `onOpenExamBank` 를 그대로 흘린다(memo 계약). */
  onClick: () => void;
  /**
   * 우측 보조 문구 긴 형(예 「평가원·교육청 3,076문항 · 2005~2027」). 버튼 폭 34rem
   * 이상에서만 보인다. 빈 값 = 긴 형 생략.
   */
  summary?: string;
  /**
   * 우측 보조 문구 짧은 형(예 「3,076문항」) — §11.2 「34rem 미만이면 「3,076문항」만」.
   * 34rem 미만에서만 보인다. 빈 값 = 짧은 형 생략(좁은 폭에선 화살표만 남는다).
   */
  summaryShort?: string;
  /** `data-tour` 값 — 프로브·투어 계약 셀렉터라 호출부가 고정 문자열로 준다. */
  tour: string;
  /** 높이·여백 등 호출부 고유 클래스(예 `h-9` / `mt-1 h-10 shrink-0`). */
  className?: string;
}) {
  // 두 span 은 폭에 따라 정확히 하나만 보인다(hidden @[34rem]:inline ↔ @[34rem]:hidden).
  // ChevronRight 규칙: 보이는 보조 span 이 없을 때만 화살표가 ml-auto 로 오른쪽 끝에
  // 가고, span 이 보이면 span 이 ml-auto 를 갖고 화살표는 ml-0 으로 양보한다(둘 다
  // ml-auto 면 여백이 반씩 갈려 span 이 가운데 뜬다). 어느 span 이 보이는지는 폭이
  // 정하므로 화살표의 ml 도 같은 폭 기준으로 갈라 둔다.
  const hasLong = Boolean(summary);
  const hasShort = Boolean(summaryShort);
  return (
    <button
      type="button"
      data-tour={tour}
      onClick={onClick}
      className={cn(EXAM_BANK_CTA_CLS, className)}
    >
      <BookMarked className="size-4" aria-hidden="true" />
      기출 문제 불러오기
      {hasLong ? (
        <span className={cn(SUMMARY_CLS, "ml-auto hidden @[34rem]:inline")}>
          {summary}
        </span>
      ) : null}
      {hasShort ? (
        <span className={cn(SUMMARY_CLS, "ml-auto @[34rem]:hidden")}>
          {summaryShort}
        </span>
      ) : null}
      <ChevronRight
        className={cn(
          "size-3.5 text-blue-400",
          // 34rem 미만: 짧은 span 이 있으면 양보, 없으면 화살표가 ml-auto.
          hasShort ? "ml-0" : "ml-auto",
          // 34rem 이상: 긴 span 이 있으면 양보, 없으면 화살표가 ml-auto.
          hasLong ? "@[34rem]:ml-0" : "@[34rem]:ml-auto",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
