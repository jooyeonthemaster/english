"use client";

// 학원 방문 기록 배너 — 결제 관리·회원 상세에서 `?academyId=<id>&all=1` 로 들어오는 진입점.
//
// 학원 이름을 목록 행에서 파생하면 방문이 0건일 때 이름이 사라진다(실측: 결제 학원 17곳 중 16곳이 세션 0건).
// 그래서 이름·가입일은 세션 목록이 아니라 기존 결제 이력 API(§9.3)의 academy 를 재사용한다
// — sessions 응답 계약 { total, page, pageSize, rows } 밖 필드를 만들지 않는다.

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, X } from "lucide-react";
import { fmtDateTime } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";

export interface AcademyBrief {
  id: string;
  name: string;
  createdAt: string | null;
}

interface AcademyHistoryResponse {
  academy?: { id?: string; name?: string; createdAt?: string };
}

/** 없는 학원(404)이면 null. 그 외 실패는 throw — 배너는 이름 없이도 그려진다. */
async function fetchAcademyBrief(academyId: string): Promise<AcademyBrief | null> {
  const res = await fetch(`/api/admin/credits/academies/${encodeURIComponent(academyId)}/top-ups`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`학원 정보를 불러오지 못했습니다 (${res.status})`);
  const body = (await res.json()) as AcademyHistoryResponse;
  const academy = body.academy;
  if (!academy?.id || !academy.name) return null;
  // 원장(directorStaffId)은 일부러 쓰지 않는다 — 이 API 의 원장 선정 규칙(createdAt asc)이
  // 드로어·전환 화면의 규칙(isActive desc, createdAt asc, id asc)과 달라 같은 학원에서 다른 계정을 가리킬 수 있다.
  return { id: academy.id, name: academy.name, createdAt: academy.createdAt ?? null };
}

export function useAcademyBrief(academyId: string | null) {
  return useQuery<AcademyBrief | null, Error>({
    queryKey: ["admin-analytics-academy-brief", academyId],
    queryFn: () => fetchAcademyBrief(academyId as string),
    enabled: !!academyId,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function AcademyBanner({
  academyId,
  academy,
  isPending,
  fallbackName,
  allTime,
  includeInternal,
  onUpdate,
}: {
  academyId: string;
  /** 결제 이력 API 의 학원 정보. null = 그런 학원이 없음(404) */
  academy: AcademyBrief | null | undefined;
  isPending: boolean;
  /** API 가 실패해도 목록 행에 이름이 있으면 그것으로 */
  fallbackName: string | null;
  allTime: boolean;
  includeInternal: boolean;
  onUpdate: (patch: Record<string, string | null>) => void;
}) {
  const name = academy?.name ?? fallbackName ?? null;
  const notFound = !isPending && academy === null && !fallbackName;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[14px] font-bold text-gray-900">
          <Building2 className="size-4 shrink-0 text-violet-600" aria-hidden />
          <span className="truncate">
            {name ? `${name} 방문 기록` : notFound ? "학원을 찾을 수 없습니다" : "학원 방문 기록"}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-gray-500">
          이 학원에 연결된 방문자(브라우저)의 방문 기록 · 가입 전 익명 방문 포함 · {allTime ? "전체 기간" : "선택한 기간"} ·{" "}
          {includeInternal ? "내부 트래픽 포함" : "내부 트래픽 제외"}
          {academy?.createdAt ? ` · 학원 가입 ${fmtDateTime(academy.createdAt)}` : ""}
        </p>
        <p className="mt-0.5 font-mono text-[11px] break-all text-gray-400">{academyId}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex rounded-lg border border-violet-100 bg-white p-0.5">
          {[
            { key: "all", label: "전체 기간", active: allTime, patch: { all: "1" } },
            { key: "period", label: "선택 기간", active: !allTime, patch: { all: null } },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onUpdate({ ...opt.patch, pageNo: null })}
              className={cn(
                "h-7 rounded-md px-2.5 text-[12px] font-semibold",
                opt.active ? "bg-violet-600 text-white" : "text-gray-500 hover:text-gray-900",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Link
          href={`/admin/academies/${encodeURIComponent(academyId)}`}
          prefetch={false}
          className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          학원 상세
        </Link>
        <button
          type="button"
          onClick={() => onUpdate({ academyId: null, all: null, pageNo: null })}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-gray-500 hover:bg-white hover:text-gray-900"
        >
          <X className="size-3.5" aria-hidden /> 해제
        </button>
      </div>
    </div>
  );
}
