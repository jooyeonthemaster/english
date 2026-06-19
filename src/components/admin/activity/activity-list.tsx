"use client";

// ============================================================================
// ActivityList — 활동 타임라인 표 (회원 상세 + 전역 피드 공용 프레젠테이션).
// 행(또는 '자료' 버튼) 클릭 시 실물 자료 뷰어를 연다. 원시 메타데이터(JSON)는
// 운영자에게 노이즈라 표에 펼치지 않는다 — 필요한 값은 뷰어가 정리해서 보여준다.
// ============================================================================

import { useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActivityItem } from "@/lib/admin-activity-types";
import { ActivityResourceDialog } from "./activity-resource-dialog";

// '자료 보기'를 띄울 소스 — 실제로 열어볼 결과물이 있는 것만:
//   extraction(업로드 원본·페이지 이미지), exam(시험지 DOCX/HWP),
//   passage(지문 원문 + 문제), workbench(문제 생성 → 지문·생성 문제 + 시험지 만들기).
// report 등 메타데이터뿐인 소스는 아이콘을 달지 않는다(노이즈 방지).
const DETAILABLE_PREFIXES = new Set([
  "extraction",
  "exam",
  "passage",
  "workbench",
]);

function isDetailable(itemId: string): boolean {
  return DETAILABLE_PREFIXES.has(itemId.slice(0, itemId.indexOf(":")));
}

export interface ActivityListProps {
  items: ActivityItem[];
  /** 전역 피드에서만 학원 컬럼 표시 */
  showAcademy?: boolean;
  emptyMessage?: string;
  /** 다른 모달 안에 임베드될 때 자료 뷰어(중첩 Dialog) 비활성화 */
  disableResourceViewer?: boolean;
}

const CATEGORY_BADGE: Record<string, string> = {
  PAGE_VIEW: "bg-gray-100 text-gray-600",
  AUTH: "bg-sky-50 text-sky-700",
  EXTRACTION: "bg-indigo-50 text-indigo-700",
  AI_GENERATION: "bg-blue-50 text-blue-700",
  CONTENT: "bg-emerald-50 text-emerald-700",
  EXPORT: "bg-slate-100 text-slate-700",
};

const STATUS_META: Record<string, { label: string; dot: string }> = {
  SUCCESS: { label: "성공", dot: "bg-emerald-500" },
  FAILED: { label: "실패", dot: "bg-rose-500" },
  PENDING: { label: "진행중", dot: "bg-sky-400" },
  INFO: { label: "—", dot: "bg-gray-300" },
};

export function ActivityList({
  items,
  showAcademy = false,
  emptyMessage = "활동 내역이 없습니다",
  disableResourceViewer = false,
}: ActivityListProps) {
  const [viewer, setViewer] = useState<{ id: string; title: string } | null>(
    null,
  );

  if (items.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-[12px] text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* table-fixed — 긴 제목이 테이블을 화면 밖으로 늘려 행위자/상태/자료
          컬럼이 가로 스크롤 뒤로 밀리는 것을 방지. 활동 컬럼이 남는 폭을
          전부 가져가고 내용은 line-clamp로 줄임. */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-gray-50">
            <TableHead className="text-[11px] text-gray-400 font-medium h-9 pl-5 w-[140px]">
              일시
            </TableHead>
            {showAcademy && (
              <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[120px]">
                학원
              </TableHead>
            )}
            <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[100px]">
              분류
            </TableHead>
            <TableHead className="text-[11px] text-gray-400 font-medium h-9">
              활동
            </TableHead>
            <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[100px]">
              행위자
            </TableHead>
            <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[80px]">
              상태
            </TableHead>
            <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[60px] pr-5">
              자료
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const detailable = isDetailable(item.id);
            const canView = detailable && !disableResourceViewer;
            const status = STATUS_META[item.status] ?? STATUS_META.INFO;
            return (
              <TableRow
                key={item.id}
                className={cn(
                  "border-b border-gray-50/60 last:border-0",
                  canView
                    ? "cursor-pointer hover:bg-gray-50/50"
                    : "hover:bg-gray-50/30",
                )}
                onClick={
                  canView
                    ? () => setViewer({ id: item.id, title: item.title })
                    : undefined
                }
              >
                <TableCell className="pl-5 text-[12px] text-gray-700 tabular-nums align-top">
                  {formatDateTime(item.createdAt)}
                </TableCell>
                {showAcademy && (
                  <TableCell className="text-[12px] text-gray-700 align-top">
                    <span className="line-clamp-1">
                      {item.academyName ?? "—"}
                    </span>
                  </TableCell>
                )}
                <TableCell className="align-top">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[11px] font-medium border-0 px-2 whitespace-nowrap",
                      CATEGORY_BADGE[item.category] ??
                        "bg-gray-100 text-gray-600",
                    )}
                  >
                    {item.categoryLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-[12px] text-gray-800 align-top">
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "line-clamp-1 break-all",
                        item.category === "PAGE_VIEW" &&
                          "font-mono text-[11px] text-gray-600",
                      )}
                    >
                      {item.title}
                    </div>
                    {item.detail && (
                      <div className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">
                        {item.detail}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-[12px] text-gray-600 align-top">
                  {item.actorName ?? <span className="text-gray-300">—</span>}
                </TableCell>
                <TableCell className="align-top">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 whitespace-nowrap">
                    <span
                      className={cn("size-1.5 rounded-full", status.dot)}
                      aria-hidden
                    />
                    {status.label}
                  </span>
                </TableCell>
                <TableCell className="pr-5 align-top">
                  {canView ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                      aria-label="자료 보기"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewer({ id: item.id, title: item.title });
                      }}
                    >
                      <Eye className="size-3.5" strokeWidth={2} aria-hidden />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {!disableResourceViewer && (
        <ActivityResourceDialog
          itemId={viewer?.id ?? null}
          itemTitle={viewer?.title ?? ""}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
