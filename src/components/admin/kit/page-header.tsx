"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useRegisterAdminPage, type AdminCrumb } from "./admin-page-context";

/**
 * 관리자 페이지 머리 — 제목(사이드바 메뉴명과 같게) · 한 줄 설명 · 오른쪽 액션.
 * 등록된 제목·경로는 셸 상단 바의 브레드크럼에도 쓰인다.
 */
export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  back,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** 상단 바 브레드크럼에 덧붙일 경로(상세 페이지 등). 메뉴 경로는 셸이 채운다. */
  crumbs?: AdminCrumb[];
  /** 주 버튼 1개 + 보조 버튼 — 오른쪽 정렬 */
  actions?: ReactNode;
  /** 상세 페이지의 목록으로 돌아가기 */
  back?: { href: string; label: string };
  className?: string;
}) {
  useRegisterAdminPage({ title, crumbs });
  return (
    <div className={cn("space-y-2", className)}>
      {back && <BackLink href={back.href} label={back.label} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-[13px] text-gray-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** 목록으로 돌아가는 링크 — 상세 페이지 공통. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-500 transition-colors hover:text-gray-900"
    >
      <ArrowLeft className="size-3.5" strokeWidth={2} />
      {label}
    </Link>
  );
}
