"use client";

import { useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setSignupCreditAmount } from "@/actions/admin-settings";
import { cn } from "@/lib/utils";

/**
 * 기본 가입 크레딧 설정 — 신규 원장 자가가입 시 자동 지급되는 크레딧 수량을
 * 조정한다. 저장 즉시 DB에 반영되어 이후 가입부터 새 값이 적용된다.
 */
export function SignupCreditSetting({ initialAmount }: { initialAmount: number }) {
  const [saved, setSaved] = useState(initialAmount);
  const [value, setValue] = useState(String(initialAmount));
  const [saving, setSaving] = useState(false);

  const parsed = Number.parseInt(value, 10);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000;
  const dirty = valid && parsed !== saved;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await setSignupCreditAmount(parsed);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSaved(res.value);
      setValue(String(res.value));
      toast.success(`기본 가입 크레딧을 ${res.value.toLocaleString("ko-KR")}로 저장했어요`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
          <Coins className="size-4" />
        </span>
        <div className="leading-tight">
          <p className="text-[12px] font-bold text-slate-700">기본 가입 크레딧</p>
          <p className="text-[10.5px] text-slate-400">신규 가입 시 자동 지급</p>
        </div>
      </div>
      <input
        type="number"
        min={0}
        max={1_000_000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
        className={cn(
          "h-8 w-24 rounded-lg border px-2 text-right text-[13px] font-semibold tabular-nums outline-none transition-colors focus:ring-2",
          valid
            ? "border-slate-200 text-slate-800 focus:border-blue-400 focus:ring-blue-100"
            : "border-rose-300 text-rose-600 focus:ring-rose-100",
        )}
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty || saving}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {saving && <Loader2 className="size-3.5 animate-spin" />}
        저장
      </button>
    </div>
  );
}
