"use client";

// 분석 대시보드 구역 카드 — 공용 SectionCard 에 "크게 보기"(AdminDialog xl) 만 얹는다.
// expand 가 주어지면 헤더에 확대 버튼이 생기고, 클릭 시 같은 차트를 더 큰 height 로 팝업에 띄운다.

import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminDialog, SectionCard } from "@/components/admin/kit";

interface AnalyticsSectionProps {
  title: string;
  description?: string;
  /** 헤더 우측 영역(범례·토글 등) */
  right?: ReactNode;
  /** 주어지면 확대 버튼 + 팝업. 보통 같은 차트를 더 큰 height 로 전달. */
  expand?: ReactNode;
  className?: string;
  /** 본문 여백(표를 넣을 땐 false) */
  padded?: boolean;
  /** 본문 래퍼 클래스(유입 분석 화면이 표·차트 높이를 제어할 때 쓴다). */
  bodyClassName?: string;
  children: ReactNode;
}

export function AnalyticsSection({
  title,
  description,
  right,
  expand,
  className,
  padded = true,
  bodyClassName,
  children,
}: AnalyticsSectionProps) {
  const [open, setOpen] = useState(false);
  const actions =
    right || expand ? (
      <>
        {right}
        {expand && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(true)}
            className="text-gray-400 hover:text-gray-700"
            aria-label={`${title} 크게 보기`}
            title="크게 보기"
          >
            <Maximize2 className="size-4" strokeWidth={2} aria-hidden />
          </Button>
        )}
      </>
    ) : undefined;

  return (
    <>
      <SectionCard
        title={title}
        description={description}
        actions={actions}
        padded={padded}
        className={className}
      >
        {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
      </SectionCard>

      {expand && (
        <AdminDialog
          open={open}
          onOpenChange={setOpen}
          title={title}
          description={description}
          size="xl"
        >
          {expand}
        </AdminDialog>
      )}
    </>
  );
}
