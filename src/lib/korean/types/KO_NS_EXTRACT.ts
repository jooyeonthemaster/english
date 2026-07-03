// ============================================================================
// KO_NS_EXTRACT — 내신 서답형: 본문 근거 발췌형 (첫·끝 어절 / 어절 수 지정)
// ============================================================================
// 카탈로그 §2.7 본문 근거 발췌형 + KO-DESIGN-SPEC §5 의 전면 구현.
//
// 실측 관행:
//   발문: "㉠의 이유가 드러난 문장을 찾아 첫 어절과 끝 어절을 쓰시오." /
//         "윗글에서 '○○'을 뜻하는 말을 찾아 3어절로 쓰시오."
//   정답이 본문에 verbatim 존재하고 **본문 내 유일**하도록 설계해 채점 시비를
//   원천 차단한다 — 어절 수 지정·첫/끝 어절 답안 형식이 정답 유일성 확보 장치다.
//   결정론 게이트: ① answerSpan verbatim+유일(isUniqueSpanKo) ② 어절 수 삼자
//   정합(spec=실측=발문) ③ 첫/끝 어절-correctAnswer 정합 ④ 마킹·발문의 정답
//   위치/표현 누수 차단. examMode 기본 NAESIN, markers 는 ㉠ 지시형일 때만 1개.
// ============================================================================

import { z } from "zod";
import { koQuestionEnvelope, koMarkerSchema } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { splitKoSentences } from "../text/ko-sentence-splitter";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koQuestionEnvelope({
  extractSpec: z
    .object({
      answerSpan: z
        .string()
        .min(2)
        .describe(
          "정답 발췌 구간 — 지문 원문 verbatim(조사·어미·띄어쓰기·문장부호까지 그대로, 한 글자도 변경 금지). 본문 전체에서 정확히 1회만 등장해야 한다(유일성 게이트)",
        ),
      eojeolCount: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "발문이 어절 수를 지정할 때(예: '3어절로 쓰시오') 그 수 — answerSpan 의 실제 어절 수와 정확히 일치해야 한다. 첫·끝 어절 모드(firstLastMode=true)면 생략",
        ),
      firstLastMode: z
        .boolean()
        .describe(
          "true=문장 발췌 모드(답안은 '첫 어절, 끝 어절' — 정답 구간이 문장·긴 구절일 때) / false=어구 발췌 모드(구간 자체가 답안)",
        ),
    })
    .describe("발췌 사양 — 검증기가 verbatim·유일성·어절 수·첫/끝 어절 정합을 결정론 검사한다"),
  markers: z
    .array(koMarkerSchema)
    .max(1)
    .describe(
      "㉠ 지시형 발문일 때만 정확히 1개(KOR_CIRCLED, 라벨 ㉠). ㉠은 이유·의미를 물을 '지시 대상' 구절에만 — 정답 구간(answerSpan)에 걸치게 마킹하면 정답 위치 누수. 지시 대상이 없으면 생략",
    )
    .optional(),
  correctAnswer: z
    .string()
    .describe(
      "firstLastMode=true: '첫어절, 끝어절' 쉼표 구분(정답 구간의 실제 첫/끝 어절, 예: '그러나, 것이다.') / firstLastMode=false: answerSpan 을 그대로",
    ),
});

const prompt = `### 유형: 내신 서답형 — 본문 근거 발췌형 (첫·끝 어절 / 어절 수 지정)

**출제 목적 — 채점 시비 차단이 이 유형의 존재 이유다**:
정답이 본문에 verbatim 으로 존재하고, 본문 안에서 **오직 한 곳**에서만 성립하도록 설계하라.
채점은 원문 완전 일치로 이루어지므로 "비슷한 다른 문장도 답이 되지 않느냐"는 이의가
원천적으로 불가능해야 한다. 어절 수 지정('3어절로')과 첫/끝 어절 답안 형식은 장식이
아니라 정답 유일성을 기계적으로 좁히는 장치다. 내신 서답형은 이의제기·재채점 민원의
최전선임을 전제로 설계하라.

**발문 템플릿** (extractSpec.firstLastMode 에 따라 정확히 이 형태로 — 종결은 반드시 '~쓰시오.'):
- 문장 발췌(firstLastMode=true):
  "㉠의 이유가 드러난 문장을 찾아 첫 어절과 끝 어절을 쓰시오." (㉠ 지시형)
  "필자의 주장이 직접 드러난 문장을 찾아 첫 어절과 끝 어절을 순서대로 쓰시오." (직접 지시형)
- 어구 발췌(firstLastMode=false):
  "윗글에서 '○○'을 뜻하는 말을 찾아 3어절로 쓰시오." ('○○' 자리는 정답의 의미 풀이 — 아래 누수 금지 참조)
  "㉠이 가리키는 대상을 본문에서 찾아 2어절로 쓰시오."

**정답 구간(extractSpec.answerSpan) 선정 원리**:
1. 본문 verbatim — 조사·어미·띄어쓰기·문장부호 하나도 바꾸지 마라. 요약·재진술·현대어 치환 금지.
2. 유일성이 최우선: 같은 표현이 본문에 2회 이상 등장하면 그 구간은 정답으로 쓰지 마라.
   후보가 여럿이면 더 긴 구간을 잡아 유일하게 만들거나, 어절 수 지정·발문 한정어
   ("가장 직접적으로 드러난")로 한 곳으로 좁혀라.
3. 문장 발췌 모드: 종결부호로 끝나는 완결된 한 문장 전체를 answerSpan 으로.
   correctAnswer = "첫어절, 끝어절" (쉼표 구분, 어절은 본문 그대로 — 끝 어절의 문장부호 포함).
   ⚠ '문장' = **마침표(종결부호) 단위**다. 쉼표·연결어미('-ㄴ데', '-고', '-지만')로 이어진
   이어진문장의 **한 절만** 잘라 answerSpan 으로 삼지 마라 — 채점 관행상 학생이 마침표
   단위 문장 전체(예: '다만, 때문이다.')로 답하면 정당한 이의가 성립한다(시스템이 문장
   경계 일치를 결정론 검사해 반려한다). ㉠과 그 이유가 쉼표로 한 문장 안에 이어져 있으면
   그 지문 구조는 문장 발췌형에 부적합하다 — 다른 지시 대상을 고르거나 어구 발췌로 바꿔라.
   발문에는 문장 부호 처리 규약을 단서로 병기하라: "…첫 어절과 끝 어절을 쓰시오.
   (끝 어절은 문장 부호를 포함하여 쓸 것)" — 규약 미명시는 채점 시비의 원천이다.
4. 어구 발췌 모드: answerSpan 의 실제 어절 수 = extractSpec.eojeolCount = 발문의 'n어절'
   삼자가 정확히 일치해야 한다. correctAnswer = answerSpan 그대로.

**함정·시비 차단 원리 (원리별 예시 — 전부 점검하라)**:
- 복수 근거 함정: ㉠의 이유가 두 문장에 걸쳐 서술되면 어느 쪽을 써도 맞아 보인다 —
  이유가 한 문장에 응축된 지시 대상을 고르거나, 발문에 한정("단적으로 드러난 문장")을 넣어라.
- 첫·끝 어절 동형 함정: 발췌 문장의 첫 어절('그러나')과 끝 어절('것이다.')이 본문의 다른
  문장에서도 같은 조합으로 나타나면 답안이 두 문장을 구별하지 못한다 — 그런 문장은 피하라.
- 의미 풀이 누수: 발문의 '○○' 풀이에 정답 어휘를 그대로 쓰면 찾기 문제가 베끼기 문제가
  된다. 예: 정답이 '앞장서서 이끄는 사람'이면 풀이는 "'무리의 맨 앞에서 방향을 정하는 이'"
  처럼 본문 어휘와 겹치지 않는 재진술로 써라.
- 마킹 누수: ㉠ 마커를 정답 구간(answerSpan)에 걸치게 찍으면 학생이 위치를 보고 베낀다 —
  ㉠은 '이유·의미를 물을 대상' 구절에만, 정답 문장과 떨어진 위치에 두라.
- 조사 경계 함정: '3어절'로 지정한 답이 조사 포함 여부에 따라 2어절도 4어절도 될 수
  있으면 안 된다 — 본문 띄어쓰기 그대로 세었을 때 정확히 그 수가 되는 어구만 지정하라.

**마커(㉠ 지시형) 사용 규칙**: 0~1개, family=KOR_CIRCLED, 라벨 ㉠.
㉠ 지시형이면 발문이 반드시 ㉠을 언급해야 하고, ㉠의 spanText 는 지문 원문 그대로.
직접 지시형·의미 풀이형(마커 없음)이면 markers 를 아예 비워라.

**근거앵커(evidence) 작성**:
- relation=SUPPORTS, spanText = 정답 문장(어구 발췌면 정답 어구를 포함한 문장) verbatim.
- ㉠ 지시형이면 note 에 '㉠ 구절 → 정답 문장'의 인과·의미 연결을 한 줄로 밝혀라.
- explanation 에는 왜 그 구간이 발문의 요구(이유·주장·지시 대상)에 해당하는지 **그리고
  그것이 본문에서 유일한 근거임**을 서술하라 — 교사용 채점 근거 문서 역할을 한다.

**금지**:
- 본문에 없는 표현을 정답으로 삼기 (재진술·요약·축약 정답).
- 본문에 여러 번 등장하는 표현을 답으로 삼기 (유일성 위반 → 기계 게이트가 반려한다).
- 발문·의미 풀이에 정답 표현 verbatim 노출.
- options 생성 (서답형 — 선지 없음).
- '~쓰시오.' 이외의 종결 (서술하시오/고르시오 금지 — 이 유형은 발췌 단답이다).`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];

  const mode = settings.extractMode;
  if (mode === "FIRST_LAST") {
    lines.push(
      "- 문장 발췌 모드(firstLastMode=true)로 출제하라: 완결된 한 문장을 발췌 대상으로, 답안은 '첫 어절, 끝 어절'.",
    );
  } else if (mode === "SPAN") {
    lines.push(
      "- 어구 발췌 모드(firstLastMode=false)로 출제하라: 발문에 'n어절로 쓰시오' 어절 수를 지정하고 extractSpec.eojeolCount 에 같은 수를 기입하라.",
    );
  } else {
    lines.push(
      "- 발췌 형식은 정답 길이에 맞게 선택하라: 이유·근거가 한 문장에 응축돼 있으면 문장 발췌(첫·끝 어절), 함축 어휘·짧은 표현(2~3어절)을 묻기 좋으면 어구 발췌(어절 수 지정).",
    );
  }

  const directive = settings.markerDirective;
  if (directive === "MARKER") {
    lines.push(
      "- ㉠ 지시형으로 출제하라: 이유·의미를 물을 대상 구절에 ㉠(KOR_CIRCLED) 마커 1개를 찍고, 발문은 '㉠의 이유가 드러난 문장을 …' 형태로. ㉠은 정답 구간과 겹치지 않게.",
    );
  } else if (directive === "MEANING") {
    lines.push(
      "- 의미 풀이형으로 출제하라(마커 없음): 발문에 정답의 의미 풀이를 작은따옴표로 제시하되, 풀이에 정답 어휘를 verbatim 으로 쓰지 마라.",
    );
  } else {
    lines.push("- 지시 방식은 자유 선택: ㉠ 지시형(마커 1개) 또는 의미 풀이형·직접 지시형(마커 없음).");
  }

  if (settings.examMode === "SUNEUNG") {
    lines.push(
      "- 수능형 모드: 이 유형은 수능 실전에는 없는 내신 서답형이다 — 수능형 지문의 서답형 변형으로 출제하라. 발문·답안 형식은 내신 관행을 유지하되, 지시 대상(㉠)은 수능식 추론 근거(이유·기능)를 묻는 구절로 골라라.",
    );
  } else {
    lines.push(
      "- 내신 모드(기본): 배점 [4점] 표기 관행. 수업에서 밑줄·강조되었을 법한 핵심 문장(주제문·근거 문장·지시 대상)을 발췌 대상으로 삼되, 정답 유일성 게이트를 절대 타협하지 마라.",
    );
  }

  return lines.join("\n");
}

/** correctAnswer("첫어절, 끝어절")를 어절 토큰으로 분해 — 쉼표·물결 구분 허용. */
function parseFirstLastAnswer(correctAnswer: string): string[] {
  return correctAnswer
    .split(/[,，~〜]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const norm = (s: string) => ctx.koText.normalizeKo(s).replace(/\s+/g, " ").trim();

  // --- (0) 발문 종결 규약: 발췌형은 반드시 '~쓰시오.' -----------------------
  if (!/쓰시오\.?$/.test(norm(direction))) {
    add("error", "ko-direction-grammar", "발췌형 발문은 반드시 '~쓰시오.' 로 종결해야 합니다");
  }

  const spec =
    question.extractSpec && typeof question.extractSpec === "object"
      ? (question.extractSpec as Record<string, unknown>)
      : null;
  const answerSpan = typeof spec?.answerSpan === "string" ? spec.answerSpan.trim() : "";
  const firstLastMode = spec?.firstLastMode === true;
  const eojeolCountSpec =
    typeof spec?.eojeolCount === "number" && Number.isInteger(spec.eojeolCount)
      ? (spec.eojeolCount as number)
      : null;

  if (!answerSpan) {
    add("error", "ko-correct-answer-invalid", "extractSpec.answerSpan 이 비어 있습니다 — 발췌 정답 구간 필수");
    return issues;
  }

  // --- (1) verbatim + 유일성 게이트 (채점 시비 차단의 심장) ------------------
  const match = ctx.koText.findSpanKo(ctx.passage, answerSpan, 0);
  if (!match) {
    add(
      "error",
      "ko-quote-not-verbatim",
      `정답 구간이 지문에 그대로(verbatim) 존재하지 않습니다: "${answerSpan.slice(0, 40)}"`,
    );
  } else if (match.occurrenceTotal > 1) {
    add(
      "error",
      "ko-extract-not-unique",
      `정답 구간이 본문에 ${match.occurrenceTotal}회 등장합니다 — 유일성 위반(채점 시비). 더 긴 구간을 잡거나 다른 근거를 고르세요: "${answerSpan.slice(0, 40)}"`,
    );
  }

  // --- (2) 어절 수 삼자 정합: spec = answerSpan 실측 = 발문의 'n어절' --------
  const eojeols = norm(answerSpan).split(" ").filter(Boolean);
  if (eojeolCountSpec !== null && eojeols.length !== eojeolCountSpec) {
    add(
      "error",
      "ko-correct-answer-invalid",
      `정답 구간의 실제 어절 수(${eojeols.length})가 지정 어절 수(${eojeolCountSpec})와 다릅니다`,
    );
  }
  const directionEojeol = /([0-9]+)\s*어절/.exec(norm(direction));
  if (directionEojeol) {
    const n = Number.parseInt(directionEojeol[1], 10);
    if (n !== eojeols.length) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `발문이 ${n}어절을 지정했는데 정답 구간은 ${eojeols.length}어절입니다`,
      );
    }
  } else if (eojeolCountSpec !== null) {
    add(
      "error",
      "ko-direction-grammar",
      `extractSpec.eojeolCount(${eojeolCountSpec})가 지정됐는데 발문에 '${eojeolCountSpec}어절' 지정이 없습니다`,
    );
  }

  // --- (3) 답안 형식 정합: firstLastMode ↔ correctAnswer ---------------------
  if (firstLastMode) {
    if (!/첫\s*어절과?\s*끝\s*어절/.test(norm(direction))) {
      add(
        "error",
        "ko-direction-grammar",
        "첫·끝 어절 모드인데 발문에 '첫 어절과 끝 어절' 지정이 없습니다",
      );
    }
    if (eojeols.length < 2) {
      add(
        "error",
        "ko-correct-answer-invalid",
        "첫·끝 어절 모드의 정답 구간이 1어절입니다 — 완결된 문장(2어절 이상)을 발췌 대상으로 하세요",
      );
    } else {
      const first = eojeols[0];
      const last = eojeols[eojeols.length - 1];
      const tokens = parseFirstLastAnswer(correctAnswer);
      if (tokens.length !== 2 || tokens[0] !== first || tokens[1] !== last) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `correctAnswer("${correctAnswer}")가 정답 구간의 실제 첫 어절("${first}")·끝 어절("${last}")과 일치하지 않습니다 — "첫어절, 끝어절" 형식이어야 합니다`,
        );
      }
    }
  } else if (correctAnswer && norm(correctAnswer) !== norm(answerSpan)) {
    add(
      "error",
      "ko-correct-answer-invalid",
      `어구 발췌 모드에서는 correctAnswer("${correctAnswer}")가 extractSpec.answerSpan 과 동일해야 합니다(본문 그대로)`,
    );
  }

  // --- (3.5) 문장 발췌 모드: answerSpan ↔ 실제 문장 경계 정합 (결정론) ------
  // 이어진문장의 한 절(쉼표 절)만 발췌하면 '문장 전체의 첫/끝 어절'로 답한 학생의
  // 이의가 정당해진다(복수정답/정답오류). 산문 갈래에서만 판정하고(운문·희곡·MIXED 는
  // 행 중심이라 문장 경계 개념이 흐려 침묵 — 오탐 억제), 판정 불가면 침묵한다.
  const proseSplittable =
    ctx.passageKind === null ||
    ctx.passageKind.startsWith("READING_") ||
    ctx.passageKind === "GRAMMAR_CONCEPT" ||
    ctx.passageKind === "LIT_MODERN_NOVEL" ||
    ctx.passageKind === "LIT_CLASSIC_NOVEL" ||
    ctx.passageKind === "LIT_ESSAY";
  if (firstLastMode && match && proseSplittable) {
    const squash = (s: string) => ctx.koText.normalizeKo(s).replace(/\s+/g, "");
    const normPassage = ctx.koText.normalizeKo(ctx.passage);
    const { sentences } = splitKoSentences(normPassage, { mode: "prose" });
    // answerSpan 이 걸치는 문장 스팬들 (findSpanKo 좌표는 normalizeKo(passage) 기준)
    const overlapping = sentences.filter(
      (s) => s.start < match.sourceEnd && match.sourceStart < s.end,
    );
    if (overlapping.length > 1) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `정답 구간이 문장 ${overlapping.length}개에 걸칩니다 — 문장 발췌 모드의 answerSpan 은 마침표 단위 한 문장 전체여야 합니다`,
      );
    } else if (overlapping.length === 1) {
      const sentence = overlapping[0];
      if (squash(sentence.text) !== squash(answerSpan)) {
        const sentEojeols = norm(sentence.text).split(" ").filter(Boolean);
        const first = sentEojeols[0] ?? "";
        const last = sentEojeols[sentEojeols.length - 1] ?? "";
        add(
          "error",
          "ko-correct-answer-invalid",
          `정답 구간이 지문의 실제 문장 경계와 다릅니다 — 쉼표·연결어미로 이어진 절만 잘라내면 채점 시비가 됩니다. 해당 문장 전체(첫 어절 "${first}", 끝 어절 "${last}")를 answerSpan 으로 삼거나 다른 근거 문장을 고르세요: "${answerSpan.slice(0, 30)}…"`,
        );
      } else {
        // 문장 일치 — correctAnswer 의 첫/끝 어절이 실제 문장의 첫/끝 어절인지 재확증
        const sentEojeols = norm(sentence.text).split(" ").filter(Boolean);
        const tokens = parseFirstLastAnswer(correctAnswer);
        if (
          sentEojeols.length >= 2 &&
          tokens.length === 2 &&
          (tokens[0] !== sentEojeols[0] || tokens[1] !== sentEojeols[sentEojeols.length - 1])
        ) {
          add(
            "error",
            "ko-correct-answer-invalid",
            `correctAnswer("${correctAnswer}")가 지문 실제 문장의 첫 어절("${sentEojeols[0]}")·끝 어절("${sentEojeols[sentEojeols.length - 1]}")과 일치하지 않습니다`,
          );
        }
      }
    }
  }

  // --- (4) 누수 차단: 발문(의미 풀이 포함)에 정답 verbatim 노출 금지 ----------
  if (ctx.koText.containsSpanKo(direction, answerSpan)) {
    add(
      "error",
      "ko-answer-leak",
      "발문에 정답 구간이 verbatim 으로 노출됐습니다 — 의미 풀이는 본문 어휘와 겹치지 않는 재진술로 쓰세요",
    );
  }

  // --- (5) 마커 규칙: 0~1개 KOR_CIRCLED + 발문 정합 + 정답 위치 누수 금지 ----
  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  if (markers.length > 1) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `마커가 ${markers.length}개 — 발췌 지시형은 ㉠ 최대 1개입니다`,
    );
  }
  const directionMarkerLabel = /[㉠-㉭]/.exec(direction)?.[0] ?? null;
  const marker = markers[0];
  if (marker) {
    const family = typeof marker.family === "string" ? marker.family : "";
    const label = typeof marker.label === "string" ? marker.label : "";
    const spanText = typeof marker.spanText === "string" ? marker.spanText : "";
    if (family !== "KOR_CIRCLED") {
      add(
        "warning",
        "ko-marker-hierarchy",
        `발췌 지시 마커는 ㉠계열(KOR_CIRCLED)이어야 합니다 — 현재 ${family || "미지정"}`,
      );
    }
    if (label && !direction.includes(label)) {
      add(
        "error",
        "ko-direction-grammar",
        `마커 ${label} 가 있는데 발문이 이를 지시하지 않습니다 — ㉠ 지시형 발문은 마커 라벨을 언급해야 합니다`,
      );
    }
    // 정답 위치 누수: ㉠ 스팬이 정답 구간과 겹치면 학생이 위치를 보고 베낀다
    if (spanText && match) {
      const markerMatch = ctx.koText.findSpanKo(
        ctx.passage,
        spanText,
        typeof marker.occurrenceIndex === "number" ? marker.occurrenceIndex : 0,
      );
      if (markerMatch && ctx.koText.spansOverlap(markerMatch, match)) {
        add(
          "error",
          "ko-answer-leak",
          `마커 ${label || "㉠"} 가 정답 구간과 겹칩니다 — 마킹이 정답 위치를 누설합니다(지시 대상은 정답 구간 밖에서 고를 것)`,
        );
      }
    }
  } else if (directionMarkerLabel) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 ${directionMarkerLabel} 를 지시하는데 markers 가 비어 있습니다`,
    );
  }

  return issues;
}

export const KO_NS_EXTRACT: KoTypeModule = {
  meta: {
    typeId: "KO_NS_EXTRACT",
    area: "NAESIN",
    label: "근거 발췌형(첫·끝 어절)",
    formatCategory: "서술형",
    uiGroup: "국어 서답형",
    answerFormat: "SHORT",
    includesPassage: true,
    passageKinds: [
      "READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART",
      "LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL",
      "LIT_ESSAY", "LIT_PLAY", "MIXED",
    ],
    defaultPoints: 4,
    usesBogi: "none",
    markerFamilies: ["KOR_CIRCLED"],
    optionEnding: "any",
    needsSolverGate: false,
    description:
      "본문에서 근거 문장·어구를 verbatim 발췌해 첫·끝 어절 또는 지정 어절 수로 답하는 내신 서답형 — 정답 유일성 게이트로 채점 시비 차단",
    setSlot: "내신 서답형 세트 후반 슬롯(서술형 별도 번호 관행) — 본문 근거 발췌 담당, 시어 쓰기와 조건 서술 사이의 중간 난도",
    studentTask:
      "발문의 지시(㉠의 이유, 의미 풀이)에 해당하는 본문 구간을 찾아 첫 어절과 끝 어절(또는 지정 어절 수의 어구)을 본문 그대로 씁니다.",
    bestFor: ["내신 서·논술형 의무 비율 구간", "주제문·근거 문장이 분명한 산문·비문학", "수업 필기 강조 지점 확인"],
    outputUi: ["지문 동봉(㉠ 마킹 시)", "단답 서답형 답안란", "모범답안·유일성 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "extractMode",
        label: "발췌 형식",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(정답 길이에 맞게)" },
          { value: "FIRST_LAST", label: "문장 발췌(첫 어절·끝 어절)" },
          { value: "SPAN", label: "어구 발췌(지정 어절 수)" },
        ],
        defaultValue: "AUTO",
        description: "문장 발췌는 '첫 어절, 끝 어절' 답안, 어구 발췌는 'n어절로 쓰시오' 지정",
      },
      {
        key: "markerDirective",
        label: "지시 방식",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동" },
          { value: "MARKER", label: "㉠ 지시형(마커 1개)" },
          { value: "MEANING", label: "의미 풀이형(마커 없음)" },
        ],
        defaultValue: "AUTO",
        description: "㉠ 지시형은 지문에 ㉠ 마킹 후 '㉠의 이유가 드러난 문장을 …' 발문",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: true,
      answerFormat: "SHORT",
      defaultPoints: 4,
      examMode: "NAESIN",
    });
  },
  difficultyGuide: {
    BASIC:
      "지시 대상(㉠·의미 풀이)과 정답 구간을 같은 문단에 인접 배치하라. 어구 발췌는 2~3어절의 표면 어휘로 바로 찾히게, 문장 발췌는 '때문이다' 류 인과 표지가 있는 문장으로.",
    INTERMEDIATE:
      "지시 대상과 정답 문장을 서로 다른 문단에 배치하라. 의미 풀이는 본문 어휘를 피한 재진술로 쓰고, 유사 후보 문장이 있는 지문에서는 어절 수 지정으로 유일화하라.",
    KILLER:
      "첫·끝 어절 모드 + 긴 복문을 정답으로: ㉠의 이유가 표면 인과어 없이 논리 전개로만 드러나는 문장을 골라라. 유사한 후보 문장을 여럿 둔 지문에서 발문의 한정 조건(이유·직접 진술)으로 정확히 하나만 걸리게 설계하고, 의미 풀이형은 정답과 어휘가 전혀 겹치지 않는 개념적 재진술로 제시하라.",
  },
};
