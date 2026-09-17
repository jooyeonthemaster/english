"use client";

// ============================================================================
// 클래스 홈 — 4탭 공통 표면 규격 (docs/class-studio-spec.md §3.0)
//
// 감사 결론(L1-02·L1-06·L4-08): 지문·학생 탭은 「카운트 + 주 CTA」 행을 서로 다른
// 타입 스케일·버튼 높이로 그렸고, 결과·설정 탭에는 그 행이 아예 없어 탭을 바꿀
// 때마다 첫 표면 y 가 53px 튀었다. 이 파일이 4탭 공통 규격의 정본이다.
//
//  · SectionHeader — 라벨(text-xs slate-400) + 우측 액션 1개. 행 높이를 min-h-11 로
//    고정해 액션이 없는 탭(결과·설정)도 같은 높이를 차지한다 → 4탭의 콘텐츠 시작
//    y 가 모든 뷰포트에서 동일. 라벨 규격은 지문 탭을 정본으로 삼는다(아이콘 없음).
//  · EmptyState — 빈 상태 박스 단일 규격(rounded-xl 점선 · 아이콘 박스 rounded-xl ·
//    문구 폭 max-w-md · CTA 슬롯). 세 탭이 각자 다른 반경·아이콘·높이로 그리던 것을
//    한 곳으로 모은다(L4-04·L1-14·L4-15·L1-09).
//  · 버튼 클래스 상수 — 헤더/빈 상태 CTA 치수 통일. primary 는 한 화면에 1개:
//    빈 상태에서는 헤더 CTA 를 숨기고 박스 CTA 만 남긴다(L4-10·L1-11).
//
// 터치 타깃: 폰·태블릿 상호작용 요소는 최소 44px(min-h-11) — 포인터 환경인 lg 이상
// 에서만 컴팩트 치수로 줄인다(학생 탭 테이블이 이미 쓰던 lg 기준에 맞춤).
// 주의: h-11 은 밀도 모드(body.smoat-large-ui)가 button.h-11 을 38px 로 !important
// 덮어써 무력화된다 — 높이는 반드시 min-h-11 로 잡을 것(실측 확인).
// ============================================================================

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** 헤더 우측 주 CTA(파랑) — 화면당 1개. 폰·태블릿 44px, lg 이상 컴팩트(정본 = 지문 탭 규격). */
export const HEADER_PRIMARY_BTN =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 lg:min-h-0";

/** 헤더 우측 보조 CTA(흰 테두리) — 같은 치수, 위계만 낮춘다. */
export const HEADER_SECONDARY_BTN =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 lg:min-h-0";

/** 빈 상태 박스 안 주 CTA — 헤더보다 한 단계 크다(그 화면의 유일한 행동). */
export const EMPTY_PRIMARY_BTN =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700";

/** 빈 상태 박스 안 보조 CTA — 다른 탭으로 넘기는 안내형 행동. */
export const EMPTY_SECONDARY_BTN =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600";

/** 4탭 공통 섹션 헤더 — 좌측 라벨 · 우측 액션(선택). 행 높이 고정이 핵심이다. */
export function SectionHeader({
  label,
  action,
}: {
  label: ReactNode;
  /** 그 탭의 primary 1개(없으면 생략 — 행 높이는 그대로 유지된다) */
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-2">
      <p className="min-w-0 text-xs text-slate-400">{label}</p>
      {action ?? null}
    </div>
  );
}

/** 4탭 공통 빈 상태 박스 — 치수는 컴포넌트가 고정하고 호출측은 내용만 정한다. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-sm">
        <Icon className="h-7 w-7 text-blue-500" aria-hidden />
      </span>
      <p className="mt-4 max-w-md text-sm font-semibold leading-relaxed text-slate-700 break-keep">
        {title}
      </p>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400 break-keep">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
