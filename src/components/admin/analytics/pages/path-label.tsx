"use client";

// 페이지 리포트 공용 조각 — 경로 라벨(모노폰트 + 제목 보조줄 + 공개 페이지 새 창 링크), 흐름 버튼.

import { ExternalLink, Route } from "lucide-react";
import { areaOfPath } from "@/lib/analytics/sanitize";
import { cn } from "@/lib/utils";
import { useNarrow } from "./use-narrow";

const PUBLIC_ORIGIN = "https://www.smoat.co.kr";

/** group=1 로 합쳐진 경로 묶음(`/exam/:id`)인지 — 실제 URL 이 아니므로 필터·링크 대상이 아니다. */
export function isGroupPattern(path: string): boolean {
  return path.split("/").includes(":id");
}

/** 공개 영역(marketing) 실경로만 운영 사이트 URL. 가린 토큰(`:token`)·묶음(`:id`) 경로는 null. */
export function publicUrl(path: string): string | null {
  if (!path.startsWith("/") || path.includes(":")) return null;
  return areaOfPath(path) === "marketing" ? `${PUBLIC_ORIGIN}${path}` : null;
}

export function PathLabel({ path, title, className }: { path: string; title?: string | null; className?: string }) {
  const href = publicUrl(path);
  // 넓은 판: 한 줄 말줄임(전체는 title 툴팁). 좁은 판: 터치에서는 툴팁을 띄울 수 없으므로 두 줄까지 접어 보여준다
  // (390px 한 줄은 14자뿐이라 /resources/2026-… 류가 서로 구분되지 않는다).
  const narrow = useNarrow();
  return (
    // 좁은 화면에서 경로가 표 폭을 독점하지 않게 폭 상한
    <span className={cn("flex min-w-0 max-w-[200px] flex-col sm:max-w-[420px]", className)}>
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "font-mono text-[12px] text-gray-800",
            narrow ? "line-clamp-2 break-all whitespace-normal" : "truncate",
          )}
          title={path}
        >
          {path}
        </span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-gray-300 transition-colors hover:bg-white hover:text-blue-600"
            title="운영 사이트에서 새 창으로 열기"
            aria-label={`${path} 새 창에서 열기`}
          >
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </span>
      {title && <span className="truncate text-[11.5px] font-normal text-gray-400">{title}</span>}
    </span>
  );
}

export function FlowButton({ active, onClick, path }: { active: boolean; onClick: () => void; path: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold transition-colors",
        active ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-blue-50 hover:text-blue-700",
      )}
      title="이 페이지의 이전·다음 페이지 흐름 보기"
      aria-label={`${path} 페이지 흐름 보기`}
      aria-pressed={active}
    >
      <Route className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">흐름</span>
    </button>
  );
}

/** 비율(%) 소수 1자리 — 분모 0 이면 0 */
export function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}
