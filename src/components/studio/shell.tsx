"use client";

// ============================================================================
// 클래스 스튜디오 — 공통 셸 (docs/class-studio-spec.md §3.0 정본)
//
// 세 페이지(목록·클래스 홈·지문 스튜디오)가 하나의 제품으로 보이게 하는 골격:
// 시트 배경(#F4F6F9)·본문 폭·패딩·브레드크럼(클래스 컨텍스트 상실 금지)·타이틀 행.
// 페이지는 이 셸 안에 자기 콘텐츠만 채운다 — 레이아웃 관용구를 각자 재발명하면
// "페이지별 통일성 최악"(2026-08-10 사용자 지적)이 재발한다.
// ============================================================================

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

export interface StudioCrumb {
  label: string;
  /** 부재 = 현재 화면(볼드·비링크) */
  href?: string;
}

export function StudioShell({
  crumbs,
  backHref,
  title,
  titleMeta,
  actions,
  wide = false,
  children,
}: {
  /** 첫 조각은 항상 "클래스 스튜디오"(/director/studio) — 호출부가 명시적으로 넘긴다 */
  crumbs: StudioCrumb[];
  /** 모바일 관성 동선용 뒤로가기(브레드크럼과 병존). 부재 시 화살표 없음 */
  backHref?: string;
  title: ReactNode;
  /** 타이틀 아래 메타 줄(출처·분석 일시 등) */
  titleMeta?: ReactNode;
  /** 타이틀 행 우측 액션 슬롯 */
  actions?: ReactNode;
  /** 지문 스튜디오처럼 우측 레일이 있는 화면 — 본문 폭 확장 */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    // 시트 배경 블리드 = 부모(AdminShell main)의 실제 패딩과 **정확히** 같아야 한다.
    // 실측(2026-08-10): md 미만 12px · md 이상 24px → -mx-3 / md:-mx-6.
    // 코드상 클래스는 p-4 md:p-6 이지만 전역 오버라이드로 폰이 12px 이라, -mx-4 를
    // 쓰면 좌우 4px 씩 넘쳐 가로 스크롤 + 배경 안 칠해진 흰 띠가 생겼다.
    // overflow-x-clip 은 자식이 우발적으로 넘칠 때의 2차 안전망.
    <div className="-mx-3 -mt-3 min-h-[calc(100vh-3.5rem)] overflow-x-clip bg-[#F4F6F9] md:-m-6">
      <div
        className={`mx-auto flex flex-col px-4 pb-8 pt-5 md:px-8 ${
          wide ? "max-w-5xl xl:max-w-[1200px]" : "max-w-5xl"
        }`}
      >
        {/* 브레드크럼 — 내가 어느 클래스·지문에 있는지 항상 보인다.
            루트 화면(조각 1개 = 타이틀과 같은 말)에서는 숨긴다 — 같은 문자열을
            두 줄 연속으로 보여 주는 것은 정보가 아니라 소음이다. */}
        <nav
          aria-label="위치"
          className={`flex min-w-0 items-center gap-1 pr-16 text-xs min-[1400px]:pr-0 ${crumbs.length > 1 ? "" : "hidden"}`}
        >
          {/* 루트·중간 조각은 짧으므로 자르지 않는다(자르면 "클래스 스…"가 되어 컨텍스트
              자체가 사라진다). 길이가 가변인 마지막 조각만 남는 폭에서 말줄임한다. */}
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span
                key={`${c.label}-${i}`}
                className={`flex items-center gap-1 ${isLast ? "min-w-0" : "shrink-0"}`}
              >
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />}
                {c.href ? (
                  <Link
                    href={c.href}
                    className={`font-medium text-slate-400 hover:text-slate-600 ${isLast ? "truncate" : "whitespace-nowrap"}`}
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span
                    className={`font-bold text-slate-900 ${isLast ? "truncate" : "whitespace-nowrap"}`}
                  >
                    {c.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>

        {/* 타이틀 행 — 브레드크럼이 숨은 루트 화면에서는 위 여백을 주지 않는다.
            우측 pr-16: 앱 전역 우상단 플로팅 버튼(64×56 fixed)이 액션 슬롯을 덮는다.
            실측(2026-08-10): 768·1024·1280 에서 겹치고 1400 이상에서 해소되므로
            그 지점까지만 자리를 비워 둔다 — 브레드크럼도 같은 이유로 함께 밀린다. */}
        <div
          className={`flex flex-wrap items-center gap-3 pr-16 min-[1400px]:pr-0 ${crumbs.length > 1 ? "mt-2.5" : ""}`}
        >
          {backHref && (
            <Link
              href={backHref}
              aria-label="뒤로"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          {/* h1 은 화면의 1급 정체성 앵커다 — 1줄 truncate 로 6~8자에서 잘리면
              바로 위 브레드크럼보다 정보가 적어지는 역전이 난다(감사 실측).
              2줄까지 허용하고 어절 단위로 접는다. */}
          <div className="min-w-0 flex-1 basis-40">
            <h1 className="line-clamp-2 text-base font-bold text-slate-900 break-keep md:text-lg">
              {title}
            </h1>
            {titleMeta && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 [&>*]:whitespace-nowrap">
                {titleMeta}
              </div>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  );
}
