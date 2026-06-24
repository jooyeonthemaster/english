"use client";

import { useState } from "react";
import { Languages, Loader2, Palette, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  WEBTOON_STYLES,
  WEBTOON_LANGUAGES,
  type WebtoonStyleId,
  type WebtoonLanguageId,
} from "./webtoon-page-types";

interface WebtoonOptionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 이 지문의 제목 — 모달 헤더에 어떤 지문을 설정하는지 보여준다. */
  passageTitle: string;
  /** 본문 앞부분 미리보기 — 어떤 지문인지 한 번 더 확인시킨다. */
  passagePreview: string;
  style: WebtoonStyleId;
  setStyle: (s: WebtoonStyleId) => void;
  language: WebtoonLanguageId;
  setLanguage: (l: WebtoonLanguageId) => void;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  /** 이 지문 하나로 웹툰을 큐잉한다. 성공하면 true → 모달이 닫힌다. */
  onConfirm: () => Promise<boolean>;
}

/**
 * 웹툰 워크스페이스의 지문 카드별 "유형 선택" 모달. 문제 생성의 지문별 설정 모달과
 * 동일한 흐름으로, 이 지문 하나에 적용할 화풍·대사 언어·추가 지시를 고른 뒤 웹툰을
 * 생성한다. 옵션은 페이지 상태에 그대로 바인딩돼, 다음 카드의 모달은 직전 선택을
 * 기본값으로 보여준다(반복 작업 편의).
 */
export function WebtoonOptionsModal({
  open,
  onOpenChange,
  passageTitle,
  passagePreview,
  style,
  setStyle,
  language,
  setLanguage,
  customPrompt,
  setCustomPrompt,
  onConfirm,
}: WebtoonOptionsModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm();
      if (ok) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Palette className="size-4" aria-hidden="true" />
            </span>
            웹툰 유형 선택
          </DialogTitle>
          <DialogDescription className="truncate text-[12px] text-slate-500">
            <b className="text-slate-700">{passageTitle || "지문"}</b> — 이 지문
            하나로 한 장의 세로형 웹툰을 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 지문 미리보기 */}
          {passagePreview ? (
            <p className="line-clamp-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500">
              {passagePreview}
            </p>
          ) : null}

          {/* ── 화풍 ── */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Palette className="size-3.5 text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                화풍
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEBTOON_STYLES.map((s) => {
                const active = style === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id)}
                    disabled={submitting}
                    title={s.description}
                    aria-pressed={active}
                    className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 ${
                      active
                        ? "border-blue-400 bg-blue-50/70 text-blue-800 ring-1 ring-blue-200"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 대사 언어 ── */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Languages className="size-3.5 text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                대사 언어
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEBTOON_LANGUAGES.map((l) => {
                const active = language === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLanguage(l.id)}
                    disabled={submitting}
                    title={`${l.label} — ${l.description}`}
                    aria-pressed={active}
                    aria-label={l.label}
                    className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 ${
                      active
                        ? "border-blue-400 bg-blue-50/70 text-blue-800 ring-1 ring-blue-200"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {l.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 추가 지시사항 ── */}
          <div>
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
              추가 지시사항{" "}
              <span className="font-medium normal-case text-slate-400">
                (선택)
              </span>
            </span>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              disabled={submitting}
              aria-label="추가 지시사항"
              placeholder="예: 주인공은 고등학생, 배경은 한국 학교, 명대사는 큰 말풍선으로 강조..."
              className="min-h-[64px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-[12px] leading-relaxed outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 disabled:opacity-60"
            />
          </div>
        </div>

        {/* ── 생성 푸터 ── */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-3.5">
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className="h-10 w-full rounded-lg bg-blue-600 px-3 text-[13px] font-bold hover:bg-blue-700"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            웹툰 생성
            <CreditCostChip
              amount={CREDIT_COSTS.WEBTOON_IMAGE}
              className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10.5px]"
            />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
