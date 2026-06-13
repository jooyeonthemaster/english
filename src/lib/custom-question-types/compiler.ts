import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { model as geminiModel } from "@/lib/ai";

import type { QuestionAnalysis } from "./analysis-input";
import type { FormatAnalysisResult } from "./format-analysis";
import { type FormatSpec, formatSpecSchema } from "./format-spec";
import { describeFormatDelta, interpretFormatInstruction } from "./format-intent";
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

const tunableParamSchema = z.object({
  key: z.string().max(40).catch("").default(""),
  label: z.string().max(60).catch("").default(""),
  value: z.number().int().min(0).max(50).catch(0).default(0),
  min: z.number().int().min(0).max(50).catch(0).default(0),
  max: z.number().int().min(0).max(50).catch(0).default(0),
});

const compilerOutputSchema = z.object({
  typeName: z.string().max(80).catch("").default(""),
  description: z.string().max(1000).catch("").default(""),
  invariants: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  variableAxes: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  generationPrompt: z.string().max(8000).catch("").default(""),
  tunableParams: z.array(tunableParamSchema).max(8).catch([]).default([]),
});

type RawTunableParam = z.infer<typeof tunableParamSchema>;

// LLM 이 뽑은 수치 파라미터 정규화 — 빈/중복 키 제거, min≤value≤max 보정, 최대 8개.
// 조절 불가(max<=min: 예 0/0/0 '지문 단어 수' 같은 외부값/추측값)는 버린다 — 무의미한 노브 노출 방지.
function normalizeTunableParams(raw: RawTunableParam[]): RawTunableParam[] {
  const seen = new Set<string>();
  const out: RawTunableParam[] = [];
  for (const p of raw) {
    const key = p.key.trim();
    const label = p.label.trim();
    if (!key || !label || seen.has(key)) continue;
    const min = Math.max(0, Math.min(p.min, p.max));
    const max = Math.max(min, p.max);
    if (max <= min) continue; // 조절 범위가 없으면(=값을 못 찾았거나 외부값) 제외
    seen.add(key);
    const value = Math.min(max, Math.max(min, p.value));
    out.push({ key, label, value, min, max });
    if (out.length >= 8) break;
  }
  return out;
}

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
    "- tunableParams: 이 유형에서 생성할 때마다 **조절 가능한 수치 파라미터** 목록. 정체성(invariants)이 아니라 정체성을 안 깨고 바뀔 수 있는 값만.",
    "  · **반드시 위 [원본 문항 분석]의 reproductionSpec(구조 설명)·발문·출제 포인트에서 실제 개수를 읽어내 적을 것.** 예: 발문/구조에 '(A) (B) (C)'나 '세 곳을 빈칸으로'가 있으면 → {key:'blankCount', label:'빈칸 수', value:3, min:2, max:4}. 순서배열 분할 지문 개수, 어법 밑줄 개수, 무관문장 슬롯 수도 같은 방식.",
    "  · 각 항목 {key(영문 머신키), label(한글), value(분석에서 실제로 읽은 개수), min, max(value 주변의 합리적 범위, min<max 가 되도록)}.",
    "  · **절대 금지**: ① 보기 수·정답 수(별도 관리) ② 지문 길이·단어 수처럼 외부(주어진 지문)에서 정해지는 값 ③ 분석에서 개수를 못 찾는 항목(value 0 이나 추측값, min===max 로 만들지 말 것). 조절할 고유 수치가 분석에서 명확히 안 보이면 **빈 배열**로 둘 것.",
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
    tunableParams: normalizeTunableParams(out.tunableParams),
    prompt: out.generationPrompt.trim() || buildTypeKnowledgePrompt(analysis),
    typeSettings: null,
    reconstruction: { primitive: "NONE" },
    description: out.description.trim() || cls.noveltyNote || analysis.testingPoint.summary || "",
  });

  return { spec, suggestedName: out.typeName.trim() || buildSuggestedName(analysis) };
}

/**
 * 포맷 분석(2차 패스) 결과를 spec 에 병합한다.
 * 구조 필드(보기 수/정답 수/답형)는 시각 분석이 더 정확하므로 format 쪽으로 정합시킨다.
 */
function applyFormatToSpec(
  spec: CompiledCustomType,
  formatResult: FormatAnalysisResult | null | undefined,
): CompiledCustomType {
  if (!formatResult) return spec;
  const format = formatResult.format;
  const isObjective = format.answer.shape !== "SHORT_ANSWER";
  return compiledCustomTypeSchema.parse({
    ...spec,
    format,
    sourceLayout: formatResult.sourceLayout,
    answerShape:
      format.answer.shape === "MIXED"
        ? "OTHER"
        : format.answer.shape === "SHORT_ANSWER"
          ? "SHORT_ANSWER"
          : "MULTIPLE_CHOICE",
    optionCount: isObjective && format.choices.present ? format.choices.count : 0,
    correctAnswerCount: format.answer.correctCount,
    multipleAnswers: format.answer.multipleAnswers || format.answer.correctCount > 1,
  });
}

/**
 * 분석을 커스텀 유형 정의로 컴파일한다. LLM 유형 컴파일러로 본질/인스턴스를 추상화하고,
 * 실패 시 결정형으로 폴백한다. 유형당 1회 호출이라 비용은 분할상환.
 * formatResult(시각 포맷 분석)가 있으면 v2 스펙(형식 계약 포함)으로 병합한다.
 */
export async function compileCustomType(
  analysis: QuestionAnalysis,
  formatResult?: FormatAnalysisResult | null,
): Promise<CompileCustomTypeResult> {
  try {
    const compiled = await compileWithLlm(analysis);
    return { ...compiled, spec: applyFormatToSpec(compiled.spec, formatResult) };
  } catch (error) {
    let detail = error instanceof Error ? error.message : String(error);
    if (NoObjectGeneratedError.isInstance(error)) {
      detail = `${error.message} | finishReason=${error.finishReason ?? "?"}`;
    }
    console.warn(`[CUSTOM-TYPE-COMPILER] LLM compile failed → deterministic fallback: ${detail}`);
    const compiled = compileDeterministic(analysis);
    return { ...compiled, spec: applyFormatToSpec(compiled.spec, formatResult) };
  }
}

// ─────────────────────────── 자연어 편집(강사 프롬프트/형식 수정) ───────────────────────────
const reviseOutputSchema = z.object({
  description: z.string().max(1000).catch("").default(""),
  invariants: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  variableAxes: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  generationPrompt: z.string().max(8000).catch("").default(""),
  // v2: 수정 요청이 '형식'(마커/선지 수·배치/빈칸/박스/답란)에 관한 것이면 형식 스펙 전체를
  // 수정해 반환. 내용만 수정이면 formatChanged=false 로 두고 format 은 무시된다.
  formatChanged: z.boolean().catch(false).default(false),
  format: formatSpecSchema.nullable().catch(null).default(null),
});

function buildRevisePrompt(spec: CompiledCustomType, typeName: string, instruction: string): string {
  const formatBlock = spec.format
    ? [
        "## 현재 형식 스펙(FormatSpec JSON — 시각·구조 계약)",
        "수정 요청이 형식(선지 수/마커 스킴/배치/페어·표 선지/빈칸/박스/서술형 답란/배점 표기)에 관한 것이면,",
        "이 JSON 의 해당 필드만 고친 **전체 형식 스펙**을 format 으로 반환하고 formatChanged=true 로 설정하세요.",
        "형식과 무관한 요청이면 formatChanged=false (format 은 null).",
        "```json",
        clip(JSON.stringify(spec.format), 6000),
        "```",
      ].join("\n")
    : "";

  return [
    "당신은 '문항 유형 정의 편집기'입니다. 강사가 기존 커스텀 문항 유형을 자연어로 수정 요청했습니다.",
    "임무: 아래 [현재 정의]를 유지하되 [수정 요청]을 반영해 invariants/variableAxes/generationPrompt/description(필요 시 format)을 다시 작성하세요.",
    "",
    "## 규칙",
    "- 수정 요청과 무관한 기존 내용은 보존하세요(전면 재작성 금지, 요청 부분만 반영).",
    "- 특정 단어/문장/소재를 본질로 박지 말고 variableAxes 로 유지하세요.",
    "- generationPrompt 는 invariants/variableAxes 와 모순 없게 일관되게 갱신하세요.",
    "- 형식 변경 요청(예: '선지를 (a)~(e)로', '빈칸 3개로', '조건 박스 추가', '2단 배치로')은 format 에 반영하세요.",
    "",
    `## 유형 이름\n${typeName}`,
    `## 현재 정의 — invariants(반드시 보존)\n${spec.invariants.map((i) => `- ${i}`).join("\n") || "(없음)"}`,
    `## 현재 정의 — variableAxes(매번 가변)\n${spec.variableAxes.map((v) => `- ${v}`).join("\n") || "(없음)"}`,
    `## 현재 정의 — description\n${spec.description || "(없음)"}`,
    `## 현재 정의 — generationPrompt\n${clip(spec.prompt, 4000)}`,
    formatBlock,
    `## 수정 요청 (강사)\n${instruction}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** 편집 결과 형식 스펙의 구조 필드를 spec 의 1급 필드(보기 수/정답 수/답형)에 정합시킨다. */
function reconcileSpecWithFormat(spec: CompiledCustomType, format: FormatSpec): CompiledCustomType {
  const isObjective = format.answer.shape !== "SHORT_ANSWER";
  return compiledCustomTypeSchema.parse({
    ...spec,
    format,
    answerShape:
      format.answer.shape === "MIXED"
        ? "OTHER"
        : format.answer.shape === "SHORT_ANSWER"
          ? "SHORT_ANSWER"
          : "MULTIPLE_CHOICE",
    optionCount: isObjective && format.choices.present ? format.choices.count : 0,
    correctAnswerCount: format.answer.correctCount,
    multipleAnswers: format.answer.multipleAnswers || format.answer.correctCount > 1,
  });
}

export interface ReviseCustomTypeResult {
  spec: CompiledCustomType;
  /** 형식 변경 요약(한국어 불릿). 형식 변화가 없으면 빈 배열. */
  changes: string[];
  /** 내용(invariants/variableAxes/prompt/description) 이 바뀌었는지. */
  contentChanged: boolean;
  /** 어느 경로로 반영했는지(결정 해석기 vs LLM). */
  source: "deterministic" | "llm";
}

function specContentChanged(prev: CompiledCustomType, next: CompiledCustomType): boolean {
  return (
    prev.prompt !== next.prompt ||
    prev.description !== next.description ||
    JSON.stringify(prev.invariants) !== JSON.stringify(next.invariants) ||
    JSON.stringify(prev.variableAxes) !== JSON.stringify(next.variableAxes)
  );
}

/**
 * 자연어 수정 요청을 반영해 유형 정의를 재작성한다.
 *
 * 1) **결정 해석기 우선**(format 이 있는 v2 유형): 형식 명령(서술형 전환·밑줄/빈칸/선지 개수·
 *    마커·배치·박스·조건·답란·배점·부정형)은 LLM 없이 즉시·100% 반영한다. Gemini 가 formatChanged
 *    플래그를 빠뜨려 "프롬프트만 손보고 미리보기는 그대로"인 사고를 원천 차단한다.
 * 2) 결정 해석기가 못 잡는 요청(내용/난이도/본질)만 LLM 편집(편집당 1회).
 *
 * 형식이 바뀌면 구조 필드(보기 수/정답 수/답형)도 형식에 정합시킨다.
 */
export async function reviseCustomTypeDetailed(args: {
  currentSpec: CompiledCustomType;
  typeName: string;
  instruction: string;
}): Promise<ReviseCustomTypeResult> {
  // ── 1) 결정 해석기: 형식 명령은 LLM 없이 즉시 반영 ──
  if (args.currentSpec.format) {
    const intent = interpretFormatInstruction(args.currentSpec.format, args.instruction);
    if (intent) {
      const spec = reconcileSpecWithFormat(args.currentSpec, intent.format);
      return { spec, changes: intent.changes, contentChanged: false, source: "deterministic" };
    }
  }

  // ── 2) LLM 편집(내용 + 형식, 결정 해석기가 못 잡은 요청) ──
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
  let next = compiledCustomTypeSchema.parse({
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
  if (out.formatChanged && out.format && args.currentSpec.format) {
    next = reconcileSpecWithFormat(next, formatSpecSchema.parse(out.format));
  }
  const changes =
    args.currentSpec.format && next.format
      ? describeFormatDelta(args.currentSpec.format, next.format)
      : [];
  return {
    spec: next,
    changes,
    contentChanged: specContentChanged(args.currentSpec, next),
    source: "llm",
  };
}

/** 하위호환 래퍼 — spec 만 필요한 호출부(유형 버전 저장 등)용. */
export async function reviseCustomType(args: {
  currentSpec: CompiledCustomType;
  typeName: string;
  instruction: string;
}): Promise<CompiledCustomType> {
  return (await reviseCustomTypeDetailed(args)).spec;
}
