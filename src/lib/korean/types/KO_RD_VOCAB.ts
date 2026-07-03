// ============================================================================
// KO_RD_VOCAB — 독서 어휘 문맥적 의미 (ⓐ~ⓔ 바꿔쓰기)
// ============================================================================
// 카탈로그 §2.1 KO_RD_VOCAB + KO-DESIGN-SPEC §5 교정의 전면 구현.
// v1 은 **바꿔쓰기 모드 단독**이다(동일 의항 용례 짝짓기 모드는 표준국어대사전
// 의항 앵커 DB 부재로 v1 제외 — 스펙 §5 교정).
//
// 실측 관행:
//   발문: "문맥상 ⓐ~ⓔ와 바꿔 쓰기에 적절하지 않은 것은?"
//   마커: ⓐ~ⓔ 정확 5개 — 서술성 한자어 동사/명사(도출하다·상정하다 류) 위주
//   선지: "① ⓐ: 이끌어 내는" — 마커+쌍점+대체어, 선지-마커 1:1 순서 대응(①=ⓐ)
//   정답(부적절 치환) 1개 = 같은 표제어의 다른 의항 유의어 또는 문맥 호응 파괴
//   오답(적절 치환) 4개 = 자연스러운 고유어 치환
//   세트 역할: 독서 세트 마지막 슬롯 고정, 2점, 매회 1~2문항
//
// 1:1 순서 대응 유형이므로 lockedOptionOrder: true (정답 위치 결정론 셔플 제외).
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koMarkerSchema } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { LATIN_CIRCLED_LABELS } from "../core/markers";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koMc5Envelope({
  markers: z
    .array(koMarkerSchema)
    .length(5)
    .describe(
      "지문 어휘 마킹 정확 5개 — 전부 family=LATIN_CIRCLED(ⓐ~ⓔ), 지문 등장 순서대로 ⓐ→ⓔ. spanText 는 지문에 실제로 적힌 활용형 그대로(예: '도출한다', '상정했다' — 기본형으로 바꾸지 말 것)",
    ),
  answerFlaw: z
    .enum(["OTHER_SENSE_SYNONYM", "COLLOCATION_BREAK"])
    .describe(
      "정답(부적절 치환) 선지에 적용한 함정 원리: OTHER_SENSE_SYNONYM=같은 표제어의 다른 의항에 대응하는 유의어, COLLOCATION_BREAK=사전상 유의어이나 해당 문장의 주어·목적어와 호응(연어)이 깨지는 치환",
    ),
});

const prompt = `### 유형: 독서 — 어휘의 문맥적 의미 (ⓐ~ⓔ 바꿔쓰기)

**발문 템플릿** (정확히 이 형태로 — 변형 금지):
- "문맥상 ⓐ~ⓔ와 바꿔 쓰기에 적절하지 않은 것은?"

**마커(ⓐ~ⓔ) 선정 원리**:
1. 지문에서 **서술성 한자어 동사·명사(하다류)** 5개를 고르라: 도출하다, 상정하다, 수반하다, 개진하다, 견지하다, 초래하다, 구현하다, 관철하다 계열. 고유어·조사·부사는 마킹 금지.
2. 각 어휘는 **문맥적 의미가 판정 가능한 지점**이어야 한다 — 주어·목적어와의 호응이 문면에 드러나는 문장 속 어휘만 고르라.
3. 5개는 지문 전반에 분산시켜라(한 문단 몰림 금지, 같은 문장에 2개 금지). 지문 등장 순서대로 ⓐ→ⓔ 라벨을 부여하라.
4. spanText 는 지문에 적힌 **활용형 그대로**('도출한다'가 지문 표기면 '도출하다'로 바꾸지 말 것). 조사는 포함하지 마라 — 밑줄은 단어 단위다.
5. 같은 표제어를 두 번 마킹하지 마라(ⓐ~ⓔ 다섯 표제어는 서로 달라야 한다).

**선지 구성 원리**:
1. 선지 텍스트는 정확히 "ⓐ: 대체어" 형식이다 — 마커 라벨 + 쌍점 + 치환 표현. 예: "ⓐ: 이끌어 내는".
2. **선지-마커 1:1 순서 대응 절대 준수**: ①=ⓐ, ②=ⓑ, ③=ⓒ, ④=ⓓ, ⑤=ⓔ. 순서를 바꾸지 마라.
3. 대체어는 원문 자리에 **그대로 갈아 끼웠을 때 문장이 문법적으로 성립하는 활용형**으로 제시하라: 원문이 '도출한다'면 '이끌어 낸다', 원문이 '도출하는'이면 '이끌어 내는'. 어미·시제·높임을 원문과 일치시켜라.
4. 다섯 대체어는 서로 **중복 금지**(같은 표현을 두 선지에 쓰지 마라), 그리고 어떤 대체어도 원어 자체와 같아서는 안 된다.
5. **오답(적절 치환) 4개**: 해당 문맥 의항의 자연스러운 **고유어 풀이**여야 한다 — 대입 후 의미·호응이 완전히 보존되는 치환(도출하다→이끌어 내다, 수반하다→뒤따르다, 상정하다→가정하다가 아니라 '미리 생각해 두다' 같은 고유어 계열 우선). 한자어→한자어 맞바꿈은 피하라.
6. **정답(부적절 치환) 1개** — answerFlaw 원리 중 하나를 정확히 적용하라:
   - OTHER_SENSE_SYNONYM(다른 의항의 유의어): 같은 표제어가 가진 **다른 뜻**에 대응하는 치환을 대입한다. 예: '진리를 밝히다(=규명하다)'의 ⓐ에 '불을 켜는'(조명 의항) / '비용을 치르다(=지불하다)'에 '(시험을) 겪는'(경험 의항). 사전을 펼치면 유의어가 맞지만 **이 문맥**에서는 어긋나는 것이 핵심이다.
   - COLLOCATION_BREAK(문맥 호응 파괴): 의미 축은 비슷하나 해당 문장의 주어·목적어와 **연어 결합이 불가능한** 치환. 예: '의견을 개진하다'에 '펼치는'은 적절하지만 '벌이는'은 '사업을 벌이다'와만 호응하므로 부적절.
7. 정답 선지도 표면상 그럴듯해야 한다 — 원어와 아무 의미 연관이 없는 엉뚱한 단어는 금지(읽지 않아도 배제되는 선지가 된다).

**근거앵커(evidence) 작성**:
- 선지 ①~⑤ 각각에 해당 마커 어휘가 포함된 **지문 원문 문장(또는 구절)**을 spanText 로 제시하라 — 문맥 호응 판정의 근거가 되는 주어·목적어가 함께 들어가야 한다.
- 오답(적절 치환) 4개: relation=SUPPORTS. 정답(부적절 치환) 1개: relation=DISTORTS.

**해설(explanation) 의무 — 치환 검증 문장** (기계 검증 대상):
- 해설에는 **정답 대체어를 원문 자리에 실제로 대입한 문장**을 인용하고, 왜 부자연스러운지(의항 차이/호응 파괴)를 밝히는 문장이 반드시 있어야 한다. "'…(원문 구절)…'에서 ⓔ를 '가리키는'으로 바꾸면 '…(대입 후 문장)…'이 되어 ~와 호응하지 않는다" 형식 — **'~로 바꾸면' 패턴을 반드시 포함**하라.
- 나머지 오답 4개도 대입이 자연스러움을 wrongOptionExplanations 에서 각각 확인하라(대체어가 원어의 이 문맥 의항과 일치함을 한 줄로).

**빈발 반려 사유 — 아래를 어기면 시스템이 기계 검사로 전량 반려한다**:
1. **지문에 없는 단어 마킹**: 마커 spanText 는 지문에 **실제로 적혀 있는** 활용형을
   찾아 복사한 것이어야 한다. 네가 출제하고 싶은 한자어('수탁한', '회귀한다고' 류)로
   지문 단어를 **바꿔치기해 인용하는 것은 절대 금지** — 마킹 전에 지문 원문에서 그
   단어를 눈으로 확인하고 그대로 옮겨 적어라. 지문에 서술성 한자어가 부족하면 지문에
   실재하는 다른 서술어(2음절 한자어 용언·명사)로 대상을 바꿔라(창작 금지).
2. **근거 스팬 재서술**: evidence 의 spanText 도 지문 원문 문장 복사만 허용 — 지문
   내용을 요약·재서술한 문장을 근거로 쓰면 verbatim 검사에서 반려된다.
3. **치환어 = 원어**: 각 선지의 대체어는 해당 마커의 원어와 표기가 달라야 한다
   ('맡긴'→'맡긴' 식의 동일 표기는 치환 불성립으로 반려). 마킹한 단어가 이미 고유어라
   자연스러운 딴 표현이 없으면, 그 단어 대신 지문의 다른 한자어를 마킹 대상으로 바꿔라.

**금지**:
- 고유어·부사·조사 마킹, 같은 표제어 중복 마킹.
- 대체어 상호 중복, 원어와 동일한 대체어, 원문 어미와 어긋나 대입이 불가능한 활용형.
- 정답이 2개 이상 성립하는 구성(오답 4개 중 하나라도 대입 시 어색하면 반려된다 — 오답 대체어는 보수적으로 확실히 자연스러운 것만).
- 사전 없이 상식만으로 배제되는 황당 치환.
- 발문 변형("의미가 가장 가까운 것은?", 용례 짝짓기형) — 이 유형은 바꿔쓰기 부정발문 단독이다.`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const flaw = settings.answerFlaw;
  if (flaw === "OTHER_SENSE_SYNONYM") {
    lines.push(
      "- answerFlaw=OTHER_SENSE_SYNONYM 으로 출제하라: 정답 치환은 같은 표제어의 다른 의항에 대응하는 유의어로.",
    );
  } else if (flaw === "COLLOCATION_BREAK") {
    lines.push(
      "- answerFlaw=COLLOCATION_BREAK 으로 출제하라: 정답 치환은 사전상 유의어이나 이 문장의 주어·목적어와 호응이 깨지는 것으로.",
    );
  } else {
    lines.push("- answerFlaw 는 마킹한 어휘의 의항 구조에 맞게 선택하라(다의어가 있으면 OTHER_SENSE_SYNONYM 우선).");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 해설과 오답 해설에서 원어의 한자 병기를 허용한다(예: 도출(導出)) — 사전적 의미 확인 요소를 결합하라. 단 마커 spanText 에는 한자를 덧붙이지 마라(지문 원문 그대로여야 한다).",
      "- 내신 모드: 교과서·수업에서 어휘 노트로 정리될 법한 빈출 한자어를 우선 마킹하라.",
    );
  } else {
    lines.push("- 수능 모드: 선지·발문에 한자 병기를 넣지 마라(수능 어휘 문항 관행). 판정은 오직 문맥 호응으로.");
  }
  return lines.join("\n");
}

/** "ⓐ: 이끌어 내는" — 마커 라벨 + 쌍점(: / ：) + 대체어. */
const OPTION_FORMAT_RE = /^([ⓐⓑⓒⓓⓔ])\s*[:：]\s*(.+)$/;
/** 해설의 치환 검증 문장 패턴 ('~로 바꾸면' 계열). */
const SUBSTITUTION_PROOF_RE = /(바꾸면|바꿔\s*쓰면|바꿔\s*넣으면|대입하면|갈아\s*끼우면)/;

const compact = (s: string) => s.replace(/\s+/g, "");

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const explanation = typeof question.explanation === "string" ? question.explanation : "";

  // --- (1) 발문 = 바꿔쓰기 부정발문 템플릿 (이 유형은 모드 단독) ------------
  const d = direction.replace(/\s+/g, " ");
  if (!/바꿔\s*쓰/.test(d) || !d.includes("ⓐ") || !ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      `어휘 바꿔쓰기 유형의 발문은 "문맥상 ⓐ~ⓔ와 바꿔 쓰기에 적절하지 않은 것은?" 형태여야 합니다 — "${direction}"`,
    );
  }

  // --- (2) 마커: 정확 5개 · 전부 LATIN_CIRCLED · ⓐ→ⓔ 순서 ------------------
  if (markers.length !== 5) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `마커가 ${markers.length}개 — 선지 1:1 대응을 위해 ⓐ~ⓔ 정확히 5개여야 합니다`,
    );
  }
  const badFamilies = markers.filter((m) => m.family !== "LATIN_CIRCLED");
  if (badFamilies.length > 0) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `어휘 유형 마커는 전부 LATIN_CIRCLED(ⓐ~ⓔ)여야 합니다 — 위반 ${badFamilies.length}개`,
    );
  }
  const labels = markers.map((m) => (typeof m.label === "string" ? m.label : ""));
  const expectedSeq = LATIN_CIRCLED_LABELS.slice(0, markers.length).join("");
  if (markers.length === 5 && labels.join("") !== expectedSeq) {
    add("error", "ko-marker-option-mismatch", `마커 라벨이 ${expectedSeq} 순서가 아닙니다: ${labels.join("")}`);
  }

  // 마커 스팬은 단어(활용형 1어절) 단위 — 구절 마킹은 위계 위반
  for (const m of markers) {
    const span = typeof m.spanText === "string" ? m.spanText : "";
    if (span && ctx.koText.eojeolCount(span) >= 3) {
      add(
        "warning",
        "ko-marker-hierarchy",
        `어휘 마커 스팬이 구절("${span.slice(0, 20)}…")입니다 — ⓐ계열은 단어(활용형) 단위여야 합니다`,
      );
    }
  }

  // 같은 표제어 중복 마킹 금지 (spanText 압축형 비교)
  const spanSet = new Set<string>();
  for (const m of markers) {
    const span = typeof m.spanText === "string" ? compact(m.spanText) : "";
    if (!span) continue;
    if (spanSet.has(span)) {
      add("error", "ko-marker-option-mismatch", `같은 어휘("${m.spanText}")가 두 번 마킹되었습니다`);
    }
    spanSet.add(span);
  }

  // --- (3) 선지 형식 "ⓐ: 대체어" + 1:1 순서 대응 + 치환어 추출 --------------
  const replacements: (string | null)[] = [];
  for (let i = 0; i < Math.min(options.length, 5); i++) {
    const text = typeof options[i].text === "string" ? (options[i].text as string) : "";
    const optionLabel = typeof options[i].label === "string" ? (options[i].label as string) : "";
    const m = OPTION_FORMAT_RE.exec(text.trim());
    if (!m) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${optionLabel} 선지가 "ⓐ: 대체어" 형식이 아닙니다: "${text}"`,
      );
      replacements.push(null);
      continue;
    }
    const expectedMarker = LATIN_CIRCLED_LABELS[i];
    if (m[1] !== expectedMarker) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${optionLabel} 선지가 ${expectedMarker} 가 아니라 ${m[1]} 를 지시합니다 — 선지-마커 1:1 순서 대응(①=ⓐ) 위반`,
      );
    }
    replacements.push(m[2].trim());
  }

  // --- (4) 치환어 상호 중복 금지 + 원어 동일 치환 금지 ----------------------
  const seen = new Map<string, number>(); // compact(치환어) → 선지 index
  for (let i = 0; i < replacements.length; i++) {
    const rep = replacements[i];
    if (!rep) continue;
    const key = compact(rep);
    const prev = seen.get(key);
    if (prev !== undefined) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `치환어 "${rep}" 가 선지 ${prev + 1}번과 ${i + 1}번에 중복 사용되었습니다 — 치환어 상호 중복 금지`,
      );
    } else {
      seen.set(key, i);
    }
    const markerSpan =
      i < markers.length && typeof markers[i].spanText === "string"
        ? compact(markers[i].spanText as string)
        : "";
    if (markerSpan && key === markerSpan) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${i + 1}번 선지의 치환어("${rep}")가 원어와 동일합니다 — 치환이 성립하지 않습니다`,
      );
    }
  }

  // --- (5) 해설의 치환 검증 문장 강제 ('~로 바꾸면' 패턴 + 정답 치환어 포함) --
  const correctIdx = (["①", "②", "③", "④", "⑤"] as const).indexOf(
    correctAnswer as "①" | "②" | "③" | "④" | "⑤",
  );
  const correctReplacement = correctIdx >= 0 ? replacements[correctIdx] : null;
  if (correctReplacement) {
    const hasPattern = SUBSTITUTION_PROOF_RE.test(explanation);
    const hasReplacement = compact(explanation).includes(compact(correctReplacement));
    if (!hasPattern || !hasReplacement) {
      add(
        "error",
        "ko-evidence-missing",
        `해설에 정답 치환("${correctReplacement}")을 실제 대입한 검증 문장('~로 바꾸면 …' 패턴 + 치환어 인용)이 없습니다 — 부적절 판정의 근거를 문장 대입으로 보여야 합니다`,
      );
    }
  }

  return issues;
}

export const KO_RD_VOCAB: KoTypeModule = {
  meta: {
    typeId: "KO_RD_VOCAB",
    area: "READING",
    label: "어휘 문맥적 의미(ⓐ~ⓔ)",
    formatCategory: "어휘",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: ["LATIN_CIRCLED"],
    optionEnding: "any", // "ⓐ: 이끌어 내는" — 관형형 대체어라 어미 규칙 비적용
    needsSolverGate: false,
    lockedOptionOrder: true, // ①=ⓐ 1:1 순서 대응 — 정답 위치 셔플 제외
    description:
      "지문의 서술성 한자어 5곳(ⓐ~ⓔ)을 마킹하고 고유어 치환의 적절성을 판정하는 독서 어휘 유형 — 바꿔쓰기 모드 단독",
    setSlot: "독서 세트 마지막 슬롯 고정 — 매회 1~2문항",
    studentTask: "ⓐ~ⓔ 각 어휘를 선지의 대체어로 바꿔 쓸 때 문맥이 어긋나는 하나를 고릅니다.",
    bestFor: ["서술성 한자어가 풍부한 설명 지문", "다의어·연어 판정이 가능한 논증 지문", "내신 어휘 노트 확인"],
    outputUi: ["ⓐ~ⓔ 마킹 지문", "5지선다(마커: 대체어, 1:1 대응)", "치환 대입 검증 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "answerFlaw",
        label: "정답 함정 원리",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(어휘 의항 구조에 맞게)" },
          { value: "OTHER_SENSE_SYNONYM", label: "다른 의항의 유의어" },
          { value: "COLLOCATION_BREAK", label: "문맥 호응(연어) 파괴" },
        ],
        defaultValue: "AUTO",
        description: "부적절 치환(정답) 선지를 만드는 함정 원리를 지정합니다",
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
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "빈출 한자어(도출·수반·초래 급)를 마킹하고, 정답 치환은 의항 차이가 뚜렷해 대입 즉시 어색함이 드러나게 하라. 오답 고유어 풀이는 직역 수준으로.",
    INTERMEDIATE:
      "정답 치환은 사전상 유의어이되 이 문장의 주어·목적어와의 호응(연어)만 깨지게 하라. 오답 중 1개는 직역이 아닌 의역 수준 고유어로 두어 대입 확인을 유도하라.",
    KILLER:
      "다섯 대체어 전부 첫눈에 그럴듯하게 구성하라 — 정답은 미세한 의항 경계(추상/구체, 행위/상태)나 연어 제약으로만 배제되게 하고, 오답 4개도 표제어 수준이 높은 고유어로 두어 전 선지 대입 검증을 강제하라.",
  },
};
