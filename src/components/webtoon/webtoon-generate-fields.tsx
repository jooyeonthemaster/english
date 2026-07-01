"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Gem, Images, Languages, Palette, X, Zap } from "lucide-react";
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

/** 섹션 라벨 — 문제 생성 모달과 동일한 대문자 트래킹 라벨. */
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
        <span className="text-[11px] font-medium normal-case text-slate-400">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 웹툰 생성 옵션 필드(모델 등급·화풍·대사 언어·추가 지시) — 컨트롤드.
 * 지문 웹툰 삽입 모달과 워크스페이스 유형 선택 모달이 동일한 디자인으로 공유한다.
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
  const [showExamples, setShowExamples] = useState(false);
  const [preview, setPreview] = useState<WebtoonImagePlanDef | null>(null);

  return (
    <div className="space-y-4">
      {/* ── 생성 모델(등급) ── */}
      <div>
        <SectionLabel>생성 모델</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {WEBTOON_IMAGE_PLAN_LIST.map((plan) => {
            const active = value.plan === plan.id;
            const Icon = PLAN_ICON[plan.id];
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => onChange({ plan: plan.id })}
                disabled={disabled}
                aria-pressed={active}
                className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 ${
                  active
                    ? "border-blue-400 bg-blue-50/70 ring-1 ring-blue-200"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span
                      className={`text-[12.5px] font-bold ${active ? "text-blue-900" : "text-slate-800"}`}
                    >
                      {plan.label}
                    </span>
                    <CreditCostChip
                      amount={plan.credits}
                      className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                      }`}
                    />
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500">
                    {plan.blurb}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── 예시 보기(레퍼런스) ── */}
        <button
          type="button"
          onClick={() => setShowExamples((v) => !v)}
          aria-expanded={showExamples}
          className="mt-2 inline-flex items-center gap-1 rounded-md text-[11px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
        >
          <Images className="size-3.5" aria-hidden="true" />
          {showExamples ? "예시 숨기기" : "등급별 예시 보기"}
          <ChevronDown
            className={`size-3.5 transition-transform ${showExamples ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {showExamples ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {WEBTOON_IMAGE_PLAN_LIST.map((plan) => (
              <figure key={plan.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setPreview(plan)}
                  title={`${plan.label} 예시 크게 보기`}
                  className="group relative block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={plan.exampleUrl}
                    alt={`${plan.label} 등급 예시 웹툰`}
                    loading="lazy"
                    className="aspect-[9/16] w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-slate-900/55 py-0.5 text-[9px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    크게 보기
                  </span>
                </button>
                <figcaption className="mt-1 text-center text-[10.5px] font-semibold text-slate-500">
                  {plan.label} 예시
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </div>

      {/* 예시 확대 라이트박스 — 변형(transform)된 모달 조상 밖으로 나가기 위해 body 포털 */}
      {preview
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 p-4"
              onClick={() => setPreview(null)}
              role="dialog"
              aria-modal="true"
              aria-label={`${preview.label} 예시`}
            >
              <div
                className="relative max-h-[92vh] overflow-auto rounded-xl bg-white p-2 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.exampleUrl}
                  alt={`${preview.label} 등급 예시 웹툰`}
                  className="max-h-[84vh] w-auto rounded-lg"
                />
                <p className="mt-1 text-center text-[11px] font-semibold text-slate-600">
                  {preview.label} 예시
                </p>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  aria-label="닫기"
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow transition-colors hover:bg-white hover:text-slate-900"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* ── 화풍 ── */}
      <div>
        <SectionLabel icon={Palette}>화풍</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
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
        <SectionLabel icon={Languages}>대사 언어</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
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
        <SectionLabel hint="(선택)">추가 지시사항</SectionLabel>
        <textarea
          value={value.customPrompt}
          onChange={(e) => onChange({ customPrompt: e.target.value })}
          disabled={disabled}
          aria-label="추가 지시사항"
          maxLength={1000}
          placeholder="예: 주인공은 고등학생, 배경은 한국 학교, 명대사는 큰 말풍선으로 강조..."
          className="min-h-[64px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-[12px] leading-relaxed outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:opacity-60"
        />
      </div>
    </div>
  );
}
