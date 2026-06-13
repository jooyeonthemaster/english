"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Info, Loader2, LogOut, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { parseUserAgent } from "@/lib/tutor/parse-user-agent";
import { maskIp } from "@/lib/utils/mask-ip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  getStudentRegisteredDevices,
  revokeStudentDevice,
  type StudentDeviceItem,
} from "@/actions/students";
import { DEVICE_LIMIT } from "./types";

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
      toast.error("기기 정보를 불러오지 못했어요.");
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
          // Optimistic removal so the slot frees immediately (no success+error
          // double-toast from a follow-up reload failing).
          setDevices((prev) => prev?.filter((d) => d.id !== sessionId) ?? null);
          toast.success(`${label} 기기를 해제했어요. 학생은 다시 로그인해야 해요.`);
          router.refresh();
        } else {
          toast.error(result.error || "기기 해제에 실패했어요.");
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
          aria-label={`등록 기기 ${count}/${DEVICE_LIMIT}대`}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition hover:bg-[#F2F4F6]"
        >
          <span className="flex items-center gap-0.5">
            {Array.from({ length: DEVICE_LIMIT }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-2 rounded-full",
                  i < count ? "bg-[#3182F6]" : "bg-[#E5E8EB]",
                )}
              />
            ))}
          </span>
          <span className="text-[11px] font-bold tabular-nums text-[#8B95A1]">
            {count}/{DEVICE_LIMIT}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 rounded-xl border-[#E5E8EB] p-0 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#F2F4F6] px-3 py-2.5">
          <div>
            <p className="text-sm font-bold text-[#191F28]">등록 기기</p>
            <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">{studentName}</p>
          </div>
          <span className="rounded-full bg-[#F2F4F6] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#4E5968]">
            {count} / {DEVICE_LIMIT}
          </span>
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-[#8B95A1]">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : !devices || devices.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs font-medium text-[#8B95A1]">
              아직 로그인한 기기가 없어요.
            </p>
          ) : (
            devices.map((d) => {
              const ua = parseUserAgent(d.userAgent);
              const Icon = ua.Icon ?? Smartphone;
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-2.5 rounded-lg border border-[#F2F4F6] px-2.5 py-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#3182F6]">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#191F28]">{ua.label}</p>
                    <p className="truncate text-[11px] font-medium text-[#8B95A1]">
                      {formatRelativeTime(d.lastSeenAt)} · {maskIp(d.ip)}
                    </p>
                  </div>
                  <Button
                    onClick={() => revoke(d.id, ua.label)}
                    disabled={isPending}
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 rounded-md px-2 text-[11px] font-bold text-[#8B95A1] hover:bg-red-50 hover:text-red-600"
                  >
                    <LogOut className="size-3.5" />
                    해제
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-start gap-1.5 border-t border-[#F2F4F6] px-3 py-2.5 text-[11px] font-medium leading-4 text-[#8B95A1]">
          <Info className="mt-px size-3.5 shrink-0" />
          <p>
            웹 기반이라 완벽한 차단은 어려워요. 학생이 브라우저 데이터를 지우면 슬롯이 다시
            비워질 수 있어요.{" "}
            <Link
              href={`/director/students/${studentId}`}
              className="font-bold text-[#3182F6] hover:underline"
            >
              자세히
            </Link>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
