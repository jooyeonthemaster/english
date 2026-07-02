"use client";

// ============================================================================
// 회원 목록 상단 액션 바 — 항상 표시된다.
//   · 크레딧 조정 / 소멸기한 관리 : 선택 회원 대상. 미선택 시 음영 처리(비활성).
//   · 전체 회원 엑셀            : 선택과 무관하게 전체 회원.
//   · 정보성 / 광고성 발송 CSV  : 선택이 있으면 선택 회원, 없으면 전체 기준.
// 선택 여부에 따라 버튼 세트가 바뀌지 않고, 작동 불가한 버튼만 비활성화된다.
// ============================================================================

import { useState } from "react";
import {
  Loader2,
  Send,
  Megaphone,
  Coins,
  CalendarClock,
  Download,
  Users,
  X,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { exportMembers } from "@/actions/admin-members";
import type { ExportMode } from "@/actions/admin-members/export-members";
import { triggerDownload } from "./export-button";
import { BulkCreditAdjustModal } from "./bulk-credit-adjust-modal";
import { BulkCreditExpiryModal } from "./bulk-credit-expiry-modal";

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
  filteredCount: number;
  totalCount: number;
  /**
   * 크레딧 조정·소멸기한 관리 버튼 활성 여부. 크레딧은 학원 단위 지갑이라
   * "학원별 보기"에서만 켠다(회원별 보기에서 같은 학원 여러 원장을 골라
   * 이중 적용되는 잠재 버그 방지).
   */
  creditEnabled?: boolean;
  /** 카운트 표기 단위("명" | "학원") */
  unitLabel?: string;
}

const DOWNLOAD_OPTIONS: {
  mode: ExportMode;
  label: string;
  desc: string;
  icon: typeof Users;
}[] = [
  { mode: "all", label: "전체 회원 엑셀", desc: "상세 15컬럼 (분석·관리용)", icon: Users },
  { mode: "info", label: "정보성 발송 CSV", desc: "전화번호 있는 활성 회원 (동의 무관)", icon: Send },
  { mode: "ad", label: "광고성 발송 CSV", desc: "마케팅 수신동의자만", icon: Megaphone },
];

function cnIcon(mode: ExportMode) {
  return mode === "ad"
    ? "mt-0.5 size-4 shrink-0 text-amber-600"
    : "mt-0.5 size-4 shrink-0 text-gray-500";
}

export function BulkActionsBar({
  selectedIds,
  onClear,
  filteredCount,
  totalCount,
  creditEnabled = true,
  unitLabel = "명",
}: BulkActionsBarProps) {
  const [pending, setPending] = useState<ExportMode | null>(null);
  const [creditOpen, setCreditOpen] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const count = selectedIds.length;
  const hasSelection = count > 0;

  async function runExport(mode: ExportMode) {
    if (pending) return;
    setPending(mode);
    try {
      // 선택된 회원이 있으면 엑셀·발송 CSV 모두 선택 회원만, 없으면 전체 기준.
      const res = await exportMembers(
        hasSelection ? { mode, memberIds: selectedIds } : { mode },
      );
      if (!res.contentBase64 || res.totalRows === 0) {
        toast.message(
          mode === "ad"
            ? "마케팅 동의한 광고 발송대상이 없습니다"
            : mode === "info"
              ? "발송대상이 없습니다"
              : "내보낼 회원이 없습니다",
        );
        return;
      }
      triggerDownload(res.filename, res.contentBase64, res.mimeType);
      toast.success(
        mode === "info"
          ? `정보성 발송대상 ${res.totalRows}명 내보내기 완료`
          : mode === "ad"
            ? `광고성 발송대상 ${res.totalRows}명 내보내기 완료`
            : `회원 ${res.totalRows}명 내보내기 완료 (광고발송 가능 ${res.smsTargetRows}명)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "내보내기에 실패했습니다");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <>
      <div
        className={cnBar(hasSelection)}
      >
        <div className="flex items-center gap-2">
          {hasSelection ? (
            <>
              <span className="text-[12.5px] font-medium text-blue-900">
                <span className="tabular-nums">{count}</span>
                {unitLabel} 선택됨
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11.5px] text-blue-700 hover:bg-blue-100 hover:text-blue-900"
                onClick={onClear}
              >
                <X className="size-3.5" strokeWidth={2} aria-hidden />
                선택 해제
              </Button>
            </>
          ) : (
            <span className="text-[12.5px] text-gray-500">
              <span className="font-semibold text-gray-800 tabular-nums">
                {filteredCount}
              </span>
              {unitLabel}{" "}
              <span className="text-gray-400">
                · 전체 {totalCount}
                {unitLabel} 중
              </span>
            </span>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Button
            size="sm"
            className="h-8 flex-1 bg-blue-600 text-[12px] hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            onClick={() => setCreditOpen(true)}
            disabled={!creditEnabled || !hasSelection || busy}
            title={
              !creditEnabled
                ? "크레딧은 학원 단위입니다 — '학원별 보기'에서 조정하세요"
                : hasSelection
                  ? undefined
                  : "학원을 먼저 선택하세요"
            }
          >
            <Coins className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
            크레딧 조정
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            onClick={() => setExpiryOpen(true)}
            disabled={!creditEnabled || !hasSelection || busy}
            title={
              !creditEnabled
                ? "크레딧은 학원 단위입니다 — '학원별 보기'에서 관리하세요"
                : hasSelection
                  ? "선택 학원의 소멸기한 강제 지정 또는 즉시 소멸"
                  : "학원을 먼저 선택하세요"
            }
          >
            <CalendarClock className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
            소멸기한 관리
          </Button>
          <Popover open={downloadOpen} onOpenChange={setDownloadOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 text-[12px] sm:flex-none"
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" strokeWidth={2} aria-hidden />
                ) : (
                  <Download className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
                )}
                다운로드
                <ChevronDown
                  className={`size-3.5 ml-1 text-gray-400 transition-transform ${downloadOpen ? "rotate-180" : ""}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1">
              {DOWNLOAD_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDownloadOpen(false);
                      void runExport(opt.mode);
                    }}
                    className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon
                      className={cnIcon(opt.mode)}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-gray-800">
                        {opt.mode === "all"
                          ? hasSelection
                            ? `선택 ${count}명 엑셀`
                            : "전체 회원 엑셀"
                          : opt.label}
                      </div>
                      <div className="text-[11px] leading-4 text-gray-400">
                        {hasSelection ? `선택 회원 · ${opt.desc}` : opt.desc}
                      </div>
                    </div>
                    {pending === opt.mode && (
                      <Loader2
                        className="ml-auto mt-0.5 size-3.5 shrink-0 animate-spin text-gray-400"
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <BulkCreditAdjustModal
        open={creditOpen}
        onOpenChange={setCreditOpen}
        memberIds={selectedIds}
        onDone={onClear}
      />

      <BulkCreditExpiryModal
        open={expiryOpen}
        onOpenChange={setExpiryOpen}
        memberIds={selectedIds}
        onDone={onClear}
      />
    </>
  );
}

function cnBar(hasSelection: boolean) {
  const base =
    "flex flex-col items-start gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5";
  return hasSelection
    ? `${base} border-blue-100 bg-blue-50/60`
    : `${base} border-gray-50 bg-white`;
}
