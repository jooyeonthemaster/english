"use client";

// ============================================================================
// 로스터 기기 셀 팝오버 — 구 튜터 허브 InlineDevicePopover 복제·슬레이트 리스킨
//
// 원본: src/app/(director)/director/tutor/_components/inline-device-popover.tsx
// (토스 hex → 디자인 바이블 §2 slate/blue). 원본은 구 로스터가 계속 쓰므로
// 수정하지 않고 여기서 독립 운용한다. 트리거는 로스터 셀 표시("N / 2")를
// 그대로 유지하고, 클릭 시 기기 목록(브라우저·최근 접속·마스킹 IP)+해제.
// ============================================================================

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2, LogOut, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRelativeTime } from "@/lib/utils";
import { parseUserAgent } from "@/lib/tutor/parse-user-agent";
import { maskIp } from "@/lib/utils/mask-ip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  getStudentRegisteredDevices,
  revokeStudentDevice,
  type StudentDeviceItem,
} from "@/actions/students";
import { DEVICE_LIMIT } from "@/app/(director)/director/tutor/_components/types";

export function InlineDevicePopover({
  studentId,
  studentName,
  deviceCount,
}: {
  studentId: string;
  studentName: string;
  deviceCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<StudentDeviceItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);

  async function load() {
    setLoading(true);
    try {
      setDevices(await getStudentRegisteredDevices(studentId));
    } catch {
      toast.error("기기 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function revoke(sessionId: string, label: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await revokeStudentDevice(studentId, sessionId);
        if (result.success) {
          // 낙관적 제거 — 슬롯이 즉시 비워지도록 (재조회 실패로 인한
          // 성공+실패 이중 토스트 방지).
          setDevices((prev) => prev?.filter((d) => d.id !== sessionId) ?? null);
          toast.success(`${label} 기기를 해제했습니다. 학생은 다시 로그인해야 합니다.`);
          router.refresh();
        } else {
          toast.error(result.error || "기기 해제에 실패했습니다.");
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  const count = devices?.length ?? deviceCount;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`등록 기기 ${count}/${DEVICE_LIMIT}대 — 목록 열기`}
          className="-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100"
        >
          {count > 0 ? (
            <>
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span className="text-[12px] font-semibold text-slate-600 tabular-nums">
                {count} / {DEVICE_LIMIT}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-slate-300">미접속</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 rounded-xl border-slate-200 p-0 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
          <div>
            <p className="text-sm font-bold text-slate-900">등록 기기</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">{studentName}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
            {count} / {DEVICE_LIMIT}
          </span>
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : !devices || devices.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs font-medium text-slate-400">
              아직 로그인한 기기가 없습니다.
            </p>
          ) : (
            devices.map((d) => {
              const ua = parseUserAgent(d.userAgent);
              const Icon = ua.Icon ?? Smartphone;
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800">{ua.label}</p>
                    <p className="truncate text-[11px] font-medium text-slate-400">
                      {formatRelativeTime(d.lastSeenAt)} · {maskIp(d.ip)}
                    </p>
                  </div>
                  <Button
                    onClick={() => revoke(d.id, ua.label)}
                    disabled={isPending}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 shrink-0 rounded-md px-2 text-[11px] font-bold text-slate-400",
                      "hover:bg-rose-50 hover:text-rose-600",
                    )}
                  >
                    <LogOut className="size-3.5" />
                    해제
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-start gap-1.5 border-t border-slate-100 px-3 py-2.5 text-[11px] font-medium leading-4 text-slate-400">
          <Info className="mt-px size-3.5 shrink-0" />
          <p>
            웹 기반 특성상 완벽한 차단은 어렵습니다. 학생이 브라우저 데이터를 지우면
            슬롯이 다시 비워질 수 있습니다.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
