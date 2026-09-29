"use client";

import { useEffect, useId, useState } from "react";
import {
  Clapperboard,
  Clock,
  Gem,
  Languages,
  Palette,
  X,
  Zap,
} from "lucide-react";
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

/** 추가 지시 글자 수 상한 — 서버(generate route)도 같은 값으로 잘라 저장한다. */
const CUSTOM_PROMPT_MAX = 1000;

/**
 * 추가 지시 도움말 — 교사 실사례에서 실제로 잘 반영된 지시 유형 3가지(스펙 §0).
 * 입력칸 아래 예시로만 보여 주고, 눌러서 삽입하지는 않는다(캐스팅 예시는 지문마다 달라
 * 그대로 넣으면 다른 지문에 엉뚱한 배역이 붙는다).
 */
const PROMPT_TIPS: ReadonlyArray<{ label: string; example: string }> = [
  { label: "대상 학년·톤", example: "중3 눈높이로 귀엽게" },
  { label: "캐스팅·비유", example: "병원체=악당 몬스터, 대식세포=성문 경비병" },
  { label: "강조 장면", example: "실험 결과를 보여 주는 장면을 크게" },
];

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
 * 대사 언어 카드의 열 배치 — 모바일 1열(설명을 자르지 않고 두 줄 안에 읽힘), sm 2열
 * (홀수 개면 마지막 카드 전폭), md 6칸 그리드에 3장씩(각 2칸) 채우고 남은 줄은 폭을
 * 나눠 끝선을 맞춘다(5종 = 윗줄 3장 + 아랫줄 2장×3칸). 클래스는 JIT 가 읽도록 리터럴.
 */
function languageSpanClass(index: number, total: number): string {
  const classes: string[] = [];
  if (total % 2 === 1 && index === total - 1) classes.push("sm:col-span-2");
  const tail = total % 3;
  if (tail === 2 && index >= total - 2) classes.push("md:col-span-3");
  else if (tail === 1 && index === total - 1) classes.push("md:col-span-6");
  else classes.push("md:col-span-2");
  return classes.join(" ");
}

/**
 * 웹툰 생성 옵션 필드(모델 등급·화풍·대사 언어·추가 지시) — 컨트롤드.
 * 지문 웹툰 삽입 모달과 워크스페이스 유형 선택 모달이 동일한 디자인으로 공유한다.
 *
 * 레이아웃: 모든 섹션이 전폭(full-width) 행 — 상단 엔진 안내 한 줄, 생성 모델 2열,
 * 화풍 5열, 대사 언어 3+2(데스크톱), 추가 지시 전폭. 카드 제목은 1줄 고정(truncate),
 * 설명은 2줄 고정 높이로 클램프해 어느 행에서도 카드 높이·좌우 끝선이 어긋나지 않는다.
 */
export function WebtoonGenerateFields({
  value,
  onChange,
  disabled,
  koreanPassage,
}: {
  value: WebtoonGenerateConfig;
  onChange: (patch: Partial<WebtoonGenerateConfig>) => void;
  disabled?: boolean;
  /**
   * 국어 지문 표면 — 서버가 국어 지문은 언어 선택과 무관하게 한국어로 조판하므로
   * (스펙 §3) 대사 언어 선택지를 숨기고 안내 한 줄로 대신한다. 미전달 = 기존 동작.
   */
  koreanPassage?: boolean;
}) {
  const [preview, setPreview] = useState<WebtoonImagePlanDef | null>(null);
  const promptTipsId = useId();
  const promptLength = value.customPrompt.length;

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
      {/* ── 엔진 안내 — 무엇이 어떻게 그려지는지 한 줄로 ── */}
      <p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
        <Clapperboard
          className="mt-0.5 size-3.5 shrink-0 text-blue-500"
          aria-hidden="true"
        />
        <span className="min-w-0 break-keep">
          AI가 지문을{" "}
          <b className="font-semibold text-slate-800">5~8컷 콘티</b>로 각색하고
          컷마다 <b className="font-semibold text-slate-800">샷·앵글·구도</b>를
          설계한 뒤 한 장의 세로 웹툰으로 그려요.
        </span>
      </p>

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
                      {/* 예상 소요 시간 — 제목 행 우측 끝(엔진 줄과 나누면 sm 2열에서도 안 잘린다). */}
                      <span
                        className={`ml-auto inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-medium ${
                          active ? "text-blue-700/80" : "text-slate-500"
                        }`}
                      >
                        <Clock className="size-3" aria-hidden="true" />
                        {plan.etaLabel}
                      </span>
                    </span>
                    {/* 엔진 보조 줄 — 엔진명은 UI 에서 이 줄에만 노출(스펙 §5). */}
                    <span
                      className={`mt-0.5 block truncate text-[10.5px] font-semibold ${
                        active ? "text-blue-700/80" : "text-slate-500"
                      }`}
                    >
                      {plan.engineLabel}
                    </span>
                    <span className="mt-1 line-clamp-2 min-h-[2.8em] break-keep text-[11px] leading-snug text-slate-500">
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

      {/* ── 대사 언어 — 모바일 1열 · sm 2열 · 데스크톱 3+2 ── */}
      <div>
        <SectionLabel icon={Languages}>대사 언어</SectionLabel>
        {koreanPassage ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
            국어 지문은 대사·나레이션이 모두 한국어로 들어가요.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-6">
            {WEBTOON_LANGUAGES.map((l, i) => {
              const active = value.language === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onChange({ language: l.id })}
                  disabled={disabled}
                  title={`${l.label} — ${l.description}`}
                  aria-pressed={active}
                  className={`rounded-xl border px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 ${languageSpanClass(i, WEBTOON_LANGUAGES.length)} ${cardClass(active)}`}
                >
                  <span
                    className={`block truncate text-[12.5px] font-bold ${active ? "text-blue-900" : "text-slate-800"}`}
                  >
                    {l.label}
                  </span>
                  <span className="mt-0.5 line-clamp-2 break-keep text-[10.5px] leading-snug text-slate-500 sm:min-h-[2.8em]">
                    {l.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 추가 지시사항 — 전폭 + 잘 먹히는 지시 예시 ── */}
      <div>
        <SectionLabel
          hint={
            promptLength > 0
              ? `${promptLength}/${CUSTOM_PROMPT_MAX}자`
              : "선택 사항"
          }
        >
          추가 지시사항
        </SectionLabel>
        <textarea
          value={value.customPrompt}
          onChange={(e) => onChange({ customPrompt: e.target.value })}
          disabled={disabled}
          aria-label="추가 지시사항"
          aria-describedby={promptTipsId}
          maxLength={CUSTOM_PROMPT_MAX}
          placeholder="대상 학년·톤, 캐스팅·비유, 강조 장면 등 원하는 연출을 적어 주세요"
          className="min-h-[64px] w-full sm:min-h-[52px] resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-[12px] leading-relaxed outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:opacity-60"
        />
        <ul
          id={promptTipsId}
          aria-label="추가 지시 예시"
          className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1"
        >
          {PROMPT_TIPS.map((t) => (
            <li
              key={t.label}
              className="flex min-w-0 items-baseline gap-1.5 text-[10.5px] leading-snug"
            >
              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-px font-semibold text-slate-600">
                {t.label}
              </span>
              <span className="min-w-0 break-keep text-slate-500">
                “{t.example}”
              </span>
            </li>
          ))}
        </ul>
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
