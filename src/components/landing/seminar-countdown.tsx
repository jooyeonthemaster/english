"use client";

import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * 세미나 신청 마감 카운트다운. deadline(ISO)까지 남은 시간을 1초마다 갱신한다.
 * SSR 하이드레이션 불일치를 피하려고 마운트 후에만 숫자를 그린다.
 */
export function SeminarCountdown({ deadline }: { deadline: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(deadline).getTime();
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline]);

  if (left === 0) return null; // 마감 지남 — 표시하지 않음

  const sec = left != null ? Math.floor(left / 1000) : null;
  const days = sec != null ? Math.floor(sec / 86400) : 0;
  const h = sec != null ? Math.floor((sec % 86400) / 3600) : 0;
  const m = sec != null ? Math.floor((sec % 3600) / 60) : 0;
  const s = sec != null ? sec % 60 : 0;

  return (
    <div className="relative inline-flex items-center gap-2.5 rounded-xl border border-red-400/50 bg-red-500/15 px-3.5 py-2">
      <AlarmClock className="size-4 shrink-0 text-red-400" />
      <span className="text-[12px] font-bold text-red-200/90">신청 마감까지</span>
      <span className="font-mono text-[15px] font-black tabular-nums tracking-wide text-white">
        {sec == null ? (
          "--:--:--"
        ) : (
          <>
            {days > 0 && <span className="mr-1.5 text-red-400">D-{days}</span>}
            {pad(h)}:{pad(m)}:{pad(s)}
          </>
        )}
      </span>
    </div>
  );
}
