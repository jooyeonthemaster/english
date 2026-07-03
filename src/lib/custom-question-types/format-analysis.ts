import "server-only";

import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { model as geminiModel } from "@/lib/ai";

import type { QuestionAnalysis } from "./analysis-input";
import {
  type FormatAnnotation,
  type FormatSpec,
  formatAnnotationsSchema,
  formatSpecSchema,
  parseFormatSpec,
} from "./format-spec";
import { type LayoutDoc, layoutDocSchema, parseLayoutDoc } from "./layout-doc";

// ============================================================================
// 포맷 분석(2차 패스) — 원본 문항 이미지의 '생김새'를 강박적으로 추출
// ============================================================================
// 1차 패스(analyzeForCustomType)는 내용(출제 포인트·변형·정답 논리)을 뽑는다.
// 이 2차 패스는 같은 이미지를 레이아웃 관점에서 다시 보고 다음을 추출한다:
//  - formatSpec: 마커 스킴·선지 배치·페어/표 선지·빈칸·박스·답란 등 형식 계약
//  - sourceLayout: 원본 문항을 LayoutDoc(구조 문서)으로 재구성(스튜디오 미리보기 + 생성 few-shot)
//  - annotations: 이미지 좌표 기반 해부 카드(해부 뷰의 핀/영역)
//
// ── 분리 호출 설계(2026-06-13) ──
// 처음엔 셋을 한 호출로 받았으나, 전사(sourceLayout)가 길어지면 Gemini 가 반복 루프에
// 빠져 finishReason=length 로 전체가 죽는 사례가 관측됐다(같은 이미지에서 1차 시도는
// 성공, 2차 시도는 3연속 실패 — 확률적). 출력이 작을수록 안정적이므로 3개의 호출로
// 분리하고, 전사·어노테이션은 실패해도 결정적 폴백으로 부분 성공시킨다.
// formatSpec 추출까지 실패하면 그때만 전체 실패(컴파일러가 v1 로 폴백).

// 속도 우선: formatSpec 만 critical path(재시도 1회). 전사/어노테이션은 결정적 폴백이
// 있어 실패해도 유형은 만들어지므로 fail-fast(재시도 0)로 두고, 둘은 병렬 실행한다.
// (전사는 밀집 지문에서 결정적으로 parse 실패→재시도 무의미했음 — 곧장 폴백이 빠르고 동일 품질.)
const FORMAT_TIMEOUT_MS = 90_000;
const FORMAT_MAX_TOKENS = 8_000;
const FORMAT_MAX_RETRIES = 1;

const TRANSCRIBE_TIMEOUT_MS = 75_000;
const TRANSCRIBE_MAX_TOKENS = 14_000;
const TRANSCRIBE_MAX_RETRIES = 0;

const ANNOTATION_TIMEOUT_MS = 60_000;
const ANNOTATION_MAX_TOKENS = 10_000;

export interface FormatAnalysisResult {
  format: FormatSpec;
  sourceLayout: LayoutDoc;
  annotations: FormatAnnotation[];
}

export interface AnalyzeFormatArgs {
  image: { data: Buffer; mediaType: string };
  analysis?: QuestionAnalysis | null;
  gradeInfo?: string;
  /** 1차 분석의 DocAI OCR 원문 — 전사 입력 하이브리드(픽셀 전사 대신 텍스트 재구성)로 루프 방지. */
  referenceText?: string;
}

function errorDetail(error: unknown): string {
  if (NoObjectGeneratedError.isInstance(error)) {
    return `${error.message} | finishReason=${error.finishReason ?? "?"}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function describeContentAnalysis(analysis: QuestionAnalysis | null): string {
  if (!analysis) return "";
  const lines: string[] = ["## 1차 내용 분석 요약(참고 — 형식 판단의 보조 자료)"];
  if (analysis.source.direction) lines.push(`- 발문: ${analysis.source.direction.slice(0, 300)}`);
  lines.push(`- 보기 수(내용 분석 기준): ${analysis.source.optionCount || analysis.source.options.length}`);
  if (analysis.source.correctAnswerLabels.length) {
    lines.push(`- 정답 라벨: ${analysis.source.correctAnswerLabels.join(", ")}`);
  }
  lines.push(`- 답형: ${analysis.classification.answerShape} / 자료: ${analysis.classification.stimulusKind}`);
  if (analysis.reproductionSpec.optionFormat) {
    lines.push(`- 보기 형식 메모: ${analysis.reproductionSpec.optionFormat.slice(0, 300)}`);
  }
  if (analysis.reproductionSpec.structureNotes) {
    lines.push(`- 구조 메모: ${analysis.reproductionSpec.structureNotes.slice(0, 300)}`);
  }
  return lines.join("\n");
}

// ───────────────────────── 호출 A: FormatSpec 추출 ─────────────────────────

const formatOnlySchema = z.object({ format: formatSpecSchema });

function buildFormatPrompt(args: {
  analysis: QuestionAnalysis | null;
  gradeInfo?: string;
  retryErrors: string[];
}): string {
  const retryBlock = args.retryErrors.length
    ? `\n## 이전 시도 문제점(이번에 반드시 수정)\n${args.retryErrors.map((e) => `- ${e}`).join("\n")}\n`
    : "";

  return `당신은 한국 ${args.gradeInfo || "고등학교"} 영어 내신/모의고사 문항의 '지면 형식'을 정밀 해부하는 전문가입니다.
첨부 이미지는 시험지에서 크롭한 문항 1개입니다. 이 문항과 시각적으로 동일한 형식의 문항을 코드로 재현할 수 있도록, 레이아웃의 모든 변수를 강박적으로 추출해 형식 스펙(format)으로 출력하세요.

## 반드시 관찰할 것 (하나도 빠뜨리지 말 것)
1. **발문(stem)**: 정확한 문구 패턴, 한/영, 부정형("틀린/않은") 여부, 배점 표기([3.4점] 등 — 숫자까지), 발문 내 강조(밑줄/굵게) 토큰.
2. **자료(stimulus)**: 형태(산문/편지/안내문·포스터/대화/문장목록/단어목록/표/없음), 박스 테두리 유무, 내부 제목 줄, 불릿 섹션(•) 구조.
3. **자료 내 마커**: ⓐ~ⓔ·(A)(B)(C)·①~⑤ 등 라벨 밑줄(개수·스킴·무엇에 밑줄 치는지), 분할 단락 라벨, 문장 번호, 빈칸(개수·라벨·표기: 밑줄/괄호/박스).
4. **보조 박스**: 주어진 문장 / 조건 / <보기> / 어휘 상자 / 요약문 / 표 — 라벨 문구, 항목 수, 번호 매김 여부, 표라면 열 헤더와 행 수.
5. **선지(choices)**: 개수, 마커 스킴(①/(a)/(A)/A. 등 정확히), 배치(세로 1열/2단/3단/한 줄/표), 선지 1개의 내부 구조 — 단일 텍스트인지, "(X)-(Y)-(Z)" 페어/조합인지(구분자 문자까지), "ⓐ, ⓒ" 기호 조합인지, "(A)-(C)-(B)" 순서인지, 표의 행인지(열 헤더 명시). 선지 언어(한/영), 길이감.
6. **정답/답안 형식**: 객관식 정답 개수(복수 선택 여부), 서술형이면 답 작성란 — 괘선 줄 수, 답 빈칸 수와 라벨, 요구 형태("한 단어 2개", "완전한 문장" 등), 조건 개수.
7. **형식 디테일**: 위 구조 필드로 표현 못 한 것은 layoutNotes 에 문장으로(예: "선지 페어 구분자는 em-dash", "표 1열은 굵게", "빈칸 뒤 콜론").

${describeContentAnalysis(args.analysis)}
${retryBlock}
정확히 스키마 형식으로만 출력하세요. 추측 금지 — 이미지에 보이는 형식만 기록하세요.`;
}

function validateFormatOnly(format: FormatSpec): string[] {
  const errors: string[] = [];
  const isObjective = format.answer.shape !== "SHORT_ANSWER";
  if (isObjective && format.choices.present && format.choices.count <= 0) {
    errors.push("객관식인데 choices.count 가 0입니다. 실제 선지 개수를 세어 기록하세요.");
  }
  if (
    format.answer.shape === "SHORT_ANSWER" &&
    format.answer.subjective.answerBlankCount === 0 &&
    format.answer.subjective.answerLineCount === 0 &&
    !format.answer.subjective.answerFormat.trim()
  ) {
    errors.push("서술형인데 답안 형식(빈칸 수/줄 수/answerFormat)이 모두 비어 있습니다.");
  }
  return errors;
}

async function analyzeFormatSpec(args: AnalyzeFormatArgs): Promise<FormatSpec> {
  let lastError: unknown;
  const retryErrors: string[] = [];
  for (let attempt = 0; attempt <= FORMAT_MAX_RETRIES; attempt += 1) {
    try {
      const result = await generateObject({
        model: geminiModel,
        schema: formatOnlySchema,
        maxOutputTokens: FORMAT_MAX_TOKENS,
        abortSignal: AbortSignal.timeout(FORMAT_TIMEOUT_MS),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildFormatPrompt({
                  analysis: args.analysis ?? null,
                  gradeInfo: args.gradeInfo,
                  retryErrors,
                }),
              },
              { type: "image", image: args.image.data, mediaType: args.image.mediaType },
            ],
          },
        ],
      });
      const format = parseFormatSpec(result.object.format);
      const problems = validateFormatOnly(format);
      if (problems.length > 0) {
        retryErrors.splice(0, retryErrors.length, ...problems);
        throw new Error(`형식 스펙 검증 실패: ${problems.join(" / ")}`);
      }
      return format;
    } catch (error) {
      lastError = error;
      console.warn(`[CUSTOM-TYPE-FORMAT-ANALYSIS] format attempt ${attempt} failed: ${errorDetail(error)}`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("형식 스펙 추출에 실패했습니다.");
}

// ───────────────────────── 호출 B: 원본 전사(sourceLayout) ─────────────────────────

const sourceLayoutOnlySchema = z.object({ sourceLayout: layoutDocSchema });

function buildTranscribePrompt(
  format: FormatSpec,
  retryErrors: string[],
  referenceText?: string,
): string {
  const retryBlock = retryErrors.length
    ? `\n## 이전 시도 문제점(이번에 반드시 수정)\n${retryErrors.map((e) => `- ${e}`).join("\n")}\n`
    : "";
  // OCR 텍스트가 있으면 픽셀 전사 대신 "텍스트 재배치" 과제가 되어 반복 루프가 급감한다
  // (1차 분석의 DocAI 하이브리드와 동일 원리). 이미지는 레이아웃 판단용으로 함께 첨부.
  const ocrBlock = referenceText?.trim()
    ? `\n## OCR 텍스트(이 텍스트를 블록으로 재구성 — 다시 받아쓰지 말 것)\n${referenceText.trim().slice(0, 6000)}\n`
    : "";

  return `첨부 이미지는 시험지에서 크롭한 영어 문항 1개입니다. 이 문항을 구조 문서(sourceLayout)로 **전사**하세요.${ocrBlock}

## 전사 규칙
- 이미지의 실제 텍스트를 **그대로, 각 문장은 정확히 한 번씩만**(번역/수정/반복 금지) 옮기세요.
- direction = 발문(문항 번호 제외). blocks = 자료/박스/표를 지면 순서대로. choices = 선지(마커 라벨 포함, 페어/표 행이면 cells 로 분리).
- 본문 밑줄은 __이렇게__, 라벨 밑줄은 "ⓐ __표현__" 형태, 빈칸은 _____ (밑줄 5개)로.
- 박스 종류: 주어진 문장=GIVEN, 조건=CONDITIONS, <보기>=EXAMPLE, 요약문=SUMMARY, (A)(B)(C) 분할 단락=LABELED_PARAS(items 로), 표=TABLE(tableHeaders/tableRows), 일반 박스=BOX, 그 외 본문=TEXT.
- 안내문 불릿은 TEXT/BOX 블록 안에 "• " 줄바꿈 줄로.
- 서술형 답란이 보이면 answerLineCount 에 괘선 줄 수(없으면 0), 답 슬롯은 kind="ANSWER_FORM" 블록으로.
- 해설/정답 표시가 인쇄돼 있어도 blocks 에는 넣지 말 것(학생용 지면만).

## 이 문항의 형식 스펙(이미 추출됨 — 전사가 이 구조와 일치해야 함)
${JSON.stringify({
    choices: {
      count: format.choices.count,
      markerStyle: format.choices.markerStyle,
      itemPattern: format.choices.itemPattern,
      columnHeaders: format.choices.columnHeaders,
    },
    stimulus: { form: format.stimulus.form, boxed: format.stimulus.boxed },
    boxes: format.boxes.map((b) => b.kind),
  })}
${retryBlock}
정확히 스키마 형식으로만 출력하세요.`;
}

function validateSourceLayout(format: FormatSpec, sourceLayout: LayoutDoc): string[] {
  const errors: string[] = [];
  if (!sourceLayout.direction.trim()) {
    errors.push("sourceLayout.direction(발문)이 비었습니다. 이미지의 발문을 그대로 옮기세요.");
  }
  const isObjective = format.answer.shape !== "SHORT_ANSWER";
  if (isObjective && format.choices.present && format.choices.count > 0) {
    const layoutItems = sourceLayout.choices?.items?.length ?? 0;
    if (layoutItems === 0) {
      errors.push("sourceLayout.choices.items 가 비었습니다. 이미지의 선지를 그대로 옮기세요.");
    } else if (layoutItems !== format.choices.count) {
      errors.push(
        `형식 스펙 선지 수(${format.choices.count})와 전사된 선지 수(${layoutItems})가 다릅니다.`,
      );
    }
  }
  return errors;
}

/** 전사 실패 시 1차 내용 분석으로 결정적 폴백 — 스튜디오 미리보기/few-shot 이 비지 않게. */
function buildSourceLayoutFallback(
  format: FormatSpec,
  analysis: QuestionAnalysis | null,
): LayoutDoc {
  const src = analysis?.source;
  return parseLayoutDoc({
    direction: src?.direction ?? "",
    blocks: src?.passage?.trim()
      ? [
          {
            kind: format.stimulus.boxed ? "BOX" : "TEXT",
            label: "",
            text: src.passage,
            items: [],
            tableHeaders: [],
            tableRows: [],
          },
        ]
      : [],
    choices:
      format.answer.shape !== "SHORT_ANSWER" && (src?.options?.length ?? 0) > 0
        ? {
            markerStyle: format.choices.markerStyle,
            layout: format.choices.layout,
            itemPattern: format.choices.itemPattern,
            pairSeparator: format.choices.pairSeparator,
            columnHeaders: format.choices.columnHeaders,
            items: (src?.options ?? []).map((o) => ({ label: o.label, text: o.text, cells: [] })),
          }
        : null,
    answerLineCount:
      format.answer.shape === "SHORT_ANSWER" ? format.answer.subjective.answerLineCount : 0,
  });
}

async function transcribeSourceLayout(
  args: AnalyzeFormatArgs,
  format: FormatSpec,
): Promise<LayoutDoc> {
  let lastError: unknown;
  const retryErrors: string[] = [];
  for (let attempt = 0; attempt <= TRANSCRIBE_MAX_RETRIES; attempt += 1) {
    try {
      const result = await generateObject({
        model: geminiModel,
        schema: sourceLayoutOnlySchema,
        maxOutputTokens: TRANSCRIBE_MAX_TOKENS,
        abortSignal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
        // thinking 0: 1차 분석(같은 이미지에서 안정 동작)과 동일 — thinking 토큰이
        // maxOutputTokens 를 공유하며 사고 루프가 finishReason=length 를 유발하는 사례 방어.
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildTranscribePrompt(format, retryErrors, args.referenceText) },
              { type: "image", image: args.image.data, mediaType: args.image.mediaType },
            ],
          },
        ],
      });
      const sourceLayout = parseLayoutDoc(result.object.sourceLayout);
      const problems = validateSourceLayout(format, sourceLayout);
      if (problems.length > 0) {
        retryErrors.splice(0, retryErrors.length, ...problems);
        throw new Error(`전사 검증 실패: ${problems.join(" / ")}`);
      }
      return sourceLayout;
    } catch (error) {
      lastError = error;
      console.warn(
        `[CUSTOM-TYPE-FORMAT-ANALYSIS] transcribe attempt ${attempt} failed: ${errorDetail(error)}`,
      );
    }
  }
  console.warn(
    `[CUSTOM-TYPE-FORMAT-ANALYSIS] transcribe exhausted → deterministic fallback: ${errorDetail(lastError)}`,
  );
  return buildSourceLayoutFallback(format, args.analysis ?? null);
}

// ───────────────────────── 호출 C: 어노테이션(해부 카드) ─────────────────────────

const annotationOutputSchema = z.object({ annotations: formatAnnotationsSchema });

function buildAnnotationPrompt(format: FormatSpec, analysis: QuestionAnalysis | null): string {
  const choiceRationales = (analysis?.source.options ?? [])
    .slice(0, 10)
    .map((o) => `- ${o.label} ${o.isCorrect ? "(정답)" : "(오답)"}: ${o.rationale?.slice(0, 200) ?? ""}`)
    .join("\n");

  return `당신은 시험 문항 지면을 해부하는 전문가입니다. 첨부 이미지는 크롭된 문항 1개입니다.
이 문항의 지면을 학습 자료처럼 '해부'하는 주석 카드를 10~18개 만드세요. 각 카드는 이미지 위 핀으로 표시됩니다.

## 카드 규칙
- {category, title(8자 내외 짧게), detail(1~2문장, 구체적으로), region}
- region: 해당 요소의 위치(첨부 이미지 기준 정규화 0..1 {x,y,width,height}). **모든 카드에 region 을 채우는 것을 목표로** 하되, 정말 특정 불가하면 null.
- 반드시 포함할 카드:
  1. STEM — 발문 1개(문구 패턴·부정형·배점 표기 관찰)
  2. STIMULUS — 자료 1개(형태·박스·제목 등)
  3. MARKER — 마커 체계 1개(라벨 스킴과 적용 대상)
  4. CHOICE — 선지 전체 배치 1개(단 수·표 구조·마커)
  5. CHOICE/TRAP — **각 선지마다 1개씩**(그 선지의 위치 region + 정답/오답 설계 특징. 아래 [선지 근거] 활용)
  6. BLANK/BOX/ANSWER/SCORING — 보이는 경우 각각
  7. LAYOUT — 전체 지면 구성 1개
- title/detail 은 한국어. 이미지에 보이는 사실만. 같은 내용 반복 금지.

## 형식 스펙(이미 추출됨 — 참고)
${JSON.stringify({ stem: format.stem.pattern, choices: format.choices, stimulus: { form: format.stimulus.form, underlineMarks: format.stimulus.underlineMarks, blanks: format.stimulus.blanks } })}

${choiceRationales ? `## 선지 근거(내용 분석에서)\n${choiceRationales}` : ""}

정확히 스키마 형식으로만 출력하세요.`;
}

async function analyzeAnnotations(args: {
  image: { data: Buffer; mediaType: string };
  format: FormatSpec;
  analysis: QuestionAnalysis | null;
}): Promise<FormatAnnotation[]> {
  const result = await generateObject({
    model: geminiModel,
    schema: annotationOutputSchema,
    maxOutputTokens: ANNOTATION_MAX_TOKENS,
    abortSignal: AbortSignal.timeout(ANNOTATION_TIMEOUT_MS),
    // thinking 0 — 전사 호출과 같은 이유(사고 루프 → length 방어).
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildAnnotationPrompt(args.format, args.analysis) },
          { type: "image", image: args.image.data, mediaType: args.image.mediaType },
        ],
      },
    ],
  });
  return formatAnnotationsSchema.parse(result.object.annotations ?? []);
}

// ───────────────────────── 본체 ─────────────────────────

/**
 * 이미지 1장(크롭된 문항)의 형식을 분석한다.
 * formatSpec 추출 실패 시에만 throw(호출부가 v1 로 폴백). 전사/어노테이션은 부분 성공.
 */
export async function analyzeQuestionFormat(args: AnalyzeFormatArgs): Promise<FormatAnalysisResult> {
  // 1) formatSpec(필수) — 실패 시에만 throw(컴파일러가 v1 폴백).
  const format = await analyzeFormatSpec(args);

  // 2) 전사·어노테이션은 서로 독립 → 병렬. 둘 다 실패해도 부분 성공(전사=결정적 폴백, 어노=[]).
  const [sourceLayout, annotations] = await Promise.all([
    transcribeSourceLayout(args, format),
    analyzeAnnotations({ image: args.image, format, analysis: args.analysis ?? null }).catch(
      (error) => {
        console.warn(`[CUSTOM-TYPE-FORMAT-ANALYSIS] annotation pass failed: ${errorDetail(error)}`);
        return [] as FormatAnnotation[];
      },
    ),
  ]);

  return { format, sourceLayout, annotations };
}
