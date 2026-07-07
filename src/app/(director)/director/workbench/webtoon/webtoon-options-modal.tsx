"use client";

import { useState } from "react";
import { Check, FileText, Loader2, Palette, Wand2, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  WEBTOON_IMAGE_PLANS,
  type WebtoonImagePlanId,
} from "@/lib/webtoon-models";
import { WebtoonGenerateFields } from "@/components/webtoon/webtoon-generate-fields";
import type { WebtoonStyleId, WebtoonLanguageId } from "./webtoon-page-types";

interface WebtoonOptionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 이 지문의 제목 — 모달 헤더에 어떤 지문을 설정하는지 보여준다. */
  passageTitle: string;
  /** 본문 앞부분 미리보기 — 어떤 지문인지 한 번 더 확인시킨다. */
  passagePreview: string;
  plan: WebtoonImagePlanId;
  setPlan: (p: WebtoonImagePlanId) => void;
  style: WebtoonStyleId;
  setStyle: (s: WebtoonStyleId) => void;
  language: WebtoonLanguageId;
  setLanguage: (l: WebtoonLanguageId) => void;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  /** 이 지문 하나로 웹툰을 큐잉한다(또는 담는다). 성공하면 true → 모달이 닫힌다. */
  onConfirm: () => Promise<boolean>;
  /**
   * "generate"(기본, PC): 확인 시 곧바로 웹툰을 생성한다.
   * "save"(모바일 스텝 플로우): 확인 시 이 유형을 지문에 '담기'만 한다(무과금).
   *   담긴 지문들은 워크스페이스 하단 '웹툰 N개 생성'에서 한 번에 생성된다.
   */
  confirmMode?: "generate" | "save";
}

/**
 * 웹툰 워크스페이스의 지문 카드별 "유형 선택" 모달. 문제 생성의 지문별 설정 모달과
 * 동일한 디자인으로, 이 지문 하나에 적용할 생성 모델·화풍·대사 언어·추가 지시를 고른 뒤
 * 웹툰을 생성한다. 옵션은 페이지 상태에 그대로 바인딩돼, 다음 카드의 모달은 직전 선택을
 * 기본값으로 보여준다(반복 작업 편의).
 */
export function WebtoonOptionsModal({
  open,
  onOpenChange,
  passageTitle,
  passagePreview,
  plan,
  setPlan,
  style,
  setStyle,
  language,
  setLanguage,
  customPrompt,
  setCustomPrompt,
  onConfirm,
  confirmMode = "generate",
}: WebtoonOptionsModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const saveMode = confirmMode === "save";

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

  const credits = WEBTOON_IMAGE_PLANS[plan].credits;

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 p-0 shadow-2xl sm:max-w-3xl"
      >
        {/* 헤더 — 아이콘·제목·설명·닫기를 한 행에, 좌우 끝선은 본문(px-6)과 일치 */}
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-3.5 text-left">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Palette className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-[15px] font-bold text-slate-900">
                웹툰 유형 선택
              </DialogTitle>
              <DialogDescription className="mt-0.5 truncate text-[12px] text-slate-500">
                <b className="font-semibold text-slate-700">
                  {passageTitle || "지문"}
                </b>{" "}
                —{" "}
                {saveMode
                  ? "이 유형을 지문에 담습니다. 담긴 지문은 한 번에 생성합니다."
                  : "이 지문 하나로 한 장의 세로형 웹툰을 생성합니다."}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="닫기"
                disabled={submitting}
                className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {passagePreview ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <FileText
                className="size-4 shrink-0 text-blue-500"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 truncate text-[12px] leading-relaxed text-slate-600">
                {passagePreview}
              </p>
            </div>
          ) : null}

          <WebtoonGenerateFields
            value={{ plan, style, language, customPrompt }}
            onChange={(patch) => {
              if (patch.plan !== undefined) setPlan(patch.plan);
              if (patch.style !== undefined) setStyle(patch.style);
              if (patch.language !== undefined) setLanguage(patch.language);
              if (patch.customPrompt !== undefined)
                setCustomPrompt(patch.customPrompt);
            }}
            disabled={submitting}
          />
        </div>

        <div className="shrink-0 border-t border-slate-100 px-6 py-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-[14px] font-bold text-white shadow-md shadow-blue-200/50 transition-all hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {saveMode ? "담는 중…" : "생성 시작 중…"}
              </>
            ) : saveMode ? (
              <>
                <Check className="size-4" />
                이 유형으로 담기
              </>
            ) : (
              <>
                <Wand2 className="size-4" />
                웹툰 생성
                <CreditCostChip
                  amount={credits}
                  className="ml-0.5 rounded-lg bg-white/20 px-2 py-0.5 text-[11px] text-white"
                />
              </>
            )}
          </button>
          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-slate-400">
            {saveMode
              ? "담기는 과금되지 않아요. 담긴 지문들은 하단 버튼에서 한 번에 생성됩니다."
              : "생성에는 약 3분 정도 걸려요. 시작한 뒤 다른 작업을 계속하셔도 완료되면 결과 목록에 표시됩니다."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
