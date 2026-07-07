"use client";

import { useEffect, useState } from "react";
import { Gem, Languages, Palette, X, Zap } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WEBTOON_IMAGE_PLAN_LIST,
  type WebtoonImagePlanDef,
  type WebtoonImagePlanId,
} from "@/lib/webtoon-models";
import {
  WEBTOON_STYLES,
  WEBTOON_LANGUAGES,
  type WebtoonStyleId,
  type WebtoonLanguageId,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";

export interface WebtoonGenerateConfig {
  plan: WebtoonImagePlanId;
  style: WebtoonStyleId;
  language: WebtoonLanguageId;
  customPrompt: string;
}

const PLAN_ICON: Record<WebtoonImagePlanId, typeof Gem> = {
  STANDARD: Zap,
  PREMIUM: Gem,
};

/** 섹션 라벨 행 — 라벨은 좌측, 힌트는 우측 끝선에 정렬. */
function SectionLabel({
  icon: Icon,
  children,
  hint,
}: {
  icon?: typeof Palette;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      {Icon ? <Icon className="size-3.5 text-slate-400" aria-hidden="true" /> : null}
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {children}
      </span>
      {hint ? (
        <span className="ml-auto text-[10.5px] font-medium normal-case text-slate-400">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** 선택 카드 공통 테두리 — active 여부에 따른 파란 강조(문제 생성 모달과 동일 토큰). */
function cardClass(active: boolean): string {
  return active
    ? "border-blue-400 bg-blue-50/70 ring-1 ring-blue-200"
    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";
}

/**
 * 웹툰 생성 옵션 필드(모델 등급·화풍·대사 언어·추가 지시) — 컨트롤드.
 * 지문 웹툰 삽입 모달과 워크스페이스 유형 선택 모달이 동일한 디자인으로 공유한다.
 *
 * 레이아웃: 모든 섹션이 전폭(full-width) 행 — 생성 모델 2열, 화풍 5열, 대사 언어
 * 4열, 추가 지시 전폭. 카드 제목은 1줄 고정(truncate), 설명은 2줄 고정 높이로
 * 클램프해 어느 행에서도 카드 높이·좌우 끝선이 어긋나지 않는다.
 */
export function WebtoonGenerateFields({
  value,
  onChange,
  disabled,
}: {
  value: WebtoonGenerateConfig;
  onChange: (patch: Partial<WebtoonGenerateConfig>) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<WebtoonImagePlanDef | null>(null);

  // 라이트박스가 열려 있는 동안 Escape 를 캡처 단계에서 가로채 라이트박스만 닫는다.
  // (호스트 모달들이 window/document 에 자체 Escape 리스너를 두고 있어, 가로채지
  // 않으면 라이트박스와 호스트 모달이 한 번에 같이 닫힌다.)
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPreview(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [preview]);

  return (
    <div className="space-y-3.5">
      {/* ── 생성 모델(등급) — 2열, 카드에 등급별 예시 썸네일 내장 ── */}
      <div>
        <SectionLabel hint="예시 이미지를 누르면 크게 볼 수 있어요">
          생성 모델
        </SectionLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEBTOON_IMAGE_PLAN_LIST.map((plan) => {
            const active = value.plan === plan.id;
            const Icon = PLAN_ICON[plan.id];
            return (
              // 카드 자체는 div — 안에 "선택"과 "예시 확대" 두 개의 독립 버튼을 담는다
              // (버튼 중첩은 invalid HTML이라 분리).
              <div
                key={plan.id}
                className={`flex items-stretch gap-2.5 rounded-xl border p-2 transition-all ${cardClass(active)}`}
              >
                <button
                  type="button"
                  onClick={() => onChange({ plan: plan.id })}
                  disabled={disabled}
                  aria-pressed={active}
                  className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                      active ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`truncate text-[13px] font-bold ${active ? "text-blue-900" : "text-slate-800"}`}
                      >
                        {plan.label}
                      </span>
                      <CreditCostChip
                        amount={plan.credits}
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${
                          active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                        }`}
                      />
                    </span>
                    <span className="mt-0.5 line-clamp-2 min-h-[2.8em] break-keep text-[11px] leading-snug text-slate-500">
                      {plan.blurb}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(plan)}
                  title={`${plan.label} 예시 크게 보기`}
                  aria-label={`${plan.label} 등급 예시 크게 보기`}
                  className="group relative w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={plan.exampleUrl}
                    alt={`${plan.label} 등급 예시 웹툰`}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-slate-900/55 py-0.5 text-center text-[8.5px] font-semibold text-white">
                    예시
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 화풍 — 데스크톱 5열 한 줄 ── */}
      <div>
        <SectionLabel icon={Palette}>화풍</SectionLabel>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {WEBTOON_STYLES.map((s) => {
            const active = value.style === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ style: s.id })}
                disabled={disabled}
                title={s.description}
                aria-pressed={active}
                className={`rounded-xl border px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 last:col-span-2 md:last:col-span-1 ${cardClass(active)}`}
              >
                <span
                  className={`block truncate text-[12.5px] font-bold ${active ? "text-blue-900" : "text-slate-800"}`}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 line-clamp-2 min-h-[2.8em] break-keep text-[10.5px] leading-snug text-slate-500">
                  {s.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 대사 언어 — 데스크톱 4열 한 줄 ── */}
      <div>
        <SectionLabel icon={Languages}>대사 언어</SectionLabel>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {WEBTOON_LANGUAGES.map((l) => {
            const active = value.language === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onChange({ language: l.id })}
                disabled={disabled}
                title={`${l.label} — ${l.description}`}
                aria-pressed={active}
                aria-label={l.label}
                className={`rounded-xl border px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 ${cardClass(active)}`}
              >
                <span
                  className={`block truncate text-[12.5px] font-bold ${active ? "text-blue-900" : "text-slate-800"}`}
                >
                  {l.short}
                </span>
                <span className="mt-0.5 line-clamp-2 min-h-[2.8em] break-keep text-[10.5px] leading-snug text-slate-500">
                  {l.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 추가 지시사항 — 전폭 ── */}
      <div>
        <SectionLabel hint="선택 사항">추가 지시사항</SectionLabel>
        <textarea
          value={value.customPrompt}
          onChange={(e) => onChange({ customPrompt: e.target.value })}
          disabled={disabled}
          aria-label="추가 지시사항"
          maxLength={1000}
          placeholder="예: 주인공은 고등학생, 배경은 한국 학교, 명대사는 큰 말풍선으로 강조..."
          className="min-h-[52px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-[12px] leading-relaxed outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:opacity-60"
        />
      </div>

      {/* ── 예시 확대 라이트박스 — 중첩 Radix Dialog ──
          수동 body 포털은 호스트가 Radix 모달일 때 body pointer-events:none 에 눌려
          클릭이 전부 죽고, 호스트의 바깥클릭 감지가 모달을 통째로 닫아버린다.
          중첩 Dialog 는 레이어링·포커스·바깥클릭을 Radix 가 올바르게 처리한다. */}
      <Dialog
        open={!!preview}
        onOpenChange={(v) => {
          if (!v) setPreview(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          onClick={(e) => {
            // 이미지 카드 바깥(딤 영역) 클릭 시 닫기.
            if (e.target === e.currentTarget) setPreview(null);
          }}
          className="inset-0 z-[130] flex h-dvh w-screen max-w-none max-h-none translate-x-0 translate-y-0 items-center justify-center rounded-none border-0 bg-slate-900/70 p-4 shadow-none sm:w-screen sm:max-w-none sm:p-4"
        >
          <DialogTitle className="sr-only">
            {preview ? `${preview.label} 등급 예시 웹툰` : "예시 웹툰"}
          </DialogTitle>
          {preview ? (
            <div className="relative max-h-full overflow-auto rounded-xl bg-white p-2 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.exampleUrl}
                alt={`${preview.label} 등급 예시 웹툰`}
                className="max-h-[82vh] w-auto rounded-lg"
              />
              <p className="mt-1.5 pb-0.5 text-center text-[11px] font-semibold text-slate-600">
                {preview.label} 예시
              </p>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="닫기"
                  className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md transition-colors hover:bg-white hover:text-slate-900"
                >
                  <X className="size-4" />
                </button>
              </DialogClose>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
