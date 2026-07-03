// ============================================================================
// KO_LIT_PSYCH — 문학 화자·인물의 심리/태도/정서
// ============================================================================
// 카탈로그 §2.2 [KO_LIT_EMO] 사양의 전면 구현 (v1 타입코드 KO_LIT_PSYCH).
//
// 실측 근거:
//   발문: "(나)의 '당신'에 대한 설명으로 적절하지 않은 것은?" /
//         "윗글에 나타난 화자의 정서로 가장 적절한 것은?"
//   인물·화자 지칭어는 작은따옴표 인용 — 지문 실재성 결정론 검사 대상.
//   오답 설계의 핵심 = 극성 반전('A 대신 not-A')이 아니라
//   **동일 극성 내 다른 개념 치환('A 대신 B': 안정감→적막함)**.
//   극성 반전 오답은 최대 1개(정답률 하한 조절용)만 허용.
//
// 결정론 장치:
//   - 정서·태도 개념어 은행(폴라리티 분류) 내장 → 선지 정서어 추출·은행 대조
//   - 반전 정서쌍 사전(체념↔의지, 예찬↔냉소 등) → 극성 반전 오답 개수 휴리스틱
//     (2개 이상 = warning)
//   - 발문 작은따옴표 인용(인물명)·subjectName 의 지문 verbatim 검사
//   ※ 달관·관조·성찰은 중립(관조·초월) 계열로 분류 — '체념→달관' 치환은
//     동일 극성 인접 개념 취급(KO_LIT_PHRASE 프롬프트 관행과 정합).
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 정서·태도 개념어 은행 (48개) — 폴라리티: NEG=부정·하강, POS=긍정·상승,
// NEUTRAL=관조·초월(반전 판정에서 제외)
// ---------------------------------------------------------------------------

type KoEmotionPolarity = "NEG" | "POS" | "NEUTRAL";

const EMOTION_POLARITY: Record<string, KoEmotionPolarity> = {
  // 부정·하강 (27)
  체념: "NEG", 자조: "NEG", 회한: "NEG", 연민: "NEG", 애상: "NEG", 우수: "NEG",
  그리움: "NEG", 안타까움: "NEG", 냉소: "NEG", 무상감: "NEG", 비애: "NEG",
  한탄: "NEG", 서러움: "NEG", 설움: "NEG", 절망: "NEG", 좌절: "NEG",
  원망: "NEG", 불안: "NEG", 초조: "NEG", 고독: "NEG", 외로움: "NEG",
  상실감: "NEG", 자괴감: "NEG", 향수: "NEG", 수심: "NEG", 시름: "NEG", 환멸: "NEG",
  // 긍정·상승 (18)
  의지: "POS", 동경: "POS", 예찬: "POS", 경외: "POS", 자부심: "POS", 자긍심: "POS",
  만족감: "POS", 안도: "POS", 희망: "POS", 기대감: "POS", 소망: "POS", 열망: "POS",
  흥취: "POS", 풍류: "POS", 여유: "POS", 애정: "POS", 감사: "POS", 환희: "POS",
  // 관조·초월 — 중립 (3)
  달관: "NEUTRAL", 관조: "NEUTRAL", 성찰: "NEUTRAL",
};

const EMOTION_BANK_WORDS = Object.keys(EMOTION_POLARITY);

/** 은행어 추출 시 오탐 차단 — '의지하다(依支)' 는 정서 '의지(意志)'가 아니다. */
const EXTRACT_RE_OVERRIDES: Record<string, RegExp> = {
  의지: /의지(?![하할해했함])/,
};

/** 텍스트에 등장하는 은행 정서어를 추출한다 (결정론 — 은행 대조의 기초). */
function extractBankEmotions(text: string): string[] {
  const t = text.normalize("NFC");
  const found: string[] = [];
  for (const word of EMOTION_BANK_WORDS) {
    const override = EXTRACT_RE_OVERRIDES[word];
    if (override ? override.test(t) : t.includes(word)) found.push(word);
  }
  return found;
}

/** 반전 정서쌍 사전 — 극성 반전 오답 판정의 명시 앵커 (양방향). */
const REVERSAL_PAIRS: [string, string][] = [
  ["체념", "의지"],
  ["좌절", "의지"],
  ["절망", "의지"],
  ["절망", "희망"],
  ["예찬", "냉소"],
  ["불안", "안도"],
  ["자조", "자부심"],
  ["자조", "자긍심"],
  ["자괴감", "자부심"],
  ["자괴감", "자긍심"],
  ["원망", "감사"],
  ["동경", "환멸"],
  ["비애", "환희"],
];

const REVERSAL_MAP: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const [a, b] of REVERSAL_PAIRS) {
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a)!.add(b);
    map.get(b)!.add(a);
  }
  return map;
})();

function isReversalPair(a: string, b: string): boolean {
  return REVERSAL_MAP.get(a)?.has(b) ?? false;
}

const NEG_WORDS = EMOTION_BANK_WORDS.filter((w) => EMOTION_POLARITY[w] === "NEG");
const POS_WORDS = EMOTION_BANK_WORDS.filter((w) => EMOTION_POLARITY[w] === "POS");
const NEUTRAL_WORDS = EMOTION_BANK_WORDS.filter((w) => EMOTION_POLARITY[w] === "NEUTRAL");

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  questionFocus: z
    .enum(["SPEAKER_EMOTION", "CHARACTER_PSYCH"])
    .describe(
      "출제 축 — SPEAKER_EMOTION: 화자의 정서·태도(운문·수필), CHARACTER_PSYCH: 특정 인물의 심리·태도(소설·극)",
    ),
  stemPolarity: z
    .enum(["POSITIVE", "NEGATIVE"])
    .describe(
      "발문 극성 — POSITIVE: '가장 적절한 것은?'(정서 단수 판정, 화자형 기본), NEGATIVE: '적절하지 않은 것은?'(설명 전수 검증, 인물형 기본)",
    ),
  subjectName: z
    .string()
    .describe(
      "발문에 작은따옴표로 인용한 인물·화자 지칭어 — 지문에 그대로 등장하는 표기여야 함(시스템이 verbatim 검사). CHARACTER_PSYCH 는 필수, SPEAKER_EMOTION 은 지칭어가 지문에 명시될 때만",
    )
    .optional(),
  correctEmotion: z
    .string()
    .describe(
      "정답 선지가 담는 핵심 정서·태도 개념어 1개 — 정서 개념어 은행 목록에서 고르고, 정답 선지 텍스트에 그 단어가 실제로 포함되어야 함",
    ),
});

// ---------------------------------------------------------------------------
// 프롬프트 (출제 매뉴얼)
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문학 — 화자·인물의 심리/태도/정서

**발문 템플릿** (questionFocus × stemPolarity 에 따라 정확히 이 형태로):
- SPEAKER_EMOTION × POSITIVE(화자형 기본): "윗글에 나타난 화자의 정서로 가장 적절한 것은?" (복합지문이면 "(나)에 나타난 화자의 정서로 가장 적절한 것은?")
- SPEAKER_EMOTION × NEGATIVE: "윗글에 나타난 화자의 정서와 태도에 대한 이해로 적절하지 않은 것은?"
- CHARACTER_PSYCH × NEGATIVE(인물형 기본): "'인물명'에 대한 설명으로 적절하지 않은 것은?" / "(나)의 '인물명'에 대한 설명으로 적절하지 않은 것은?"
- CHARACTER_PSYCH × POSITIVE: "'인물명'의 심리에 대한 이해로 가장 적절한 것은?"
- 인물·화자 지칭어는 반드시 **지문에 그대로 등장하는 표기**를 작은따옴표로 인용하고, 같은 문자열을 subjectName 에 넣어라 — 시스템이 지문 실재성을 결정론 검사한다. 지문에 없는 이름을 만들어 내지 마라.

**정서·태도 개념어 은행** — 선지의 정서어는 이 은행에서 고른다 (correctEmotion 은 은행 개념어 1개):
- 부정·하강: ${NEG_WORDS.join(", ")}
- 긍정·상승: ${POS_WORDS.join(", ")}
- 관조·초월(중립): ${NEUTRAL_WORDS.join(", ")}

**선지 구성 원리**:
1. 선지 = [지문 속 근거 국면(상황·시상 전개·행위·발화)] + [정서·태도 개념어] 의 결합 완결문. 어미는 '~다'.
   예) "임과 이별한 처지에서 오는 안타까움과 그리움이 드러나 있다." / "'허원'은 누명을 벗을 길이 없다는 좌절 속에서도 가족에 대한 연민을 놓지 않는다."
2. 정서어만 나열한 선지 금지 — 반드시 어느 국면에서 비롯한 정서인지 근거 상황과 묶어라. 반대로 정서어 없이 줄거리만 재진술한 선지도 금지.
3. POSITIVE 발문: 참 선지 1(정답) + 함정 선지 4. NEGATIVE 발문: 참 선지 4 + 왜곡 선지 1(정답).
4. 5개 선지의 핵심 정서어는 서로 겹치지 않게 하라 — 특히 오답이 정답 선지의 정서어를 재사용하면 복수 정답 시비가 생긴다.
5. 운문 화자형은 정서+시적 태도(애상·관조·예찬·달관 …)를, 산문 인물형은 심리+행위 동기(불안·경계심·연민·자부심 …)를 축으로 하라.

**오답(함정) 설계 원리 — 핵심: 'A 대신 not-A'가 아니라 'A 대신 B'**:
오답의 정서어는 정답과 **같은 극성 안의 다른 개념**으로 치환하는 것이 이 유형의 함정 본질이다. 극성을 뒤집은 오답(체념→의지)은 지문을 읽지 않아도 배제되므로 **최대 1개**(정답률 하한 조절용)만 허용한다 — 시스템이 은행 대조로 반전 개수를 검사한다.
1. **동일 극성 개념 치환(주력 — 오답 4개 중 2개 이상)**: 근거 국면은 그대로 두고 개념어만 인접 개념으로 바꾼다.
   예) 체념→자조/무상감/한탄, 그리움→연민/애상, 예찬→경외/동경, 안정감→적막함, 회한→서러움.
   '체념→달관'처럼 관조·초월 계열로의 미세 치환은 최상급 함정이다(포기의 수용 여부가 갈림).
2. **근거 국면 왜곡**: 정서어는 실제와 같게 두고 그 계기·대상을 다른 국면으로. 예) "임에 대한 그리움" → "고향에 대한 그리움".
3. **주체 오귀속(산문)**: 다른 인물의 심리를 대상 인물의 것으로. 예) 아내가 느끼는 불안을 '허원'의 불안으로.
4. **시간 국면 착오**: 회상 장면의 정서를 현재의 정서로, 또는 태도 변화(갈등→수용)의 전후를 뒤바꿈.
5. **극성 반전(최대 1개)**: 반전쌍 사전 — 체념↔의지, 예찬↔냉소, 절망↔희망, 불안↔안도, 자조↔자부심, 원망↔감사, 동경↔환멸, 비애↔환희.
6. **과잉 해석**: 지문 문면에 근거 없는 정서 단정. 예) 자연 묘사뿐인 연에 '현실 도피 욕구'를 부여.

**근거앵커(evidence) 작성**:
- 각 선지의 근거는 정서가 응축된 시행·발화·서술 구절을 지문에서 verbatim 으로 뽑아라. 감탄사·영탄('어즈버', '아아'), 독백, 행동 묘사(한숨·눈물·서성임), 어조가 드러나는 종결형이 우선 후보다.
- 참 선지: SUPPORTS. 동일 극성 치환·국면 왜곡·주체 오귀속·시간 착오: DISTORTS(왜곡 판정 기준 구절). 극성 반전: CONTRADICTS. 과잉 해석: NOT_MENTIONED(가장 가까운 관련 구절 제시).

**금지**:
- 극성 반전 오답 2개 이상 (은행 대조로 검출됨).
- 발문·선지에 지문에 없는 인물명·지칭어 인용.
- 지문 밖 작가·작품 상식으로만 판정되는 선지 ("이 작가 특유의 ~", "이 작품의 주제인 ~").
- 정답 선지와 오답 선지가 같은 정서어를 공유하는 구성.
- 은행에 없는 자의적 신조 정서어 사용 (예: '몽환적 슬픔').`;

// ---------------------------------------------------------------------------
// 설정 → 프롬프트
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const focus = settings.questionFocus;
  if (focus === "SPEAKER_EMOTION") {
    lines.push(
      "- questionFocus=SPEAKER_EMOTION 로 출제하라: 화자의 정서·태도 축(운문·수필). subjectName 은 화자 지칭어('당신' 등)가 지문에 명시될 때만 넣는다.",
    );
  } else if (focus === "CHARACTER_PSYCH") {
    lines.push(
      "- questionFocus=CHARACTER_PSYCH 로 출제하라: 특정 인물의 심리·태도 축(서사 갈래). 발문에 인물명을 작은따옴표로 인용하고 subjectName 을 반드시 채워라.",
    );
  } else {
    lines.push(
      "- questionFocus 는 갈래에 맞게 선택하라: 운문·수필=SPEAKER_EMOTION(화자 정서), 소설·극=CHARACTER_PSYCH(인물 심리).",
    );
  }
  const polarity = settings.stemPolarity;
  if (polarity === "POSITIVE") {
    lines.push("- stemPolarity=POSITIVE 로 출제하라 ('가장 적절한 것은?' — 함정 4 + 참 1).");
  } else if (polarity === "NEGATIVE") {
    lines.push("- stemPolarity=NEGATIVE 로 출제하라 ('적절하지 않은 것은?' — 참 4 + 왜곡 1).");
  } else {
    lines.push("- stemPolarity 는 축에 맞게: 화자 정서형=POSITIVE 기본, 인물 설명형=NEGATIVE 기본.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 정답 정서는 교과서·자습서의 고정 해석(수업 필기 강조점)에 앵커하고, 오답은 수업에서 함께 언급될 법한 인접 개념 치환으로 구성하라 — 단 위치·해석 암기만으로 풀리지 않게 근거 국면 결합을 유지하라. 서술형 변형 대비를 위해 explanation 에 정서 도출의 근거 구절을 명시적으로 인용하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 발췌 장면의 문면만으로 판정 가능해야 한다 — 전체 줄거리·작가 배경지식·자습서 고정 해석을 전제하는 선지 금지.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 (유형 특화 결정론 체크)
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = str(question.direction);
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
  const stemPolarity = question.stemPolarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const questionFocus =
    question.questionFocus === "CHARACTER_PSYCH" ? "CHARACTER_PSYCH" : "SPEAKER_EMOTION";
  const correctAnswer = str(question.correctAnswer);
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[]).map((o) => ({
        label: str(o?.label),
        text: str(o?.text),
      }))
    : [];

  // ── 1. 발문 극성 ↔ 선언 극성 정합 ─────────────────────────────────────
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // ── 2. 발문 작은따옴표 인용(인물·화자 지칭어)의 지문 실재성 ──────────────
  // 공통 게이트는 '선지' 인용만 검사하므로 발문 인용은 이 유형이 결정론 검사한다.
  for (const quoted of ctx.koText.extractQuotedSpansKo(direction)) {
    if (quoted.length < 2) continue; // 1자 인용은 강조 표기로 간주
    if (!ctx.koText.containsSpanKo(ctx.passage, quoted)) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `발문 인용 '${quoted.slice(0, 20)}'이 지문에 없습니다 — 인물·화자 지칭어는 지문 실재 표기여야 합니다`,
      );
    }
  }
  const subjectName = str(question.subjectName).trim();
  if (questionFocus === "CHARACTER_PSYCH" && !subjectName) {
    add(
      "error",
      "ko-direction-grammar",
      "CHARACTER_PSYCH(인물 심리형)인데 subjectName(인물 지칭어)이 없습니다",
    );
  }
  if (subjectName) {
    if (!ctx.koText.containsSpanKo(ctx.passage, subjectName)) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `subjectName '${subjectName}' 이 지문에 없습니다 (verbatim 위반)`,
      );
    }
    if (questionFocus === "CHARACTER_PSYCH") {
      const quotedInStem = ctx.koText
        .extractQuotedSpansKo(direction)
        .some((q) => q === subjectName);
      if (!quotedInStem) {
        add(
          "error",
          "ko-direction-grammar",
          `발문이 인물명 '${subjectName}' 을 작은따옴표로 인용하지 않았습니다 — "'${subjectName}'에 대한 설명으로…" 형태여야 합니다`,
        );
      }
    }
  }

  // ── 3. 정서 개념어 은행 대조 ──────────────────────────────────────────
  const correctEmotion = str(question.correctEmotion).trim();
  const correctOption = options.find((o) => o.label === correctAnswer);
  if (correctEmotion && !(correctEmotion in EMOTION_POLARITY)) {
    add(
      "warning",
      "ko-option-ending",
      `correctEmotion '${correctEmotion}' 이 정서 개념어 은행에 없습니다 — 은행 개념어(체념·달관·자조·연민·회한 등) 사용 권장`,
    );
  }
  if (correctEmotion && correctOption) {
    const stemForm = correctEmotion.length >= 3 ? correctEmotion.slice(0, -1) : correctEmotion;
    const present =
      correctOption.text.normalize("NFC").includes(correctEmotion) ||
      correctOption.text.normalize("NFC").includes(stemForm);
    if (!present) {
      add(
        "warning",
        "ko-option-ending",
        `정답 선지(${correctAnswer})에 선언한 정서어 '${correctEmotion}' 이 나타나지 않습니다 — 선언·실현 불일치`,
      );
    }
  }
  if (!negativeStem && questionFocus === "SPEAKER_EMOTION" && options.length === 5) {
    const withBankWord = options.filter((o) => extractBankEmotions(o.text).length > 0);
    if (withBankWord.length <= 2) {
      add(
        "warning",
        "ko-option-ending",
        `은행 정서 개념어가 검출된 선지가 ${withBankWord.length}개뿐입니다 — 화자 정서형 선지는 정서 개념어 기반이어야 합니다`,
      );
    }
  }

  // ── 4. 극성 반전 오답 개수 휴리스틱 (긍정발문 — 오답 4개 대상) ──────────
  // 'A 대신 B'(동일 극성 치환) 원리: 반전쌍 사전 + 폴라리티 분류로 반전 오답을
  // 세고 2개 이상이면 warning. (부정발문은 왜곡 선지가 1개뿐이라 반전 상한 1을
  // 구조적으로 넘을 수 없어 검사 대상이 아니다.)
  if (!negativeStem && correctOption) {
    const refWords = new Set(extractBankEmotions(correctOption.text));
    if (correctEmotion in EMOTION_POLARITY) refWords.add(correctEmotion);
    const refPolarities = new Set(
      [...refWords].map((w) => EMOTION_POLARITY[w]).filter((p) => p !== "NEUTRAL"),
    );
    if (refWords.size > 0) {
      const flippedLabels: string[] = [];
      for (const o of options) {
        if (o.label === correctAnswer) continue;
        const words = extractBankEmotions(o.text);
        if (words.length === 0) continue;
        const pairFlip = words.some((w) => [...refWords].some((r) => isReversalPair(r, w)));
        const polarityFlip =
          refPolarities.size === 1 &&
          words.every(
            (w) => EMOTION_POLARITY[w] !== "NEUTRAL" && !refPolarities.has(EMOTION_POLARITY[w]),
          );
        if (pairFlip || polarityFlip) flippedLabels.push(o.label);
      }
      if (flippedLabels.length >= 2) {
        add(
          "warning",
          "ko-option-ending",
          `극성 반전 오답이 ${flippedLabels.length}개(${flippedLabels.join(" ")}) — 'A 대신 B'(동일 극성 내 개념 치환) 원리 위반, 반전 오답은 최대 1개여야 합니다`,
        );
      }
      // 정답 정서어를 오답이 재사용 — 복수 정답 시비 위험
      const dupLabels = options
        .filter((o) => o.label !== correctAnswer)
        .filter((o) => extractBankEmotions(o.text).some((w) => refWords.has(w)))
        .map((o) => o.label);
      if (dupLabels.length > 0) {
        add(
          "warning",
          "ko-option-ending",
          `오답 선지(${dupLabels.join(" ")})가 정답의 정서어를 재사용합니다 — 복수 정답 시비 위험, 정서어를 겹치지 않게 하세요`,
        );
      }
    }
  }

  // ── 5. 극성-근거관계 정합 (KO_RD_FACT 와 동일 원리) ───────────────────
  // 부정발문 → 정답(왜곡 선지)의 근거는 왜곡 계열, 참 선지 4개는 SUPPORTS.
  // 긍정발문 → 반대.
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const relationOf = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = str(e?.optionLabel);
    const relation = str(e?.relation);
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }
  const distortRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    const shouldBeDistorted = negativeStem ? isCorrect : !isCorrect;
    const hasSupport = relations.has("SUPPORTS");
    const hasDistort = [...relations].some((r) => distortRelations.has(r));
    if (shouldBeDistorted && !hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 함정 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeDistorted && !hasSupport) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 참 선지인데 SUPPORTS 근거가 없습니다 — 극성 모순`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_LIT_PSYCH: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_PSYCH",
    area: "LITERATURE",
    label: "화자·인물의 심리·태도",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: [
      "LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL", "LIT_ESSAY", "LIT_PLAY", "MIXED",
    ],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: [],
    optionEnding: "plain",
    needsSolverGate: false,
    description:
      "화자·인물의 심리/태도/정서를 정서 개념어(체념·달관·자조·연민 …)로 판정 — 오답은 동일 극성 내 개념 치환이 함정 본질",
    setSlot: "문학 세트 중간 슬롯 — 운문 세트 정서 축(EXPR→PHRASE→PSYCH→BOGI 프리셋 3슬롯), 타 유형에 흡수되는 경우 다수",
    studentTask:
      "화자의 정서 또는 지정 인물의 심리·태도 진술 5개를 지문 국면과 대조해 적절한/왜곡된 하나를 고릅니다.",
    bestFor: ["정서가 응축된 운문(현대시·고전시가)", "인물 심리 갈등이 뚜렷한 산문", "내신 자습서 고정 해석 확인"],
    outputUi: ["지문 동봉", "5지선다(정서 개념어 선지)", "선지별 근거·오답 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "questionFocus",
        label: "출제 축",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(갈래 기준)" },
          { value: "SPEAKER_EMOTION", label: "화자의 정서(운문·수필)" },
          { value: "CHARACTER_PSYCH", label: "인물의 심리·태도(산문)" },
        ],
        defaultValue: "AUTO",
        description: "운문·수필은 화자 정서, 소설·극은 인물 심리 축이 관행입니다",
      },
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(축 기준)" },
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것)" },
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것)" },
        ],
        defaultValue: "AUTO",
        description: "화자 정서형=긍정발문, 인물 설명형=부정발문이 기본 관행입니다",
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
      "정서가 표면에 직접 노출된 지점(감정 어휘·영탄이 문면에 등장)을 기준으로 하라. 오답은 근거 국면이 명확히 다른 개념 치환으로, 판정이 한 구절 안에서 끝나게.",
    INTERMEDIATE:
      "정서가 소재·행위·어조에 간접 응축된 지점을 기준으로 하라. 오답은 동일 극성 인접 개념 치환(체념↔자조↔무상감, 그리움↔연민↔애상)을 주력으로 하고, 판정에 앞뒤 2~3개 국면의 결합이 필요하게.",
    KILLER:
      "표층 정서와 심층 태도가 갈리는 지점(반어·자조·체념 속 달관)을 기준으로 하라. 오답 전부를 동일 극성 인접 개념 + 근거 국면의 미세한 어긋남으로 설계하고(극성 반전 0~1개), 참 선지도 맥락 종합 진술로 구성해 전수 검증을 강제하라.",
  },
};
