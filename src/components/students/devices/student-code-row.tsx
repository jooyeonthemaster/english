"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function maskCode(code: string): string {
  if (!code) return "";
  if (code.length <= 4) return `${code[0]}${"·".repeat(Math.max(1, code.length - 1))}`;
  return `${code.slice(0, 2)}${"·".repeat(code.length - 4)}${code.slice(-2)}`;
}

async function copyText(text: string): Promise<boolean> {
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

export function StudentCodeRow({
  code,
  isDirector,
  onReissueClick,
}: {
  code: string;
  isDirector: boolean;
  onReissueClick: () => void;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto re-mask 8s after revealing (shoulder-surfing guard).
  useEffect(() => {
    if (show) {
      timer.current = setTimeout(() => setShow(false), 8000);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }
  }, [show]);

  async function copy() {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      toast.success("학생 코드를 복사했습니다.");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="select-all font-mono text-lg font-black tracking-[0.25em] text-slate-900">
          {show ? code : maskCode(code)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "코드 가리기" : "코드 표시"}
            className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
          <button
            type="button"
            onClick={copy}
            aria-label="코드 복사"
            className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
          >
            {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          </button>
          {isDirector && (
            <Button
              onClick={onReissueClick}
              variant="ghost"
              className="h-9 gap-1.5 rounded-lg px-3 text-xs font-bold text-blue-600 hover:bg-blue-50"
            >
              <RotateCw className="size-3.5" />
              재발급
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-slate-400">
        학생이 앱에서 학원코드와 함께 입력하는 로그인 코드입니다.
      </p>
    </div>
  );
}
