"use client";

import { useState, useTransition } from "react";
import { purgeFfRequestAction } from "./actions";

/** 신청 하나 파기 — 되돌릴 수 없으므로 확인을 받는다 */
export function PurgeButton({ requestId, overdue }: { requestId: string; overdue: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("이 신청의 신청서와 올린 파일을 모두 지웁니다. 되돌릴 수 없습니다. 계속할까요?")) return;
          start(async () => {
            const r = await purgeFfRequestAction(requestId);
            setMsg(r.ok ? `파기됨(${r.removed}개)` : r.error ?? "실패");
          });
        }}
        className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${overdue ? "border-red-300 bg-red-50 text-red-700" : "border-slate-300 text-slate-600"} disabled:opacity-50`}
      >
        {pending ? "파기 중…" : "파기"}
      </button>
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </span>
  );
}
