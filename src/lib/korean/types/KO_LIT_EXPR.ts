// ============================================================================
// KO_LIT_EXPR — 문학 표현상 특징 (운문 중심)  【기법 은행 대조형 MC5】
// ============================================================================
// 카탈로그 §2.2 KO_LIT_EXPR + 스펙 §5 사양의 전면 구현.
//
// 실측 근거:
//   발문: "(가), (나)에 대한 설명으로 가장 적절한 것은?" / "윗글의 표현상 특징으로
//         가장 적절한 것은?" (운문 세트 1번 슬롯)
//   선지: "[기법]+~하여/~을 통해+[효과]" 2단 구조 고정, 어미 '~고 있다'(strategy)
//   오답 3원리: (a)기법 자체가 지문에 부재 (b)기법 실재·효과 왜곡
//              (c)기법-효과 연결 오류 (+복합지문 확장: 한 작품만 성립을 '모두'로)
//   기법 개념어는 닫힌 집합(은행) — 개념어 오용이 AI 생성 국어 문항의 최대 실패
//   양상(카탈로그 G8 온톨로지 게이트)이므로 은행 대조를 결정론 검증한다.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { splitKoPassageParts } from "../core/passage-meta";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 기법 개념어 은행 (닫힌 집합 상수 — 카탈로그 "기법 어휘 풀은 닫힌 집합")
// canonical = 프롬프트·optionAnalyses 기입용 원형, aliases = 선지 문면 활용형.
// 매칭은 공백·가운뎃점 제거 정규화 후 부분 문자열 대조(결정론).
// ---------------------------------------------------------------------------

interface KoExprTechniqueEntry {
  canonical: string;
  aliases: readonly string[];
}

const TECHNIQUE_BANK: readonly KoExprTechniqueEntry[] = [
  { canonical: "대구", aliases: ["대구법", "유사한 통사 구조", "동일한 문장 구조"] },
  { canonical: "설의", aliases: ["설의법", "설의적"] },
  { canonical: "영탄", aliases: ["영탄법", "영탄적"] },
  { canonical: "반어", aliases: ["반어법", "반어적"] },
  { canonical: "역설", aliases: ["역설법", "역설적"] },
  { canonical: "의인화", aliases: ["의인법", "의인"] },
  { canonical: "활유", aliases: ["활유법"] },
  { canonical: "직유", aliases: ["직유법"] },
  { canonical: "은유", aliases: ["은유법"] },
  { canonical: "비유", aliases: ["비유법", "비유적"] },
  { canonical: "상징", aliases: ["상징적"] },
  { canonical: "대유", aliases: ["대유법", "제유", "환유"] },
  { canonical: "과장", aliases: ["과장법", "과장된 표현"] },
  { canonical: "언어유희", aliases: [] },
  { canonical: "수미상관", aliases: ["수미상응"] },
  { canonical: "색채어", aliases: [] },
  { canonical: "색채 대비", aliases: ["색채의 대비"] },
  { canonical: "음성상징어", aliases: ["의성어", "의태어"] },
  { canonical: "감정이입", aliases: ["감정 이입"] },
  { canonical: "객관적 상관물", aliases: [] },
  { canonical: "시선의 이동", aliases: ["시선 이동"] },
  { canonical: "공간의 이동", aliases: ["공간 이동"] },
  { canonical: "어조 변화", aliases: ["어조의 변화", "어조의 전환"] },
  { canonical: "반복", aliases: ["반복법", "동일한 시어의 반복", "동일한 시구의 반복"] },
  { canonical: "열거", aliases: ["열거법"] },
  { canonical: "점층", aliases: ["점층법", "점층적"] },
  { canonical: "대조", aliases: ["대조법", "대비"] },
  { canonical: "도치", aliases: ["도치법"] },
  { canonical: "문답", aliases: ["문답법", "자문자답"] },
  { canonical: "돈호", aliases: ["돈호법", "말을 건네는 방식", "말을 건네는 어투"] },
  { canonical: "시각적 심상", aliases: [] },
  { canonical: "청각적 심상", aliases: [] },
  { canonical: "촉각적 심상", aliases: [] },
  { canonical: "후각적 심상", aliases: [] },
  { canonical: "미각적 심상", aliases: [] },
  { canonical: "공감각적 심상", aliases: ["감각의 전이"] },
  { canonical: "계절감 소재", aliases: ["계절감", "계절적 이미지"] },
  { canonical: "음보율", aliases: ["규칙적인 율격", "운율"] },
  { canonical: "선경후정", aliases: [] },
  { canonical: "시상 전환", aliases: ["시상의 전환"] },
  { canonical: "시간의 흐름", aliases: ["시간의 경과"] },
];

/** 공백·가운뎃점 제거 정규화 (은행 대조 전용). */
function normTerm(text: string): string {
  return text.normalize("NFC").replace(/[\s·]/g, "");
}

/** 은행 엔트리별 정규화 별칭 전개 (canonical 포함). */
const BANK_TERMS: readonly { entry: KoExprTechniqueEntry; norm: string }[] = TECHNIQUE_BANK.flatMap(
  (entry) => [entry.canonical, ...entry.aliases].map((t) => ({ entry, norm: normTerm(t) })),
);

/** 개념어 후보가 은행 원소(또는 그 활용형)인가 — 결정론 대조. */
function findBankEntry(candidate: string): KoExprTechniqueEntry | null {
  const cand = normTerm(candidate);
  if (cand.length < 2) return null;
  for (const { entry, norm } of BANK_TERMS) {
    if (cand === norm || cand.includes(norm) || norm.includes(cand)) return entry;
  }
  return null;
}

/** 선지 문면에서 '~법'/'~적 심상' 접미형 개념어 후보 추출 (외부 개념어 검출용).
 *  비탐욕 매칭이라 "풍유법을" 처럼 조사가 붙어도 '풍유법' 까지만 잡는다. */
const SUFFIX_CONCEPT_RE = /[가-힣]{1,8}?법|[가-힣]{2,5}적\s?심상/g;
/** 접미 '법'이지만 기법 개념어가 아닌 일반어. */
const SUFFIX_STOPLIST = new Set(["방법", "기법", "수법", "어법", "문법", "화법", "표현법", "수사법"]);

/** 선지 2단 구조의 기법부-효과부 연결어. */
const CONNECTOR_RE = /(하여|해서|하며|하면서|함으로써|[을를]\s?통해|[을를]\s?활용하|[을를]\s?사용하|[을를]\s?구사하|[을를]\s?동원하)/;

/** 발문·선지의 (가)(나)(다)(라) 파트 참조 추출. */
const PART_REF_RE = /\((가|나|다|라)\)/g;

// ---------------------------------------------------------------------------
// 스키마 — 공통 MC5 봉투 + 발문 극성 + 선지별 기법 분석(은행 대조 게이트 소비)
// ---------------------------------------------------------------------------

const koExprFlawPrinciple = z.enum([
  "NONE",
  "TECHNIQUE_ABSENT",
  "EFFECT_DISTORTED",
  "LINK_MISMATCH",
  "SCOPE_OVERREACH",
]);

const schema = koMc5Envelope({
  stemPolarity: z
    .enum(["POSITIVE", "NEGATIVE"])
    .describe(
      "발문 극성 — POSITIVE: '~에 대한 설명으로 가장 적절한 것은?' (기본, 함정 4+참 1), NEGATIVE: '적절하지 않은 것은?' (참 4+함정 1)",
    ),
  optionAnalyses: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("선지 라벨 — ①~⑤ 각 1회"),
        technique: z
          .string()
          .min(1)
          .describe(
            "이 선지 기법부의 핵심 개념어 1개 — 반드시 기법 은행의 원형 그대로 기입 (예: '설의', '색채 대비', '공감각적 심상')",
          ),
        techniquePresent: z
          .boolean()
          .describe("이 기법이 선지가 주장하는 범위의 지문(작품)에 실재하는가"),
        flawPrinciple: koExprFlawPrinciple.describe(
          "NONE=참 선지 / TECHNIQUE_ABSENT=기법 자체가 지문에 부재(원리 a) / EFFECT_DISTORTED=기법은 실재하나 효과 왜곡(원리 b) / LINK_MISMATCH=기법도 효과도 각각 실재하나 연결이 허위(원리 c) / SCOPE_OVERREACH=한 작품만 성립하는 기법을 '(가)와 (나) 모두'로 확장(복합지문 전용)",
        ),
      }),
    )
    .length(5)
    .describe("선지별 기법 분석 5개 — ①~⑤ 순서대로. 검증 게이트가 은행 대조·극성 정합 검사에 사용"),
});

// ---------------------------------------------------------------------------
// 프롬프트 — 출제 매뉴얼
// ---------------------------------------------------------------------------

const bankListing = TECHNIQUE_BANK.map((t) => t.canonical).join(", ");

const prompt = `### 유형: 문학 — 표현상 특징 (운문 중심)

**발문 템플릿** (stemPolarity·지문 구성에 따라 정확히 이 형태로):
- 단일 작품·긍정(기본): "윗글의 표현상 특징으로 가장 적절한 것은?"
- 단일 작품·부정: "윗글에 대한 설명으로 적절하지 않은 것은?"
- 복합 (가)(나)·긍정: "(가)와 (나)에 대한 설명으로 가장 적절한 것은?"
- 복합 (가)(나)·부정: "(가), (나)에 대한 설명으로 적절하지 않은 것은?"
- (가)/(나) 라벨은 지문에 실재하는 파트만 참조하라 — 지문에 없는 파트를 발문·선지가 언급하면 자동 반려된다.

**선지 2단 구조 (고정)**:
모든 선지는 "[기법부] + ~하여/~을 통해 + [효과부] ~하고 있다" 2단 구조로 쓴다. 어미는 반드시 '~고 있다'.
- 좋은 예: "설의적 표현을 통해 자연에 귀의하려는 화자의 의지를 부각하고 있다."
- 나쁜 예(효과부 없음): "설의법이 사용되었다."
- 나쁜 예(내용 이해 선지 — 이 유형이 아님): "화자는 떠나온 고향을 그리워하고 있다."
효과부는 화자의 정서·태도·시적 대상의 속성·분위기·주제 의식·운율감·구조적 안정감 등 **작품 내적 효과**와 연결하라. 기법부는 선지당 **정확히 1개** — 기법 2개 병렬("반복과 대구를 통해")은 판정 지점을 흐리므로 금지.

**기법 개념어 은행 (닫힌 집합 — 이 밖의 개념어 사용 금지)**:
${bankListing}
- 기법부에는 은행 원소(또는 '~법'/'~적 표현' 활용형: 설의→설의법·설의적 표현)만 사용하라. 은행에 없는 개념어(풍유법·중의법·억양법 등)를 쓰면 반려된다.
- optionAnalyses[i].technique 에는 해당 선지 기법부의 개념어를 은행 원형 그대로 기입하라 (선지 순서와 1:1).

**선지 구성 원리**:
1. 5개 선지의 기법은 서로 달라야 한다 — 같은 기법 2회 금지 (심상 계열은 감각이 다르면 별개로 침).
2. 참 선지의 기법은 지문에서 **구현 시행을 특정**할 수 있어야 한다. 형식 표지가 있는 기법(직유의 '~같이/~듯이', 설의의 의문형 종결, 색채어의 색 어휘, 음성상징어)을 우선 활용하면 실재 판정이 명확해진다.
3. POSITIVE 발문: 참 선지 1개(=정답) + 함정 선지 4개. NEGATIVE 발문: 참 선지 4개 + 함정 선지 1개(=정답).
4. **오답 함정 3원리(+복합 확장 1)** — 각 함정 선지에 정확히 하나를 적용하고 flawPrinciple 로 선언하라:
   - (a) TECHNIQUE_ABSENT — 기법 자체가 지문에 부재: 지문 분위기와 어울려 그럴듯하지만 형식 표지가 전혀 없는 기법 (예: 첫 연과 끝 연이 다른 시에 "수미상관을 통해 구조적 안정감을 부여하고 있다").
   - (b) EFFECT_DISTORTED — 기법은 실재하나 효과 왜곡: 기법부는 참, 효과부가 허위 (예: 예찬적 설의가 있는 시에 "설의적 표현을 통해 대상에 대한 냉소적 태도를 드러내고 있다" — 태도의 극성·방향을 비틀기).
   - (c) LINK_MISMATCH — 기법-효과 연결 오류: 기법도 효과도 지문에 각각 실재하지만 서로 무관 (예: 색채어도 있고 애상적 정서도 있으나 애상감은 하강 이미지에서 나오는 시에 "색채어를 활용하여 애상적 정서를 자아내고 있다"). 가장 정교한 함정 — 기법 확인만으로는 못 거르고 인과까지 검증해야 한다.
   - (복합지문 전용) SCOPE_OVERREACH — 한 작품에만 성립하는 기법을 "(가)와 (나) 모두 ~하고 있다"로 확장. 단일 작품 지문에서는 사용 금지.
5. POSITIVE 발문의 함정 4개는 원리를 섞어라 — 같은 원리 3회 이상 금지. (a)만 4개면 기법 존재 확인만으로 풀리는 하급 문항이 된다.
6. 함정 선지의 기법도 은행 원소여야 한다 — 함정은 개념어가 낯설어서가 아니라 **지문 대조**에서 갈려야 한다.
7. 판정이 논쟁적일 수 있는 기법(상징·공감각적 심상·객관적 상관물)은 명백한 구현 사례가 있을 때만 참 선지로 쓰라. 참/거짓이 문면에서 결정되지 않는 선지는 복수정답 시비의 원천이다.

**근거앵커(evidence) 작성법**:
- 참 선지(SUPPORTS): 기법이 구현된 시행·구절을 지문에서 **그대로 복사** (예: 직유 참 선지 → '~같이'가 실제 들어간 행). 개행이 있는 행은 한 행 단위로.
- (a) 기법 부재(NOT_MENTIONED): 그 기법으로 착각하기 가장 쉬운 구절을 앵커하고, note 에 왜 그 기법이 아닌지(형식 표지 부재)를 한 줄로.
- (b) 효과 왜곡·(c) 연결 오류(DISTORTS): 기법이 구현된 구절을 앵커하고, note 에 실제 효과와 선지의 허위 효과를 대비.
- SCOPE_OVERREACH(DISTORTS): 기법이 성립하는 쪽 작품의 구절을 앵커하고, note 에 다른 작품에는 부재함을 명시.

**금지**:
- 은행 밖 기법 개념어.
- 표현 기법이 아닌 내용 이해·인물 심리·감상 선지.
- 기법 2개 병렬 선지, 효과부 없는 선지.
- 시행 근거 없이 '전반적 분위기'로만 성립하는 참 선지.
- 두 개 이상의 선지가 같은 이유(같은 구절·같은 원리)로 틀리는 구성.`;

// ---------------------------------------------------------------------------
// 설정 → 프롬프트
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.stemPolarity === "NEGATIVE") {
    lines.push(
      "- stemPolarity=NEGATIVE 로 출제하라: 발문은 '~에 대한 설명으로 적절하지 않은 것은?', 선지는 참 4 + 함정 1.",
    );
  } else {
    lines.push(
      "- stemPolarity=POSITIVE 로 출제하라: 발문은 '~(에 대한 설명으로/의 표현상 특징으로) 가장 적절한 것은?', 선지는 함정 4 + 참 1.",
    );
  }
  if (settings.compareScope === "MULTI") {
    lines.push(
      "- 복합 판정으로 출제하라: 지문의 (가)(나) 파트를 함께 묶는 발문('(가), (나)에 대한 설명으로…')을 쓰고, 선지 5개 중 2개 이상은 '(가)와 (나) 모두 ~하고 있다' 공통 판정 프레임으로 구성하라 (지문에 (가)(나) 파트가 실재할 때만 — 없으면 단일 작품 발문으로 강등하라).",
    );
  } else if (settings.compareScope === "SINGLE") {
    lines.push("- 단일 작품 판정으로 출제하라: 발문은 '윗글의 표현상 특징으로…' 계열, (가)(나) 공통 판정 프레임 금지.");
  } else {
    lines.push(
      "- 판정 범위는 지문 구성에 따르라: (가)(나) 복합지문이면 복합 발문 + 공통 판정 프레임 일부 포함, 단일 작품이면 '윗글' 발문.",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 수업 필기 기법 목록 확인 성격 — 기법 개념어를 선지 문면에 명시적으로 드러내고, 정오가 개념어 정의의 정확한 적용(예: 반어 vs 역설, 감정이입 vs 객관적 상관물 변별)에서 갈리게 하라. 수미상관·음보율 같은 구조·율격 기법까지 적극 활용하고, 기출 선지의 미세 변형(기법부 유지 + 효과부 한 단어 치환) 스타일을 허용한다.",
    );
  } else {
    lines.push(
      "- 수능 모드: 초견 작품 판정 전제 — 기법 실재 여부가 지문 문면의 형식 표지에서 확인 가능해야 하고, 자습서식 고정 해석·작품 배경지식에 의존하는 선지는 금지한다.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 — 유형 특화 결정론 체크
//   1) 기법 개념어 은행 대조 (선언 technique + 선지 문면 접미형 개념어 스캔)
//   2) (가)(나) 파트 참조 무결성 ('모두' 공통 판정 프레임 포함)
//   3) 발문 극성 ↔ stemPolarity ↔ flawPrinciple 정합
//   4) 선지 2단 구조(기법부-효과부 연결어) 존재
// 공통 게이트(선지 수·근거앵커 verbatim·어미 strategy)는 dispatch 선실행 — 중복 금지.
// ---------------------------------------------------------------------------

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const analyses = Array.isArray(question.optionAnalyses)
    ? (question.optionAnalyses as Record<string, unknown>[])
    : [];

  // --- 발문 극성 ↔ 선언 극성 정합 -----------------------------------------
  const stemPolarity = question.stemPolarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // --- (가)(나) 파트 참조 무결성 -------------------------------------------
  // "(가)와 (나) 모두" 공통 판정 프레임 포함, 발문·선지가 참조하는 모든 파트
  // 라벨이 지문에 실재해야 한다 (단일 지문에 (나) 참조 = 구조 무효).
  const parts = splitKoPassageParts(ctx.passage);
  const partLabels = new Set(parts.map((p) => p.label).filter(Boolean) as string[]);
  const referencedIn = (text: string): string[] => {
    const found: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(PART_REF_RE.source, "g");
    while ((m = re.exec(text)) !== null) found.push(`(${m[1]})`);
    return found;
  };
  const referenceSources: { where: string; text: string }[] = [
    { where: "발문", text: direction },
    ...options.map((o, i) => ({
      where: `${typeof o.label === "string" ? o.label : `선지${i + 1}`} 선지`,
      text: typeof o.text === "string" ? o.text : "",
    })),
  ];
  const reportedMissing = new Set<string>();
  for (const src of referenceSources) {
    for (const label of referencedIn(src.text)) {
      if (!partLabels.has(label) && !reportedMissing.has(`${src.where}:${label}`)) {
        reportedMissing.add(`${src.where}:${label}`);
        add(
          "error",
          "ko-direction-grammar",
          `${src.where}가 ${label} 를 참조하지만 지문에 해당 파트가 없습니다 — (가)(나) 공통 판정 프레임은 복합지문에서만 사용`,
        );
      }
    }
  }

  // --- 기법 개념어 은행 대조 (1): 선지 문면 접미형('~법'/'~적 심상') 스캔 ---
  for (const o of options) {
    const text = typeof o.text === "string" ? o.text : "";
    const label = typeof o.label === "string" ? o.label : "";
    const re = new RegExp(SUFFIX_CONCEPT_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const candidate = m[0];
      if (SUFFIX_STOPLIST.has(normTerm(candidate))) continue;
      if (!findBankEntry(candidate)) {
        add(
          "warning",
          "ko-option-ending",
          `${label} 선지의 기법 개념어 '${candidate}' 가 기법 은행(닫힌 집합)에 없습니다 — 외부 개념어 금지`,
        );
      }
    }
  }

  // --- optionAnalyses 라벨 커버리지 (①~⑤ 각 1회) ---------------------------
  const analysisByLabel = new Map<string, Record<string, unknown>>();
  for (const a of analyses) {
    const label = typeof a.label === "string" ? a.label : "";
    if (label) analysisByLabel.set(label, a);
  }
  if (analyses.length !== 5 || analysisByLabel.size !== 5) {
    add(
      "error",
      "ko-option-count",
      `optionAnalyses 가 선지 ①~⑤ 를 정확히 1회씩 커버해야 합니다 (현재 ${analyses.length}개, 고유 라벨 ${analysisByLabel.size}개)`,
    );
  }

  const distinctFlaws = new Set(["TECHNIQUE_ABSENT", "EFFECT_DISTORTED", "LINK_MISMATCH", "SCOPE_OVERREACH"]);
  for (const [label, a] of analysisByLabel) {
    const technique = typeof a.technique === "string" ? a.technique : "";
    const techniquePresent = a.techniquePresent === true;
    const flaw = typeof a.flawPrinciple === "string" ? a.flawPrinciple : "";

    // --- 기법 개념어 은행 대조 (2): 선언 technique ------------------------
    const entry = technique ? findBankEntry(technique) : null;
    if (technique && !entry) {
      add(
        "warning",
        "ko-option-ending",
        `${label} 선지의 선언 기법 '${technique}' 가 기법 은행(닫힌 집합)에 없습니다 — 외부 개념어 금지`,
      );
    }

    // 선언 기법이 해당 선지 문면에 실제로 드러나는지 (은행 별칭 포함 대조)
    const option = options.find((o) => o.label === label);
    const optionText = option && typeof option.text === "string" ? option.text : "";
    if (technique && optionText) {
      const terms = entry ? [entry.canonical, ...entry.aliases, technique] : [technique];
      const optNorm = normTerm(optionText);
      if (!terms.some((t) => optNorm.includes(normTerm(t)))) {
        add(
          "warning",
          "ko-option-ending",
          `${label} 선지 문면에 선언 기법 '${technique}' 가 드러나지 않습니다 — 기법부 개념어와 optionAnalyses 를 1:1 로 맞추세요`,
        );
      }
    }

    // --- flawPrinciple ↔ 발문 극성 ↔ 정답 정합 ----------------------------
    const isCorrect = label === correctAnswer;
    const shouldBeFlawed = negativeStem ? isCorrect : !isCorrect;
    const isFlawed = distinctFlaws.has(flaw);
    if (shouldBeFlawed && !isFlawed) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${label} 선지는 함정 선지여야 하는데 flawPrinciple 이 함정 원리(a/b/c/scope)가 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeFlawed && flaw !== "NONE" && flaw !== "") {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${label} 선지는 참 선지여야 하는데 flawPrinciple=${flaw} 로 선언되었습니다 — 극성 모순`,
      );
    }

    // --- flawPrinciple ↔ techniquePresent 내적 정합 ------------------------
    if (flaw === "TECHNIQUE_ABSENT" && techniquePresent) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${label} 선지: TECHNIQUE_ABSENT(기법 부재) 인데 techniquePresent=true — 자기모순`,
      );
    }
    if ((flaw === "NONE" || flaw === "EFFECT_DISTORTED" || flaw === "LINK_MISMATCH") && !techniquePresent) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${label} 선지: flawPrinciple=${flaw || "NONE"} 은 기법 실재가 전제인데 techniquePresent=false — 자기모순`,
      );
    }
    if (flaw === "SCOPE_OVERREACH" && partLabels.size < 2) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${label} 선지: SCOPE_OVERREACH 함정은 (가)(나) 복합지문 전용인데 지문 파트가 ${Math.max(partLabels.size, 1)}개입니다`,
      );
    }
  }

  // --- 참 선지 간 기법 중복 (같은 기법 2회 금지 — 판정 지점 중복) -----------
  const declaredCanonicals = new Map<string, string[]>();
  for (const [label, a] of analysisByLabel) {
    const technique = typeof a.technique === "string" ? a.technique : "";
    const entry = technique ? findBankEntry(technique) : null;
    const key = entry ? entry.canonical : normTerm(technique);
    if (!key) continue;
    declaredCanonicals.set(key, [...(declaredCanonicals.get(key) ?? []), label]);
  }
  for (const [canonical, labels] of declaredCanonicals) {
    if (labels.length > 1) {
      add(
        "warning",
        "ko-option-ending",
        `선지 ${labels.join(", ")} 가 같은 기법('${canonical}')을 중복 사용합니다 — 선지 5개의 기법은 서로 달라야 합니다`,
      );
    }
  }

  // --- 선지 2단 구조: 기법부-효과부 연결어('~하여/~을 통해') 존재 -----------
  for (const o of options) {
    const text = typeof o.text === "string" ? o.text : "";
    const label = typeof o.label === "string" ? o.label : "";
    if (text && !CONNECTOR_RE.test(text)) {
      add(
        "warning",
        "ko-option-ending",
        `${label} 선지에 기법부-효과부 연결어('~하여/~을 통해')가 없습니다 — "[기법]+~하여/~을 통해+[효과]" 2단 구조 위반`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_LIT_EXPR: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_EXPR",
    area: "LITERATURE",
    label: "표현상 특징(운문)",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_ESSAY", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: [],
    optionEnding: "strategy",
    needsSolverGate: false,
    description:
      "운문(현대시·고전시가)의 표현 기법과 그 효과를 '[기법]+~하여+[효과]' 2단 선지로 판정하는 문학 세트 도입 유형",
    setSlot: "운문 세트 1번 슬롯(도입) — 문학 운문4 프리셋 개시(EXPR→PHRASE→PSYCH→BOGI), 내신 최다 빈출",
    studentTask: "선지 5개의 기법-효과 진술을 지문과 대조해 기법 실재·효과 정합이 성립하는(또는 깨진) 하나를 고릅니다.",
    bestFor: ["형식 표지가 뚜렷한 현대시·고전시가", "(가)(나) 운문 복합 지문", "내신 수업 필기 기법 목록 확인"],
    outputUi: ["지문 동봉", "5지선다(기법+효과 2단 선지)", "선지별 기법 근거·오답 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 함정 4개 소거형)" },
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것)" },
        ],
        defaultValue: "POSITIVE",
        description: "표현상 특징은 긍정발문이 관행 — 함정 4개를 전수 소거해야 해 체감 난도가 올라갑니다",
      },
      {
        key: "compareScope",
        label: "판정 범위",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 구성)" },
          { value: "SINGLE", label: "단일 작품(윗글)" },
          { value: "MULTI", label: "(가)(나) 공통 판정" },
        ],
        defaultValue: "AUTO",
        description: "(가)(나) 공통 판정은 검증량이 배가되는 킬러 프레임 — 복합지문에서만 동작합니다",
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
      "함정은 기법 부재(원리 a) 중심 — 형식 표지가 뚜렷한 대표 기법(직유·반복·설의·색채어)으로 구성해 기법 존재 확인만으로 판정되게 하라. 효과부는 평이하게.",
    INTERMEDIATE:
      "함정은 효과 왜곡(b)·연결 오류(c) 중심 — 기법 확인만으로는 못 거르고 효과의 인과까지 검증해야 하게 하라. 판정에 작품 전체 맥락(시상 흐름·어조)이 필요하게 구성하라.",
    KILLER:
      "복합지문이면 '(가)와 (나) 모두 ~하고 있다' 공통 판정 프레임으로 검증량을 배가하고 SCOPE_OVERREACH(한 작품만 성립) 함정을 심어라. 함정은 '절반 참'(기법부 참·효과부만 허위)으로 설계하고, 참 선지도 형식 표지가 덜 명시적인 기법(객관적 상관물·시상 전환)의 명백 사례로 구성해 전수 검증을 강제하라.",
  },
};
