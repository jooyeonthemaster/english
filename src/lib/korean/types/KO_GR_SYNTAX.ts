// ============================================================================
// KO_GR_SYNTAX — 문법 문장 구조 (홑/겹문장·안긴문장의 종류와 기능·문장 성분)
// ============================================================================
// 카탈로그 §2.5 KO_GR_SYN 사양의 전면 구현. 지문 없이 <보기>(usesBogi: required)
// 와 자체 창작 예문만으로 성립하는 문법 유형 — 저작권 청정(기출·문학 인용 금지).
//
// 실측 근거(언매 단독 문법 슬롯 + 내신 문법 단원 관행):
//   발문: "<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?" /
//         "밑줄 친 안긴문장의 기능이 나머지와 일치하지 않는 것은?"
//   (관행 발문 "…에 해당하는 예로 적절한 것은?"/"…나머지와 다른 것은?"은 공통
//    발문 게이트(stemGrammarIssueKo)의 긍정/부정 정규식을 통과하지 못해
//    게이트 호환형으로 조정 — SPEC-GAP 보고 참조)
//   개념: 명사절·관형절(동격/관계)·부사절·서술절·인용절, 문장 성분(주어·목적어·
//         보어·관형어·부사어), 생략 성분 복원. 킬러 = 다층 내포 + 성분 생략.
//   오답 4원리: 절 종류 오귀속 · 동격/관계 관형절 혼동 · 서술절 존재 오판 ·
//               성분 층위 혼동(관형사 vs 관형어)
//   결정론 시그니처: 안긴문장 표지 휴리스틱(-음/-기=명사절, -(으)ㄴ/-는/-던/-(으)ㄹ
//   =관형절, -게/-도록=부사절, -고=인용절, 무표지=서술절)을 선지 분석 라벨과 대조.
//   내신 서술형 최빈 소재: 문장 도해·안긴문장 찾아 쓰고 종류/기능 밝히기 — 이 유형이
//   그 객관식 원형이다(내신 모드 프롬프트가 학습활동 프레임으로 연계).
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { KOR_CIRCLED_LABELS } from "../core/markers";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 닫힌 개념 집합 — 학교문법 기준 (이 밖의 이론 문법 용어 금지)
// ---------------------------------------------------------------------------

const OPTION_LABELS = ["①", "②", "③", "④", "⑤"] as const;

const CLAUSE_TYPE_VALUES = [
  "NOMINAL", //             명사절 (-음/-기)
  "ADNOMINAL_RELATIVE", //  관계 관형절 (수식 명사가 절 안 성분 — 생략 발생)
  "ADNOMINAL_APPOSITIVE", //동격 관형절 (절 = 명사의 내용, 생략 없음)
  "ADVERBIAL", //           부사절 (-게/-도록/-이)
  "PREDICATIVE", //         서술절 (표지 없음)
  "QUOTATIVE", //           인용절 (인용 조사 '고' — 라고/다고/자고/냐고)
  "NONE", //                안긴문장 없음 (홑문장·이어진문장 — 서술절 존재 오판 함정 전용)
] as const;
type KoClauseType = (typeof CLAUSE_TYPE_VALUES)[number];

const CLAUSE_TYPE_LABELS: Record<KoClauseType, string> = {
  NOMINAL: "명사절",
  ADNOMINAL_RELATIVE: "관계 관형절",
  ADNOMINAL_APPOSITIVE: "동격 관형절",
  ADVERBIAL: "부사절",
  PREDICATIVE: "서술절",
  QUOTATIVE: "인용절",
  NONE: "안긴문장 없음(홑문장·이어진문장)",
};

/** 절 표지 힌트 — 결정론 휴리스틱 경고 메시지에 사용. */
const CLAUSE_MARKER_HINTS: Record<KoClauseType, string> = {
  NOMINAL: "-음/-기(명사형 어미)",
  ADNOMINAL_RELATIVE: "-(으)ㄴ/-는/-(으)ㄹ/-던(관형사형 어미)",
  ADNOMINAL_APPOSITIVE: "-(으)ㄴ/-는/-(으)ㄹ/-던(관형사형 어미, 흔히 '-다는')",
  ADVERBIAL: "-게/-도록/-이(부사형 어미)",
  PREDICATIVE: "표지 없음(주어+서술어가 그대로 안김)",
  QUOTATIVE: "인용 조사 '고'(-라고/-다고/-자고/-냐고)",
  NONE: "해당 없음",
};

const CLAUSE_FUNCTION_VALUES = ["주어", "목적어", "보어", "관형어", "부사어", "서술어"] as const;

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------

const koClauseAnalysisSchema = z.object({
  optionLabel: z.enum(OPTION_LABELS),
  exampleSentence: z
    .string()
    .min(4)
    .describe(
      "선지 예문 전체 — 자체 창작(기출·문학 작품·교과서 문장 인용 금지). 해당 선지 text 안에 그대로 포함되어야 함",
    ),
  embeddedClause: z
    .string()
    .min(1)
    .describe(
      "예문 속 안긴문장(절)을 예문에서 그대로 복사 — 격조사는 제외하고 절 자체만 (예: '그가 옳았음'). 단 인용절은 인용 조사 '고'까지 포함 (예: '자기가 옳다고'). ODD_ONE_OUT 이면 선지에서 밑줄(__ __) 칠 부분과 동일해야 함",
    ),
  clauseType: z
    .enum(CLAUSE_TYPE_VALUES)
    .describe(
      "안긴문장의 실제 종류(주장이 아니라 사실): NOMINAL=명사절(-음/-기), ADNOMINAL_RELATIVE=관계 관형절(수식 명사가 절 안 성분으로 생략), ADNOMINAL_APPOSITIVE=동격 관형절(절이 명사의 내용 — 생략 없음), ADVERBIAL=부사절(-게/-도록/-이), PREDICATIVE=서술절(표지 없음), QUOTATIVE=인용절(-고), NONE=안긴문장이 없는 예문(보어 구문·이어진문장 — 서술절 존재 오판 함정 전용, 이때 embeddedClause 에는 쟁점 구절을 복사)",
    ),
  clauseFunction: z
    .enum(CLAUSE_FUNCTION_VALUES)
    .describe(
      "안긴문장이 안은문장 안에서 실제로 수행하는 문장 성분 기능 (명사절+을/를=목적어, 관형절=관형어, 부사절=부사어, 서술절=서술어, 인용절=부사어)",
    ),
  omittedComponent: z
    .string()
    .optional()
    .describe(
      "관계 관형절 전용 — 절 안에서 생략된 성분의 복원형과 성분명 (예: '(그림을) — 목적어 생략'). 동격 관형절·다른 절 유형은 반드시 비워 둘 것",
    ),
  bogiTargetLabel: z
    .string()
    .optional()
    .describe("BOGI_MATCH 전용 — 이 선지가 예시라고 주장하는 <보기> 항목 라벨(㉠/㉡/㉢). 선지 text 머리에도 동일 표기"),
});

const koBogiItemSpecSchema = z.object({
  label: z.string().describe("<보기> 항목 라벨 — ㉠/㉡/㉢ 순서대로"),
  clauseType: z
    .enum([...CLAUSE_TYPE_VALUES, "ADNOMINAL_ANY"])
    .optional()
    .describe("이 항목이 요구하는 절 종류. ADNOMINAL_ANY=동격/관계 구분 없는 관형절. 종류를 요구하지 않으면 생략"),
  clauseFunction: z
    .enum(CLAUSE_FUNCTION_VALUES)
    .optional()
    .describe("이 항목이 요구하는 성분 기능. 기능을 요구하지 않으면 생략 (종류·기능 중 최소 하나는 지정)"),
});

const schema = koMc5Envelope({
  questionMode: z
    .enum(["BOGI_MATCH", "ODD_ONE_OUT"])
    .describe(
      "출제 모드 — BOGI_MATCH: '<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?' (기본), ODD_ONE_OUT: '밑줄 친 안긴문장의 기능(종류)이 나머지와 일치하지 않는 것은?'",
    ),
  differAxis: z
    .enum(["CLAUSE_TYPE", "CLAUSE_FUNCTION"])
    .optional()
    .describe(
      "ODD_ONE_OUT 전용 — 정답 하나만 나머지 넷과 달라지는 축. CLAUSE_FUNCTION=성분 기능(발문 '기능이'), CLAUSE_TYPE=절 종류(발문 '종류가'). 발문과 반드시 일치",
    ),
  clauseAnalyses: z
    .array(koClauseAnalysisSchema)
    .length(5)
    .describe("선지 ①~⑤ 각각의 예문 통사 분석 — 시스템이 표지 휴리스틱·단일정답성을 기계 검증한다"),
  bogiItems: z
    .array(koBogiItemSpecSchema)
    .min(1)
    .max(4)
    .optional()
    .describe(
      "BOGI_MATCH 필수 — <보기> ㉠~㉢ 각 항목이 규정하는 조건의 구조화(절 종류/성분 기능). 시스템이 clauseAnalyses 와 대조해 단일정답성을 기계 검증한다",
    ),
});

// ---------------------------------------------------------------------------
// 프롬프트 — 실제 출제 매뉴얼
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문법 — 문장 구조 (홑/겹문장 · 안긴문장의 종류와 기능 · 문장 성분)

**전제**: 이 유형은 지문이 없다. <보기>와 선지의 예문은 전부 네가 새로 짓는다 —
기출·문학 작품·교과서 문장 인용 금지(저작권 청정 원칙). 예문은 일상 소재의 자연스러운
현대 국어 문장(대체로 8~20자)으로, 안긴문장 경계와 분석이 **한 가지로만** 성립하게 지어라
(중의적 예문·비문·방언 금지).

**개념 범위 (학교문법 기준 — 이 밖의 이론 문법 용어 금지)**:
- 안긴문장(절) 5종과 표지: 명사절(-음/-기) · 관형절(-(으)ㄴ/-는/-(으)ㄹ/-던) ·
  부사절(-게/-도록/-이) · 서술절(표지 없음) · 인용절(인용 조사 '고' — 라고/다고/자고/냐고)
- **관형절 하위 구분** (이 유형의 핵심 함정 축):
  · 관계 관형절 = 수식받는 명사가 절 안의 성분(주어·목적어·부사어)으로 쓰여 **생략**됨
    (예: "동생이 그린 그림" — 절 안에서 '그림을'(목적어)이 생략). 관계 관형절은
    omittedComponent 에 생략 성분의 복원형을 반드시 명시하라.
  · 동격 관형절 = 절이 수식받는 명사의 내용 그 자체 — 절 안에 생략 성분이 **없다**
    (예: "그가 돌아왔다는 소식" — '소식'은 절 안 성분이 아님). omittedComponent 는 비워 둔다.
- 안긴문장의 성분 기능: 주어·목적어·보어·관형어·부사어·서술어. 명사절은 붙는 조사에 따라
  주어(이/가)·목적어(을/를)·부사어(에) 기능이 갈린다 — 기능 판정의 근거를 조사로 명시하라.
- 서술절: "코끼리는 코가 길다"처럼 표지 없이 주어+서술어가 그대로 서술어 자리에 안긴다.
  보어 구문("물이 얼음이 되었다" — 홑문장)과 혼동하게 만드는 것이 대표 함정이다.

**두 가지 출제 모드 (questionMode 에 따라 정확히 이 형태로)**:

[BOGI_MATCH — <보기> 조건 대응형 (기본)]
- 발문 템플릿: "<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?"
  (항목이 2개면 "㉠~㉡", 조건 동시 충족형이면 "<보기>의 ㉠~㉢을 모두 충족하는 예로 가장 적절한 것은?")
- <보기>: ㉠~㉢ 각 항목에 절 종류·성분 기능 조건을 한 줄씩 서술한다.
  예) "㉠ 명사절이 목적어로 쓰인 문장 / ㉡ 관형절 속에 성분의 생략이 있는 문장 /
  ㉢ 부사절이 서술어를 수식하는 문장". 각 항목의 조건을 bogiItems 에 구조화
  (clauseType/clauseFunction)로 **반드시 병기**하라 — 시스템이 clauseAnalyses 와 대조해
  단일정답성을 기계 검증한다.
- 선지: "㉠: 예문" 형식 — 각 선지는 <보기> 항목 하나(bogiTargetLabel)를 주장하고 예문
  하나를 제시한다. **정답 1개만 주장한 항목과 예문의 실제 분석이 일치**하고, 오답 4개는
  주장한 항목의 조건을 예문이 충족하지 못한다(아래 오답 원리 적용).
- <보기> 안에 선지 예문을 그대로 싣지 마라 — 정답 누출로 기계 검증에서 즉시 반려된다.

[ODD_ONE_OUT — 이질 판정형]
- 발문 템플릿: "밑줄 친 안긴문장의 기능이 나머지와 일치하지 않는 것은?" (differAxis=CLAUSE_FUNCTION)
  / "밑줄 친 안긴문장의 종류가 나머지와 일치하지 않는 것은?" (differAxis=CLAUSE_TYPE)
  — '~와 다른 것은?' 같은 자유 변형 금지(발문 문법 게이트가 차단한다).
- 선지: 예문 5개. 각 예문의 안긴문장 부분에 밑줄 마크업(__안긴문장__)을 넣어라 —
  밑줄 구간은 embeddedClause 와 동일해야 한다. 넷은 differAxis 값이 동일하고 정답
  하나만 다르다(4:1 분포 — 시스템이 clauseAnalyses 로 기계 검증).
- differAxis=CLAUSE_TYPE 에서 동격/관계 관형절은 **한 종류(관형절)** 로 판정된다 —
  하위 구분을 이질 축으로 삼지 마라('전부 관형절'이라는 반론이 성립해 복수 정답 사고).
  동격/관계 구분 함정은 BOGI_MATCH 조건 대응형에서만 써라.
- <보기>: 안긴문장 개념을 정리한 학습활동 프레임을 제시하라
  (예: "다른 문장 속에 들어가 하나의 성분처럼 쓰이는 절을 안긴문장이라 한다. 안긴문장은
  명사절, 관형절, 부사절, 서술절, 인용절로 나뉘며, 문장 안에서 주어, 목적어, 관형어,
  부사어, 서술어 등의 성분으로 기능한다."). 판정에 쓰이는 절 종류·성분 용어가 <보기>
  문면에 등장해야 근거앵커(evidence)가 성립한다. <보기>에 선지 예문 재사용 금지.

**clauseAnalyses 작성 (선지 ①~⑤ 전부 — 기계 검증 대상)**:
- exampleSentence 는 선지 text 안에 글자 그대로 포함되어야 한다.
- embeddedClause 는 exampleSentence 에서 그대로 복사한 절이다 — 격조사를 제외한 절
  자체만. 단 **인용절은 인용 조사 '고'까지 포함**해 적어라('자기가 옳다고').
  시스템이 표지 휴리스틱(-음/-기=명사절, -(으)ㄴ/-는/-(으)ㄹ/-던=관형절, -게/-도록=부사절,
  -고=인용절, 무표지=서술절)으로 clauseType 라벨과 대조한다 — 표지가 선언한 종류와
  어긋나면 경고된다.
- clauseType/clauseFunction 은 **주장이 아니라 실제 분석**이다. 오답 선지도 예문의 참
  분석을 적어라 — 함정은 '주장(bogiTargetLabel/발문 축)과 실제 분석의 어긋남'으로 만든다.

**오답 함정 원리 — 오답마다 아래 4원리 중 정확히 하나를 적용**:
1. **절 종류 오귀속**: 표면이 비슷한 다른 절을 주장 항목의 예로 제시.
   (예: ㉠이 명사절 조건일 때 "농부들은 비가 오기를 기다린다"(명사절) 대신
   "그는 말도 없이 떠났다"(부사절)를 ㉠의 예로 주장. 대등 연결 '-고'와 인용절 '-고',
   보조적 연결 '-게'와 부사절 '-게'처럼 동형 어미 대비가 상급 함정이다.)
2. **동격·관계 관형절 혼동**: 관계 관형절 예문("네가 어제 만난 사람" — '사람이' 생략)을
   동격 조건의 예로, 동격 관형절 예문("우리가 우승했다는 소문" — 생략 없음)을
   '성분 생략이 있는 관형절' 조건의 예로 제시.
3. **서술절 존재 오판**: 서술절 안은문장("기린은 목이 길다")을 홑문장처럼 취급하거나,
   보어 구문("동생이 어른이 되었다" — 홑문장)·이중 주어처럼 보이는 문장을 서술절의
   예로 제시해 절의 존재 자체를 오판하게 한다. 안긴문장이 없는 예문은 clauseAnalyses
   에 clauseType=NONE 으로 기록하라 — BOGI_MATCH 오답 전용이며 ODD_ONE_OUT 에는
   쓸 수 없다(밑줄 칠 안긴문장이 없으므로 기계 반려).
4. **성분 층위 혼동(관형사 vs 관형어)**: 품사(관형사)와 성분(관형어)의 층위를 뒤섞는다.
   (예: "새 옷을 샀다"의 '새'는 관형사 한 단어(절 아님)인데 이를 관형절 조건의 예로
   주장, 또는 "예쁜 옷"의 '예쁜'(형용사 활용형 — 관형절)을 관형사로 규정하는 진술.)

**근거앵커(evidence) 작성** — 지문이 없는 유형: spanText 는 반드시 **<보기> 행에서
그대로 복사**하라(시스템이 지문/<보기> 실재를 기계 검증 — <보기> 밖 문구·예문 구절을
spanText 로 쓰면 즉시 반려).
- BOGI_MATCH: 각 선지의 spanText = 그 선지가 주장하는 항목의 <보기> 조건 행
  (예: "㉠ 명사절이 목적어로 쓰인 문장") verbatim. 정답 선지=SUPPORTS(예문 분석이 조건과
  일치), 오답 선지=CONTRADICTS + note 에 '주장 항목 조건 vs 실제 분석(절 종류·기능·생략
  여부)'을 명시.
- ODD_ONE_OUT: 각 선지의 spanText = <보기> 개념 프레임에서 그 예문의 판정에 해당하는 행
  verbatim. 전 선지 SUPPORTS + note 에 각 예문의 절 종류·성분 기능 분석을 명시
  (정답 선지 note 에는 나머지 넷과 달라지는 지점을 명시).
- 예문 자체에 대한 통사 분석은 clauseAnalyses 가 담당한다 — evidence 는 <보기> 준거
  연결 전용이다.

**금지**:
- 기출 문항·문학 작품·교과서 본문 문장의 인용 (예문은 전부 자체 창작).
- 두 가지 분석이 모두 성립하는 중의적 예문 (안긴문장 경계·종류가 유일해야 한다).
- 학교문법 밖 용어(내포문·보문자·핵 이동 등 이론 문법 용어).
- <보기>가 특정 선지의 정오를 직접 발화하거나 선지 예문을 포함하는 구성 (정답 누출).
- 선지 예문 안의 작은따옴표(' ') 인용 — 인용 실재 게이트가 지문/<보기> 실재를 요구하므로
  대화 인용이 필요하면 큰따옴표를 써라.
- 옛한글·중세국어 표기가 필요한 예문 (현대 국어만).
- BASIC 난이도에서 한 예문에 안긴문장 2개 이상 (다층 내포는 KILLER 전용).`;

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const mode = settings.questionMode;
  if (mode === "ODD_ONE_OUT") {
    lines.push(
      "- questionMode=ODD_ONE_OUT 로 출제하라: 발문은 '밑줄 친 안긴문장의 기능(종류)이 나머지와 일치하지 않는 것은?', 선지 예문 5개에 밑줄(__ __), differAxis 4:1 분포.",
    );
  } else {
    lines.push(
      "- questionMode=BOGI_MATCH 로 출제하라: 발문은 '<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?', <보기> 조건 항목 + bogiItems 구조화 병기.",
    );
  }
  const focus = settings.conceptFocus;
  if (focus === "EMBEDDED_TYPE") {
    lines.push(
      "- 개념 초점=안긴문장의 종류: <보기> 조건(또는 differAxis=CLAUSE_TYPE)을 절 종류 판별 중심으로 구성하고, 동격/관계 관형절 대비를 최소 1회 포함하라.",
    );
  } else if (focus === "CLAUSE_FUNCTION") {
    lines.push(
      "- 개념 초점=성분 기능: <보기> 조건(또는 differAxis=CLAUSE_FUNCTION)을 안긴문장의 성분 기능(주어/목적어/부사어 등) 판별 중심으로 구성하고, 명사절+조사 결합에 따른 기능 분화를 활용하라.",
    );
  } else {
    lines.push(
      "- 개념 초점=혼합: 절 종류와 성분 기능을 결합한 조건('명사절이 목적어로 쓰인 문장')으로 구성해 두 층위 판정을 동시에 요구하라.",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 문법 단원의 예문 스타일·용어에 밀착하라. 이 유형은 내신 서술형 최빈 소재(문장 도해, '안긴문장을 찾아 쓰고 종류와 기능을 밝히시오')의 객관식 원형이므로, 예문마다 안긴문장 경계가 깔끔하게 떨어져 도해 연습으로 이어지게 하라. <보기>는 '학습 활동' 프레임(선생님 설명·탐구 활동)을 사용해도 좋다. 다층 내포는 피하라.",
    );
  } else {
    lines.push(
      "- 수능(언매 단독 문법 슬롯) 모드: 낯선 일상 예문 + 조건 결합형(절 종류+성분 기능 동시 요구)을 우선하라. 표면 표지가 동형인 절(대등 '-고' vs 인용 '-고', 보조적 연결 '-게' vs 부사절 '-게')의 대비, 생략 성분 복원이 필요한 관계 관형절을 포함해 기계적 표지 암기로 풀리지 않게 하라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 결정론 검증 헬퍼 — 안긴문장 표지 휴리스틱
// ---------------------------------------------------------------------------

const JONG_NIEUN = 4; //  종성 ㄴ (-(으)ㄴ 관형사형)
const JONG_RIEUL = 8; //  종성 ㄹ (-(으)ㄹ 관형사형)
const JONG_MIEUM = 16; // 종성 ㅁ (-(으)ㅁ 명사형: 삶·앎·꿈)

function finalJongOf(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return -1;
  return (code - 0xac00) % 28;
}

function stripClauseTail(s: string): string {
  return s.replace(/[\s"'“”‘’.,!?…]+$/g, "").trim();
}

/** 절 말미에 붙었을 수 있는 조사 1개 (명사절 '옳았음을' 형태 허용용). */
const TRAILING_PARTICLES = new Set(["을", "를", "이", "가", "은", "도", "만", "의", "에", "로"]);

/**
 * 스펙 지정 표지 휴리스틱: -음/-기(+종성 ㅁ)=명사절, -는/-던(+종성 ㄴ/ㄹ)=관형절,
 * -게/-도록(-이/-서 포함)=부사절, -고=인용절, 무표지=서술절.
 * 선언된 clauseType 과 절 말미 표지의 정합만 판정한다(불일치=warning 신호).
 */
function clauseMarkerMatches(clauseType: KoClauseType, clauseRaw: string): boolean {
  const test = (t: string): boolean => {
    if (!t) return false;
    const last = t.slice(-1);
    switch (clauseType) {
      case "NOMINAL":
        return /(음|기)$/.test(t) || finalJongOf(last) === JONG_MIEUM;
      case "ADNOMINAL_RELATIVE":
      case "ADNOMINAL_APPOSITIVE":
        return /(는|던)$/.test(t) || finalJongOf(last) === JONG_NIEUN || finalJongOf(last) === JONG_RIEUL;
      case "ADVERBIAL":
        return /(게|도록|이|서)$/.test(t);
      case "QUOTATIVE":
        return /고$/.test(t);
      case "PREDICATIVE":
        // 무표지 — 다른 절 표지로 끝나면 '서술절 존재 오판' 신호
        return !(
          /(음|기|는|던|게|도록|고)$/.test(t) ||
          finalJongOf(last) === JONG_NIEUN ||
          finalJongOf(last) === JONG_RIEUL
        );
      case "NONE":
        // 안긴문장 없음 — 표지 대조 대상 아님 (쟁점 구절이 무엇이든 통과)
        return true;
    }
  };
  const t0 = stripClauseTail(clauseRaw);
  if (test(t0)) return true;
  // 말미 조사 1개 허용 (예: '그가 옳았음을' → '그가 옳았음')
  if (t0.length > 2 && TRAILING_PARTICLES.has(t0.slice(-1))) return test(t0.slice(0, -1));
  return false;
}

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

interface ClauseAnalysisRow {
  optionLabel: string;
  exampleSentence: string;
  embeddedClause: string;
  clauseType: string;
  clauseFunction: string;
  omittedComponent?: string;
  bogiTargetLabel?: string;
}

function readAnalyses(v: unknown): ClauseAnalysisRow[] {
  if (!Array.isArray(v)) return [];
  const out: ClauseAnalysisRow[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    if (
      typeof a.optionLabel === "string" &&
      typeof a.exampleSentence === "string" &&
      typeof a.embeddedClause === "string" &&
      typeof a.clauseType === "string" &&
      typeof a.clauseFunction === "string"
    ) {
      out.push({
        optionLabel: a.optionLabel,
        exampleSentence: a.exampleSentence,
        embeddedClause: a.embeddedClause,
        clauseType: a.clauseType,
        clauseFunction: a.clauseFunction,
        omittedComponent: typeof a.omittedComponent === "string" ? a.omittedComponent : undefined,
        bogiTargetLabel: typeof a.bogiTargetLabel === "string" ? a.bogiTargetLabel : undefined,
      });
    }
  }
  return out;
}

interface BogiItemSpecRow {
  label: string;
  clauseType?: string;
  clauseFunction?: string;
}

function readBogiItems(v: unknown): BogiItemSpecRow[] {
  if (!Array.isArray(v)) return [];
  const out: BogiItemSpecRow[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    if (typeof b.label === "string") {
      out.push({
        label: b.label,
        clauseType: typeof b.clauseType === "string" ? b.clauseType : undefined,
        clauseFunction: typeof b.clauseFunction === "string" ? b.clauseFunction : undefined,
      });
    }
  }
  return out;
}

function satisfiesBogiSpec(a: ClauseAnalysisRow, spec: BogiItemSpecRow): boolean {
  if (spec.clauseType) {
    if (spec.clauseType === "ADNOMINAL_ANY") {
      if (!a.clauseType.startsWith("ADNOMINAL")) return false;
    } else if (spec.clauseType !== a.clauseType) {
      return false;
    }
  }
  if (spec.clauseFunction && spec.clauseFunction !== a.clauseFunction) return false;
  return true;
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const mode = question.questionMode === "ODD_ONE_OUT" ? "ODD_ONE_OUT" : "BOGI_MATCH";
  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const analyses = readAnalyses(question.clauseAnalyses);

  const optionsRaw = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const optionTextOf = new Map<string, string>();
  for (const o of optionsRaw) {
    if (typeof o.label === "string" && typeof o.text === "string") {
      optionTextOf.set(o.label, o.text);
    }
  }

  const bogi = question.bogi && typeof question.bogi === "object" ? (question.bogi as Record<string, unknown>) : null;
  const bogiLinesRaw = bogi && Array.isArray(bogi.lines) ? (bogi.lines as unknown[]) : [];
  const bogiLines = bogiLinesRaw.filter((l): l is string => typeof l === "string");
  const bogiText = bogiLines.join("\n");

  // [결정론 1] <보기> 필수 (usesBogi: required — 두 모드 공통. ODD_ONE_OUT 도 개념
  //   학습활동 프레임 <보기>를 동봉하는 규약)
  if (bogiLines.length === 0) {
    add("error", "ko-bogi-missing", "usesBogi=required 유형인데 <보기>(bogi.lines)가 비어 있습니다");
  }

  // [결정론 2] clauseAnalyses ↔ 선지 1:1 — 라벨 ①~⑤ 각 1회 + 예문이 선지 text 에 실재
  const seenLabels = new Set<string>();
  for (const a of analyses) {
    if (seenLabels.has(a.optionLabel)) {
      add("error", "ko-marker-option-mismatch", `clauseAnalyses 에 ${a.optionLabel} 분석이 중복되었습니다`);
    }
    seenLabels.add(a.optionLabel);
  }
  for (const label of OPTION_LABELS) {
    if (!seenLabels.has(label)) {
      add("error", "ko-marker-option-mismatch", `${label} 선지의 clauseAnalyses 분석이 없습니다 — 5개 선지 전부 분석 필수`);
    }
  }
  // 선지 text 의 밑줄 마크업(__ __)은 표시용 — 예문 포함 판정 전에 벗겨서 비교한다.
  const stripInlineMarkup = (text: string): string => text.replace(/__([^_]+)__/g, "$1");
  for (const a of analyses) {
    const optionText = optionTextOf.get(a.optionLabel) ?? "";
    if (optionText && !ctx.koText.containsSpanKo(stripInlineMarkup(optionText), a.exampleSentence)) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${a.optionLabel} 선지 text 에 분석의 exampleSentence("${a.exampleSentence.slice(0, 20)}…")가 그대로 포함되어 있지 않습니다`,
      );
    }
  }

  // [결정론 3] embeddedClause 가 exampleSentence 안에 verbatim 실재
  for (const a of analyses) {
    if (!ctx.koText.containsSpanKo(a.exampleSentence, a.embeddedClause)) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `${a.optionLabel}: embeddedClause("${a.embeddedClause}")가 예문("${a.exampleSentence}") 안에 verbatim 으로 존재하지 않습니다`,
      );
    }
  }

  // [결정론 4] 스펙 시그니처 — 안긴문장 표지 휴리스틱 대조:
  //   -음/-기=명사절, -(으)ㄴ/-는/-(으)ㄹ/-던=관형절, -게/-도록=부사절, -고=인용절,
  //   무표지=서술절. 선언한 clauseType 과 절 말미 표지 불일치 = warning.
  for (const a of analyses) {
    if (!(CLAUSE_TYPE_VALUES as readonly string[]).includes(a.clauseType)) continue;
    const clauseType = a.clauseType as KoClauseType;
    if (!clauseMarkerMatches(clauseType, a.embeddedClause)) {
      add(
        "warning",
        "ko-option-ending",
        `${a.optionLabel}: 안긴문장("${a.embeddedClause}")의 말미 표지가 선언된 절 종류(${CLAUSE_TYPE_LABELS[clauseType]} — 기대 표지 ${CLAUSE_MARKER_HINTS[clauseType]})와 어긋납니다 — 절 종류 라벨 또는 절 경계를 재검토하세요`,
      );
    }
  }

  // [결정론 5] 동격/관계 관형절 구조 제약 — 관계 관형절=생략 성분 복원 필수,
  //   동격 관형절=생략 성분 없음 (동격·관계 혼동 오답원리의 기계 검증 가능 부분)
  for (const a of analyses) {
    const omitted = (a.omittedComponent ?? "").trim();
    if (a.clauseType === "ADNOMINAL_RELATIVE" && !omitted) {
      add(
        "warning",
        "ko-option-ending",
        `${a.optionLabel}: 관계 관형절인데 omittedComponent(절 안에서 생략된 성분의 복원)가 없습니다 — 관계 관형절은 수식 명사가 절 안 성분으로 생략되어야 합니다`,
      );
    }
    if (a.clauseType === "ADNOMINAL_APPOSITIVE" && omitted) {
      add(
        "warning",
        "ko-option-ending",
        `${a.optionLabel}: 동격 관형절인데 omittedComponent("${omitted}")가 있습니다 — 생략 성분이 있으면 관계 관형절입니다 (동격/관계 혼동)`,
      );
    }
  }

  // [결정론 6] 정답 누출 — <보기>가 선지 예문을 verbatim 포함하면 반려 (두 모드 공통)
  if (bogiText) {
    for (const a of analyses) {
      if (ctx.koText.containsSpanKo(bogiText, a.exampleSentence)) {
        add(
          "error",
          "ko-answer-leak",
          `<보기>에 ${a.optionLabel} 선지 예문("${a.exampleSentence.slice(0, 20)}…")이 그대로 실려 있습니다 — 정답 누출`,
        );
      }
    }
  }

  if (mode === "BOGI_MATCH") {
    // [결정론 7] 발문이 <보기>를 지시하는가 (발문 템플릿 정합)
    if (direction && !direction.includes("보기")) {
      add(
        "error",
        "ko-direction-grammar",
        "questionMode=BOGI_MATCH 인데 발문이 <보기>를 지시하지 않습니다 — 템플릿: '<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?'",
      );
    }

    // [결정론 8] 주장 라벨(bogiTargetLabel) 정합 — 존재·㉠계열·<보기> 실재·선지 표기
    const validBogiLabels = new Set<string>(KOR_CIRCLED_LABELS);
    for (const a of analyses) {
      const target = a.bogiTargetLabel ?? "";
      if (!target) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${a.optionLabel}: BOGI_MATCH 인데 bogiTargetLabel(주장하는 <보기> 항목)이 없습니다`,
        );
        continue;
      }
      if (!validBogiLabels.has(target)) {
        add("error", "ko-marker-option-mismatch", `${a.optionLabel}: bogiTargetLabel("${target}")이 ㉠계열 라벨이 아닙니다`);
        continue;
      }
      if (bogiText && !bogiText.includes(target)) {
        add("error", "ko-bogi-missing", `${a.optionLabel} 이 주장하는 항목 ${target} 이 <보기>에 없습니다`);
      }
      const optionText = optionTextOf.get(a.optionLabel) ?? "";
      if (optionText && !optionText.includes(target)) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${a.optionLabel} 선지 text 에 주장 항목 표기(${target})가 없습니다 — "㉠: 예문" 형식으로 표기해야 학생이 판정할 수 있습니다`,
        );
      }
    }

    // [결정론 9] 단일정답성 기계 검증 — bogiItems 구조화 조건 vs 실제 분석 대조:
    //   정답 선지만 주장 항목을 충족하고, 오답 4개는 충족하지 않아야 한다.
    const bogiItems = readBogiItems(question.bogiItems);
    if (bogiItems.length === 0) {
      add(
        "error",
        "ko-bogi-missing",
        "BOGI_MATCH 인데 bogiItems(<보기> 항목 조건의 구조화)가 없습니다 — 단일정답성 기계 검증 불가",
      );
    } else {
      const specOf = new Map<string, BogiItemSpecRow>();
      for (const item of bogiItems) {
        if (!item.clauseType && !item.clauseFunction) {
          add("error", "ko-bogi-missing", `bogiItems ${item.label}: 절 종류·성분 기능 조건이 모두 비어 있습니다 — 최소 하나 지정`);
        }
        specOf.set(item.label, item);
      }
      const matchedLabels: string[] = [];
      for (const a of analyses) {
        const target = a.bogiTargetLabel ?? "";
        const spec = target ? specOf.get(target) : undefined;
        if (target && !spec) {
          add("error", "ko-bogi-missing", `${a.optionLabel} 이 주장하는 항목 ${target} 이 bogiItems 에 구조화되어 있지 않습니다`);
          continue;
        }
        if (spec && satisfiesBogiSpec(a, spec)) matchedLabels.push(a.optionLabel);
      }
      if (matchedLabels.length === 0 && analyses.length === 5) {
        add("error", "ko-solver-mismatch", "주장 항목의 조건을 충족하는 선지가 하나도 없습니다 — 정답 부재");
      } else if (matchedLabels.length > 1) {
        add(
          "error",
          "ko-solver-mismatch",
          `주장 항목의 조건을 충족하는 선지가 ${matchedLabels.length}개(${matchedLabels.join(", ")})입니다 — 복수 정답. 오답 예문의 실제 분석이 주장 조건과 어긋나게 수정하세요`,
        );
      } else if (matchedLabels.length === 1 && correctAnswer && matchedLabels[0] !== correctAnswer) {
        add(
          "error",
          "ko-solver-mismatch",
          `기계 검증상 정답은 ${matchedLabels[0]} 인데 correctAnswer 는 ${correctAnswer} 입니다 — 분석·정답 desync`,
        );
      }
    }
  } else {
    // [결정론 10] ODD_ONE_OUT 발문 템플릿 정합 ('나머지와 다른')
    if (direction && !direction.includes("나머지")) {
      add(
        "error",
        "ko-direction-grammar",
        "questionMode=ODD_ONE_OUT 인데 발문에 '나머지'가 없습니다 — 템플릿: '밑줄 친 안긴문장의 기능이 나머지와 일치하지 않는 것은?'",
      );
    }

    // [결정론 11] 밑줄 마크업 — 각 선지에 __안긴문장__ 이 있고 밑줄부=embeddedClause.
    //   안긴문장 없는 예문(NONE)은 이 모드에서 성립 불가.
    for (const a of analyses) {
      if (a.clauseType === "NONE") {
        add(
          "error",
          "ko-correct-answer-invalid",
          `${a.optionLabel}: clauseType=NONE(안긴문장 없음) 예문은 ODD_ONE_OUT('밑줄 친 안긴문장' 발문)에 쓸 수 없습니다`,
        );
      }
    }
    for (const a of analyses) {
      const optionText = optionTextOf.get(a.optionLabel) ?? "";
      if (!optionText) continue;
      const underlineMatch = /__([^_]+)__/.exec(optionText);
      if (!underlineMatch) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${a.optionLabel} 선지에 밑줄 마크업(__안긴문장__)이 없습니다 — '밑줄 친 안긴문장' 발문이 성립하지 않습니다`,
        );
        continue;
      }
      const underlined = underlineMatch[1].trim();
      if (
        !ctx.koText.containsSpanKo(underlined, a.embeddedClause) &&
        !ctx.koText.containsSpanKo(a.embeddedClause, underlined)
      ) {
        add(
          "warning",
          "ko-option-ending",
          `${a.optionLabel}: 밑줄 구간("${underlined}")과 embeddedClause("${a.embeddedClause}")가 일치하지 않습니다 — 밑줄은 분석된 안긴문장과 동일해야 합니다`,
        );
      }
    }

    // [결정론 12] 발문 축 단어 ↔ differAxis 정합 ('기능이'/'종류가')
    const axis = question.differAxis === "CLAUSE_TYPE" ? "CLAUSE_TYPE" : "CLAUSE_FUNCTION";
    const axisWord = axis === "CLAUSE_TYPE" ? "종류" : "기능";
    if (direction && direction.includes("나머지") && !direction.includes(axisWord)) {
      add(
        "error",
        "ko-direction-grammar",
        `differAxis=${axis} 인데 발문에 '${axisWord}' 가 없습니다 — 판정 축과 발문이 어긋나면 복수 정답 사고가 납니다`,
      );
    }

    // [결정론 13] 이질 판정 기계 검증 — differAxis 기준 4:1 분포 + 이질 선지=정답.
    //   절 '종류' 축은 학교문법 5대 분류 층위이므로 동격/관계 관형절을 하나로 접는다
    //   (하위 구분에 의존한 이질 판정은 '전부 관형절' 반론이 성립 — 중의성 사고).
    if (analyses.length === 5) {
      const groups = new Map<string, string[]>();
      for (const a of analyses) {
        const key =
          axis === "CLAUSE_TYPE"
            ? a.clauseType.startsWith("ADNOMINAL")
              ? "ADNOMINAL"
              : a.clauseType
            : a.clauseFunction;
        const list = groups.get(key) ?? [];
        list.push(a.optionLabel);
        groups.set(key, list);
      }
      const sizes = [...groups.values()].map((labels) => labels.length).sort((x, y) => x - y);
      if (!(groups.size === 2 && sizes[0] === 1 && sizes[1] === 4)) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `ODD_ONE_OUT 인데 ${axis === "CLAUSE_TYPE" ? "절 종류(동격/관계 관형절은 한 종류로 판정)" : "성분 기능"} 분포가 4:1 이 아닙니다 (분포: ${[...groups.entries()].map(([k, v]) => `${k}×${v.length}`).join(", ")}) — 나머지 넷은 동일, 정답 하나만 달라야 합니다`,
        );
      } else {
        const oddGroup = [...groups.values()].find((labels) => labels.length === 1);
        if (correctAnswer && oddGroup && oddGroup[0] !== correctAnswer) {
          add(
            "error",
            "ko-solver-mismatch",
            `기계 검증상 이질 선지는 ${oddGroup[0]} 인데 correctAnswer 는 ${correctAnswer} 입니다 — 분석·정답 desync`,
          );
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_GR_SYNTAX: KoTypeModule = {
  meta: {
    typeId: "KO_GR_SYNTAX",
    area: "GRAMMAR",
    label: "문장 구조(안긴문장·성분)",
    formatCategory: "객관식",
    uiGroup: "국어 문법",
    answerFormat: "MC5",
    includesPassage: false,
    passageKinds: ["GRAMMAR_CONCEPT"],
    defaultPoints: 2,
    usesBogi: "required",
    markerFamilies: [],
    optionEnding: "plain",
    needsSolverGate: false,
    // 선지가 "㉠: 예문" 형식으로 <보기> 항목 오름차순(㉠→㉢) 정렬되는 관행 —
    // 위치 셔플이 항목 순서를 흩뜨리므로 셔플 제외(정답 위치는 프롬프트로 분산).
    lockedOptionOrder: true,
    description:
      "홑/겹문장·안긴문장(명사절/관형절 동격·관계/부사절/서술절/인용절)의 종류와 성분 기능을 <보기> 조건 대응 또는 이질 판정으로 묻는 문법 유형 — 지문 없이 자체 창작 예문(저작권 청정), 표지 휴리스틱·단일정답성 기계 검증",
    setSlot:
      "언매 단독 문법 슬롯(37~39번대) — 문장 구조·안긴문장 판정. 내신 문법 단원 최다 빈출 축이자 내신 서술형(문장 도해·안긴문장 찾기) 최빈 소재의 객관식 원형",
    studentTask:
      "선지 예문 5개의 안긴문장을 분석해, <보기> 조건에 부합하는 예문 하나(또는 종류·기능이 나머지와 다른 하나)를 고릅니다.",
    bestFor: [
      "안긴문장 종류·기능 판별 연습 (지문 불필요 — 문법 단원 단독 출제)",
      "동격·관계 관형절 구분과 생략 성분 복원 훈련",
      "내신 서술형 '문장 도해' 대비 객관식 변형",
    ],
    outputUi: ["<보기> 조건 박스(㉠~㉢)", "5지선다(자체 창작 예문·밑줄)", "선지별 통사 분석 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "questionMode",
        label: "출제 모드",
        kind: "select",
        options: [
          { value: "BOGI_MATCH", label: "<보기> 조건 대응형(㉠~㉢에 해당하는 예)" },
          { value: "ODD_ONE_OUT", label: "이질 판정형(나머지와 다른 것)" },
        ],
        defaultValue: "BOGI_MATCH",
        description: "조건 대응형은 <보기> 항목-예문 매칭, 이질 판정형은 5예문 중 종류/기능이 다른 하나를 찾습니다",
      },
      {
        key: "conceptFocus",
        label: "개념 초점",
        kind: "select",
        options: [
          { value: "MIXED", label: "혼합(절 종류+성분 기능 결합)" },
          { value: "EMBEDDED_TYPE", label: "안긴문장의 종류(동격·관계 포함)" },
          { value: "CLAUSE_FUNCTION", label: "성분 기능(주어·목적어·부사어 등)" },
        ],
        defaultValue: "MIXED",
        description: "<보기> 조건(또는 이질 축)을 어느 문법 층위로 구성할지 정합니다",
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
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "표지가 뚜렷한 단층 내포 예문만 사용하라(-기 명사절·-는 관형절·-게 부사절·라고 인용절). 동격/관계 구분은 다루지 않고, 오답은 절 종류 오귀속 한 원리로 통일하라. <보기> 조건은 절 종류 단일 층위로.",
    INTERMEDIATE:
      "동격/관계 관형절 대비와 서술절 예문을 각 1개 이상 포함하고, 관계 관형절은 생략 성분 복원(omittedComponent)이 판정 근거가 되게 하라. <보기> 조건은 절 종류+성분 기능 결합형으로, 명사절은 조사에 따라 기능이 갈리는 예문을 써라.",
    KILLER:
      "다층 내포(안긴문장 속 안긴문장) 예문 1개와 동형 표지 대비(대등 '-고' vs 인용 '-고', 보조적 연결 '-게' vs 부사절 '-게')를 포함하라. 서술절 존재 오판(보어 구문 '~이 되다'와의 대비)과 성분 층위 혼동(관형사 vs 관형어)을 오답에 배치하고, 조건 동시 충족형('㉠~㉢을 모두 충족하는 예')으로 전수 검증을 강제하라.",
  },
};
