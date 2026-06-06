import type { QuestionAnalysis } from "./analysis-input";
import {
  type CompiledCustomType,
  type CompileCustomTypeResult,
  compiledCustomTypeSchema,
} from "./types";

// ============================================================================
// 유형 컴파일러 — QuestionAnalysis → CompiledCustomType
// ============================================================================
// P1 은 결정형(추가 LLM 콜 없음): 분석 필드를 base 형태 "유형 지식" 블록으로 직조하고,
// 가장 가까운 빌트인과 신뢰도로 생성 티어를 정한다. (LLM "유형 컴파일러"·정교화는 P2.)

function clip(value: string | null | undefined, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function getOptionCount(analysis: QuestionAnalysis): number {
  return analysis.source.optionCount || analysis.source.options.length;
}

function getCorrectAnswerCount(analysis: QuestionAnalysis): number {
  const labelCount = analysis.source.correctAnswerLabels.length;
  const flaggedCount = analysis.source.options.filter((o) => o.isCorrect).length;
  return Math.max(labelCount, flaggedCount, analysis.source.multipleAnswers ? 2 : 1);
}

/**
 * 빌트인 엔진 경로(②)로 안전하게 태울 수 있는 "표준형"인지. 비표준이면 GENERIC(④)으로.
 * 의심스러우면 GENERIC 으로 떨어뜨린다(빌트인 validator 가 정당한 변형을 reject 하는 사고 방지).
 */
function isStandardForBuiltin(analysis: QuestionAnalysis): boolean {
  const cls = analysis.classification;
  if (!cls.matchedType) return false;
  if (cls.matchConfidence === "low") return false;
  if (cls.stimulusKind === "LISTENING" || cls.stimulusKind === "VISUAL") return false;
  if (cls.answerShape === "OTHER") return false;
  // 빌트인 대부분 단일정답. 복수정답이면 비표준 → GENERIC.
  if (analysis.source.multipleAnswers || analysis.source.correctAnswerLabels.length >= 2) {
    return false;
  }
  // 객관식 빌트인은 보통 5지선다. 0(서술형류)/4/5만 표준으로 인정.
  if (cls.answerShape === "MULTIPLE_CHOICE") {
    const oc = getOptionCount(analysis);
    if (oc !== 0 && oc !== 4 && oc !== 5) return false;
  }
  return true;
}

function renderSourceExample(analysis: QuestionAnalysis): string {
  const src = analysis.source;
  const lines: string[] = [
    "## 원본 예시 (이 유형의 진짜 예시 — 구조·논리·난이도를 그대로 모사하되 내용/소재는 새로 만들 것)",
  ];
  if (src.direction) lines.push(`발문: ${src.direction}`);
  if (src.passage) {
    lines.push(`원본 지문(참고용, 그대로 재사용 금지):\n${clip(src.passage, 1400)}`);
  }
  const optionLines = src.options
    .map((o) => `${o.label}. ${o.text}${o.isCorrect ? "  (정답)" : ""}`)
    .join("\n");
  if (optionLines) lines.push(`보기:\n${optionLines}`);
  if (src.correctAnswerLabels.length) {
    lines.push(`정답: ${src.correctAnswerLabels.join(", ")}`);
  }
  if (src.originalExplanation) lines.push(`해설: ${clip(src.originalExplanation, 800)}`);
  return lines.join("\n");
}

/** base 형태의 "유형 지식" 블록(출력 형식 규칙은 생성기가 티어별로 덧붙임). */
function buildTypeKnowledgePrompt(analysis: QuestionAnalysis): string {
  const cls = analysis.classification;
  const tp = analysis.testingPoint;
  const tr = analysis.transformation;
  const rep = analysis.reproductionSpec;
  const optionCount = getOptionCount(analysis);
  const correctAnswerCount = getCorrectAnswerCount(analysis);

  const blocks: string[] = [];

  blocks.push(
    [
      "## 유형 설명",
      cls.noveltyNote || tp.summary || "원본과 같은 형식·논리의 문항",
    ].join("\n"),
  );

  const pointLines = ["## 출제 포인트 (반드시 동일하게 유지)"];
  if (tp.summary) pointLines.push(`- 핵심: ${tp.summary}`);
  if (tp.skills.length) pointLines.push(`- 평가 스킬: ${tp.skills.join(", ")}`);
  if (cls.difficultyRationale) pointLines.push(`- 난이도 근거: ${cls.difficultyRationale}`);
  if (pointLines.length > 1) blocks.push(pointLines.join("\n"));

  if (tr.applied) {
    const trLines = ["## 변형 방식 (같은 규칙으로 새 지문에 맞게 새로 적용)"];
    if (tr.description) trLines.push(`- ${tr.description}`);
    if (tr.rules.length) trLines.push(`- 규칙: ${tr.rules.join(" / ")}`);
    const spans = tr.changedSpans
      .slice(0, 8)
      .map((s) => `"${s.from}"→"${s.to}"(${s.rule})`)
      .join(", ");
    if (spans) trLines.push(`- 원본 변형 예시(그대로 베끼지 말 것): ${spans}`);
    if (trLines.length > 1) blocks.push(trLines.join("\n"));
  }

  const repLines = ["## 재현 형식 (그대로 따를 것)"];
  if (rep.stemFormat) repLines.push(`- 발문 형식: ${rep.stemFormat}`);
  if (rep.optionFormat) repLines.push(`- 보기 형식: ${rep.optionFormat}`);
  if (rep.answerFormat) repLines.push(`- 정답 형식: ${rep.answerFormat}`);
  if (rep.structureNotes) repLines.push(`- 구조: ${rep.structureNotes}`);
  if (repLines.length > 1) blocks.push(repLines.join("\n"));

  const structureLines = ["## 구조 제약 (원본과 동일)"];
  if (cls.answerShape === "SHORT_ANSWER") {
    structureLines.push("- 서술형/단답: 선택지를 만들지 말 것.");
  } else if (optionCount > 0) {
    structureLines.push(`- 보기 정확히 ${optionCount}개.`);
  }
  structureLines.push(`- 정답 정확히 ${correctAnswerCount}개.`);
  blocks.push(structureLines.join("\n"));

  if (analysis.variationAxes.length) {
    blocks.push(
      `## 바꿔야 할 축 (원본 복제 금지)\n${analysis.variationAxes.map((a) => `- ${a}`).join("\n")}`,
    );
  }

  blocks.push(renderSourceExample(analysis));
  blocks.push(
    "## 필수\n- 원본 지문·문장을 그대로 재사용하지 말고, 제공된 새 지문으로 출제할 것.\n- 출제 의도·구조·난이도는 원본과 동형(同形)으로 유지할 것.",
  );

  return blocks.join("\n\n");
}

function buildSuggestedName(analysis: QuestionAnalysis): string {
  const cls = analysis.classification;
  const base =
    cls.noveltyNote?.trim() ||
    analysis.testingPoint.summary?.trim() ||
    analysis.source.direction?.trim() ||
    "커스텀 유형";
  // 한 줄·짧게.
  const firstLine = base.split("\n").find((l) => l.trim())?.trim() ?? base;
  return clip(firstLine, 40) || "커스텀 유형";
}

/** 분석을 커스텀 유형 정의로 컴파일한다(결정형). */
export function compileCustomType(analysis: QuestionAnalysis): CompileCustomTypeResult {
  const cls = analysis.classification;
  const standard = isStandardForBuiltin(analysis);
  const tier = standard ? "BUILTIN_OVERRIDE" : "GENERIC";

  const targetPoints = [
    ...analysis.testingPoint.skills,
    ...analysis.transformation.rules,
  ]
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 24);

  const spec: CompiledCustomType = compiledCustomTypeSchema.parse({
    tier,
    nearestBuiltin: cls.matchedType ?? null,
    matchConfidence: cls.matchConfidence,
    passageBased: analysis.source.passageBased !== false,
    stimulusKind: cls.stimulusKind,
    answerShape: cls.answerShape,
    optionCount: getOptionCount(analysis),
    multipleAnswers: analysis.source.multipleAnswers,
    correctAnswerCount: getCorrectAnswerCount(analysis),
    difficulty: cls.difficulty,
    targetPoints,
    prompt: buildTypeKnowledgePrompt(analysis),
    typeSettings: null,
    reconstruction: { primitive: "NONE" },
    description: cls.noveltyNote || analysis.testingPoint.summary || "",
  });

  return { spec, suggestedName: buildSuggestedName(analysis) };
}
