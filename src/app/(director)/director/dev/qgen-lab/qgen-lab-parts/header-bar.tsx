"use client";

// 랩 머리띠 — 제목 · 비용 캡 계기 · 서버 킬스위치 상태 · 메타 새로고침.

import { FlaskConical, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LabMeta } from "./api-utils";
import { fmtKrw, fmtUsd } from "./format-utils";
import { Mono } from "./ui-bits";

function switchOn(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim().toLowerCase() !== "off";
  if (v == null) return null;
  return Boolean(v);
}

/** QGEN_GRAMMAR_KILLER_DECOY_DEPTH_GATE → decoy-depth (미설정 = 켬). */
function switchLabel(k: string): string {
  return k
    .replace(/^QGEN_(GRAMMAR_KILLER_)?/, "")
    .replace(/_GATE$/, "")
    .toLowerCase()
    .replace(/_/g, "-");
}

export function HeaderBar({
  meta,
  loading,
  error,
  onRefresh,
}: {
  meta: LabMeta | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const spent = meta?.spentUsd ?? null;
  const cap = meta?.capUsd ?? null;
  const ratio = spent != null && cap ? Math.min(1, spent / cap) : 0;
  const switches = Object.entries(meta?.switches ?? {});

  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b-2 border-stone-900 pb-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold tracking-[0.2em] text-stone-500 uppercase">
          <FlaskConical className="size-3.5" /> dev · qgen-lab
        </p>
        <h1 className="mt-0.5 text-[1.375rem] leading-tight font-extrabold tracking-tight text-stone-950">
          어법 생성 모델 벤치
        </h1>
        <p className="mt-0.5 text-[0.75rem] text-stone-500">
          프로덕션 md-stream 어법 경로(5·1)를 모델·계획·검증만 바꿔 재현 · DB 쓰기 없음 · 결과는 서버 runs 원장
        </p>
      </div>

      <div className="ml-auto flex flex-wrap items-end gap-4">
        <div className="w-[220px]" title="서버 원장(ledger.jsonl) 누적 / QGEN_LAB_CAP_USD — 캡 이상이면 서버가 호출 전에 거부">
          <div className="flex items-baseline justify-between text-[0.6875rem] text-stone-500">
            <span className="font-semibold">비용 캡</span>
            <Mono className="text-[0.75rem] text-stone-900">
              {fmtUsd(spent)} <span className="text-stone-400">/ {fmtUsd(cap)}</span>
            </Mono>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div
              className={cn("h-full", ratio >= 0.8 ? "bg-red-700" : ratio >= 0.5 ? "bg-orange-600" : "bg-stone-800")}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <p className="mt-0.5 text-right font-mono text-[0.625rem] text-stone-400">{fmtKrw(spent)} @1350</p>
        </div>

        {switches.length > 0 && (
          <div className="flex max-w-[420px] flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[0.6875rem] font-semibold text-stone-500">킬러 스위치</span>
            {switches.map(([k, v]) => {
              const on = switchOn(v);
              return (
                <span
                  key={k}
                  title={`${k}=${v == null ? "(미설정 = 켬)" : String(v)}`}
                  className={cn(
                    "rounded-[4px] border px-1.5 font-mono text-[0.625rem] leading-[1.125rem]",
                    on === false ? "border-stone-300 bg-stone-100 text-stone-400 line-through" : "border-stone-400 bg-white text-stone-700",
                  )}
                >
                  {switchLabel(k)}
                  {typeof v === "string" && v && <span className="ml-1 text-stone-400">={v}</span>}
                </span>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-[30px] items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 text-[0.75rem] font-semibold text-stone-700 hover:border-stone-500 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> 메타
        </button>
      </div>

      {error && (
        <p className="basis-full rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[0.75rem] text-red-800">
          /meta 실패 — {error} · 팔은 로컬 레지스트리(arms.ts)로 대체, 지문 목록 없음(직접 입력만 가능)
        </p>
      )}
    </header>
  );
}
