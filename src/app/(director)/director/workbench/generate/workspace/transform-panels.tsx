"use client";

import { Check, Loader2, RefreshCcw, X } from "lucide-react";

import { diffWords } from "./word-diff";

// ============================================================================
// AI 변형 미리보기 패널 — 적용 전 결과를 검토하는 공용 UI.
//  - ParaphrasePreviewPanel: 원문 ↔ 변형문 단어 diff 하이라이트
//  - PrependPreviewPanel:    생성된 앞 문단 + 연결 설명
// ============================================================================

function PanelActions({
  applyLabel,
  busy,
  disabled = false,
  onApply,
  onRegenerate,
  onCancel,
}: {
  applyLabel: string;
  busy: boolean;
  /** 행 외부 잠금(예: 문제 생성 진행 중) — busy 와 별개로 모든 액션 차단. */
  disabled?: boolean;
  onApply: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  const blocked = busy || disabled;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onApply}
        disabled={blocked}
        className="flex h-7.5 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {applyLabel}
      </button>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={blocked}
        className="flex h-7.5 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-[11.5px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        다시 생성
        <span className="rounded bg-blue-50 px-1 py-0.5 text-[9px] font-bold text-blue-500">
          ◈1
        </span>
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={blocked}
        className="flex h-7.5 items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        취소
      </button>
    </div>
  );
}

export function ParaphrasePreviewPanel({
  original,
  rewritten,
  note,
  busy,
  disabled,
  onApply,
  onRegenerate,
  onCancel,
}: {
  original: string;
  rewritten: string;
  note: string;
  busy: boolean;
  disabled?: boolean;
  onApply: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  const tokens = diffWords(original, rewritten);
  return (
    <div className="overflow-hidden rounded-lg border border-blue-200 bg-blue-50/40 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-blue-100 bg-white/70 px-3 py-2">
        <p className="text-[12px] font-bold text-blue-800">
          AI 문장 변형 결과{" "}
          <span className="font-medium text-blue-500">
            — 바뀐 단어를 확인하고 적용하세요
          </span>
        </p>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-700">
          {tokens.map((t, i) =>
            t.type === "same" ? (
              <span key={i}>{t.text} </span>
            ) : t.type === "del" ? (
              <span
                key={i}
                className="mx-px rounded-sm bg-red-50 px-0.5 text-red-400 line-through decoration-red-300"
              >
                {t.text}{" "}
              </span>
            ) : (
              <span
                key={i}
                className="mx-px rounded-sm bg-blue-100/80 px-0.5 font-semibold text-blue-800"
              >
                {t.text}{" "}
              </span>
            ),
          )}
        </div>
        {note ? (
          <p className="text-[11px] leading-relaxed text-blue-600/90">{note}</p>
        ) : null}
        <PanelActions
          applyLabel="이 문장으로 교체"
          busy={busy}
          disabled={disabled}
          onApply={onApply}
          onRegenerate={onRegenerate}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

export function PrependPreviewPanel({
  paragraph,
  firstSentence,
  note,
  busy,
  disabled,
  onApply,
  onRegenerate,
  onCancel,
}: {
  paragraph: string;
  /** 연결 확인용 — 기존 지문의 첫 부분 미리보기. */
  firstSentence: string;
  note: string;
  busy: boolean;
  disabled?: boolean;
  onApply: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-blue-200 bg-blue-50/40 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-blue-100 bg-white/70 px-3 py-2">
        <p className="text-[12px] font-bold text-blue-800">
          생성된 앞 문단{" "}
          <span className="font-medium text-blue-500">
            — 지문 맨 앞에 이어 붙습니다
          </span>
        </p>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed">
          <span className="rounded-sm bg-blue-100/80 px-0.5 font-medium text-blue-900">
            {paragraph}
          </span>{" "}
          <span className="text-slate-400">{firstSentence}…</span>
        </div>
        {note ? (
          <p className="text-[11px] leading-relaxed text-blue-600/90">{note}</p>
        ) : null}
        <PanelActions
          applyLabel="맨 앞에 추가"
          busy={busy}
          disabled={disabled}
          onApply={onApply}
          onRegenerate={onRegenerate}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
