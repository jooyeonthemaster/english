import { FileQuestion, Languages } from "lucide-react";

import type {
  VocabTestLayout,
  VocabTestMode,
  VocabularyTier,
} from "@/lib/passage-report/analysis-report/schema";

export function VocabTestOptions({
  sectionIndex,
  vocabMode,
  vocabTestLayout,
  vocabTestOnly,
  hideVocabTestOnly,
  excludedVocabTestCount,
  vocabTierFilter,
  onVocabTestMode,
  onVocabTestLayout,
  onVocabTestOnly,
  onRestoreVocabTestRows,
  onVocabTierFilter,
}: {
  sectionIndex: number;
  vocabMode: VocabTestMode;
  vocabTestLayout: VocabTestLayout;
  vocabTestOnly: boolean;
  /**
   * [E23] 파이널 문서에서는 「단어 시험지만 만들기」 토글을 숨긴다 — vocabTestOnly 가
   * 본편 시트·활동·웹툰을 전부 소멸시키는 I3 위반 경로라 진입 자체를 차단(스펙 E23).
   * 단, 이미 켜진 문서(레거시 저장본)의 「전체 자료 다시 보이기」 복구 경로는 남긴다.
   */
  hideVocabTestOnly?: boolean;
  excludedVocabTestCount: number;
  vocabTierFilter: VocabularyTier[] | undefined;
  onVocabTestMode: (sectionIndex: number, mode: VocabTestMode) => void;
  onVocabTestLayout: (sectionIndex: number, layout: VocabTestLayout) => void;
  onVocabTestOnly: (sectionIndex: number, enabled: boolean, mode?: Exclude<VocabTestMode, "study">) => void;
  onRestoreVocabTestRows: (sectionIndex: number) => void;
  onVocabTierFilter: (sectionIndex: number, tiers: VocabularyTier[]) => void;
}) {
  // 난이도 단계: AI가 매긴 core/test/challenge = 1/2/3단계. 필터 없으면(undefined) 전체.
  const activeTiers: VocabularyTier[] = vocabTierFilter && vocabTierFilter.length > 0 ? vocabTierFilter : ["core", "test", "challenge"];
  const toggleTier = (tier: VocabularyTier) => {
    const next = activeTiers.includes(tier) ? activeTiers.filter((t) => t !== tier) : [...activeTiers, tier];
    onVocabTierFilter(sectionIndex, next.length === 0 ? ["core", "test", "challenge"] : next);
  };
  return (
    <div>
      {/* '추가 안 함'(study)은 상단 ON/OFF 스위치와 기능이 중복되어 제외. */}
      <div className="grid grid-cols-2 gap-1.5">
        {([
          { mode: "hide-meaning", label: "뜻 쓰기", icon: Languages },
          { mode: "hide-headword", label: "단어 쓰기", icon: FileQuestion },
          { mode: "synonym", label: "동의어 쓰기", icon: Languages },
          { mode: "antonym", label: "반의어 쓰기", icon: Languages },
        ] as const).map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            data-vocab-mode={mode}
            onClick={() => onVocabTestMode(sectionIndex, mode)}
            className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-[11px] font-semibold ${
              vocabMode === mode
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500">난이도 단계</span>
          <span className="text-[10.5px] text-slate-400">단어장·시험지 공통</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { tier: "core", label: "1단계", sub: "쉬움" },
            { tier: "test", label: "2단계", sub: "중상" },
            { tier: "challenge", label: "3단계", sub: "고난도" },
          ] as const).map(({ tier, label, sub }) => {
            const on = activeTiers.includes(tier);
            return (
              <button
                key={tier}
                type="button"
                data-vocab-tier={tier}
                aria-pressed={on}
                onClick={() => toggleTier(tier)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-md border py-1.5 text-[11px] font-semibold transition-colors ${
                  on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-400 hover:bg-slate-50"
                }`}
              >
                <span>{label}</span>
                <span className="text-[9.5px] font-medium text-slate-400">{sub}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10.5px] text-slate-400">
          {vocabTierFilter && vocabTierFilter.length > 0 ? "선택 단계만 단어장·시험지에 표시돼요." : "전체 표시 — 시험지는 기본으로 1단계(쉬움)를 빼고 출제해요."}
        </p>
      </div>

      <div className="mt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500">시험지 레이아웃</span>
          <span className="text-[10.5px] text-slate-400">{vocabTestLayout === "two-column" ? "2열 카드" : "1열 표"}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { layout: "table", label: "1열 표" },
            { layout: "two-column", label: "2열 카드" },
          ] as const).map(({ layout, label }) => (
            <button
              key={layout}
              type="button"
              data-vocab-test-layout={layout}
              onClick={() => onVocabTestLayout(sectionIndex, layout)}
              className={`h-8 rounded-md border text-[12px] font-semibold transition-colors ${
                vocabTestLayout === layout
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* [E23] 파이널에서는 켜기 버튼을 렌더하지 않는다(위 hideVocabTestOnly 계약).
          vocabTestOnly 가 이미 true 인 문서에서는 복구(restore) 버튼만 남긴다. */}
      {hideVocabTestOnly && !vocabTestOnly ? null : (
      <button
        type="button"
        data-vocab-test-only={vocabTestOnly ? "restore" : "only"}
        onClick={() => {
          if (vocabTestOnly) {
            onVocabTestOnly(sectionIndex, false);
            return;
          }
          onVocabTestOnly(
            sectionIndex,
            true,
            vocabMode !== "study" ? vocabMode : "hide-meaning",
          );
        }}
        className={`mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[12px] font-semibold transition-colors ${
          vocabTestOnly
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <FileQuestion className={`h-3.5 w-3.5 ${vocabTestOnly ? "text-blue-600" : "text-slate-400"}`} />
        {vocabTestOnly ? "전체 자료 다시 보이기" : "단어 시험지만 만들기"}
      </button>
      )}

      {excludedVocabTestCount > 0 ? (
        <button
          type="button"
          onClick={() => onRestoreVocabTestRows(sectionIndex)}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          제외한 단어 다시 포함 ({excludedVocabTestCount})
        </button>
      ) : null}
    </div>
  );
}
