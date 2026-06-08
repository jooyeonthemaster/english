import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { model as geminiModel } from "@/lib/ai";

import type { QuestionAnalysis } from "./analysis-input";
import {
  type CompiledCustomType,
  type CompileCustomTypeResult,
  compiledCustomTypeSchema,
} from "./types";

// ============================================================================
// 유형 컴파일러 — QuestionAnalysis → CompiledCustomType
// ============================================================================
// 핵심: 예시 1개에서 "타입의 본질(불변)" 과 "이번 예시의 우연한 디테일(가변)" 을 분리한다.
// 어법이면 변형규칙이 불변·문장이 가변, 어휘면 포맷이 불변·특정 단어(예: 'lose')가 가변.
// → LLM 유형 컴파일러가 추상화(compileWithLlm). 실패 시 결정형 폴백(compileDeterministic).
// 커스텀 유형은 항상 GENERIC 경로(빌트인에 흡수 금지).

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
  // 명시 정답키(correctAnswerLabels)를 1순위로(분석기가 isCorrect 를 과다 표시하면 max 가 부풀려짐).
  const raw =
    labelCount > 0 ? labelCount : Math.max(flaggedCount, analysis.source.multipleAnswers ? 2 : 1);
  const optionCount = getOptionCount(analysis);
  // 정답 수는 보기 수를 넘을 수 없고 최소 1 — 시드가 부풀려져 모든 생성이 reject 되는 사고 방지.
  return optionCount > 0 ? Math.min(Math.max(raw, 1), optionCount) : Math.max(raw, 1);
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
  // 각 보기의 정오 + rationale(왜 정답/오답인지)까지 실어 "오답 구성 논리"를 학습시킨다(이전엔 버려졌음).
  const optionLines = src.options
    .map((o) => {
      const tag = o.isCorrect ? "(정답)" : "(오답)";
      const why = o.rationale?.trim() ? ` — ${clip(o.rationale, 300)}` : "";
      return `${o.label}. ${o.text}  ${tag}${why}`;
    })
    .join("\n");
  if (optionLines) {
    lines.push(`보기(정오·근거 = 오답 구성 논리, 같은 논리를 새 소재로 재현):\n${optionLines}`);
  }
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

function deriveTargetPoints(analysis: QuestionAnalysis): string[] {
  return [...analysis.testingPoint.skills, ...analysis.transformation.rules]
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 24);
}

/** 결정형 폴백 — LLM 컴파일 실패 시. 분석 필드를 그대로 직조(추상화는 약함). 항상 GENERIC. */
function compileDeterministic(analysis: QuestionAnalysis): CompileCustomTypeResult {
  const cls = analysis.classification;
  // 거친 근사: 평가스킬+변형규칙=불변, 분석의 변형축=가변. (LLM 이 제대로 분리)
  const invariants = [
    ...analysis.testingPoint.skills,
    ...(analysis.transformation.applied ? analysis.transformation.rules : []),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const variableAxes = analysis.variationAxes.map((s) => s.trim()).filter(Boolean).slice(0, 20);

  const spec: CompiledCustomType = compiledCustomTypeSchema.parse({
    tier: "GENERIC",
    nearestBuiltin: cls.matchedType ?? null,
    matchConfidence: cls.matchConfidence,
    passageBased: analysis.source.passageBased !== false,
    stimulusKind: cls.stimulusKind,
    answerShape: cls.answerShape,
    optionCount: getOptionCount(analysis),
    multipleAnswers: analysis.source.multipleAnswers,
    correctAnswerCount: getCorrectAnswerCount(analysis),
    difficulty: cls.difficulty,
    targetPoints: deriveTargetPoints(analysis),
    invariants,
    variableAxes,
    prompt: buildTypeKnowledgePrompt(analysis),
    typeSettings: null,
    reconstruction: { primitive: "NONE" },
    description: cls.noveltyNote || analysis.testingPoint.summary || "",
  });

  return { spec, suggestedName: buildSuggestedName(analysis) };
}

// ─────────────────────────── LLM 유형 컴파일러 ───────────────────────────
const LLM_COMPILE_TIMEOUT_MS = 120_000;
const LLM_COMPILE_MAX_TOKENS = 8_000;

const compilerOutputSchema = z.object({
  typeName: z.string().max(80).catch("").default(""),
  description: z.string().max(1000).catch("").default(""),
  invariants: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  variableAxes: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  generationPrompt: z.string().max(8000).catch("").default(""),
});

function serializeAnalysisForCompiler(analysis: QuestionAnalysis): string {
  const cls = analysis.classification;
  const tp = analysis.testingPoint;
  const tr = analysis.transformation;
  const rep = analysis.reproductionSpec;
  const lines: string[] = [];
  lines.push(`- 가장 가까운 빌트인(참고용): ${cls.matchedType ?? "없음"} (신뢰도 ${cls.matchConfidence})`);
  lines.push(`- 답형: ${cls.answerShape} / 자료: ${cls.stimulusKind} / 난이도: ${cls.difficulty}`);
  if (cls.noveltyNote) lines.push(`- 특이점: ${cls.noveltyNote}`);
  if (tp.summary) lines.push(`- 출제 포인트(특정 단어가 섞여 있을 수 있음): ${tp.summary}`);
  if (tp.skills.length) lines.push(`- 평가 스킬: ${tp.skills.join(", ")}`);
  if (tr.applied) {
    if (tr.description) lines.push(`- 변형 방식: ${tr.description}`);
    if (tr.rules.length) lines.push(`- 변형 규칙: ${tr.rules.join(" / ")}`);
    const spans = tr.changedSpans
      .slice(0, 8)
      .map((s) => `"${s.from}"→"${s.to}"(${s.rule})`)
      .join(", ");
    if (spans) lines.push(`- 변형 예시: ${spans}`);
  }
  if (rep.stemFormat) lines.push(`- 발문 형식: ${rep.stemFormat}`);
  if (rep.optionFormat) lines.push(`- 보기 형식: ${rep.optionFormat}`);
  if (rep.answerFormat) lines.push(`- 정답 형식: ${rep.answerFormat}`);
  if (rep.structureNotes) lines.push(`- 구조: ${rep.structureNotes}`);
  if (analysis.variationAxes.length) {
    lines.push(`- 분석이 본 가변 축: ${analysis.variationAxes.join(" / ")}`);
  }
  lines.push("");
  lines.push(renderSourceExample(analysis));
  return lines.join("\n");
}

function buildCompilerPrompt(analysis: QuestionAnalysis): string {
  return [
    "당신은 '문항 유형 정의 컴파일러'입니다. 아래 [원본 문항 분석]은 강사가 \"이런 유형의 문제를 계속 만들고 싶다\"며 올린 예시 1개입니다.",
    "임무: 이 예시 하나에서 **'유형의 본질(매번 보존)'** 과 **'이번 예시의 우연한 디테일(매번 바꿔야 함)'** 을 분리해, 같은 유형을 다양한 소재로 무한히 찍어낼 정의를 만드세요.",
    "",
    "## 본질 vs 인스턴스 — 유형마다 다르다 (예시에 매몰되지 말 것)",
    "- 어법 변형 유형: **변형 규칙(예: 1형식→2형식 전환)이 본질**, 대상 문장·소재는 인스턴스(가변).",
    "- 어휘/다의어 유형: **포맷·평가 스킬(예: 한 단어의 여러 의미를 문맥으로 구분, 5개 예문 형식)이 본질**, **특정 단어(예: 'lose')는 인스턴스** → 매번 다른 단어로.",
    "- 내용/추론 유형: 출제 논리·함정 방식이 본질, 지문·정답 표현은 인스턴스.",
    "- **특정 단어/문장/소재를 본질로 박지 마세요.** 그것들은 '예시'로만 언급하고, variableAxes에 '매번 새로 바꿀 것'으로 넣으세요.",
    "",
    "## 출력 필드",
    "- typeName: 이 유형의 **일반적** 이름(특정 단어 제외. 예: 'lose 다의어'가 아니라 '다의어 문맥 의미 구분').",
    "- description: 한 줄 설명.",
    "- invariants: 모든 생성에서 **반드시 보존**할 것(포맷·평가스킬·출제논리·변형규칙 등). 특정 인스턴스 단어 금지.",
    "- variableAxes: **매번 새로** 정할 축(예: '타겟 어휘', '지문 소재'). 원본 예시의 특정 단어/문장은 예시일 뿐임을 명시.",
    "- generationPrompt: 위 invariants/variableAxes를 반영한 한국어 출제 지시문. 유형 설명·반드시 유지·매번 바꿀 것·재현 형식·원본 예시 순으로. **원본의 특정 단어/소재를 그대로 박지 말 것.**",
    "",
    "## 원본 문항 분석",
    serializeAnalysisForCompiler(analysis),
  ].join("\n");
}

async function compileWithLlm(analysis: QuestionAnalysis): Promise<CompileCustomTypeResult> {
  const result = await generateObject({
    model: geminiModel,
    schema: compilerOutputSchema,
    maxOutputTokens: LLM_COMPILE_MAX_TOKENS,
    abortSignal: AbortSignal.timeout(LLM_COMPILE_TIMEOUT_MS),
    messages: [{ role: "user", content: [{ type: "text", text: buildCompilerPrompt(analysis) }] }],
  });
  const out = result.object;
  const cls = analysis.classification;

  // LLM 이 invariants/variableAxes 를 비우면 분석 데이터로 폴백(추가 LLM 호출 X — 이미 받아온 값).
  const fallbackInvariants = [
    ...analysis.testingPoint.skills,
    ...(analysis.transformation.applied ? analysis.transformation.rules : []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  const invariants = (out.invariants.length ? out.invariants : fallbackInvariants)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const fallbackVariable = analysis.variationAxes.map((s) => s.trim()).filter(Boolean);
  const variableAxes = (out.variableAxes.length ? out.variableAxes : fallbackVariable)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  const spec: CompiledCustomType = compiledCustomTypeSchema.parse({
    tier: "GENERIC",
    nearestBuiltin: cls.matchedType ?? null,
    matchConfidence: cls.matchConfidence,
    passageBased: analysis.source.passageBased !== false,
    stimulusKind: cls.stimulusKind,
    answerShape: cls.answerShape,
    optionCount: getOptionCount(analysis),
    multipleAnswers: analysis.source.multipleAnswers,
    correctAnswerCount: getCorrectAnswerCount(analysis),
    difficulty: cls.difficulty,
    targetPoints: deriveTargetPoints(analysis),
    invariants,
    variableAxes,
    prompt: out.generationPrompt.trim() || buildTypeKnowledgePrompt(analysis),
    typeSettings: null,
    reconstruction: { primitive: "NONE" },
    description: out.description.trim() || cls.noveltyNote || analysis.testingPoint.summary || "",
  });

  return { spec, suggestedName: out.typeName.trim() || buildSuggestedName(analysis) };
}

/**
 * 분석을 커스텀 유형 정의로 컴파일한다. LLM 유형 컴파일러로 본질/인스턴스를 추상화하고,
 * 실패 시 결정형으로 폴백한다. 유형당 1회 호출이라 비용은 분할상환.
 */
export async function compileCustomType(
  analysis: QuestionAnalysis,
): Promise<CompileCustomTypeResult> {
  try {
    return await compileWithLlm(analysis);
  } catch (error) {
    let detail = error instanceof Error ? error.message : String(error);
    if (NoObjectGeneratedError.isInstance(error)) {
      detail = `${error.message} | finishReason=${error.finishReason ?? "?"}`;
    }
    console.warn(`[CUSTOM-TYPE-COMPILER] LLM compile failed → deterministic fallback: ${detail}`);
    return compileDeterministic(analysis);
  }
}

// ─────────────────────────── 자연어 편집(강사 프롬프트 수정) ───────────────────────────
const reviseOutputSchema = z.object({
  description: z.string().max(1000).catch("").default(""),
  invariants: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  variableAxes: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  generationPrompt: z.string().max(8000).catch("").default(""),
});

function buildRevisePrompt(spec: CompiledCustomType, typeName: string, instruction: string): string {
  return [
    "당신은 '문항 유형 정의 편집기'입니다. 강사가 기존 커스텀 문항 유형을 자연어로 수정 요청했습니다.",
    "임무: 아래 [현재 정의]를 유지하되 [수정 요청]을 반영해 invariants/variableAxes/generationPrompt/description 을 다시 작성하세요.",
    "",
    "## 규칙",
    "- 유형의 **구조(답형·보기 수·정답 수 등)는 바꾸지 마세요.** 자연어 본질·지시문만 손봅니다.",
    "- 수정 요청과 무관한 기존 내용은 보존하세요(전면 재작성 금지, 요청 부분만 반영).",
    "- 특정 단어/문장/소재를 본질로 박지 말고 variableAxes 로 유지하세요.",
    "- generationPrompt 는 invariants/variableAxes 와 모순 없게 일관되게 갱신하세요.",
    "",
    `## 유형 이름\n${typeName}`,
    `## 현재 정의 — invariants(반드시 보존)\n${spec.invariants.map((i) => `- ${i}`).join("\n") || "(없음)"}`,
    `## 현재 정의 — variableAxes(매번 가변)\n${spec.variableAxes.map((v) => `- ${v}`).join("\n") || "(없음)"}`,
    `## 현재 정의 — description\n${spec.description || "(없음)"}`,
    `## 현재 정의 — generationPrompt\n${clip(spec.prompt, 4000)}`,
    "",
    `## 수정 요청 (강사)\n${instruction}`,
  ].join("\n\n");
}

/**
 * 자연어 수정 요청을 반영해 유형 정의를 재작성한다(편집당 LLM 1회). 구조 필드는 현재 spec 그대로 유지하고
 * 자연어 부분(invariants/variableAxes/prompt/description)만 교체한다(비면 현재값 보존).
 */
export async function reviseCustomType(args: {
  currentSpec: CompiledCustomType;
  typeName: string;
  instruction: string;
}): Promise<CompiledCustomType> {
  const result = await generateObject({
    model: geminiModel,
    schema: reviseOutputSchema,
    maxOutputTokens: LLM_COMPILE_MAX_TOKENS,
    abortSignal: AbortSignal.timeout(LLM_COMPILE_TIMEOUT_MS),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildRevisePrompt(args.currentSpec, args.typeName, args.instruction) },
        ],
      },
    ],
  });
  const out = result.object;
  return compiledCustomTypeSchema.parse({
    ...args.currentSpec,
    invariants: out.invariants.length
      ? out.invariants.map((s) => s.trim()).filter(Boolean).slice(0, 20)
      : args.currentSpec.invariants,
    variableAxes: out.variableAxes.length
      ? out.variableAxes.map((s) => s.trim()).filter(Boolean).slice(0, 20)
      : args.currentSpec.variableAxes,
    prompt: out.generationPrompt.trim() || args.currentSpec.prompt,
    description: out.description.trim() || args.currentSpec.description,
  });
}
