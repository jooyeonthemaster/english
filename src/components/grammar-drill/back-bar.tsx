"use client";

// ============================================================================
// BackBar — /g 몰입 화면 공용 뒤로가기 헤더 행 (비주얼 전용)
//
// 각 화면이 손제작하던 셰브런 헤더(h-10/h-11/gw-iconbtn 3종 난립)를 하나의
// 스펙으로 수렴한다. 목적지·핸들러는 화면이 그대로 소유한다 — 이 컴포넌트는
// 네비게이션 정책(스펙 §4.2: 명시 경로, router.back() 금지)을 바꾸지 않는다.
//
// 형태 3종:
//  - label:   페이지형(트랙·유닛·도구) — 셰브런 옆 gd-label, h1 은 페이지가 렌더
//  - title:   플레이어형(드릴·q) — 한 줄 제목 + right 슬롯(카운터 등)
//  - eyebrow+title: 2행형(레슨 플레이어·w 뷰어) — 상단 라벨 + 제목
// ============================================================================

import Link from "next/link";
import { ArrowLeft, ChevronLeft } from "lucide-react";

export function BackBar({
  onBack,
  href,
  ariaLabel,
  label,
  eyebrow,
  title,
  right,
  icon = "chevron",
  className,
}: {
  /** 뒤로가기 핸들러 — href 와 둘 중 하나만 준다 */
  onBack?: () => void;
  /** 뒤로가기 링크 목적지 — onBack 과 둘 중 하나만 준다 */
  href?: string;
  /** 뒤로가기 버튼 aria-label — 기존 화면 문구를 그대로 전달 */
  ariaLabel: string;
  /** 페이지형: 셰브런 옆 소형 캡 라벨 */
  label?: string;
  /** 2행형: 제목 위 라벨 (title 과 함께 사용) */
  eyebrow?: string;
  /** 플레이어형/2행형: 제목 */
  title?: string;
  /** 우측 슬롯 — 진행 카운터·줌 버튼 등 */
  right?: React.ReactNode;
  icon?: "chevron" | "arrow";
  className?: string;
}) {
  const Icon = icon === "arrow" ? ArrowLeft : ChevronLeft;
  const iconEl = <Icon className="h-5 w-5" strokeWidth={2} />;
  const back = href ? (
    <Link href={href} className="gd-iconbtn -ml-2" aria-label={ariaLabel}>
      {iconEl}
    </Link>
  ) : (
    <button type="button" onClick={onBack} className="gd-iconbtn -ml-2" aria-label={ariaLabel}>
      {iconEl}
    </button>
  );

  return (
    <div className={`flex items-center ${label ? "gap-1" : "gap-2"} ${className ?? ""}`}>
      {back}
      {label ? (
        <p className="gd-label">{label}</p>
      ) : eyebrow !== undefined ? (
        <div className="min-w-0 flex-1">
          <p className="gd-t-2xs truncate" style={{ color: "var(--gd-ink-3)" }}>
            {eyebrow}
          </p>
          <p className="gd-t-sm truncate font-bold">{title}</p>
        </div>
      ) : title !== undefined ? (
        <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">{title}</p>
      ) : null}
      {right}
    </div>
  );
}
