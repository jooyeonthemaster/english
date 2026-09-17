"use client";

// 스텝2 하단 라이브 카운트 바 — step-scope 의 500줄 규약 분리체(표시 전용).

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { fmt } from "../wordbook-ui";

/** 하단 고정 라이브 카운트 바 — 상태별 톤(rose/amber/emerald)은 스펙 §7 팔레트. */
export function LiveCountBar({
  loading,
  total,
  size,
}: {
  loading: boolean;
  total: number | null;
  size: number;
}) {
  let box = "border-slate-200 bg-white";
  let icon = <AlertTriangle size={18} className="shrink-0 text-slate-400" />;
  let titleCls = "text-slate-500";
  let title: React.ReactNode = "단어 수를 계산하지 못했어요 — 조건을 바꾸면 다시 계산해요.";
  let subCls = "";
  let sub: React.ReactNode = null;
  const count = (n: number) => (
    <>
      이 조건에 맞는 단어 <span className="text-[17px] tabular-nums">{fmt(n)}</span>개
    </>
  );
  if (loading) {
    icon = <Loader2 size={18} className="shrink-0 animate-spin text-blue-500" />;
    title = "조건에 맞는 단어를 세는 중…";
  } else if (total === 0) {
    box = "border-rose-200 bg-rose-50";
    icon = <AlertTriangle size={18} className="shrink-0 text-rose-500" />;
    titleCls = "text-rose-700";
    title = "이 조건에 맞는 단어가 없어요";
    subCls = "text-rose-600/80";
    sub = "조건을 넓혀 보세요 — 수준·학년·고급 조건을 줄이면 늘어나요.";
  } else if (total !== null && total < size) {
    box = "border-amber-200 bg-amber-50";
    icon = <AlertTriangle size={18} className="shrink-0 text-amber-500" />;
    titleCls = "text-amber-800";
    title = count(total);
    subCls = "text-amber-700/80";
    sub = (
      <>
        요청한 <b className="tabular-nums">{fmt(size)}</b>개보다 적어요 — 있는 만큼
        전부 담게 됩니다.
      </>
    );
  } else if (total !== null) {
    box = "border-emerald-200 bg-emerald-50";
    icon = <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />;
    titleCls = "text-emerald-800";
    title = count(total);
    subCls = "text-emerald-700/80";
    sub = (
      <>
        요청한 <b className="tabular-nums">{fmt(size)}</b>개를 충분히 채울 수 있어요.
      </>
    );
  }
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${box}`}>
      {icon}
      <div className="min-w-0">
        <p className={`text-[13.5px] font-bold break-keep ${titleCls}`}>{title}</p>
        {sub ? <p className={`text-[11px] break-keep ${subCls}`}>{sub}</p> : null}
      </div>
    </div>
  );
}

