"use client";

// 학생 코드 & 접속 카드 — 로그인 코드 블록.
// 정책(26-07-12 유저 확정): 학원코드·학생코드는 마스킹 없이 상시 노출한다.
// 학생 앱 로그인은 두 코드가 세트이므로 나란히 보여주고 각각 원클릭 복사.

import { useRef, useState } from "react";
import { Check, Copy, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function CodeBlock({
  label,
  code,
  copyLabel,
  action,
}: {
  label: string;
  code: string;
  copyLabel: string;
  action?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      toast.success(`${copyLabel}를 복사했습니다.`);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="select-all truncate font-mono text-lg font-black tracking-[0.2em] text-slate-900">
          {code || "—"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={copy}
            aria-label={`${copyLabel} 복사`}
            className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
          >
            {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          </button>
          {action}
        </div>
      </div>
    </div>
  );
}

export function StudentCodeRow({
  code,
  academyCode,
  isDirector,
  onReissueClick,
}: {
  code: string;
  /** 학원 코드 — 로딩 전이면 null(블록은 자리 유지) */
  academyCode?: string | null;
  isDirector: boolean;
  onReissueClick: () => void;
}) {
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <CodeBlock label="학원코드" code={academyCode ?? ""} copyLabel="학원코드" />
        <CodeBlock
          label="학생코드"
          code={code}
          copyLabel="학생코드"
          action={
            isDirector ? (
              <Button
                onClick={onReissueClick}
                variant="ghost"
                className="h-8 gap-1 rounded-lg px-2.5 text-xs font-bold text-blue-600 hover:bg-blue-50"
              >
                <RotateCw className="size-3.5" />
                재발급
              </Button>
            ) : null
          }
        />
      </div>
      <p className="mt-2 text-xs font-medium text-slate-400">
        학생이 앱에서 두 코드를 입력해 로그인합니다. 아래 링크를 보내면 입력 없이 바로
        시작할 수 있습니다.
      </p>
    </div>
  );
}
