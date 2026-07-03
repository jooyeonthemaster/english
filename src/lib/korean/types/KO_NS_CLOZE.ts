// ============================================================================
// KO_NS_CLOZE — 내신 서답형: 작품 암기형(빈칸 복원·단답 발췌)
// ============================================================================
// 카탈로그 §2.7 + KO-DESIGN-SPEC §5 사양의 전면 구현. 수능에는 부재하는 내신
// 서답형 최다 유형군 — 원문 일부를 빈칸으로 복원시키거나(BLANK), 발문 지시에
// 맞는 시어·구절을 본문에서 찾아 쓰게 한다(FIND). 채점은 원문 완전 일치.
//
// 실측 관행 근거(카탈로그 §2.7·§3.5·§4):
//   발문: "빈칸에 들어갈 시구를 쓰시오." / "윗글에서 '○○'을 의미하는 시어를 찾아 쓰시오."
//   채점 = 원문 완전 일치(맞춤법·띄어쓰기 포함). 고전은 원문↔현대어 양방향.
//   내신 서답형은 별도 번호 체계(서술형 1~n)로 시험지 후반 배치, 전 문항 배점 표기.
//   빈칸 표기 규약: "(        )" 고정(여는 괄호+공백 8칸+닫는 괄호) — 언더스코어 금지.
//
// 결정론 검증(validate) — 공통 게이트의 ko-answer-leak 는 이 유형(KO_NS_CLOZE)을
// <보기> 검사에서 예외 처리하므로(quality/common.ts) 보기 정답 누출을 여기서
// 자체 수행한다:
//   (1) answerSpan 지문 verbatim + correctAnswer ↔ answerSpan 정합
//   (2) BLANK: <보기> 필수 + 빈칸 토큰 정확 1개 + sourceExcerpt 지문 verbatim
//       + 빈칸 복원 정합(빈칸에 정답을 되넣으면 sourceExcerpt 가 복원)
//       + 빈칸 아닌 위치 정답 노출 = ko-answer-leak
//   (3) FIND: 발문 '○○' 지시 어구 실재(지문 verbatim) + 지시 어구의 정답 노출 차단
// ============================================================================

import { z } from "zod";
import { koQuestionEnvelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { containsSpanKo, findSpanKo, normalizeKo } from "../core/ko-text";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

/** 빈칸 표기 규약 — 여는 괄호 + 공백 8칸 + 닫는 괄호 (KO 빈칸 단일 규약, 언더스코어 금지). */
const BLANK_TOKEN = "(        )";
/** 검증은 공백 2칸 이상을 빈칸 토큰으로 관용 인식한다 (LLM 공백 수 흔들림 흡수). */
const BLANK_TOKEN_RE = /\(\s{2,}\)/;
const BLANK_TOKEN_RE_G = /\(\s{2,}\)/g;

const schema = koQuestionEnvelope({
  clozeMode: z
    .enum(["BLANK", "FIND"])
    .describe(
      "출제 모드 — BLANK: 원문 발췌를 <보기>로 인용하고 정답 구간을 '(        )' 빈칸 처리(bogi 필수), FIND: 본문에서 찾아 쓰기(bogi 없음, 발문에 '○○' 작은따옴표 지시 어구 필수)",
    ),
  clozeSpec: z.object({
    sourceExcerpt: z
      .string()
      .min(2)
      .describe(
        "원문 발췌 — 빈칸 적용 전의 지문 원문 verbatim(한 글자·조사·띄어쓰기도 변경 금지). BLANK 모드는 이 발췌에서 answerSpan 을 빈칸 처리해 <보기>를 만든다. FIND 모드는 정답 구간이 위치한 행·문장의 앞뒤 문맥을 담는다",
      ),
    answerSpan: z
      .string()
      .min(1)
      .describe(
        "정답 구간 — sourceExcerpt 안에 그대로 들어 있는 지문 verbatim 시어·시구·구절. correctAnswer 와 완전히 동일해야 한다(원문 완전 일치 채점의 기준값)",
      ),
  }),
});

const prompt = `### 유형: 내신 서답형 — 작품 암기형(빈칸 복원·단답 발췌)

**성격**: 수능에는 없는 내신 전용 서답형(내신 서답형 최다 유형군). 원문 일부의 복원 또는
기능·의미를 지닌 시어의 발췌를 요구하며, **채점은 원문 완전 일치(맞춤법·띄어쓰기 포함)**다.
객관식 선지가 없으므로 문항의 성패는 "정답이 원문 기준으로 유일하게 특정되는가"에 달려 있다.
운문이면 '시구/시어', 산문(소설·수필·극)이면 '구절/단어'로 지칭어를 맞춰라.

**발문 템플릿** (clozeMode 에 따라 정확히 이 형태로 — 반드시 '~쓰시오.' 종결):
- BLANK: "빈칸에 들어갈 시구를 쓰시오." / "<보기>의 빈칸에 들어갈 시어를 원문 그대로 쓰시오."
  (산문이면 "빈칸에 들어갈 구절을 원문 그대로 쓰시오.")
- FIND: "윗글에서 '○○'을 의미하는 시어를 찾아 쓰시오." / "윗글에서 '○○'과 대비되는 시어를 찾아 그대로 쓰시오."
  '○○' 자리에는 **지문에 실재하는 어구를 작은따옴표로 인용**하라 — 지문에 없는 자유 서술
  개념어 금지(시스템이 지문 실재를 결정론 검증해 불합격 처리한다).

**clozeSpec 작성법**:
1. sourceExcerpt = 지문 원문 그대로의 발췌(빈칸 적용 전). 정답 구간이 포함된 행·문장을
   중심으로 1~3행(문장) — 복원의 문맥 단서가 되므로 통째 복사하되 한 글자도 바꾸지 마라.
2. answerSpan = sourceExcerpt 안의 정답 구간. 시어(1어절)~시구(2~4어절) 범위가 표준이며,
   correctAnswer 에 **동일한 문자열**을 그대로 넣어라(요약·현대어 변환 금지).

**BLANK 모드 <보기> 구성** (bogi 필수):
1. bogi.lines = sourceExcerpt 에서 answerSpan 자리만 "${BLANK_TOKEN}"(여는 괄호+공백 8칸+닫는
   괄호)로 치환한 것. 행 구분은 원문 그대로 lines 배열로 나눠라.
2. 빈칸은 **정확히 1개**. 언더스코어 빈칸(_____)·네모(□)·㉮ 기호는 이 유형에서 금지.
3. 빈칸 이외의 위치에 정답 구간이 다시 등장하면 안 된다 — 수미상관·후렴구처럼 정답이
   반복되는 작품은 발췌 범위를 좁혀 반복 등장을 피하라(시스템이 노출을 검증해 차단한다).
4. bogi.label 은 "보기".

**FIND 모드 구성** (bogi 없음):
1. 발문의 '○○' 지시 어구가 정답을 유일하게 특정해야 한다. 지시 어구는
   (a) 정답과 의미·기능으로 연결되는 **지문 실재 어구**를 작은따옴표로 인용하고,
   (b) 필요하면 "1연에서/윗글의 앞부분에서/2어절로" 같은 위치·분량 한정을 덧붙여 유일성을 보강하라.
2. 지시 어구에 정답 자체(또는 정답을 포함하는 어구)를 쓰지 마라 — 정답 노출.

**복수 정답·채점 시비 유발 함정 원리 — 반드시 회피(원리별 예시)**:
1. **유사 시어 간섭**: 지문에 같은 의미장의 시어가 여럿이면 지시가 흔들린다.
   (예: '눈'·'서리'가 함께 시련을 상징하는 지문에서 "시련을 의미하는 시어를 찾아 쓰시오"
   → 두 답 모두 성립. 해결: "'매화'와 대비되는 시어" 처럼 관계를 한정하거나 연을 지정)
2. **반복 구절의 위치 모호**: 정답 구간이 발췌 안에 2회 이상 보이면 어느 쪽을 쓸지 갈린다.
   (예: 후렴구 일부를 빈칸 처리하면서 발췌를 넓게 잡아 다른 후렴구가 그대로 노출되는 경우)
3. **기능어 절단**: 조사·어미·접속어만의 빈칸은 암기 확인이 아니라 문법 추측 문제가 된다.
   (예: "산에는 꽃 피네 꽃(  ) 피네"의 조사 빈칸 금지 — 의미를 지닌 시어·시구를 비워라)
4. **어절 경계 위반 절단**: 빈칸 경계가 어절 중간을 자르면 답 표기가 갈린다.
   (예: "나룻배"에서 "룻배"만 빈칸 — 금지. 빈칸은 어절 경계에서 시작·종료)
5. **원문·현대어 표기 혼동(고전)**: 고전시가에서 어느 표기로 쓸지 미지정이면 시비가 난다.
   발문에 "원문 그대로" 또는 "현대어로"를 명시하고 correctAnswer 를 그 표기로 통일하라.

**근거앵커(evidence) 작성**:
- 정답 구간이 위치한 원문 문맥(정답 행과 그 앞뒤 행)을 spanText 로, relation=SUPPORTS.
- FIND 모드는 지시 어구('○○')와 정답을 잇는 근거 구절을 1개 이상 추가하라
  (왜 그 시어가 '○○'을 의미하는지의 원문 근거).

**해설(explanation)**:
- 정답 구간의 의미·기능(왜 이 지점이 핵심인지)을 원문 인용과 함께 서술하고,
- 말미에 반드시 "채점은 원문 완전 일치(맞춤법·띄어쓰기 포함)만 정답으로 인정한다."를 명시하라.
- 유사 시어가 있으면 그것이 왜 답이 될 수 없는지 한 줄 덧붙여라(채점 시비 예방).

**금지**:
- sourceExcerpt·answerSpan·correctAnswer 의 원문 변형(현대어 임의 교체·조사 교정 포함).
- 발문·<보기>에 정답 노출. 언더스코어/네모/㉮ 빈칸. 빈칸 2개 이상.
- 지문에 없는 개념어를 '○○' 지시 어구로 인용(FIND).
- 해석이 갈리는 상징 시어를 지시 한정 없이 요구("화자의 정서를 담은 시어" 단독 — 특정 불가).`;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function readBogiLines(question: Record<string, unknown>): string[] {
  const bogi = question.bogi;
  if (!bogi || typeof bogi !== "object") return [];
  const lines = (bogi as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

/**
 * [KO-LEAK-1] 텍스트 내 answerSpan 의 전 출현을 빈칸 토큰으로 치환한다.
 * findSpanKo 와 동일한 공백 관용 매칭(개행 걸침 허용) — 수미상관·후렴구처럼 정답
 * 구간이 반복되는 작품에 대응해 전역 치환하고, 뒤에서부터 치환해 앞 오프셋을 보존한다.
 */
function maskAnswerSpanKo(
  text: string,
  answerSpan: string,
): { text: string; maskedCount: number } {
  const source = normalizeKo(text);
  const first = findSpanKo(source, answerSpan, 0);
  if (!first) return { text: source, maskedCount: 0 };
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < first.occurrenceTotal; i += 1) {
    const m = findSpanKo(source, answerSpan, i);
    if (!m) continue;
    const prev = ranges[ranges.length - 1];
    if (prev && m.sourceStart < prev.end) continue; // 자기중첩 매치는 앞 매치 우선
    ranges.push({ start: m.sourceStart, end: m.sourceEnd });
  }
  let out = source;
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    out = `${out.slice(0, ranges[i].start)}${BLANK_TOKEN}${out.slice(ranges[i].end)}`;
  }
  return { text: out, maskedCount: ranges.length };
}

/**
 * [KO-LEAK-1] BLANK 모드는 정답 구간이 verbatim 으로 실린 지문을 그대로 출력하면
 * 구조적 정답 누수다 — 검증기(ko-quote-not-verbatim)가 지문 내 존재를 강제하므로
 * 합격 문항 100%에서 정답이 지문 박스에 노출된다. 렌더모델 조립 후 지문 파트의
 * answerSpan 전 출현을 "(        )" 빈칸으로 마스킹하고(실제 내신 관행: 지문 자체에
 * 빈칸), 마스킹이 불가능하면(마커 밑줄이 스팬을 가로지르는 등) 지문 파트를 생략하는
 * 안전 강등을 택한다. FIND 모드는 무변경 — '본문에서 찾아 쓰기'가 유형의 본질이라
 * 지문 노출이 전제다. 4개 렌더 표면(카드·웹 시험지·DOCX·HWPX)이 전부 이 모델만
 * 소비하므로 이 1곳 수정으로 전 표면이 커버된다.
 */
function toRenderModelImpl(
  question: Record<string, unknown>,
  ctx: KoRenderContext,
): KoRenderModel {
  // 내신 전용 유형 — 서답형 배점 전 문항 표기 관행(examMode=NAESIN)을 렌더에 반영한다.
  const model = buildDefaultKoRenderModel({
    question,
    passage: ctx.passage,
    suppressPassage: ctx.suppressPassage,
    includesPassage: true,
    answerFormat: "SHORT",
    defaultPoints: 3,
    examMode: "NAESIN",
  });
  const mode = question.clozeMode === "FIND" ? "FIND" : "BLANK";
  if (mode !== "BLANK" || !model.passage) return model;

  const spec =
    question.clozeSpec && typeof question.clozeSpec === "object"
      ? (question.clozeSpec as Record<string, unknown>)
      : null;
  const answerSpan = spec ? str(spec.answerSpan).trim() : "";
  if (!answerSpan) {
    // 정답 구간을 특정할 수 없으면 마스킹을 보장할 수 없다 — 지문 생략(안전 강등)
    delete model.passage;
    return model;
  }
  let maskedTotal = 0;
  let residual = false;
  for (const part of model.passage.parts) {
    const masked = maskAnswerSpanKo(part.text, answerSpan);
    part.text = masked.text;
    maskedTotal += masked.maskedCount;
    // 밑줄 마크업(__)이 스팬을 끊어 마스킹은 실패했지만 문면에는 정답이 남는 경우 검출
    if (containsSpanKo(masked.text.replace(/__+/g, ""), answerSpan)) residual = true;
  }
  if (maskedTotal === 0 || residual) delete model.passage;
  return model;
}

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const mode = settings.clozeMode === "FIND" ? "FIND" : "BLANK";
  if (mode === "FIND") {
    lines.push(
      "- clozeMode=FIND 로 출제하라: bogi 없이, 발문의 작은따옴표 지시 어구('○○' — 지문 실재 verbatim)로 본문에서 찾아 쓰게 하라.",
    );
  } else {
    lines.push(
      `- clozeMode=BLANK 로 출제하라: 원문 발췌를 <보기>로 인용하고 정답 구간만 "${BLANK_TOKEN}" 빈칸 1개로 치환하라(bogi 필수).`,
    );
  }
  if (settings.answerUnit === "WORD") {
    lines.push("- 정답 단위: 시어·단어(1어절)로 한정하라.");
  } else if (settings.answerUnit === "PHRASE") {
    lines.push("- 정답 단위: 시구·구절(2~4어절)로 한정하라.");
  }
  if (settings.examMode === "SUNEUNG") {
    // 이 유형은 수능에 부재 — 수능 모드가 와도 내신 서답형 규약을 유지하되 소재 밀도만 올린다.
    lines.push(
      "- 주의: 이 유형은 수능에 부재하는 내신 전용 서답형이다. 수능형 세트에 편성되더라도 내신 서답형 규약(원문 완전 일치 채점·배점 표기·'~쓰시오.' 종결)을 그대로 유지하고, 정답 구간은 수능 연계 교재가 강조할 법한 주제 응축부에서 골라라.",
    );
  } else {
    lines.push(
      "- 내신 모드(기본): 수업에서 강조되는 주제 응축부·상징 시어·핵심 구절을 정답 구간으로 골라라. 고전 지문이면 원문 표기 그대로 쓰게 하고(원문↔현대어 양방향 출제 가능), 발문에 표기 기준('원문 그대로'/'현대어로')을 명시하라.",
    );
  }
  return lines.join("\n");
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });
  const { koText } = ctx;

  const direction = str(question.direction);
  const correctAnswer = str(question.correctAnswer).trim();
  const mode = question.clozeMode === "FIND" ? "FIND" : "BLANK";
  const spec =
    question.clozeSpec && typeof question.clozeSpec === "object"
      ? (question.clozeSpec as Record<string, unknown>)
      : null;
  const sourceExcerpt = spec ? str(spec.sourceExcerpt) : "";
  const answerSpan = spec ? str(spec.answerSpan).trim() : "";

  // ── 발문 종결: 서답형은 '~쓰시오.' (공통 게이트의 '~것은?' 허용을 좁힌다) ──
  if (!/쓰시오\.?\s*$/.test(direction.trim())) {
    add("error", "ko-direction-grammar", `작품 암기형 발문은 '~쓰시오.' 로 종결해야 합니다: "${direction.slice(0, 40)}"`);
  }

  if (!answerSpan) {
    add("error", "ko-correct-answer-invalid", "clozeSpec.answerSpan(정답 구간)이 비어 있습니다 — 원문 완전 일치 채점 불가");
  }

  // ── (1) 정답 구간 지문 verbatim + correctAnswer 정합 ──────────────────
  if (answerSpan && !koText.containsSpanKo(ctx.passage, answerSpan)) {
    add(
      "error",
      "ko-quote-not-verbatim",
      `정답 구간이 지문 원문에 없습니다(verbatim 위반): "${answerSpan.slice(0, 40)}"`,
    );
  }
  if (answerSpan && correctAnswer) {
    const identical =
      koText.containsSpanKo(answerSpan, correctAnswer) &&
      koText.containsSpanKo(correctAnswer, answerSpan);
    if (!identical) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `correctAnswer("${correctAnswer.slice(0, 30)}")가 clozeSpec.answerSpan("${answerSpan.slice(0, 30)}")과 다릅니다 — 채점 기준값이 이원화되면 원문 완전 일치 채점이 깨집니다`,
      );
    }
  }

  const bogiLines = readBogiLines(question);
  const bogiText = bogiLines.join("\n");

  if (mode === "BLANK") {
    // ── (2) BLANK: 발문 형식 + <보기> 필수 + 빈칸 토큰 + 발췌 정합 + 누출 ──
    if (!/들어갈/.test(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        `BLANK 모드 발문은 "빈칸에 들어갈 ~을(를) 쓰시오." 템플릿이어야 합니다: "${direction.slice(0, 40)}"`,
      );
    }
    if (bogiLines.length === 0) {
      add("error", "ko-bogi-missing", "BLANK 모드는 원문 발췌 <보기>(bogi)가 필수입니다");
    }
    if (!sourceExcerpt) {
      add("error", "ko-quote-not-verbatim", "clozeSpec.sourceExcerpt(빈칸 적용 전 원문 발췌)가 비어 있습니다");
    } else if (!koText.containsSpanKo(ctx.passage, sourceExcerpt)) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `원문 발췌(sourceExcerpt)가 지문과 다릅니다(verbatim 위반): "${sourceExcerpt.slice(0, 40)}"`,
      );
    }
    if (sourceExcerpt && answerSpan && !koText.containsSpanKo(sourceExcerpt, answerSpan)) {
      add(
        "error",
        "ko-quote-not-verbatim",
        "정답 구간(answerSpan)이 원문 발췌(sourceExcerpt) 안에 없습니다 — 빈칸을 만들 수 없습니다",
      );
    }
    const blankCount = (bogiText.match(BLANK_TOKEN_RE_G) ?? []).length;
    if (bogiLines.length > 0) {
      if (blankCount === 0) {
        add(
          "error",
          "ko-bogi-missing",
          `<보기>에 빈칸 토큰 "${BLANK_TOKEN}" 이 없습니다 — BLANK 모드는 정답 구간을 괄호+공백 빈칸으로 치환해야 합니다(언더스코어 금지)`,
        );
      } else if (blankCount > 1) {
        add("error", "ko-bogi-missing", `<보기>의 빈칸이 ${blankCount}개입니다 — 정확히 1개여야 합니다`);
      }
    }
    // 빈칸 복원 정합: 빈칸에 정답을 되넣으면 sourceExcerpt(지문 verbatim)가 복원되어야 한다.
    if (blankCount === 1 && sourceExcerpt && answerSpan) {
      const restored = bogiText.replace(BLANK_TOKEN_RE, answerSpan);
      if (!koText.containsSpanKo(restored, sourceExcerpt)) {
        add(
          "error",
          "ko-quote-not-verbatim",
          "<보기>의 빈칸 문맥이 원문 발췌와 정합하지 않습니다 — 빈칸에 정답을 되넣어도 sourceExcerpt 가 복원되지 않습니다(보기 인용이 원문에서 변형됨)",
        );
      }
    }
    // 정답 누출: 공통 게이트(ko-answer-leak)가 이 유형의 <보기>를 예외 처리하므로 자체 검사.
    // 빈칸 토큰을 제거한 나머지 보기에 정답 구간이 등장하면 누출이다.
    if (answerSpan && bogiText) {
      const blankRemoved = bogiText.replace(BLANK_TOKEN_RE_G, " ");
      if (koText.containsSpanKo(blankRemoved, answerSpan)) {
        add(
          "error",
          "ko-answer-leak",
          `<보기>의 빈칸 아닌 위치에 정답 구간("${answerSpan.slice(0, 30)}")이 노출되어 있습니다 — 발췌 범위를 좁혀 반복 등장을 피하세요`,
        );
      }
    }
    // [렌더 결정론 게이트 — KO-LEAK-1] BLANK 렌더 지문에 정답 구간 잔존 금지.
    // toRenderModel 의 마스킹이 실패하면 지문이 통째로 생략(안전 강등)되어 문항이
    // 훼손되므로 생성 시점에 차단하고, 마스킹 후 잔존(마크업 간섭 등)도 함께 차단한다.
    if (answerSpan && ctx.passage && koText.containsSpanKo(ctx.passage, answerSpan)) {
      const rendered = toRenderModelImpl(question, { passage: ctx.passage });
      const parts = rendered.passage?.parts ?? [];
      if (parts.length === 0) {
        add(
          "error",
          "ko-answer-leak",
          "BLANK 모드 지문 마스킹 실패 — 렌더 지문에서 정답 구간을 빈칸 처리할 수 없어 지문이 생략됩니다(마커가 정답 구간을 가로지르는지 확인하세요)",
        );
      } else if (
        parts.some((p) => koText.containsSpanKo(p.text.replace(/__+/g, ""), answerSpan))
      ) {
        add(
          "error",
          "ko-answer-leak",
          "렌더 지문에 정답 구간이 잔존합니다 — BLANK 모드 마스킹 결정론 게이트 위반",
        );
      }
    }
  } else {
    // ── (3) FIND: 발문 형식 + '○○' 지시 어구 지문 실재 + 정답 노출 차단 ──
    if (!/찾아/.test(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        `FIND 모드 발문은 "윗글에서 '○○'을 ~하는 …를 찾아 쓰시오." 템플릿이어야 합니다: "${direction.slice(0, 40)}"`,
      );
    }
    const quoted = koText.extractQuotedSpansKo(direction).filter((q) => q.length >= 2);
    if (quoted.length === 0) {
      add(
        "error",
        "ko-direction-grammar",
        "FIND 모드 발문에 작은따옴표 지시 어구('○○')가 없습니다 — 정답을 특정하는 지문 실재 어구를 인용해야 합니다",
      );
    }
    for (const q of quoted) {
      if (!koText.containsSpanKo(ctx.passage, q)) {
        add(
          "error",
          "ko-quote-not-verbatim",
          `발문 지시 어구 '${q.slice(0, 30)}' 가 지문에 없습니다 — FIND 모드 지시 어구는 지문 실재 verbatim 이어야 합니다`,
        );
      }
      if (answerSpan && answerSpan.length >= 2 && koText.containsSpanKo(q, answerSpan)) {
        add(
          "error",
          "ko-answer-leak",
          `발문 지시 어구 '${q.slice(0, 30)}' 에 정답 구간("${answerSpan.slice(0, 20)}")이 노출되어 있습니다`,
        );
      }
    }
    // FIND 는 <보기> 불요 — 만약 있다면 정답 누출만 자체 검사(공통 게이트 예외의 보전).
    if (answerSpan && bogiText && koText.containsSpanKo(bogiText, answerSpan)) {
      add("error", "ko-answer-leak", "<보기>에 정답 구간이 그대로 노출되어 있습니다");
    }
  }

  // ── 서답형 근거앵커 verbatim (공통 게이트는 MC5 에서만 검사) ──────────
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  for (const e of evidence) {
    const span = str(e.spanText);
    if (span && !koText.containsSpanKo(ctx.passage, span)) {
      add(
        "error",
        "ko-evidence-not-in-passage",
        `근거 스팬이 지문에 없습니다(verbatim 위반): "${span.slice(0, 40)}"`,
      );
    }
  }

  return issues;
}

export const KO_NS_CLOZE: KoTypeModule = {
  meta: {
    typeId: "KO_NS_CLOZE",
    area: "NAESIN",
    label: "작품 암기(빈칸·단답)",
    formatCategory: "서술형",
    uiGroup: "국어 서답형",
    answerFormat: "SHORT",
    includesPassage: true,
    passageKinds: [
      "LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL", "LIT_ESSAY", "LIT_PLAY", "MIXED",
    ],
    defaultPoints: 3,
    usesBogi: "optional", // BLANK 모드만 필수 — 모드별 강제는 validate 가 수행
    markerFamilies: [],
    optionEnding: "any",
    needsSolverGate: false,
    description:
      "내신 전용 작품 암기형 서답형 — 원문 발췌의 빈칸 복원(BLANK) 또는 지시 어구로 시어·구절 찾아 쓰기(FIND), 원문 완전 일치 채점",
    setSlot: "내신 서답형 슬롯(서술형 1~n 별도 번호 체계, 시험지 후반 배치) — 수능 부재, 내신 서답형 최다 유형군",
    studentTask:
      "원문 발췌의 빈칸에 들어갈 시구를 원문 그대로 복원하거나, 발문 지시에 맞는 시어·구절을 본문에서 찾아 씁니다(맞춤법 포함 완전 일치 채점).",
    bestFor: ["내신 범위 시·시가의 핵심 시구 암기 확인", "고전시가 원문 표기 암기(원문↔현대어)", "수업 강조 구절·상징 시어 점검"],
    outputUi: ["지문 동봉", "BLANK: 원문 발췌 <보기> + (        ) 빈칸", "단답 답안란 — 원문 완전 일치 채점"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "clozeMode",
        label: "출제 모드",
        kind: "select",
        options: [
          { value: "BLANK", label: "빈칸 복원(원문 발췌 보기)" },
          { value: "FIND", label: "찾아 쓰기(본문 발췌)" },
        ],
        defaultValue: "BLANK",
        description: "BLANK 는 <보기>의 빈칸을 복원, FIND 는 발문 지시로 본문에서 시어·구절을 찾아 씁니다",
      },
      {
        key: "answerUnit",
        label: "정답 단위",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 특성)" },
          { value: "WORD", label: "시어·단어(1어절)" },
          { value: "PHRASE", label: "시구·구절(2~4어절)" },
        ],
        defaultValue: "AUTO",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  // BLANK 모드 지문 마스킹 포함 (KO-LEAK-1) — validate 의 렌더 결정론 게이트와 공유.
  toRenderModel: toRenderModelImpl,
  difficultyGuide: {
    BASIC:
      "정답 구간은 수업 최다 강조 지점(주제 응축부·표제 시어)의 시어 1개~1어절로. BLANK 발췌는 정답 행 앞뒤로 충분한 문맥(2~3행)을 줘 문맥 단서로도 복원 가능하게 하라.",
    INTERMEDIATE:
      "정답 구간을 2~4어절 시구로 확장하고 발췌 문맥을 최소화(정답 행 ±1행)해 위치 단서 없이 암기로만 복원되게 하라. FIND 는 지시 어구를 한 단계 추상화하되 유일성 한정(연·기능 지정)을 유지하라.",
    KILLER:
      "고전시가는 원문 표기(고어) 그대로 쓰게 하고 현대어 뜻을 근거로 지시하는 원문↔현대어 교차형으로. 지문에 유사 시어가 여럿인 지점을 골라 지시 어구의 관계 한정('~과 대비되는')으로만 유일 정답이 특정되게 하되, 정답 구간은 문면에 덜 노출된 행에서 골라라.",
  },
};
