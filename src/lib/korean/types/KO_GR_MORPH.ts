// ============================================================================
// KO_GR_MORPH — 문법: 형태소 분석·단어 형성 (<보기> ㉠~㉢ 개념 × 사례 짝짓기)
// ============================================================================
// 카탈로그 §2.5 사양의 전면 구현. 문법 단독형(includesPassage=false,
// usesBogi=required): <보기>가 개념 정의 3개(㉠~㉢)를 자기완결로 제시하고,
// 선지는 "㉠: 단어, ㉡: 단어, ㉢: 단어" 사례 삼중쌍이다.
//
// 실측: 발문 "<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?" (변형: 2026 수능
// 39번 의존 형태소 종합 판별). 오답 4원리 = 접사↔어근 혼동 · 어미↔접사 혼동 ·
// 통사적↔비통사적 합성 오분류 · 직접구성요소 분석 단계 오류. 기출 관행 관찰:
// 정답을 앞 번호에 두어 뒤 오답들의 전수 검증 비용을 키우는 배치가 빈번 —
// 최종 위치는 시스템 결정론 셔플이 처리하므로 프롬프트에서는 무작위만 지시.
//
// 결정론 장치: 빈출 단어 형성 goldmap 내장 — 보기·선지의 사례 단어가 goldmap 에
// 있으면 분류 진술(fits)을 기계 대조해 모순 시 차단(ko-solver-mismatch). 선지가
// 삼중쌍 텍스트를 자체 내장하므로(라벨 참조 없음) 정답 위치 셔플에 안전하다.
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
// 개념 라벨·분류 체계
// ---------------------------------------------------------------------------

const CONCEPT_LABELS = ["㉠", "㉡", "㉢"] as const;
type ConceptLabel = (typeof CONCEPT_LABELS)[number];

/** 개념 정의의 기계 판정 키 — goldmap 대조가 가능한 학교문법 표준 분류. */
const CATEGORY_KEYS = [
  "COMPOUND", //            합성어 (통사적+비통사적 전체)
  "COMPOUND_SYNTACTIC", //  통사적 합성어
  "COMPOUND_ASYNTACTIC", // 비통사적 합성어
  "DERIVED", //             파생어 (접두+접미 전체)
  "DERIVED_PREFIX", //      접두 파생어
  "DERIVED_SUFFIX", //      접미 파생어
  "COMPLEX", //             복합어 (단일어가 아닌 전체)
  "SIMPLE", //              단일어
  "OTHER", //               위 분류로 환원 불가한 자유 개념 (goldmap 대조 생략)
] as const;

type KoWordFormation =
  | "COMPOUND_SYNTACTIC"
  | "COMPOUND_ASYNTACTIC"
  | "DERIVED_PREFIX"
  | "DERIVED_SUFFIX"
  | "SIMPLE";

/** categoryKey 가 goldmap 분류를 수용하는가. null = 대조 불가(OTHER). */
function categoryAccepts(categoryKey: string, formation: KoWordFormation): boolean | null {
  switch (categoryKey) {
    case "COMPOUND_SYNTACTIC":
    case "COMPOUND_ASYNTACTIC":
    case "DERIVED_PREFIX":
    case "DERIVED_SUFFIX":
    case "SIMPLE":
      return formation === categoryKey;
    case "COMPOUND":
      return formation === "COMPOUND_SYNTACTIC" || formation === "COMPOUND_ASYNTACTIC";
    case "DERIVED":
      return formation === "DERIVED_PREFIX" || formation === "DERIVED_SUFFIX";
    case "COMPLEX":
      return formation !== "SIMPLE";
    default:
      return null;
  }
}

const FORMATION_LABELS: Record<KoWordFormation, string> = {
  COMPOUND_SYNTACTIC: "통사적 합성어",
  COMPOUND_ASYNTACTIC: "비통사적 합성어",
  DERIVED_PREFIX: "접두 파생어",
  DERIVED_SUFFIX: "접미 파생어",
  SIMPLE: "단일어",
};

// ---------------------------------------------------------------------------
// 빈출 단어 형성 goldmap — 학교문법 통설 확정치 33개 (결정론 대조 원장)
// 논쟁 어휘(어원 불투명어·교과서 간 판정 상이 경계어)는 의도적으로 배제했다.
// ---------------------------------------------------------------------------

const KO_WORD_FORMATION_GOLDMAP: Record<string, { formation: KoWordFormation; analysis: string }> = {
  // 통사적 합성어 (8)
  첫사랑: { formation: "COMPOUND_SYNTACTIC", analysis: "첫(관형사)+사랑(명사) — 관형사+명사의 정상 통사 구성" },
  밤낮: { formation: "COMPOUND_SYNTACTIC", analysis: "밤(명사)+낮(명사) — 명사 병렬의 정상 통사 구성" },
  손발: { formation: "COMPOUND_SYNTACTIC", analysis: "손(명사)+발(명사) — 명사 병렬" },
  새해: { formation: "COMPOUND_SYNTACTIC", analysis: "새(관형사)+해(명사)" },
  큰집: { formation: "COMPOUND_SYNTACTIC", analysis: "크-+-ㄴ(관형사형 어미)+집 — 어미가 개재된 정상 구성" },
  들어가다: { formation: "COMPOUND_SYNTACTIC", analysis: "들-+-어(연결어미)+가다 — 연결어미 개재" },
  본받다: { formation: "COMPOUND_SYNTACTIC", analysis: "본(을)+받다 — 목적어-서술어 구성" },
  코웃음: { formation: "COMPOUND_SYNTACTIC", analysis: "직접 구성 요소 코+웃음(명사+명사) — 1차 절단이 합성을 결정" },
  // 비통사적 합성어 (6)
  덮밥: { formation: "COMPOUND_ASYNTACTIC", analysis: "덮-(어간)+밥(명사) — 관형사형 어미 없이 결합" },
  늦잠: { formation: "COMPOUND_ASYNTACTIC", analysis: "늦-(어간)+잠(명사) — 어미 생략 결합" },
  부슬비: { formation: "COMPOUND_ASYNTACTIC", analysis: "부슬(부사성 어근)+비 — 부사성 어근이 명사를 직접 수식" },
  척척박사: { formation: "COMPOUND_ASYNTACTIC", analysis: "척척(부사)+박사(명사) — 부사가 명사를 직접 수식" },
  여닫다: { formation: "COMPOUND_ASYNTACTIC", analysis: "열-+닫- 어간+어간, 연결어미 생략" },
  오르내리다: { formation: "COMPOUND_ASYNTACTIC", analysis: "오르-+내리- 어간+어간 직접 결합" },
  // 접두 파생어 (6)
  새파랗다: { formation: "DERIVED_PREFIX", analysis: "새-(접두사)+파랗다" },
  맨손: { formation: "DERIVED_PREFIX", analysis: "맨-(접두사)+손 — '맨-'은 어근이 아니라 접두사" },
  풋사과: { formation: "DERIVED_PREFIX", analysis: "풋-(접두사)+사과" },
  헛수고: { formation: "DERIVED_PREFIX", analysis: "헛-(접두사)+수고" },
  덧신: { formation: "DERIVED_PREFIX", analysis: "덧-(접두사)+신" },
  되묻다: { formation: "DERIVED_PREFIX", analysis: "되-(접두사)+묻다" },
  // 접미 파생어 (11)
  지우개: { formation: "DERIVED_SUFFIX", analysis: "지우-(어근)+-개(접미사)" },
  덮개: { formation: "DERIVED_SUFFIX", analysis: "덮-(어근)+-개(접미사) — '덮밥'(합성)과 대조 쌍" },
  어른스럽다: { formation: "DERIVED_SUFFIX", analysis: "어른+-스럽다 — 명사→형용사 품사 변화 파생" },
  웃음: { formation: "DERIVED_SUFFIX", analysis: "웃-+-음(명사 파생 접미사) — 명사형 어미 활용형과 구별" },
  놀이: { formation: "DERIVED_SUFFIX", analysis: "놀-+-이(명사 파생 접미사)" },
  먹이: { formation: "DERIVED_SUFFIX", analysis: "먹-+-이(명사 파생 접미사)" },
  높이다: { formation: "DERIVED_SUFFIX", analysis: "높-+-이-(사동 접미사)+-다 — 접사가 새 단어를 파생" },
  잡히다: { formation: "DERIVED_SUFFIX", analysis: "잡-+-히-(피동 접미사)+-다" },
  지붕: { formation: "DERIVED_SUFFIX", analysis: "집+-웅 — 형태 변화를 수반한 접미 파생" },
  비웃음: { formation: "DERIVED_SUFFIX", analysis: "직접 구성 요소 비웃-+-음 — 1차 절단이 파생을 결정('코웃음'과 대조)" },
  해돋이: { formation: "DERIVED_SUFFIX", analysis: "직접 구성 요소 해돋-+-이 — 합성 어근에 접미사가 붙은 파생어" },
  // 단일어 (2)
  하늘: { formation: "SIMPLE", analysis: "형태소 1개 — 단일어" },
  바다: { formation: "SIMPLE", analysis: "형태소 1개 — 단일어" },
};

/** 사례 단어 정규화 — 따옴표·괄호·문장부호 제거 후 goldmap 키와 대조. */
function normalizeWord(raw: string): string {
  return raw
    .normalize("NFC")
    .trim()
    .replace(/^['‘"“(\[]+/, "")
    .replace(/[)\]'’"”.,·]+$/, "");
}

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  conceptSlots: z
    .array(
      z.object({
        label: z.enum(CONCEPT_LABELS),
        categoryKey: z
          .enum(CATEGORY_KEYS)
          .describe(
            "개념의 기계 판정 키: COMPOUND=합성어, COMPOUND_SYNTACTIC=통사적 합성어, COMPOUND_ASYNTACTIC=비통사적 합성어, DERIVED=파생어, DERIVED_PREFIX=접두 파생어, DERIVED_SUFFIX=접미 파생어, COMPLEX=복합어, SIMPLE=단일어. 이 표준 분류로 환원 불가한 개념(직접구성요소 개수 등)만 OTHER",
          ),
        definition: z
          .string()
          .min(1)
          .describe("보기에 실리는 개념 정의문 — bogi.lines 의 해당 ㉠/㉡/㉢ 행 본문과 동일(verbatim)해야 함"),
      }),
    )
    .length(3)
    .describe("보기 박스의 개념 정의 3개 — 라벨 ㉠→㉡→㉢ 순서 고정"),
  exampleJudgments: z
    .array(
      z.object({
        conceptLabel: z.enum(CONCEPT_LABELS),
        word: z.string().min(1).describe("선지에 쓴 사례 단어 — 사전 표제어형(용언은 '-다' 기본형), 따옴표 없이"),
        fits: z.boolean().describe("이 단어가 해당 개념 정의를 실제로 충족하는지 (정오 판정의 원천)"),
        analysis: z
          .string()
          .min(1)
          .describe("형태소 분석 근거 — 예: '덮-(어간)+밥(명사), 관형사형 어미 없이 결합 → 비통사적 합성어'"),
      }),
    )
    .min(6)
    .describe(
      "선지 5개 × ㉠㉡㉢ 사례 3개 = 15개 판정 전부 — 하나도 빠뜨리지 말 것. 같은 (개념, 단어) 쌍이 여러 선지에 재사용됐다면 쌍당 1회로 축약 가능(단 fits 판정은 유일해야 함)",
    ),
});

// ---------------------------------------------------------------------------
// 프롬프트 (출제 매뉴얼)
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문법 — 형태소 분석·단어 형성 (<보기> ㉠~㉢ 개념 × 사례 짝짓기)

**발문 템플릿** (정확히 이 형태로): "<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?"
— 이 유형은 긍정발문이 관행이다. 부정 변형을 쓰지 말고 '가장'을 빠뜨리지 마라.

**<보기> 구성 (bogi.lines — 3행, 자기완결 개념 정의)**:
1. 각 행은 "㉠ [정의문]" 형태 — 예: "㉡ 어근과 어근이 결합하되, 우리말의 일반적인 문장
   구성 방식에 어긋나게 결합한 단어" (비통사적 합성어).
2. 정의는 판정 조건을 **완결적으로** 담아라 — 정의만 읽고 사례의 정오를 가릴 수 있어야
   하며, 교육과정 배경지식을 별도로 요구하면 안 된다(배경지식 무력화가 존재 이유).
   "㉠ 통사적 합성어"처럼 정의 없이 용어명만 제시하는 것 금지.
3. 개념 축 조합 예: ㉠ 직접 구성 요소 기준(1차 절단의 성격) / ㉡ 접사 유형(접두·접미) /
   ㉢ 합성어의 통사적·비통사적 분류 — 판별 기준이 다른 축을 섞으면 검증량이 커진다.
4. GRAMMAR_CONCEPT 지문이 함께 주어졌다면 지문의 용어·서술과 일치시키되 자기완결성 유지.
5. 정의문에 예시 단어를 인용할 수 있으나(작은따옴표) **그 단어를 정답 선지에 재사용 금지**
   (정답 누출 — 시스템이 기계 검증한다).
6. conceptSlots 의 definition 은 bogi.lines 의 해당 행 본문과 한 글자도 다르지 않게 하라.

**선지 형식 (5개 전부 이 형식 그대로)**: "㉠: 단어, ㉡: 단어, ㉢: 단어"
- ㉠→㉡→㉢ 순서 고정. 단어는 사전 표제어형(용언은 '-다' 기본형).
- **같은 선지 안에서 단어 중복 금지.** 선지 사이에서는 소수 단어 풀(개념별 2~3개)을
  조합해 재사용해도 된다 — 매칭형의 표준 설계다(기출 관행). 단 다섯 선지의 (㉠,㉡,㉢)
  조합 패턴은 전부 달라야 하고, 같은 단어의 같은 개념 판정(fits)은 어느 선지에서든
  동일해야 한다(모순 시 반려).

**정답·오답 설계**:
1. 정답 1개: 세 단어 모두 각 개념 정의를 충족.
2. 오답 4개: **정확히 1개(최대 2개) 슬롯만 어긋나게** 하고 나머지 단어는 참이 되게 —
   3개 중 2개가 맞아야 전수 분석이 강제된다. 어긋난 슬롯은 오답마다 분산하라
   (㉠만 4번 틀리면 요령 풀이가 가능해진다).
3. 오답 함정 4원리 — 오답마다 하나를 정확히 적용:
   - **접사↔어근 혼동**: 접두사를 어근으로 오인하게 배치 — 예: 합성어 슬롯에 '맨손'
     ('맨눈, 맨발' 계열이 있어 '맨-'이 어근처럼 보이지만 접두사 → 파생어).
   - **어미↔접사 혼동**: 같은 형태의 명사형 어미와 파생 접미사('-음/-이'), 사동·피동
     접미사와 어미를 혼동하게 배치 — 예: '웃음'(파생 명사)을 두되 정의의 '새 단어
     형성/품사 변화' 조건으로 판정이 갈리게 하라.
   - **통사적↔비통사적 합성 오분류**: '덮밥'(어간+명사 — 비통사적)을 통사적 슬롯에,
     '첫사랑'(관형사+명사 — 통사적)을 비통사적 슬롯에 두는 교차 배치.
   - **직접구성요소 분석 단계 오류**: 1차 절단이 분류를 가르는 단어 활용 — 예:
     '코웃음'=코+웃음(합성) vs '비웃음'=비웃-+-음(파생), 내부의 같은 '웃음'이 오분류 유도.
4. 정답 번호를 특정 위치에 몰지 마라 — 최종 위치 균형은 시스템 셔플이 보장한다.

**빈출 대조 사례 (분류 확정치 — 시스템이 결정론 검증하므로 아래와 다르게 판정 금지)**:
- 통사적 합성어: 첫사랑(관형사+명사) · 밤낮(명사+명사) · 큰집(관형사형 어미 개재) · 들어가다(연결어미 개재) · 본받다(목적어-서술어)
- 비통사적 합성어: 덮밥(어간+명사) · 늦잠 · 부슬비(부사성 어근+명사) · 여닫다(어간+어간)
- 접두 파생어: 새파랗다 · 맨손 · 풋사과 · 되묻다 / 접미 파생어: 지우개 · 어른스럽다 · 웃음 · 높이다(사동 접미사) · 지붕(집+-웅)
- 직접구성요소 대조 쌍: 코웃음=합성 vs 비웃음=파생 / 덮밥=합성 vs 덮개=파생

**exampleJudgments 작성 (15개 전부 — 판정의 원천)**:
- 선지에 쓴 (개념, 단어) 쌍마다 fits(충족 여부)와 analysis(형태소 분해 근거)를 기록하라.
- analysis 는 형태소 분해를 명시: "지우-(어근)+-개(접미사) → 접미 파생어" 수준.
- 같은 단어를 같은 개념에 두 번 판정하며 fits 를 다르게 쓰는 모순 금지.

**근거앵커(evidence)**: 모든 선지에 부착하되 spanText 는 **<보기>의 해당 개념 정의문에서
verbatim 인용**하라(이 유형은 지문이 없으므로 <보기>가 인용의 원천이다). 정답=SUPPORTS+
세 슬롯이 충족하는 정의 구절, 오답=CONTRADICTS+어긋난 슬롯이 위배하는 정의 조건 구절.

**해설(explanation)**: 정답의 세 단어를 슬롯 순서대로 형태소 분해하며 정의 충족을 보이고,
각 오답은 어긋난 슬롯 하나를 짚어 분해 근거로 배제하라.

**금지**:
- 학교문법 안에서 분류가 논쟁적인 단어(어원 불투명어, 사전·교과서 간 합성/파생 판정이
  갈리는 경계어) — 채점 시비의 원천.
- 비표준어·방언·고유명사·전문어. 같은 선지 내 단어 중복 사용.
- <보기> 정의문에 정답 선지의 단어 노출(누출).
- 발음·사잇소리·표기 규정 등 단어 형성 이외의 지식을 판정 근거로 요구.`;

// ---------------------------------------------------------------------------
// 설정 (examMode·개념 축)
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const scheme = settings.conceptScheme;
  if (scheme === "FORMATION_3WAY") {
    lines.push(
      "- 개념 축: ㉠=통사적 합성어(categoryKey=COMPOUND_SYNTACTIC), ㉡=비통사적 합성어(COMPOUND_ASYNTACTIC), ㉢=파생어(DERIVED) 로 고정 출제하라.",
    );
  } else if (scheme === "DERIVATION_SPLIT") {
    lines.push(
      "- 개념 축: ㉠=합성어(categoryKey=COMPOUND), ㉡=접두 파생어(DERIVED_PREFIX), ㉢=접미 파생어(DERIVED_SUFFIX) 로 고정 출제하라.",
    );
  } else if (scheme === "IC_MIX") {
    lines.push(
      "- 개념 축: 직접 구성 요소 기준 개념을 최소 1개 포함해 혼합 구성하라 (예: ㉠ 직접 구성 요소 중 하나가 접사인 단어=DERIVED, ㉡ 직접 구성 요소가 모두 어근이며 통사 구성에 어긋난 단어=COMPOUND_ASYNTACTIC, …). 표준 분류로 환원되는 개념은 반드시 그 categoryKey 를 쓰고, 환원 불가할 때만 OTHER.",
    );
  } else {
    lines.push(
      "- 개념 축은 3가지 조합(합성·파생 분류 / 접사 유형 / 직접 구성 요소 기준) 중 지문·난이도에 맞게 선택하되, categoryKey 는 가능한 한 표준 분류 키로 선언하라(OTHER 남발 금지 — 시스템 결정론 검증이 무력화된다).",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 문법 단원의 대표 용례(위 '빈출 대조 사례' 목록의 단어들)를 우선 사용하고, <보기> 정의문은 교과서 서술 문형('~을 합성어라 한다')에 밀착하라. 어긋난 슬롯의 판정은 수업 필기 수준(접두/접미 구분, 합성/파생 구분)에서 갈리게 하라.",
    );
  } else {
    lines.push(
      "- 수능(언매) 모드: 대표 용례에 교과서 밖 낯선 단어를 1~2개 섞되 판정은 <보기> 정의만으로 가능해야 한다(배경지식 무력화). 직접구성요소 1차 절단이 분류를 가르는 단어(코웃음/비웃음 계열)를 포함해 검증 비용을 키워라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 (유형 특화 결정론 게이트)
// ---------------------------------------------------------------------------

interface ParsedOption {
  optionLabel: string;
  text: string;
  words: Partial<Record<ConceptLabel, string>>;
  orderOk: boolean;
}

function parseOption(optionLabel: string, text: string): ParsedOption {
  const words: Partial<Record<ConceptLabel, string>> = {};
  const positions: number[] = [];
  for (const label of CONCEPT_LABELS) {
    const re = new RegExp(`${label}\\s*[:：\\-]?\\s*['‘]?([가-힣]+)`);
    const m = re.exec(text);
    if (m) {
      words[label] = normalizeWord(m[1]);
      positions.push(text.indexOf(label));
    }
  }
  const orderOk = positions.every((p, i) => i === 0 || p > positions[i - 1]);
  return { optionLabel, text, words, orderOk };
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";

  // ---- [결정론 0] 발문 템플릿: <보기>·㉠~㉢ 지시 필수 ----
  const direction = typeof question.direction === "string" ? question.direction : "";
  if (direction && (!direction.includes("보기") || !direction.includes("㉠"))) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 <보기>의 ㉠~㉢ 개념을 지시하지 않습니다 — "<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?" 템플릿을 사용하세요 (현재: "${direction.slice(0, 40)}")`,
    );
  }

  // ---- [결정론 1] 보기 구조 게이트: ㉠㉡㉢ 정의 3개 + conceptSlots 정합 ----
  const bogi =
    question.bogi && typeof question.bogi === "object" ? (question.bogi as Record<string, unknown>) : null;
  const bogiLines = bogi && Array.isArray(bogi.lines)
    ? (bogi.lines as unknown[]).filter((l): l is string => typeof l === "string")
    : [];
  const bogiJoined = bogiLines.join("\n");
  if (!bogiLines.length) {
    add("error", "ko-bogi-missing", "이 유형은 <보기>(개념 정의 ㉠~㉢)가 필수인데 bogi 가 없습니다");
  }
  const slots = Array.isArray(question.conceptSlots)
    ? (question.conceptSlots as Record<string, unknown>[])
    : [];
  const slotByLabel = new Map<ConceptLabel, { categoryKey: string; definition: string }>();
  for (const s of slots) {
    const label = typeof s.label === "string" ? (s.label as ConceptLabel) : null;
    if (!label || !CONCEPT_LABELS.includes(label)) continue;
    slotByLabel.set(label, {
      categoryKey: typeof s.categoryKey === "string" ? s.categoryKey : "OTHER",
      definition: typeof s.definition === "string" ? s.definition : "",
    });
  }
  const slotLabels = slots.map((s) => (typeof s.label === "string" ? s.label : ""));
  if (slotLabels.join("") !== CONCEPT_LABELS.join("")) {
    add("error", "ko-bogi-missing", `conceptSlots 라벨이 ㉠㉡㉢ 순서가 아닙니다: ${slotLabels.join("") || "(없음)"}`);
  }
  for (const label of CONCEPT_LABELS) {
    if (bogiLines.length && !bogiLines.some((line) => line.includes(label))) {
      add("error", "ko-bogi-missing", `<보기>에 ${label} 개념 정의 행이 없습니다`);
    }
    const slot = slotByLabel.get(label);
    if (slot?.definition && bogiJoined && !ctx.koText.containsSpanKo(bogiJoined, slot.definition)) {
      add(
        "error",
        "ko-bogi-missing",
        `conceptSlots ${label} 의 definition 이 <보기> 본문에 verbatim 으로 없습니다 — 보기 행과 동일하게 맞추세요`,
      );
    }
  }

  // ---- 판정 원장 구성 + [결정론 2] 내부 모순 검사 ----
  const judgments = Array.isArray(question.exampleJudgments)
    ? (question.exampleJudgments as Record<string, unknown>[])
    : [];
  const judgmentMap = new Map<string, { fits: boolean; analysis: string }>();
  for (const j of judgments) {
    const label = typeof j.conceptLabel === "string" ? (j.conceptLabel as ConceptLabel) : null;
    const word = typeof j.word === "string" ? normalizeWord(j.word) : "";
    const fits = typeof j.fits === "boolean" ? j.fits : null;
    if (!label || !CONCEPT_LABELS.includes(label) || !word || fits === null) continue;
    const key = `${label}|${word}`;
    const prev = judgmentMap.get(key);
    if (prev && prev.fits !== fits) {
      add("error", "ko-solver-mismatch", `exampleJudgments 내부 모순: ${label} '${word}' 의 fits 판정이 상충합니다`);
    }
    judgmentMap.set(key, { fits, analysis: typeof j.analysis === "string" ? j.analysis : "" });
  }

  // ---- [결정론 3] goldmap 대조 (선지 판정) ----
  for (const [key, judgment] of judgmentMap) {
    const [label, word] = key.split("|") as [ConceptLabel, string];
    const gold = KO_WORD_FORMATION_GOLDMAP[word];
    const slot = slotByLabel.get(label);
    if (!gold || !slot) continue;
    const expected = categoryAccepts(slot.categoryKey, gold.formation);
    if (expected === null) continue; // OTHER — 대조 불가
    if (expected !== judgment.fits) {
      add(
        "error",
        "ko-solver-mismatch",
        `goldmap 모순: '${word}'는 ${FORMATION_LABELS[gold.formation]}(${gold.analysis})인데 ${label}(${slot.categoryKey}) 충족 여부를 ${judgment.fits ? "충족" : "미충족"}으로 판정했습니다`,
      );
    }
  }

  // ---- [결정론 4] goldmap 대조 (<보기> 정의문의 인용 예시) ----
  for (const label of CONCEPT_LABELS) {
    const slot = slotByLabel.get(label);
    if (!slot || slot.categoryKey === "OTHER") continue;
    const labelLine = bogiLines.find((line) => line.includes(label));
    if (!labelLine) continue;
    for (const quoted of ctx.koText.extractQuotedSpansKo(labelLine)) {
      const word = normalizeWord(quoted);
      const gold = KO_WORD_FORMATION_GOLDMAP[word];
      if (!gold) continue;
      const expected = categoryAccepts(slot.categoryKey, gold.formation);
      if (expected === false) {
        add(
          "error",
          "ko-solver-mismatch",
          `<보기> ${label} 정의문의 인용 예시 '${word}'가 개념과 모순됩니다 — '${word}'는 ${FORMATION_LABELS[gold.formation]}(${gold.analysis})`,
        );
      }
    }
  }

  // ---- 선지 파싱 + [결정론 5] 삼중쌍 형식·판정 3자 정합 ----
  const optionsRaw = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const parsed: ParsedOption[] = [];
  for (const o of optionsRaw) {
    const label = typeof o.label === "string" ? o.label : "";
    const text = typeof o.text === "string" ? o.text : "";
    if (!label || !text) continue;
    const p = parseOption(label, text);
    parsed.push(p);
    for (const cLabel of CONCEPT_LABELS) {
      if (!p.words[cLabel]) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지가 "㉠: 단어, ㉡: 단어, ㉢: 단어" 형식이 아닙니다 — ${cLabel} 사례를 파싱할 수 없습니다`,
        );
      } else if (!judgmentMap.has(`${cLabel}|${p.words[cLabel]}`)) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지의 ${cLabel} 사례 '${p.words[cLabel]}'에 대한 exampleJudgments 판정이 없습니다 — 15개 전부 기록하세요`,
        );
      }
    }
    if (!p.orderOk) {
      add("warning", "ko-marker-order", `${label} 선지의 ㉠㉡㉢ 표기가 순서대로가 아닙니다`);
    }
  }

  // ---- [결정론 6] 정오 구조: 정답=전 슬롯 충족, 오답=최소 1 미충족 ----
  const misfitLabelsOfWrong: ConceptLabel[][] = [];
  for (const p of parsed) {
    const fitsList: (boolean | null)[] = CONCEPT_LABELS.map((cLabel) => {
      const word = p.words[cLabel];
      return word ? judgmentMap.get(`${cLabel}|${word}`)?.fits ?? null : null;
    });
    if (fitsList.some((f) => f === null)) continue; // 형식 오류는 위에서 이미 차단
    const misfits = CONCEPT_LABELS.filter((_, i) => fitsList[i] === false);
    if (p.optionLabel === correctAnswer) {
      if (misfits.length > 0) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `정답 ${p.optionLabel} 의 ${misfits.join(", ")} 사례가 개념을 충족하지 않는 것으로 판정돼 있습니다 — 정답은 세 슬롯 전부 충족해야 합니다`,
        );
      }
    } else {
      if (misfits.length === 0) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `오답 ${p.optionLabel} 의 세 사례가 모두 개념을 충족합니다 — 복수 정답. 최소 1개 슬롯을 어긋나게 하세요`,
        );
      }
      misfitLabelsOfWrong.push(misfits);
    }
  }

  // ---- [결정론 7] 정답 누출: 정답 선지의 사례 단어가 <보기> 정의문에 등장 ----
  const correctParsed = parsed.find((p) => p.optionLabel === correctAnswer);
  if (correctParsed && bogiJoined) {
    for (const cLabel of CONCEPT_LABELS) {
      const word = correctParsed.words[cLabel];
      if (word && bogiJoined.includes(word)) {
        add(
          "error",
          "ko-answer-leak",
          `정답 선지의 사례 '${word}'가 <보기> 정의문에 그대로 등장합니다 — 정의 예시와 정답 사례를 분리하세요`,
        );
      }
    }
  }

  // ---- 경고: 오답 misfit 슬롯 집중 / 사례 단어 재사용 ----
  if (misfitLabelsOfWrong.length >= 3) {
    const flat = misfitLabelsOfWrong.flat();
    const allSame = flat.length > 0 && flat.every((l) => l === flat[0]);
    if (allSame) {
      add(
        "warning",
        "ko-option-ending",
        `오답의 어긋난 슬롯이 전부 ${flat[0]} 에 몰려 있습니다 — 오답마다 misfit 슬롯을 분산해 요령 풀이를 막으세요`,
      );
    }
  }
  // 선지 간 단어 재사용은 매칭형(소수 단어 풀 조합)의 정상 설계 — 기출과 동일 관행이라
  // 경고하지 않는다(종전 '15개 전부 달라야' 검사는 오탐 — 판정단 확인). 결함은
  // ① 같은 선지 안의 단어 중복(슬롯 낭비·변별 붕괴)과 ② 선지 간 (㉠,㉡,㉢) 조합
  // 완전 동일(사실상 같은 선지 2개)뿐이다.
  const comboOf = new Map<string, string>();
  for (const p of parsed) {
    const inOption = new Map<string, string>();
    for (const cLabel of CONCEPT_LABELS) {
      const word = p.words[cLabel];
      if (!word) continue;
      const firstSlot = inOption.get(word);
      if (firstSlot) {
        add(
          "warning",
          "ko-option-ending",
          `${p.optionLabel} 선지 안에서 사례 단어 '${word}'가 ${firstSlot}·${cLabel} 슬롯에 중복 사용됐습니다 — 한 선지의 세 사례는 서로 달라야 합니다`,
        );
      } else {
        inOption.set(word, cLabel);
      }
    }
    const combo = CONCEPT_LABELS.map((cLabel) => p.words[cLabel] ?? "").join("|");
    if (combo.replace(/\|/g, "")) {
      const priorLabel = comboOf.get(combo);
      if (priorLabel) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `${priorLabel} 와 ${p.optionLabel} 선지의 사례 조합이 완전히 동일합니다 — 선지 중복(변별 붕괴)`,
        );
      } else {
        comboOf.set(combo, p.optionLabel);
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_GR_MORPH: KoTypeModule = {
  meta: {
    typeId: "KO_GR_MORPH",
    area: "GRAMMAR",
    label: "형태소·단어 형성(㉠~㉢ 사례)",
    formatCategory: "객관식",
    uiGroup: "국어 문법",
    answerFormat: "MC5",
    includesPassage: false,
    passageKinds: ["GRAMMAR_CONCEPT"],
    defaultPoints: 2,
    usesBogi: "required",
    markerFamilies: [], // ㉠~㉢ 는 <보기> 내부 개념 라벨 — 지문 마커 아님
    optionEnding: "any", // 선지가 "㉠: 단어, ㉡: 단어, ㉢: 단어" 나열형
    needsSolverGate: false, // goldmap 결정론 대조가 유형 내장 솔버 역할
    description:
      "<보기>의 단어 형성·형태소 개념 정의 ㉠~㉢에 사례 단어를 짝짓는 문법 단독형 — 빈출 단어 goldmap(33개) 결정론 검증 내장",
    setSlot:
      "언매 단독 문법 슬롯(36~38번대, 2026 수능 39번 의존 형태소 판별 실측) — 지문 없이 <보기> 단독 출제, 내신 문법 단원(단어의 형성) 최다 빈출 축",
    studentTask:
      "<보기>의 개념 정의 ㉠~㉢을 읽고, 선지의 사례 단어 삼중쌍을 형태소 분석해 세 슬롯이 모두 들어맞는 하나를 고릅니다.",
    bestFor: [
      "단어 형성(합성·파생) 개념 확인 — 지문 없이 출제 가능",
      "GRAMMAR_CONCEPT 지문(단어 형성 단원)과 세트 구성",
      "내신 문법 단원 대표 용례 암기·적용 확인",
    ],
    outputUi: ["<보기> 개념 정의 박스(㉠~㉢)", "5지선다(사례 삼중쌍)", "슬롯별 형태소 분석 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "conceptScheme",
        label: "개념 축 구성",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(난이도·지문 특성)" },
          { value: "FORMATION_3WAY", label: "통사적/비통사적 합성·파생 3분" },
          { value: "DERIVATION_SPLIT", label: "합성·접두 파생·접미 파생 3분" },
          { value: "IC_MIX", label: "직접구성요소 기준 혼합(고난도)" },
        ],
        defaultValue: "AUTO",
        description: "㉠~㉢ 세 개념의 분류 축 조합 — 혼합형일수록 검증량이 커집니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    // 문법 단독형 — 지문 미동봉(GRAMMAR_CONCEPT 지문은 생성 참조용일 뿐 렌더 비대상).
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "빈출 대조 사례(goldmap 수준의 대표 용례)만 사용하라. 오답의 misfit 은 범주 거리가 먼 오분류(단일어를 합성어 슬롯에, 접두 파생어를 접미 슬롯에)로 명백하게. 개념 축은 합성/파생 2분법 계열로 단순하게.",
    INTERMEDIATE:
      "misfit 을 인접 범주 간 오분류(통사적↔비통사적, 접두↔접미)로 좁혀라. 오답마다 misfit 슬롯을 분산하고, 오답 4개 중 최소 2개는 '3개 중 2개가 참'인 구성으로 전수 분석을 유도하라.",
    KILLER:
      "직접구성요소 1차 절단이 분류를 가르는 단어 쌍(코웃음/비웃음, 덮밥/덮개, 해돋이 계열)을 정답과 오답에 함께 배치하고, 어미↔접사 혼동 함정('-음/-이' 계열)을 최소 1개 포함하라. 모든 오답은 정확히 1개 슬롯만 어긋나게 해 세 슬롯 전수 형태소 분석 없이는 배제가 불가능하게 설계하라. 개념 축은 IC 기준 혼합(IC_MIX)을 우선 고려하라.",
  },
};
