// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { buildIrrelevantPointGuidance } from "@/lib/irrelevant-point-catalog";
import { buildSentenceInsertPointGuidance } from "@/lib/sentence-insert-point-catalog";
import { buildSentenceOrderPointGuidance } from "@/lib/sentence-order-point-catalog";
import { buildAntonymCandidateBlock } from "./antonym";
import { buildBlankInferenceCandidateBlock } from "./blank";
import { buildGrammarChoiceComboCandidateBlock, buildGrammarCorrectionCandidateBlock, buildGrammarErrorCandidateBlock } from "./grammar";
import { buildImpliedMeaningCandidateBlock } from "./implied";
import { buildIrrelevantCandidateBlock } from "./irrelevant";
import { buildReferenceCandidateBlock } from "./reference";
import { CandidateDiversityOptions } from "./shared";



export function buildQuestionTargetCandidateBlock(
  typeId: string,
  passage: string,
  options: {
    irrelevantSlotCount?: number;
    grammarMarkerCount?: number;
    grammarAnswerCount?: number;
    grammarCorrectionErrorCount?: number;
    antonymPairCount?: number;
    /** 2~3 = multi-blank BLANK_INFERENCE; the single-blank candidate block is suppressed. */
    blankInferenceBlankCount?: number;
    /** Single-blank BLANK_INFERENCE should use paraphrased visible answers. */
    blankInferenceParaphraseAnswer?: boolean;
    /** Single-blank BLANK_INFERENCE should use double-negative transformed answers. */
    blankInferenceDoubleNegative?: boolean;
    /** Legacy name; interpreted as grammarMarkerCount. */
    grammarErrorCount?: number;
    /** 결핍(제한 지문) 판정 기준 — 스페어 과잉생성(G=K+1) 시 검증 기준 K. */
    grammarScarcityBaseCount?: number;
    /** 어법 후보 블록 diet 변형(연구 프로필 G4) — 미지정 시 기존 full 그대로. */
    grammarCandidateBlockVariant?: "full" | "diet";
    requestedDifficulty?: string;
    /** 다양성: 같은 지문에서 이미 사용된 타깃(유형별 원문 표현) — 후보 필터링용 */
    usedTargets?: string[];
    /** 다양성: 기존 문항의 정규화된 정답 라벨 — 정답 위치 분산용 */
    usedAnswerLabels?: string[];
    /** 다양성: 어법류에서 이미 정답으로 쓰인 출제 포인트 코드(a~m) — 포인트 분산용 */
    usedPointCodes?: string[];
    /** 다양성: 배치 내 변형 인덱스 — 후보 로테이션/위치 분산의 결정형 오프셋 */
    variantIndex?: number;
    /** 다양성 모드 활성 여부 (미지정 시 기존 동작 그대로) */
    diversityEnabled?: boolean;
    /** 핵심 집중(focus) 모드 — 어법 정답 포인트를 고빈출 톱셋으로 좁힘 */
    pointFocus?: boolean;
  } = {},
): string {
  const diversity: CandidateDiversityOptions = {
    usedTargets: options.usedTargets,
    usedAnswerLabels: options.usedAnswerLabels,
    usedPointCodes: options.usedPointCodes,
    variantIndex: options.variantIndex,
    diversityEnabled: options.diversityEnabled,
    pointFocus: options.pointFocus,
  };
  switch (typeId) {
    case "GRAMMAR_ERROR":
      return buildGrammarErrorCandidateBlock(
        passage,
        options.grammarMarkerCount ?? options.grammarErrorCount,
        options.grammarAnswerCount,
        options.requestedDifficulty,
        diversity,
        options.grammarScarcityBaseCount,
        options.grammarCandidateBlockVariant,
      );
    case "GRAMMAR_CHOICE_COMBO":
      return buildGrammarChoiceComboCandidateBlock(
        passage,
        options.requestedDifficulty,
        diversity,
      );
    case "GRAMMAR_CORRECTION":
      return buildGrammarCorrectionCandidateBlock(
        passage,
        options.grammarCorrectionErrorCount,
        options.requestedDifficulty,
        diversity,
      );
    case "IRRELEVANT": {
      // 후보(문장) 블록 + (pointFocus 일 때) 무관성 유형 focus 가이드 주입.
      // pointFocus 미지정이면 guidance="" → 기존(비-focus) 동작 불변.
      const irrelevantBlock = buildIrrelevantCandidateBlock(
        passage,
        options.irrelevantSlotCount,
        options.requestedDifficulty,
        diversity,
      );
      const irrelevantFocus = buildIrrelevantPointGuidance({
        variantIndex: diversity.variantIndex,
        pointFocus: diversity.pointFocus,
        diversityEnabled: diversity.diversityEnabled,
      });
      return [irrelevantBlock, irrelevantFocus].filter(Boolean).join("\n\n");
    }
    case "BLANK_INFERENCE":
      // The candidate block proposes single-blank targets; the multi-blank
      // variant carries its own instructions in the type-settings prompt.
      if ((options.blankInferenceBlankCount ?? 1) >= 2) return "";
      return buildBlankInferenceCandidateBlock(passage, diversity, {
        paraphraseAnswer: options.blankInferenceParaphraseAnswer,
        doubleNegative: options.blankInferenceDoubleNegative,
        requestedDifficulty: options.requestedDifficulty,
      });
    case "REFERENCE":
      return buildReferenceCandidateBlock(passage, diversity);
    case "IMPLIED_MEANING":
      return buildImpliedMeaningCandidateBlock(
        passage,
        options.requestedDifficulty,
        diversity,
      );
    case "ANTONYM":
      return buildAntonymCandidateBlock(
        passage,
        options.requestedDifficulty,
        options.antonymPairCount,
        diversity,
      );
    case "SENTENCE_INSERT":
      // 문장삽입은 후보 스팬을 열거하지 않으므로(다중빈칸과 동일) focus 가이드만 주입.
      // pointFocus 미지정이면 "" 반환 → 기존(비-focus) 동작 불변.
      return buildSentenceInsertPointGuidance({
        variantIndex: diversity.variantIndex,
        pointFocus: diversity.pointFocus,
        diversityEnabled: diversity.diversityEnabled,
      });
    case "SENTENCE_ORDER":
      // 글의순서도 후보 스팬 열거 없이 focus 가이드만 주입(문장삽입과 동형).
      return buildSentenceOrderPointGuidance({
        variantIndex: diversity.variantIndex,
        pointFocus: diversity.pointFocus,
        diversityEnabled: diversity.diversityEnabled,
      });
    default:
      return "";
  }
}
