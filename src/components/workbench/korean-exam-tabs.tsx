"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, Link2, ChartNoAxesCombined } from "lucide-react";

const TABS = [
  {
    href: "/director/korean/passage-library",
    label: "기출 지문",
    icon: BookOpenText,
    hint: "수능·평가원·교육청 기출 지문 코퍼스",
  },
  {
    href: "/director/korean/lit-trends",
    label: "문학 출제 트렌드",
    icon: ChartNoAxesCombined,
    hint: "기출 문학 546지문에서 역산한 작품 선정·발췌 경향 대시보드",
  },
  {
    href: "/director/korean/suneung-wanseong",
    label: "수능완성 지문 분석",
    icon: Link2,
    hint: "2027 수능완성 독서 지문 × 연계 기출",
  },
] as const;

/**
 * 국어 "기출 자료" 하위 탭 — 기출 지문 라이브러리와 수능완성 지문 분석을 오간다.
 * 두 페이지 헤더에서 공유한다.
 */
export function KoreanExamTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="기출 자료 하위 탭"
      className="flex items-center gap-1 border-b border-slate-100 px-5"
    >
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            title={t.hint}
            className={
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12.5px] font-semibold transition " +
              (active
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700")
            }
          >
            <Icon className="size-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
