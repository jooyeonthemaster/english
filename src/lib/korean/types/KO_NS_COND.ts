// ============================================================================
// KO_NS_COND — 내신 서답형: 조건 제시형 서술형 (<조건> 충족 서술)  【내신 시그니처】
// ============================================================================
// 카탈로그 §2.7 KO_NS_COND + KO-DESIGN-SPEC §5 의 전면 구현 — 내신 서·논술형
// 의무 구간(시도별 30%±)의 주력 유형. 문항 = 발문 + 자료(지문/보기) + <조건>
// 3요소(경기도교육청 공식 유형론: 제한형). 채점기준표(모범답안·인정답안·요소별
// 부분점수)는 문항과 동시 생성이 의무 산출물이며, 조건에 포함된 제약은
// 채점기준에 전부 반영돼야 한다(교육청 지침 원문).
//
// 실측 관행(경기도교육청 확증):
//   발문: "㉠에 담긴 화자의 정서를 <조건>에 맞게 서술하시오."
//   <조건> = 내용 조건(포함할 개념·요소) + 형식 조건 3종(종결 형태 "'~때문이다'로
//   끝맺을 것" · 문장 수 "한 문장으로 쓸 것" · 포함 단어 "'○○'라는 단어를
//   포함할 것") — 전 항목 '~할 것' 명사형 종결.
//
// 결정론 게이트(본 모듈 validate):
//   ① 조건↔rubric 전수 매핑  ② 형식 조건의 모범답안 기계 검사(종결·포함어·문장 수)
//   ③ 발문·자료·<조건> 정답 누출  ④ rubric 배점 합계 = points  ⑤ ㉠ 마커 규율(0~1)
// ============================================================================

import { z } from "zod";
import { koQuestionEnvelope, koEssaySchema, koMarkerSchema } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { KOR_CIRCLED_LABELS } from "../core/markers";
import type {
  KoDifficulty,
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koQuestionEnvelope({
  essay: koEssaySchema.describe(
    "서술형 필수 — conditions(<조건> 항목, '~할 것' 명사형 종결) + answerSheet{model 모범답안, accepted 인정답안, rubric 채점기준표}. 조건의 모든 제약이 rubric 에 반영되어야 하며 rubric 배점 합계 = 문항 배점",
  ),
  markers: z
    .array(koMarkerSchema)
    .max(1)
    .describe(
      "발문이 지시하는 ㉠ 마커 0~1개 — KOR_CIRCLED(구절·발화) 전용, spanText 는 지문 verbatim. 무마커 직접 명명형 발문이면 생략",
    )
    .optional(),
});

const prompt = `### 유형: 내신 서답형 — 조건 제시형 서술형 (<조건> 충족 서술)

**문항 3요소 구조**: 발문 + 자료(지문, 필요시 <보기>) + <조건> 박스. 학생은 <조건>의
모든 제약을 동시에 충족하는 1~3문장을 서술한다. 모범답안·인정답안·채점기준표
(essay.answerSheet)는 문항과 **동시 생성이 의무 산출물**이다.

**발문 템플릿** (반드시 "…<조건>에 맞게 서술하시오." 골격 — 서답형은 '~것은?' 규칙
대신 '~서술하시오.'/'~쓰시오.' 종결. '조건' 지시어 누락 금지):
- 정서형(기본): "㉠에 담긴 화자의 정서를 <조건>에 맞게 서술하시오."
- 이유형: "화자가 ㉠과 같이 말한 이유를 <조건>에 맞게 서술하시오." / "필자가 ~라고 주장하는 이유를 <조건>에 맞게 서술하시오."
- 의미형: "㉠의 함축적 의미를 <조건>에 맞게 서술하시오."
- 주제형: "윗글을 통해 글쓴이가 전달하려는 바를 <조건>에 맞게 서술하시오."
마커(㉠) 지시형이면 markers 에 같은 라벨의 KOR_CIRCLED 마커 1개를 등록하라(지문 verbatim 스팬).
무마커형이면 발문이 서술 대상을 작은따옴표 인용으로 직접 명명한다.

**<조건> 구성 원리** (essay.conditions) — 내용 조건 1개 이상 + 형식 조건 1개 이상,
총 2~4개. 전 항목 '~할 것' 명사형 종결('~하세요/~하시오' 금지):
1. **내용 조건**: 답에 포함할 개념·요소·근거를 지정한다 — 예: "㉠에 나타난 정서와 그
   정서의 대상을 모두 밝힐 것", "화자의 정서를 드러내는 시어를 근거로 들 것".
   요소가 2개 이상이면 '모두'로 명시해 채점 요소를 확정하라.
2. **형식 조건 3종** — 시스템이 모범답안 충족 여부를 **결정론 기계 검사**하므로,
   검사 대상 문자열은 반드시 작은따옴표 안에 명시하라:
   - 종결 형태: "'~때문이다'로 끝맺을 것" / "'~에 있다'로 끝낼 것" → 모범답안이 그 형태로 끝나야 한다.
   - 문장 수: "한 문장으로 쓸 것" / "두 문장 이내로 쓸 것".
   - 포함 단어: "'그리움'이라는 단어를 포함할 것" → 모범답안에 변형 없이 들어가야 한다.
   - (글자 수 상한 조건은 교육청이 지양하므로 쓰지 마라.)

**모범답안(answerSheet.model) 작성**:
- <조건>의 모든 제약을 문자 그대로 충족하는 완성 답안 — 종결형·포함어·문장 수 하나라도
  어기면 전량 반려된다. 포함 단어는 활용 변형 없이 그대로 사용하라.
- 지문 문장의 통복사가 아니라 지문 근거를 재구성한 학생 문장으로 쓰라.
- correctAnswer 에는 모범답안과 동일한 텍스트를 넣어라(서답형 정답 = model).

**인정답안(accepted) 작성** — 1~4개:
- 표현 차이(어휘 유의어·어순)만 허용하는 경계 사례. **형식 조건은 인정답안도 전부 충족**해야 한다.
- 필수 내용 요소(정서의 대상·이유 등)가 빠진 답은 넣지 마라 — 인정 폭주는 변별 소멸.

**채점기준표(rubric) 작성 원리**:
- 조건 1개당 최소 1개의 채점 항목 — 조건의 키워드(종결형·포함어·'문장'·내용 요소)가
  항목 문면에 드러나야 한다(시스템이 매핑을 결정론 검사).
- 배점 합계 = 문항 배점(points, 기본 5점)과 정확히 일치 — 내신은 발문 끝 [n점]이 rubric 합계다.
- 내용 요소 배점 > 형식 요소 배점 (예: 5점 = 내용 3점 + 형식 2점(종결 1+포함어 1)).
- 항목은 "…을 정확히 서술함 (n점)" 판정문 형태로 — 채점자가 유/무만 판정하면 되게 쓰라.

**근거앵커(evidence)**: 모범답안의 내용 요소가 도출되는 지문 구절 verbatim
(relation=SUPPORTS, optionLabel 생략). 내용 요소마다 1개 권장, 최소 1개.

**결함 방지 원리 — 채점 시비 차단 (원리별 예시)**:
1. 정답 누출 금지: 발문·<보기>·<조건>에 모범답안 핵심구 노출 금지. "'그리움'이라는
   단어를 포함할 것"(단어 1개 지정)은 허용, "'고향에 대한 그리움'을 쓸 것"처럼 답
   구절 자체를 조건에 옮겨 적으면 반려.
2. 기계 검증 불가 조건 금지: "진솔하게 쓸 것", "자신의 경험과 관련지어 쓸 것"(지문 밖)
   — 채점 불가·민원 유발.
3. 조건 상호 모순·과적재 금지: "한 문장으로 쓸 것" + 서술 요소 3개 동시 요구 같은
   물리적으로 무리한 조합.
4. 조건-rubric desync 금지: 조건에 없는 요소를 rubric 에만 두는 암묵 채점, 조건이
   rubric 어디에도 반영되지 않는 공중 조건 — 둘 다 반려.
5. 복수 해석 차단: 내용 조건이 서술 대상을 유일하게 고정해야 한다 — "화자의 정서"만
   요구하면 복수 정서가 성립하는 지문에서 채점 분쟁이 난다. 대상·국면을 조건으로 좁혀라.

**금지**:
- 선지(options)·오답 해설(wrongOptionExplanations) 생성 — 서답형이다.
- 지문 밖 배경지식·개인 경험을 요구하는 내용 조건.
- 형식 조건을 걸어 놓고 모범답안이 그 형식을 어기기, rubric 합계와 어긋나는 배점.
- <조건> 항목의 경어체 종결 — 반드시 '~할 것' 명사형.`;

// ---------------------------------------------------------------------------
// <조건> 결정론 파서 — 형식 조건 3종(종결·포함 단어·문장 수)의 기계 검증
// ---------------------------------------------------------------------------

type KoTextUtil = KoValidationContext["koText"];

interface ParsedCondition {
  text: string;
  /** 따옴표 인용 스팬 (선두 ~ 제거) */
  quoted: string[];
  /** 종결 형식 조건의 요구 종결 문자열 (인용 없으면 null — 기계검사 면제) */
  ending: string | null;
  /** 포함 단어 조건의 포함어 목록 */
  includeWords: string[];
  /** 문장 수 조건 */
  sentence: { count: number; atMost: boolean } | null;
}

const ENDING_KEYWORD_RE = /(끝맺|끝낼|끝내|끝나|맺을|마무리|종결)/;
const KOREAN_COUNT: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 하나: 1, 둘: 2 };

function quotedSpans(text: string, koText: KoTextUtil): string[] {
  const spans = [...koText.extractQuotedSpansKo(text)];
  const doubleQuoteRe = /["“]([^"”]{2,60})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = doubleQuoteRe.exec(text)) !== null) spans.push(m[1].trim());
  return spans.map((s) => s.replace(/^[~…\-]+/, "").trim()).filter(Boolean);
}

function parseCondition(text: string, koText: KoTextUtil): ParsedCondition {
  const quoted = quotedSpans(text, koText);
  const hasEnding = ENDING_KEYWORD_RE.test(text) && quoted.length > 0;
  const hasInclude = /(포함|사용할 것|넣을 것|반드시 쓸 것)/.test(text);
  const ending = hasEnding ? quoted[0].replace(/[.!?…\s]+$/, "") : null;
  const includeWords = hasInclude ? (hasEnding ? quoted.slice(1) : quoted) : [];
  const sm = /(한|두|세|네|다섯|하나|둘|[0-9]+)\s*문장/.exec(text);
  const count = sm ? (KOREAN_COUNT[sm[1]] ?? Number(sm[1])) : NaN;
  const sentence = Number.isFinite(count) && count > 0
    ? { count, atMost: /(이내|이하)/.test(text) }
    : null;
  return { text, quoted, ending, includeWords, sentence };
}

/** 답안이 형식 조건을 충족하는지 — 실패 사유 목록 반환 (빈 배열 = 전부 충족). */
function answerConditionFailures(
  answer: string,
  conditions: ParsedCondition[],
  koText: KoTextUtil,
): string[] {
  const failures: string[] = [];
  const base = answer.trim().replace(/['"’”」』\s]+$/, "").replace(/[.!?…\s]+$/, "");
  for (const c of conditions) {
    if (c.ending && !base.endsWith(c.ending)) {
      failures.push(`종결 조건 '${c.ending}' 미충족 (답안 끝: "…${base.slice(-12)}")`);
    }
    for (const word of c.includeWords) {
      if (!koText.containsSpanKo(answer, word)) {
        failures.push(`포함 단어 '${word}' 미포함`);
      }
    }
    if (c.sentence) {
      const n = koText.splitSentencesKo(answer).length;
      const ok = c.sentence.atMost ? n <= c.sentence.count : n === c.sentence.count;
      if (!ok) {
        failures.push(
          `문장 수 조건(${c.sentence.count}문장${c.sentence.atMost ? " 이내" : ""}) 미충족 — 실제 ${n}문장`,
        );
      }
    }
  }
  return failures;
}

const TOKEN_DROP = new Set(["것", "할", "쓸", "및", "또는", "모두", "맞게", "반드시", "위해", "대한", "대해"]);
const TRAILING_PARTICLE_RE = /(으로써|이라는|라는|에서|에게|으로|와|과|을|를|이|가|은|는|의|에|로|도|만)$/;

/** 조건 문면의 내용 어절(조사 제거, 2자 이상)을 뽑는다 — rubric 매핑 폴백용. */
function contentTokens(text: string): string[] {
  return text
    .replace(/['"‘’“”]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[^가-힣a-zA-Z0-9]/g, ""))
    .map((t) => t.replace(TRAILING_PARTICLE_RE, ""))
    .filter((t) => t.length >= 2 && !TOKEN_DROP.has(t));
}

/** 조건 1개가 rubric 항목 중 최소 1곳에 반영됐는지 (인용·키워드·내용 어절 기준). */
function conditionMappedToRubric(cond: ParsedCondition, itemTexts: string[]): boolean {
  if (cond.quoted.some((q) => itemTexts.some((item) => item.includes(q)))) return true;
  if (
    cond.ending &&
    itemTexts.some((item) => item.includes(cond.ending as string) || /형식|끝맺|종결|맺음/.test(item))
  ) {
    return true;
  }
  if (cond.includeWords.length > 0 && itemTexts.some((item) => /포함/.test(item))) return true;
  if (cond.sentence && itemTexts.some((item) => /문장/.test(item))) return true;
  const tokens = contentTokens(cond.text);
  return tokens.length > 0 && itemTexts.some((item) => tokens.some((t) => item.includes(t)));
}

// ---------------------------------------------------------------------------
// validate — 유형 특화 결정론 게이트
// (공통 게이트: 근거앵커 verbatim·마커 해소·발문 기본 문법은 dispatch 선실행 — 중복 금지)
// ---------------------------------------------------------------------------

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";

  // --- (1) 발문 골격 — '조건' 지시 + '~서술하시오.' 종결 -------------------
  if (!direction.includes("조건")) {
    add(
      "error",
      "ko-direction-grammar",
      '조건 제시형 발문에 \'조건\' 지시가 없습니다 — "…<조건>에 맞게 서술하시오." 골격을 지켜야 합니다',
    );
  }
  if (!/(서술하시오|쓰시오)\.?\s*$/.test(direction.trim())) {
    add("error", "ko-direction-grammar", "조건 서술형 발문은 '~서술하시오.'/'~쓰시오.' 로 종결해야 합니다");
  }

  // --- (2) 마커 규율 — KOR_CIRCLED 0~1개 + 발문 라벨 상호 정합(고아 금지) --
  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  if (markers.length > 1) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `마커가 ${markers.length}개 — 조건 서술형은 발문 지시용 ㉠계열 마커 1개까지만 허용됩니다`,
    );
  }
  const markerLabels = new Set(
    markers.map((m) => (typeof m.label === "string" ? m.label : "")).filter(Boolean),
  );
  for (const m of markers) {
    const family = typeof m.family === "string" ? m.family : "";
    if (family !== "KOR_CIRCLED") {
      add(
        "error",
        "ko-marker-option-mismatch",
        `마커 패밀리 ${family || "(없음)"} — 조건 서술형의 발문 지시는 ㉠계열(KOR_CIRCLED)만 사용합니다`,
      );
    }
    const label = typeof m.label === "string" ? m.label : "";
    if (label && !direction.includes(label)) {
      add("error", "ko-marker-option-mismatch", `마커 ${label} 가 발문에서 지시되지 않습니다 — 고아 마커`);
    }
  }
  for (const label of KOR_CIRCLED_LABELS) {
    if (direction.includes(label) && !markerLabels.has(label)) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `발문이 ${label} 를 지시하지만 markers 에 해당 마커가 없습니다 — 지문에 마킹되지 않는 지시`,
      );
    }
  }

  // --- (3) essay 구조 결손 (조건·모범답안·rubric 은 의무 산출물) ----------
  const essay =
    question.essay && typeof question.essay === "object"
      ? (question.essay as Record<string, unknown>)
      : null;
  if (!essay) {
    add("error", "ko-condition-rubric-mismatch", "essay(<조건>+답안 세트)가 없습니다 — 조건 서술형 필수 산출물");
    return issues;
  }
  const conditions = Array.isArray(essay.conditions)
    ? (essay.conditions as unknown[]).filter(
        (c): c is string => typeof c === "string" && c.trim().length > 0,
      )
    : [];
  const sheet =
    essay.answerSheet && typeof essay.answerSheet === "object"
      ? (essay.answerSheet as Record<string, unknown>)
      : null;
  const model = sheet && typeof sheet.model === "string" ? sheet.model.trim() : "";
  const rubric: { item: string; points: number }[] = [];
  if (sheet && Array.isArray(sheet.rubric)) {
    for (const raw of sheet.rubric) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      if (typeof r.item === "string" && typeof r.points === "number") {
        rubric.push({ item: r.item, points: r.points });
      }
    }
  }

  if (conditions.length < 2) {
    add(
      "error",
      "ko-condition-rubric-mismatch",
      `<조건>이 ${conditions.length}개 — 내용 조건 + 형식 조건 조합으로 최소 2개가 필요합니다`,
    );
  }
  if (!model) {
    add("error", "ko-correct-answer-invalid", "모범답안(answerSheet.model)이 비어 있습니다");
  }
  if (rubric.length === 0) {
    add("error", "ko-condition-rubric-mismatch", "채점기준표(rubric)가 비어 있습니다 — 내신 서답형 의무 산출물");
  }

  // --- (4) <조건> 문면 — '~할 것' 명사형 종결 관행 ------------------------
  for (const c of conditions) {
    const trimmed = c.trim().replace(/[.。]$/, "");
    if (!trimmed.endsWith("것")) {
      add(
        "warning",
        "ko-option-ending",
        `<조건> "${trimmed.slice(0, 24)}" 이 '~할 것' 명사형으로 끝나지 않습니다 — 내신 조건 표기 관행 위반`,
      );
    }
  }

  const parsed = conditions.map((c) => parseCondition(c, ctx.koText));

  // --- (5) 형식 조건 기계 검증 — 모범답안(error)·인정답안(warning) --------
  if (model) {
    for (const failure of answerConditionFailures(model, parsed, ctx.koText)) {
      add("error", "ko-condition-rubric-mismatch", `모범답안이 형식 조건을 충족하지 않습니다: ${failure}`);
    }
    const accepted =
      sheet && Array.isArray(sheet.accepted)
        ? (sheet.accepted as unknown[]).filter(
            (a): a is string => typeof a === "string" && a.trim().length > 0,
          )
        : [];
    accepted.forEach((answer, i) => {
      for (const failure of answerConditionFailures(answer, parsed, ctx.koText)) {
        add(
          "warning",
          "ko-condition-rubric-mismatch",
          `인정답안 ${i + 1}이 형식 조건을 충족하지 않습니다: ${failure} — 표현 차이만 허용, 형식 조건은 인정답안도 준수`,
        );
      }
    });
  }

  // --- (6) 조건↔rubric 전수 매핑 (미매핑 조건 = 채점 불가 공중 조건) ------
  if (rubric.length > 0) {
    const itemTexts = rubric.map((r) => r.item);
    parsed.forEach((cond, i) => {
      if (!conditionMappedToRubric(cond, itemTexts)) {
        add(
          "error",
          "ko-condition-rubric-mismatch",
          `<조건> ${i + 1}("${cond.text.slice(0, 24)}")이 채점기준(rubric) 어느 항목에도 반영되지 않았습니다`,
        );
      }
    });
  }

  // --- (7) 배점 정합 — rubric 합계 = points([n점] 표기의 원천) ------------
  const effectivePoints = typeof question.points === "number" ? question.points : 5;
  for (const r of rubric) {
    if (r.points <= 0) {
      add(
        "error",
        "ko-condition-rubric-mismatch",
        `rubric 항목 "${r.item.slice(0, 20)}" 배점 ${r.points} — 0 이하 배점 금지`,
      );
    }
  }
  const rubricSum = rubric.reduce((acc, r) => acc + r.points, 0);
  if (rubric.length > 0 && Math.abs(rubricSum - effectivePoints) > 1e-9) {
    add(
      "error",
      "ko-condition-rubric-mismatch",
      `rubric 배점 합계 ${rubricSum}점 ≠ 문항 배점 ${effectivePoints}점 — 내신 [n점] 표기는 rubric 합계와 일치해야 합니다`,
    );
  }
  if (typeof question.points === "number" && (question.points < 4 || question.points > 10)) {
    add("warning", "ko-points-unusual", `배점 ${question.points}점 — 내신 조건 서술형 관행(4~10점) 밖입니다`);
  }

  // --- (8) 정답 누출 — 발문·<보기>·<조건>에 모범답안 연속 3어절 노출 금지 --
  //     (공통 누출 게이트와 별개로, 이 유형은 조건 문면이 답 구절을 그대로
  //      옮겨 적는 사고가 최빈 결함이라 유형 게이트로 이중 방어)
  if (model) {
    const bogi =
      question.bogi && typeof question.bogi === "object"
        ? (question.bogi as Record<string, unknown>)
        : null;
    const bogiLines =
      bogi && Array.isArray(bogi.lines)
        ? (bogi.lines as unknown[]).filter((l): l is string => typeof l === "string")
        : [];
    const haystack = [direction, ...bogiLines, ...conditions].join("\n");
    const eojeols = model.split(/\s+/).filter(Boolean);
    for (let i = 0; i + 3 <= eojeols.length; i++) {
      const window = eojeols.slice(i, i + 3).join(" ");
      if (ctx.koText.containsSpanKo(haystack, window)) {
        add(
          "error",
          "ko-answer-leak",
          `발문·자료·<조건>에 모범답안 구절("${window}")이 노출되었습니다 — 정답 누출`,
        );
        break;
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings, difficulty: KoDifficulty): string {
  const lines: string[] = [];

  const focus = settings.targetFocus;
  if (focus === "EMOTION") {
    lines.push(
      '- 서술 대상: 화자·인물의 정서/심리. 발문은 "㉠에 담긴 화자의 정서를 <조건>에 맞게 서술하시오." 골격으로.',
    );
  } else if (focus === "REASON") {
    lines.push(
      "- 서술 대상: 이유·근거. 발문은 \"…한 이유를 <조건>에 맞게 서술하시오.\" 골격 — 종결 조건은 \"'~때문이다'로 끝맺을 것\" 이 정석이다.",
    );
  } else if (focus === "MEANING") {
    lines.push('- 서술 대상: 구절의 함축적 의미. 발문은 "㉠의 함축적 의미를 <조건>에 맞게 서술하시오." 골격으로.');
  } else if (focus === "THEME") {
    lines.push("- 서술 대상: 주제·글쓴이의 깨달음. 무마커형 발문을 우선하고 내용 조건으로 핵심 개념 포함을 강제하라.");
  } else {
    lines.push("- 서술 대상은 지문에서 가장 응축된 지점(정서/이유/의미/주제)을 자동 선택하라.");
  }

  const markerUse = settings.markerUse;
  if (markerUse === "ON") {
    lines.push("- 발문은 반드시 ㉠ 마커 지시형 — markers 에 KOR_CIRCLED 마커 1개(지문 verbatim 스팬)를 등록하라.");
  } else if (markerUse === "OFF") {
    lines.push("- 마커 없이 출제하라 — 발문이 서술 대상을 작은따옴표 인용으로 직접 명명한다. markers 생략.");
  } else {
    lines.push("- 서술 대상이 특정 구절에 응축돼 있으면 ㉠ 마커 지시형을, 지문 전체에 걸치면 무마커 직접 명명형을 선택하라.");
  }

  const sentenceLimit = settings.sentenceLimit;
  if (sentenceLimit === "ONE") {
    lines.push('- <조건>에 "한 문장으로 쓸 것" 을 포함하고 모범답안도 정확히 한 문장으로 작성하라.');
  } else if (sentenceLimit === "TWO") {
    lines.push('- <조건>에 "두 문장 이내로 쓸 것" 을 포함하라.');
  } else if (sentenceLimit === "FREE") {
    lines.push("- 문장 수 조건은 넣지 마라 — 종결 형태·포함 단어 조건으로 형태를 통제하라.");
  } else {
    lines.push('- 문장 수 조건은 답안 분량에 맞게 선택하라 (기본: "한 문장으로 쓸 것").');
  }

  if (difficulty === "BASIC") {
    lines.push(
      "- 난이도 기본: 조건 2개(내용 조건 1 — 단일 요소 + 형식 조건 1). 서술 대상은 지문 표면에 직접 드러난 지점으로. 모범답안 한 문장.",
    );
  } else if (difficulty === "KILLER") {
    lines.push(
      "- 난이도 킬러: 조건 3~4개 — 내용 조건이 두 요소(예: 정서 + 그 이유)를 동시 요구하고, 형식 조건 2개(종결 형태 + 포함 단어 2개). 근거가 지문 두 곳 이상의 결합이어야 답이 나오게 하고, rubric 은 내용 요소별로 배점을 세분하라. 인정답안 경계는 좁게.",
    );
  } else {
    lines.push(
      "- 난이도 중급: 조건 3개(내용 조건 1 + 형식 조건 2 — 종결 형태와 포함 단어 또는 문장 수). 근거 결합이 마커 앞뒤 맥락 2~3문장에 걸치게 하라.",
    );
  }

  if (settings.examMode === "SUNEUNG") {
    lines.push(
      "- 수능형 모드: 이 유형은 수능 미출제 내신 시그니처다 — 학평 서답형·수행평가 문체로 출제하되, 지문 내적 근거만으로 채점 가능해야 하며 배경지식·개인 경험 요구는 금지. 발문·조건은 평가원식 간결·중립 문체로.",
    );
  } else {
    lines.push(
      "- 내신 모드(기본): 수업에서 강조될 법한 해석 지점(주제 응축 구절·핵심 정서·필자 주장의 이유)에서 출제하라. 조건은 채점 시비를 차단하도록 전부 기계 검증 가능한 문면(검사 문자열 따옴표 명시)으로 쓰고, 배점 [n점]은 rubric 합계와 일치시키는 것이 내신 표기 관행이다.",
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// module
// ---------------------------------------------------------------------------

export const KO_NS_COND: KoTypeModule = {
  meta: {
    typeId: "KO_NS_COND",
    area: "NAESIN",
    label: "조건 제시형 서술형",
    formatCategory: "서술형",
    uiGroup: "국어 서답형",
    answerFormat: "ESSAY",
    includesPassage: true,
    passageKinds: [
      "READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART",
      "LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL",
      "LIT_ESSAY", "LIT_PLAY", "MIXED",
    ],
    defaultPoints: 5,
    usesBogi: "optional",
    markerFamilies: ["KOR_CIRCLED"],
    optionEnding: "any",
    needsSolverGate: false,
    description:
      "<조건>(내용+형식 요소) 충족 서술 + 모범답안·인정답안·채점기준표 동시 산출 — 조건↔루브릭 정합을 결정론 검증하는 내신 서답형 시그니처",
    setSlot: "내신 혼합 세트 마지막 서답형 슬롯(고배점·킬러) — 서·논술형 의무 구간(시도별 30%±)의 주력",
    studentTask:
      "㉠(또는 지정 대상)에 대해 <조건>의 내용·형식 제약을 모두 충족하는 1~3문장 답안을 서술합니다.",
    bestFor: ["내신 서·논술형 의무 구간 대비", "정서·이유·의미가 응축된 문학 구절", "필자 주장·이유가 명시된 비문학 지문"],
    outputUi: ["지문 동봉(㉠ 마킹 가능)", "<조건> 박스(• 불릿)", "모범답안·인정답안·채점기준표(교사용)"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "targetFocus",
        label: "서술 대상",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 특성)" },
          { value: "EMOTION", label: "화자·인물의 정서/심리" },
          { value: "REASON", label: "이유·근거" },
          { value: "MEANING", label: "구절의 함축적 의미" },
          { value: "THEME", label: "주제·깨달음" },
        ],
        defaultValue: "AUTO",
        description: "무엇을 서술하게 할지 — 정서형이 내신 최빈, 이유형은 '~때문이다' 종결 조건과 짝",
      },
      {
        key: "markerUse",
        label: "마커(㉠) 지시",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동" },
          { value: "ON", label: "㉠ 마커 지시형" },
          { value: "OFF", label: "무마커(직접 명명)" },
        ],
        defaultValue: "AUTO",
      },
      {
        key: "sentenceLimit",
        label: "문장 수 조건",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동" },
          { value: "ONE", label: "한 문장" },
          { value: "TWO", label: "두 문장 이내" },
          { value: "FREE", label: "제한 없음" },
        ],
        defaultValue: "AUTO",
        description: "형식 조건 중 문장 수 제약 — 시스템이 모범답안 문장 수를 기계 검증합니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    // 내신 서답형은 전 문항 [n점] 표기 관행 — examMode NAESIN 고정 전달.
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: true,
      answerFormat: "ESSAY",
      defaultPoints: 5,
      examMode: "NAESIN",
    });
  },
  difficultyGuide: {
    BASIC:
      "조건 2개(내용 1 + 형식 1). 서술 대상은 지문 표면에 직접 드러난 정서·이유로, 모범답안은 한 문장. rubric 은 내용/형식 2항목.",
    INTERMEDIATE:
      "조건 3개(내용 1 + 형식 2: 종결 형태 + 포함 단어). ㉠ 마커 지시형을 기본으로, 판정 근거가 마커 앞뒤 맥락 2~3문장의 결합이 되게 하라.",
    KILLER:
      "조건 3~4개 — 내용 조건이 두 요소(정서 + 그 이유/대상)를 동시 요구, 포함 단어 2개. 근거를 지문 두 곳 이상에 분산시키고 rubric 을 내용 요소별로 세분하라. 인정답안 경계는 필수 요소 유지 선에서 좁게.",
  },
};
