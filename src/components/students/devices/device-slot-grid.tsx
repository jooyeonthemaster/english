"use client";

import { LogOut, PlusCircle } from "lucide-react";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";
import { parseUserAgent } from "@/lib/tutor/parse-user-agent";
import { maskIp } from "@/lib/utils/mask-ip";
import { Button } from "@/components/ui/button";
import { DEVICE_LIMIT } from "@/app/(director)/director/tutor/_components/types";
import type { StudentDeviceItem } from "@/actions/students";

const THREE_DAYS_MS = 3 * 86_400_000;
function expiresWithinThreeDays(expiresAt: Date | string): boolean {
  return new Date(expiresAt).getTime() - Date.now() < THREE_DAYS_MS;
}

function DeviceCard({
  device,
  isMostRecent,
  isDirector,
  onRevoke,
}: {
  device: StudentDeviceItem;
  isMostRecent: boolean;
  isDirector: boolean;
  onRevoke: () => void;
}) {
  const ua = parseUserAgent(device.userAgent);
  const Icon = ua.Icon;
  const expiringSoon = expiresWithinThreeDays(device.expiresAt);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-200">
      <div className="flex items-start justify-between">
        <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="size-5" />
        </div>
        {isMostRecent && (
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            최근 사용
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-bold text-slate-900">{ua.label}</p>
      <dl className="mt-2 space-y-1 text-xs font-medium text-slate-400">
        <div className="flex justify-between">
          <dt>최근 접속</dt>
          <dd className="text-slate-600">{formatRelativeTime(device.lastSeenAt)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>IP</dt>
          <dd className="font-mono text-slate-600">{maskIp(device.ip)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>첫 등록</dt>
          <dd className="text-slate-600">{formatDate(device.issuedAt)}</dd>
        </div>
      </dl>
      {expiringSoon && (
        <p className="mt-2 text-[11px] font-medium text-slate-400">곧 만료됩니다</p>
      )}
      {isDirector && (
        <Button
          onClick={onRevoke}
          variant="outline"
          className="mt-3 h-8 w-full rounded-lg border-slate-200 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
        >
          <LogOut className="size-3.5" />
          기기 해제
        </Button>
      )}
    </div>
  );
}

function EmptyDeviceSlot() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <PlusCircle className="size-6 text-slate-300" />
      <p className="mt-2 text-sm font-bold text-slate-400">빈 기기 슬롯</p>
      <p className="mt-0.5 text-xs font-medium text-slate-300">학생이 로그인하면 자동 등록됩니다</p>
    </div>
  );
}

export function DeviceSlotGrid({
  devices,
  isDirector,
  onRevoke,
}: {
  devices: StudentDeviceItem[];
  isDirector: boolean;
  onRevoke: (device: StudentDeviceItem) => void;
}) {
  const used = devices.length;
  const emptySlots = Math.max(0, DEVICE_LIMIT - used);
  // The most-recently-seen device gets the "최근 사용" badge.
  const mostRecentId = devices[0]?.id;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">등록 기기</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
            {used} / {DEVICE_LIMIT}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: DEVICE_LIMIT }).map((_, i) => (
            <span
              key={i}
              className={cn("size-2 rounded-full", i < used ? "bg-blue-600" : "bg-slate-200")}
            />
          ))}
        </div>
      </div>

      {used >= DEVICE_LIMIT && (
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
          <LogOut className="mt-0.5 size-4 shrink-0" />
          <p>
            기기 {DEVICE_LIMIT}대가 모두 등록되었습니다. 새 기기에서는 로그인이 차단됩니다.
            학생이 기기를 바꾸려면 아래에서 해제해 주세요.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {devices.map((d) => (
          <DeviceCard
            key={d.id}
            device={d}
            isMostRecent={d.id === mostRecentId}
            isDirector={isDirector}
            onRevoke={() => onRevoke(d)}
          />
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <EmptyDeviceSlot key={`empty-${i}`} />
        ))}
      </div>

      {used === 0 && (
        <p className="text-center text-xs font-medium text-slate-400">
          아직 로그인한 기기가 없습니다. 학생이 코드로 로그인하면 여기에 표시됩니다.
        </p>
      )}
    </div>
  );
}
