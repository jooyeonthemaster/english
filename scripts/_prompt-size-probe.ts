/**
 * 임시 진단 스크립트(_prefix) — LLM 호출 0 (무과금).
 * run-question-generation.ts 의 GRAMMAR_ERROR 프롬프트 조립 경로(231~447행)를
 * 바이트 충실하게 재현해 buildGenerationPrompt 를 직접 호출, system+prompt+schema
 * 문자수를 실측한다. prod 관측치(PREMIUM ~41.5k tok / STANDARD ~24.1k tok)와
 * 로컬 코드 산출물을 대조하기 위한 프로브.
 *
 * 조건(어제 prod 와 동일): subType=GRAMMAR_ERROR, diffLabel=KILLER, pointFocus=true,
 * markerCount=5(KILLER 단일정답 G=K+1 → 생성 마커 6), answerCount=1,
 * analysisContext="", teacherIntentBlock="", customPrompt="", diversityEnabled=true
 * (빈 usedPointCodes), variantIndex=4, attemptIndex=0, targetPoints=[].
 *
 * 실행: NODE_OPTIONS="" npx tsx scripts/_prompt-size-probe.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

// run-question-generation.ts 모듈 프라이빗 상수의 축자 사본 (76~83행).
const GRAMMAR_ERROR_FINAL_CHECKLIST = `## 출력 직전 최종 자기검증 (하나라도 위반 시 해당 부분을 고치고 나서 JSON을 출력)
1. 정답 밑줄: 오류형(errorExpression)이 지문에 실제로 심어져 있고, correction 은 원문 그대로인가? (오류를 심지 않으면 무효)
2. 정답 포인트: pointCode 가 a~i,k(핵심 10) 중 하나이고, KILLER 라면 인접 주어-동사처럼 한눈에 보이는 자리가 아닌가?
3. 미끼 밑줄 전부: only/given/does/지시사 that 같은 장식 필러가 아니라 구조적으로 의미 있는 문법 자리인가?
4. KILLER: 어떤 미끼도 정답과 같은 pointCode 를 쓰지 않는가?
5. 모든 expression/correction 이 지문 원문에 한 글자도 다르지 않게 실재하는가? (잘린 표현·창작 표현 무효)
6. 명사 뒤에 what 을 넣는 변형을 정답으로 쓰지 않았는가? (한눈에 비문 = 반려됨)
7. keyPoints 3개가 각각 실제 밑줄 라벨로 시작하고 1번이 정답 라벨인가?`;

const PASSAGES: { id: string; text: string }[] = [
  {
    id: "imagination",
    text: `Imagination continues to function when perception is not actively discerning objects, in cases of emotion, disease, and sleep. Emotions dispose one to see the world in a distorted way. A coward's perceptual disposition is affected by his disposition to experience fear. A lover's expectations are affected by desire. In such cases, a small similarity between a perceived object and the thing one expects to see can lead to the misidentification of the perceived object as that thing. The coward sees the enemy, while the lover sees the object of desire everywhere. The more affected one is, the less similarity is required for the thing to appear. While the central organ of sense normally functions by comparing similarities and differences, emotions dispose one to discern objects inaccurately. The greater the emotional investment, the more biased one's perception.`,
  },
  {
    id: "philosophy",
    text: `Philosophy allows us to ask much broader questions than many other scientific disciplines. It is capable of looking at the bigger picture and providing important insights into the relationships between different areas of knowledge. Philosophy is particularly important for the interdisciplinary efforts of cognitive science, where it helps to bridge gaps between different disciplines and pioneer new ways for research. Unlike scientific methods, philosophizing is a non-empirical approach that attempts to validate concepts through logical thinking and argumentation. Philosophers tend to ask questions rather than provide definitive answers, and their contributions often consist of challenging established assumptions and proposing new research approaches. However, for a more comprehensive understanding of the nature of consciousness, close collaboration between philosophy and neuroscience is required. This means that while philosophy can provide valuable insights into theoretical concepts and broader ethical questions, it needs to be supplemented by empirical findings and experiments to reach a more comprehensive understanding.`,
  },
  {
    id: "sunk-cost-CALIBRATION",
    text: `Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested. The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain. The hardest lesson in economics, then, may also be the hardest lesson in life.`,
  },
];

async function main() {
  // ── loadEnvConfig 후 동적 import (정적 import 는 호이스팅 함정) ────────────
  const { z } = await import("zod");
  const { STRUCTURED_TYPE_PROMPTS } = await import("../src/lib/question-schemas");
  const { getTypeQualityRubric, buildQuestionTargetCandidateBlock } = await import(
    "../src/lib/question-quality"
  );
  const {
    buildQuestionTypeSettingsPrompt,
    readQuestionTypeDifficultySetting,
    readQuestionTypeGenerationPlanSetting,
    resolveQuestionTypeGenerationSettings,
  } = await import("../src/lib/question-type-generation-settings");
  const { buildDiversityPromptBlock } = await import("../src/lib/question-diversity");
  const { getAiResponseSchema, AI_QUESTION_SCHEMAS } = await import(
    "../src/lib/question-ai-schemas-mc"
  );
  const { normalizePassageWhitespace } = await import(
    "../src/lib/question-postprocess/text-utils"
  );
  const { DIFF_DESCRIPTION } = await import(
    "../src/app/api/ai/generate-questions-auto/_lib/constants"
  );
  const { buildGenerationPrompt, STRUCTURED_OUTPUT_INSTRUCTIONS } = await import(
    "../src/app/api/ai/generate-questions-auto/_lib/prompts"
  );
  const { mergeCustomPromptWithTypeSettings, isRecord } = await import(
    "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers"
  );

  const subType = "GRAMMAR_ERROR";
  const typeCount = 1;
  const rawTypeSettings = {
    difficulty: "KILLER",
    pointFocus: true,
    answerCount: 1,
    markerCount: 5,
  } as Record<string, unknown>;

  type Plan = "STANDARD" | "PREMIUM";
  const results: Record<string, unknown>[] = [];

  for (const passage of PASSAGES) {
    // 엔진 입구 정규화 (run-question-generation.ts 207~209행 동일)
    const passageContent = normalizePassageWhitespace(passage.text)
      .replace(/_{2,}/g, " ")
      .replace(/[ \t]{2,}/g, " ");

    for (const plan of ["PREMIUM", "STANDARD"] as Plan[]) {
      const effectiveDiffLabel = readQuestionTypeDifficultySetting(
        rawTypeSettings,
        "KILLER",
      );
      const effectiveDiffInstruction =
        (DIFF_DESCRIPTION as Record<string, string>)[effectiveDiffLabel] ||
        "top-tier exam item requiring precise passage evidence";
      const effectiveGenerationPlan = readQuestionTypeGenerationPlanSetting(
        rawTypeSettings,
        plan,
      );

      const typePrompt =
        (STRUCTURED_TYPE_PROMPTS as Record<string, string>)[subType] ||
        `${subType} 유형의 문제를 만드세요.`;
      const typeQualityRubric = getTypeQualityRubric(subType, effectiveDiffLabel);

      const resolved = resolveQuestionTypeGenerationSettings(
        subType,
        rawTypeSettings,
        effectiveDiffLabel,
      );
      const {
        effectiveTypeSettings,
        irrelevantSlotCount,
        grammarMarkerCount,
        grammarAnswerCount,
        grammarPointFocus,
        grammarCorrectionErrorCount,
        summaryCompleteMcBlankCount,
        summaryCompleteBlankCount,
        contentMatchOptionCount,
        contentMatchAnswerCount,
        vocabChoiceMarkerCount,
        vocabChoiceAnswerCount,
        sentenceInsertSlotCount,
        antonymPairCount,
        blankInferenceBlankCount,
        blankInferenceDoubleNegative,
        blankInferenceParaphraseAnswer,
        blankPointFocus,
        sentenceInsertPointFocus,
        irrelevantPointFocus,
        sentenceOrderPointFocus,
        genericOptionCount,
        genericAnswerCount,
      } = resolved as Record<string, any>;

      // ── G = K + 1 미끼 스페어 (280~292행 동일) ──────────────────────────
      const grammarDecoySurplusActive =
        subType === "GRAMMAR_ERROR" &&
        effectiveDiffLabel === "KILLER" &&
        (grammarAnswerCount ?? 1) === 1;
      const generatedGrammarMarkerCount = grammarDecoySurplusActive
        ? Math.min(10, (grammarMarkerCount ?? 5) + 1)
        : grammarMarkerCount;
      const generationTypeSettings = grammarDecoySurplusActive
        ? {
            ...(isRecord(effectiveTypeSettings) ? effectiveTypeSettings : {}),
            markerCount: generatedGrammarMarkerCount,
          }
        : effectiveTypeSettings;

      const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(
        subType,
        generationTypeSettings,
        effectiveDiffLabel,
      );

      // diversity: variantIndex=4, 빈 시그널(usedPointCodes=[])
      const diversitySignals = {
        usedTargets: [] as string[],
        usedAnswerLabels: [] as string[],
        usedPointCodes: [] as string[],
      };
      const effectiveVariantIndex = 4; // attemptIndex=0
      const diversityPromptBlock = buildDiversityPromptBlock(
        subType,
        diversitySignals,
        effectiveVariantIndex,
        {
          sentenceInsertSlotCount,
          vocabChoiceMarkerCount,
          vocabChoiceAnswerCount,
          antonymPairCount,
          grammarMarkerCount: generatedGrammarMarkerCount,
          grammarAnswerCount,
        },
      );
      const mergedCustomPrompt = mergeCustomPromptWithTypeSettings(
        "",
        [typeSettingsPrompt, diversityPromptBlock].filter(Boolean).join("\n\n"),
      );

      const targetCandidateBlock = buildQuestionTargetCandidateBlock(
        subType,
        passageContent,
        {
          irrelevantSlotCount,
          grammarMarkerCount: generatedGrammarMarkerCount,
          grammarScarcityBaseCount: grammarMarkerCount,
          grammarAnswerCount,
          grammarCorrectionErrorCount,
          antonymPairCount,
          blankInferenceBlankCount,
          blankInferenceParaphraseAnswer,
          blankInferenceDoubleNegative,
          requestedDifficulty: effectiveDiffLabel,
          usedTargets: diversitySignals.usedTargets,
          usedAnswerLabels: diversitySignals.usedAnswerLabels,
          usedPointCodes: diversitySignals.usedPointCodes,
          variantIndex: effectiveVariantIndex,
          diversityEnabled: true,
          pointFocus:
            grammarPointFocus ??
            blankPointFocus ??
            sentenceInsertPointFocus ??
            irrelevantPointFocus ??
            sentenceOrderPointFocus,
        },
      );

      const hasAiSchema = !!(AI_QUESTION_SCHEMAS as Record<string, unknown>)[subType];
      if (!hasAiSchema) throw new Error("GRAMMAR_ERROR AI schema missing?");
      const responseSchema = getAiResponseSchema(subType, {
        irrelevantSlotCount,
        grammarMarkerCount: generatedGrammarMarkerCount,
        grammarAnswerCount,
        grammarCorrectionErrorCount,
        summaryCompleteMcBlankCount,
        summaryCompleteBlankCount,
        summaryWritingBlankCount: undefined,
        topicSentenceWritingBlankCount: undefined,
        contentMatchOptionCount,
        contentMatchAnswerCount,
        vocabChoiceMarkerCount,
        vocabChoiceAnswerCount,
        sentenceInsertSlotCount,
        antonymPairCount,
        blankInferenceBlankCount,
        genericOptionCount,
        genericAnswerCount,
      });
      let schemaText = "";
      try {
        schemaText = JSON.stringify(z.toJSONSchema(responseSchema as never));
      } catch (e) {
        schemaText = `<toJSONSchema failed: ${e instanceof Error ? e.message : e}>`;
      }

      const { system, prompt } = buildGenerationPrompt({
        schoolType: "high school",
        gradeInfo: "grade 2",
        passageContent,
        teacherIntentBlock: "",
        analysisContext: "",
        targetPoints: [],
        typePrompt,
        structuredInstructions: STRUCTURED_OUTPUT_INSTRUCTIONS,
        targetCandidateBlock,
        typeQualityRubric,
        typeCount,
        diffLabel: effectiveDiffLabel,
        diffInstruction: effectiveDiffInstruction,
        generationPlan: effectiveGenerationPlan,
        subType,
        finalChecklist: GRAMMAR_ERROR_FINAL_CHECKLIST,
        customPrompt: mergedCustomPrompt,
      });

      const systemChars = system?.length ?? 0;
      const promptChars = prompt.length;
      const schemaChars = schemaText.startsWith("<") ? 0 : schemaText.length;
      results.push({
        passage: passage.id,
        plan,
        markerCountGenerated: generatedGrammarMarkerCount,
        systemChars,
        promptChars,
        schemaChars,
        totalChars: systemChars + promptChars + schemaChars,
        blocks: {
          typePrompt: typePrompt.length,
          typeQualityRubric: typeQualityRubric?.length ?? 0,
          structuredInstructions: STRUCTURED_OUTPUT_INSTRUCTIONS.length,
          targetCandidateBlock: targetCandidateBlock?.length ?? 0,
          finalChecklist: GRAMMAR_ERROR_FINAL_CHECKLIST.length,
          mergedCustomPrompt: mergedCustomPrompt?.length ?? 0,
          passage: passageContent.length,
        },
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));

  // ── 캘리브레이션: sunk-cost PREMIUM 총문자 ↔ 25,429 tok 실측 ─────────────
  const calib = results.find(
    (r) => r.passage === "sunk-cost-CALIBRATION" && r.plan === "PREMIUM",
  );
  if (calib) {
    const charsPerTok = (calib.totalChars as number) / 25_429;
    console.log(
      `\n[CALIB] sunk-cost PREMIUM totalChars=${calib.totalChars} / 25,429 tok = ${charsPerTok.toFixed(4)} chars/tok`,
    );
    for (const r of results) {
      const estTok = Math.round((r.totalChars as number) / charsPerTok);
      console.log(
        `[EST] ${r.passage} ${r.plan}: total=${r.totalChars} chars (sys=${r.systemChars} prompt=${r.promptChars} schema=${r.schemaChars}) → ~${estTok.toLocaleString()} tok`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
