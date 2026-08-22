"use client";

// ============================================================================
// 학습지 3상품 선택 데모 (U3 — .tmp-studio-tour/spec.md §3 demo-worksheet)
//
// ch3-products 스텝의 스테이지 데모. 실 화면 미러 원장:
// - 상품 라벨·부제·단가: STUDIO_SHEET_PRODUCTS(src/lib/studio/sheet-products.ts)
//   실 모듈을 직접 import — 자구 복제 금지 계약. 우측 미리보기의 섹션 라벨도
//   부제 자구를 「 · 」로 쪼개 유도한다(하드코딩 금지).
// - 「지문당 ◈{unitCost}」 단가 배지: workbook-generate-modal.tsx(:687) 자구 미러.
// - 하단 CTA 라벨 문법: workbook-generate-modal.tsx(:306-311)
//   `${active.product.label} · 지문 ${targetCount}개 생성` — 지문 1개 고정 미러.
// 서버 액션 0 · 스토어 쓰기 0 — 로컬 useState 하나로만 동작한다.
// 시간 구동 애니메이션 없음(전환은 색상 트랜지션뿐) — reduced-motion 특례 불요.
// ============================================================================

import { useState } from "react";
import { FileText } from "lucide-react";
import { DemoBadge, DemoFrame, DemoLines, DemoPaper } from "./demo-stage";
import { DEMO_PASSAGE_TITLE } from "./demo-data";
import {
  STUDIO_SHEET_PRODUCTS,
  type StudioSheetVariant,
} from "@/lib/studio/sheet-products";

// ---------------------------------------------------------------------------
// 부제 자구 → 섹션 라벨 유도 (자구 드리프트 방지 — 부제가 바뀌면 함께 바뀐다)
// ---------------------------------------------------------------------------

/** 「 · 」(공백 포함) 기준 분해 — 「출제 포인트·함정」처럼 붙은 가운뎃점은 보존. */
function splitSubtitle(subtitle: string): readonly string[] {
  return subtitle
    .split(" · ")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** practice 부제(「기본 구성 + …」)에서 기본 구성 참조를 떼고 추가 구성만 남긴다. */
function splitPracticeExtras(subtitle: string): readonly string[] {
  return subtitle
    .split(" · ")
    .flatMap((seg) => seg.split(" + "))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "기본 구성");
}

// ---------------------------------------------------------------------------
// 미니 페이지 조각 — DemoPaper(A4) 위 「라벨 밴드 + 글줄」 섹션 블록
// ---------------------------------------------------------------------------

type BandTone = "blue" | "violet" | "amber" | "slate";

const BAND_TONES: Record<BandTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-700",
  slate: "bg-slate-100 text-slate-500",
};

function MiniSection({
  label,
  lines,
  seed,
  tone = "slate",
}: {
  label: string;
  lines: number;
  seed: number;
  tone?: BandTone;
}) {
  return (
    <div>
      <div className={`flex h-3 items-center rounded-sm px-1 ${BAND_TONES[tone]}`}>
        <span className="truncate text-[8px] font-bold leading-none">{label}</span>
      </div>
      <DemoLines count={lines} seed={seed} className="mt-0.5 px-0.5" />
    </div>
  );
}

function MiniTitle() {
  return (
    <div className="shrink-0 border-b border-slate-100 px-1.5 py-1">
      <p className="truncate text-[8px] font-bold leading-none text-slate-700">
        {DEMO_PASSAGE_TITLE}
      </p>
    </div>
  );
}

/** basic 1장 — 부제에서 유도한 6섹션(원문 캔버스만 파랑 밴드로 강조). */
function BasicPage({
  sections,
  width,
}: {
  sections: readonly string[];
  width: string;
}) {
  return (
    <DemoPaper size="A4" className={width}>
      <MiniTitle />
      <div className="min-h-0 flex-1 space-y-1 p-1.5">
        {sections.map((label, i) => (
          <MiniSection
            key={label}
            label={label}
            lines={i === 0 ? 3 : 2}
            seed={i * 3}
            tone={i === 0 ? "blue" : "slate"}
          />
        ))}
      </div>
    </DemoPaper>
  );
}

/** practice 2장째 — 부제에서 유도한 추가 구성 4섹션(학습지 보라 문법). */
function WorkbookPage({
  sections,
  width,
}: {
  sections: readonly string[];
  width: string;
}) {
  return (
    <DemoPaper size="A4" className={width}>
      <MiniTitle />
      <div className="min-h-0 flex-1 space-y-1 p-1.5">
        {sections.map((label, i) => (
          <MiniSection
            key={label}
            label={label}
            lines={i === sections.length - 1 ? 4 : 3}
            seed={i * 5 + 1}
            tone="violet"
          />
        ))}
      </div>
    </DemoPaper>
  );
}

/** final 1장 — 압축 섹션 + 2단 글줄로 「한 장에 눌러 담은」 밀도를 표현. */
function FinalPage({ sections }: { sections: readonly string[] }) {
  return (
    <DemoPaper size="A4" className="w-40 ring-2 ring-amber-300">
      <MiniTitle />
      <div className="min-h-0 flex-1 space-y-1 p-1.5">
        {sections.map((label, i) => (
          <MiniSection key={label} label={label} lines={3} seed={i * 4 + 2} tone="amber" />
        ))}
        <div className="grid grid-cols-2 gap-1 pt-0.5">
          <DemoLines count={4} seed={5} />
          <DemoLines count={4} seed={9} />
        </div>
      </div>
    </DemoPaper>
  );
}

// ---------------------------------------------------------------------------
// 본체
// ---------------------------------------------------------------------------

export function DemoWorksheet() {
  const [selectedId, setSelectedId] = useState<StudioSheetVariant>("basic");
  const selected =
    STUDIO_SHEET_PRODUCTS.find((p) => p.id === selectedId) ?? STUDIO_SHEET_PRODUCTS[0];

  // basic 부제는 practice 1장째 미리보기에도 쓰이므로 선택과 무관하게 유도한다.
  const basicProduct =
    STUDIO_SHEET_PRODUCTS.find((p) => p.id === "basic") ?? STUDIO_SHEET_PRODUCTS[0];
  const basicSections = splitSubtitle(basicProduct.subtitle);
  const practiceExtras =
    selected.id === "practice" ? splitPracticeExtras(selected.subtitle) : [];
  // final 부제의 마지막 조각 = 「A4 딱 1장」 — 배지도 부제 자구에서 유도한다.
  const finalParts = selected.id === "final" ? splitSubtitle(selected.subtitle) : [];
  const finalBadge = finalParts.length > 0 ? finalParts[finalParts.length - 1] : "";
  const finalSections = finalParts.slice(0, -1);

  return (
    <DemoFrame caption="예시 화면 — 구성을 누르면 오른쪽 미리보기가 바뀝니다">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,15.5rem)_minmax(0,1fr)]">
        {/* 좌측 — 상품 라디오 3카드 (라벨·부제·단가 전부 실 모듈 자구) */}
        <div role="radiogroup" aria-label="학습지 구성 선택" className="flex flex-col gap-2">
          {STUDIO_SHEET_PRODUCTS.map((p) => {
            const active = p.id === selected.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-demo-product={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                  active
                    ? "border-blue-500 bg-blue-50/60 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? "border-blue-500" : "border-slate-300"
                  }`}
                >
                  {active ? <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-[12.5px] font-bold ${
                        active ? "text-blue-700" : "text-slate-700"
                      }`}
                    >
                      {p.label}
                    </span>
                    {/* 단가 배지 자구 미러 — 출처: workbook-generate-modal.tsx:687 */}
                    <span
                      className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-bold ${
                        active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      지문당 ◈{p.unitCost}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500 break-keep">
                    {p.subtitle}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* 우측 — 선택 상품의 구성 미리보기 */}
        <div
          data-demo-preview={selected.id}
          className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-2.5"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <DemoBadge
              tone={
                selected.id === "final" ? "amber" : selected.id === "practice" ? "violet" : "blue"
              }
            >
              {selected.label}
            </DemoBadge>
            {/* 페이지 수 배지 삭제(적대검수): 기본 학습지도 실제로는 다페이지
                상품이라 「A4 1장」 표기가 사실 왜곡이었다 — 「A4 딱 1장」은
                파이널만의 차별점 자구(부제 유도 배지가 담당). */}
            <DemoBadge tone="slate">구성 예시</DemoBadge>
            {selected.id === "final" && finalBadge ? (
              <DemoBadge tone="amber">{finalBadge}</DemoBadge>
            ) : null}
            <span className="ml-auto shrink-0 text-[10.5px] font-medium text-slate-400">
              예시 축소판
            </span>
          </div>

          <div className="mt-2.5 flex flex-1 items-start justify-center gap-3">
            {selected.id === "basic" ? (
              <BasicPage sections={basicSections} width="w-40" />
            ) : null}

            {selected.id === "practice" ? (
              <>
                {/* 캡션의 「기본 구성」은 practice 부제 자구의 반향 표현 */}
                <figure className="space-y-1">
                  <BasicPage sections={basicSections} width="w-36" />
                  <figcaption className="text-center text-[10px] font-medium text-slate-400">
                    1장 · 기본 구성
                  </figcaption>
                </figure>
                <figure className="space-y-1">
                  <WorkbookPage sections={practiceExtras} width="w-36" />
                  <figcaption className="text-center text-[10px] font-medium text-slate-400">
                    2장 · 추가 구성
                  </figcaption>
                </figure>
              </>
            ) : null}

            {selected.id === "final" ? (
              <figure className="space-y-1.5">
                <FinalPage sections={finalSections} />
                <figcaption className="text-center text-[10px] font-medium text-slate-400">
                  1장 구성 — 한 장에 전부 담습니다
                </figcaption>
              </figure>
            ) : null}
          </div>
        </div>
      </div>

      {/* 하단 CTA 목업 — 라벨 문법 미러, 출처: workbook-generate-modal.tsx:306-311
          (`${active.product.label} · 지문 ${targetCount}개 생성` — 지문 1개 고정) */}
      <div
        data-demo-cta="sheet-launch"
        className="mt-3 flex h-9 items-center justify-center rounded-lg bg-blue-600 text-[12.5px] font-bold text-white shadow-sm"
      >
        {selected.label} · 지문 1개 생성
      </div>
    </DemoFrame>
  );
}
