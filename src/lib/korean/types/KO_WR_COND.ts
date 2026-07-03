// ============================================================================
// KO_WR_COND — 작문: 조건 충족 생성형 (제목 / [A] 빈칸 / 마지막 문장)
// ============================================================================
// 카탈로그 §2.4 KO_WR_COND 의 전면 구현 — 화작 세트 43~45번대 시그니처이자
// 내신 조건 서술형(KO_NS_COND)의 객관식 원형. 자체자료(koStimulus) 인프라 위에
// 서는 첫 작문 유형: 학생 초고(DRAFT) 1블록 + <보기>=[조건] 2~3항.
//
// 실측 근거:
//   2026 수능 43번: 초고 마지막 문단 끝 [A] — "…[A]에 들어갈 내용으로 가장 적절한 것은?"
//   2026 6평 44번(제목형): "<보기>를 반영하여 '초고'의 제목을 작성한다고 할 때 가장
//     적절한 것은?" — <보기> = "◦초고의 3, 4문단에 제시된 미식 관광의 각 효과를
//     포괄하도록, 문단별로 단어를 찾아 활용할 것. ◦미식 관광에 대한 긍정적 관점을
//     드러낼 것." (내용 포괄 + 관점 조건의 정석)
//   2025-10 고1 학평 30번(제목형): "◦경험의 의미를 드러내며 비유적 표현을 활용할 것.
//     ◦경험에 대한 긍정적 관점을 드러낼 것." — 정답 ④ "별처럼 빛나는 나를 찾은,
//     밤하늘 사색 체험"(비유+긍정+의미), 오답은 정확히 조건 일부만 충족.
//
// 메커니즘(카탈로그 원문): 조건 2~3개(내용 포괄+관점+표현) 전부 충족 선지 판별.
// 오답은 정확히 '조건 일부만 충족'으로 제작 — 기출 해설이 오답별 누락 조건을
// 1:1 명시한다. 본 모듈은 그 1:1 명시를 wrongOptionExplanations 에 강제하고
// conditionAnalysis(선지×조건 매트릭스)로 결정론 검증한다.
//
// 결정론 게이트(본 모듈 validate):
//   ① <보기> 조건 ≥2 + '~할 것' 종결 관행  ② DRAFT 에 [A] 토큰 정확히 1회
//     (제목형 면제·금지)  ③ conditionAnalysis 정합(정답=전부 충족, 오답=일부만)
//   ④ 따옴표 명시 형식 조건의 기계 검사(종결·포함어·문장 수)  ⑤ 오답 해설의
//     누락 조건 1:1 명시 패턴  ⑥ 정답 선지 초고/조건 누출  ⑦ 발문-자리 정합
// ============================================================================

import { z } from "zod";
import { koBogiSchema, koMc5Envelope, koStimulusBlockSchema } from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
} from "../core/render-model";
import type {
  KoDifficulty,
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeMeta,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// 화법·작문·매체 확장 축 — KoArea("WRITING")/uiGroup("국어 화법·작문·매체") 유니온
// 등재는 레지스트리 조립 단계 소유(팬아웃은 타 파일 수정 금지). 등재 전 tsc 통과를
// 위한 전방 캐스트로, 유니온 확장 후에는 캐스트 없이도 적법한 값이다.
const KO_WR_AREA = "WRITING" as unknown as KoTypeMeta["area"];
const KO_WR_UI_GROUP = "국어 화법·작문·매체" as unknown as KoTypeMeta["uiGroup"];

const OPTION_LABELS = ["①", "②", "③", "④", "⑤"] as const;

const schema = koMc5Envelope({
  koStimulus: z
    .array(koStimulusBlockSchema)
    .length(1)
    .describe(
      "학생 초고 — kind:'DRAFT' 블록 정확히 1개, label:'[초고]'. lines = 문단 단위 행(첫 행에 '[작문 상황] …' 1행 허용). 빈칸형·마지막 문장형은 행 안에 [A] 리터럴을 정확히 1회 배치(제목형은 [A] 금지)",
    ),
  bogi: koBogiSchema.describe(
    "<보기> = 조건 박스 — lines 각 행이 조건 정확히 1항('~할 것' 명사형 종결, 불릿 기호 없이 문면만), 총 2~3항: 내용 포괄 조건 + 표현법 조건(비유·대구·설의 등 명시) + (선택) 관점·형식 조건",
  ),
  slotForm: z
    .enum(["TITLE", "BODY_BLANK", "LAST_SENTENCE"])
    .describe(
      "생성 자리 — TITLE: 초고의 제목 작성(초고에 [A] 없음), BODY_BLANK: 본문 중간 [A] 빈칸, LAST_SENTENCE: 마지막 문단 끝 [A](마무리 문장, 2026 수능 43번형)",
    ),
  conditionAnalysis: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]),
        metConditions: z
          .array(z.number().int().min(1))
          .describe("이 선지가 충족하는 조건 번호(<보기> 행 순서, 1부터)"),
        missedConditions: z
          .array(z.number().int().min(1))
          .describe("이 선지가 충족하지 못하는 조건 번호 — 정답은 빈 배열, 오답은 1개 이상"),
      }),
    )
    .length(5)
    .describe(
      "선지×조건 충족 매트릭스 — 모든 조건 번호가 met/missed 어느 한쪽에 반드시 들어가야 하며, 시스템이 '정답=전부 충족·오답=정확히 일부만 충족'을 결정론 검증한다",
    ),
});

const prompt = `### 유형: 작문 — 조건 충족 생성형 (제목 / [A] 빈칸 / 마지막 문장)

**구조**: 학생 초고(koStimulus, DRAFT 1블록) + <보기>([조건] 2~3항) + 5지선다.
학생은 <보기>의 조건을 **전부** 충족하면서 초고 흐름에 맞는 선지 하나를 고른다.
사용자 제공 지문은 초고의 **소재·화제 참고로만** 쓰라 — 초고는 학생 문체로 신규
집필하며 지문 문장을 복사하지 않는다(이 유형은 지문을 문항에 동봉하지 않는다).

**발문 템플릿** (slotForm 별 — 반드시 긍정발문 '가장 적절한 것은?' 종결, [3점] 표기는 시스템 처리):
- BODY_BLANK(본문 빈칸): "<보기>의 조건에 따라 [A]에 들어갈 내용으로 가장 적절한 것은?"
- LAST_SENTENCE(마무리 문장, 2026 수능 43번형): "<보기>의 조건에 따라 [A]에 들어갈 마지막 문장으로 가장 적절한 것은?" (또는 위 표준형 그대로)
- TITLE(제목형, 2026 6평 44번형): "<보기>를 반영하여 초고의 제목을 작성한다고 할 때 가장 적절한 것은?" / "<보기>의 조건에 따라 초고의 제목을 작성한 것으로 가장 적절한 것은?"
발문에는 반드시 '보기'가 등장해야 하고, TITLE 형은 '제목', 나머지는 '[A]' 를 발문에 그대로 쓴다.

**초고(koStimulus) 설계** — kind:"DRAFT", label:"[초고]", 블록 1개:
1. 첫 행(권장): "[작문 상황] ○○에 대해 설명하는(주장하는) 글을 작성하여 학교 신문에
   실으려 함." — 목적·예상 독자·매체를 한 행으로.
2. 이후 행 = 문단 1개씩, 3~5문단. 정형 구조(화제 제시 → 원인/특성 → 방안/효과 →
   마무리)를 갖춘 완결된 학생 초고로 쓰라. 문단 간 지시·접속 표현으로 응집성을 살려라.
3. [A] 규율: BODY_BLANK 는 본문 중간 행에, LAST_SENTENCE 는 **마지막 행 끝**에
   "[A]" 를 정확히 1회 넣는다(그 자리의 원래 문장은 쓰지 않는다 — 빈칸이다).
   TITLE 형은 [A] 를 어디에도 쓰지 않는다(제목 자리는 발문이 지시).
4. 정답 판정의 근거가 초고 문면에 실재해야 한다: 내용 포괄 조건이 지시하는 개념·
   문단별 핵심어가 초고에 실제로 등장하도록 초고와 조건을 함께 설계하라.

**<보기>([조건]) 설계** — lines 각 행 = 조건 1항, 총 2~3항, 전 항 '~할 것' 명사형 종결:
1. **내용 포괄 조건** (필수 1항): 초고의 중심 내용·특정 문단들의 핵심을 포괄하도록
   지시 — 실측 정석: "초고의 3, 4문단에 제시된 ○○의 각 효과를 포괄하도록, 문단별로
   단어를 찾아 활용할 것." / "글 전체의 중심 내용이 드러나게 쓸 것." 판정이 초고
   문면으로 소급 가능하게 구체적으로 쓰라.
2. **표현법 조건** (필수 1항): "비유적 표현을 활용할 것." / "대구의 형식을 활용할 것." /
   "설의적 표현을 활용할 것." — 표현법 명칭을 조건 문면에 명시해 채점 시비를 차단하라.
3. **관점·형식 조건** (선택 1항): "○○에 대한 긍정적 관점을 드러낼 것." /
   "'~하자'로 끝맺을 것."(권유형 종결) / "한 문장으로 쓸 것."
   따옴표로 형식을 명시하면 시스템이 정답 선지를 **기계 검사**한다 — 정답이 문자
   그대로 그 형태로 끝나도록 쓰라('~와 같이'류 예시 완화 표현은 검사에서 제외된다).
조건끼리 상호 모순 금지, 조건 문면에 정답 구절을 옮겨 적는 정답 누출 금지
(조건은 요구 사항이지 답안 미리보기가 아니다).

**정답 선지 설계**:
- <보기>의 **모든 조건을 동시에** 충족하고, 초고의 흐름(빈칸 앞뒤 문맥·글 전체 논지)에
  자연스럽게 이어지는 문장/제목. 제목형은 "○○, ~하다" / "~한, ○○" 류 수능 제목 문체.
- 조건 충족이 문면에서 확인 가능해야 한다: 비유 조건이면 보조 관념이 실제로 등장,
  포괄 조건이면 지정 문단들의 핵심어가 실제로 반영.

**오답 4개 설계 — 전부 '정확히 일부만 충족'** (이 유형의 심장):
- 각 오답은 조건 중 **1개 이상을 충족하면서 1개 이상을 누락**한다. 전 조건을 다
  어기는 무관 선지는 금지(즉시 소거되어 변별이 죽는다).
- 누락 조합을 4개 오답에 서로 다르게 분산하라(조건 2항이면: 1만 충족 ×2, 2만 충족 ×2 /
  조건 3항이면 누락 1~2개씩 서로 다른 조합).
- **사이비 충족 함정**을 최소 1개 심어라: 비유 조건에 비유처럼 보이는 직설("별을 보는
  나" — 보조 관념 없음), 포괄 조건에 일부 문단만 반영("지역 농가의 이윤"만 언급),
  관점 조건에 중립·부정 어조("밤하늘에 갇힌 별"), 대구 조건에 반쪽 대구.
- 오답도 문장 자체는 어법·의미가 온전해야 한다 — 결함은 오직 '조건 누락'이다.

**conditionAnalysis (선지×조건 매트릭스, 결정론 검증 대상)**:
- 선지 5개 각각에 대해 조건 번호(<보기> 행 순서 1부터)를 metConditions /
  missedConditions 로 빠짐없이 판정하라(모든 조건 번호가 한쪽에 반드시 등장).
- 정답: missedConditions = []. 오답: missedConditions ≥1 이면서 metConditions ≥1.

**wrongOptionExplanations — 누락 조건 1:1 명시(기출 해설 관행) 강제**:
- 오답 4개 각각: 어느 조건을 왜 충족하지 못하는지 명시 — 반드시 '조건'이라는 단어와
  누락 판정('~을 활용하지 않아', '~이 드러나지 않아', '~을 포괄하지 못해')을 포함하고,
  그 조건의 문면 핵심어(예: '비유적 표현', '긍정적 관점') 또는 서수('첫 번째 조건')를
  그대로 인용하라. 시스템이 matrix 의 missedConditions 와 대조한다.
- 예: "② 는 두 번째 조건인 비유적 표현을 활용하지 않았고, 경험에 대한 관점도 드러나지
  않아 첫 번째 조건만 충족한다."

**근거앵커(evidence)**:
- 각 선지 1개 이상. spanText 는 **<보기> 조건 행 원문 그대로**(그 선지의 충족/누락
  판정 기준이 되는 조건) 또는 **초고 문단의 구절 verbatim**(내용 포괄 판정의 원천).
- 정답: relation=SUPPORTS. 오답: relation=CONTRADICTS + note 에 누락 조건 한 줄.

**빈발 반려 사유 — 종결 형식 조건·매트릭스 desync (시스템이 기계 검사)**:
1. 따옴표 종결 조건("'~하자'로 끝맺을 것")을 썼으면, met 으로 선언한 **모든** 선지가
   문자 그대로 그 형태(청유형 '-자' 포함)로 끝나야 한다. '-합시다/-갑시다' 등 다른
   종결을 허용하고 싶으면 조건 문면에 "'~하자' 또는 '~합시다'로 끝맺을 것"처럼
   허용 형태를 전부 병기하라 — 조건에 없는 종결로 끝나는 met 선지는 desync 반려된다.
2. 선지 5개를 전부 쓴 뒤, 각 선지의 실제 끝 글자를 조건 문면과 다시 대조해
   conditionAnalysis 의 met/missed 를 재검산하라 — 매트릭스는 선지 최종 문면 기준이다.
3. 모든 선지(①~⑤)에 evidence 앵커 1개 이상 필수 — 근거앵커 누락 선지는 즉시 반려된다.
   spanText 는 <보기> 조건 행 원문 또는 초고 구절 verbatim 만.

**금지**:
- 부정발문("적절하지 않은 것은?") — 이 유형은 긍정발문 고정.
- 선지에 작은따옴표('…') 인용 — 선지는 신규 창작 문장/제목이라 인용할 원문이 없다
  (시스템이 인용 실재성을 검사하므로 따옴표를 쓰면 반려된다).
- 정답 문구를 초고·<보기>·발문에 그대로 노출(4어절 이상 연속 일치 = 반려).
- 두 선지가 같은 누락 조합·같은 문구로 겹치는 구성, 조건과 무관한 '내용이 좋은' 오답.
- 초고 없이 조건만으로 푸는 구성 — 내용 포괄 조건이 초고 문면과 반드시 결속돼야 한다.`;

// ---------------------------------------------------------------------------
// <보기> 조건 결정론 파서 — 따옴표 명시 형식 조건(종결·포함어·문장 수)의 기계 검증
// (KO_NS_COND 파서 미러 — '~와 같이'류 예시 완화 표현은 기계 검사에서 제외)
// ---------------------------------------------------------------------------

type KoTextUtil = KoValidationContext["koText"];

interface ParsedWrCondition {
  /** 1-based 조건 번호 (<보기> 행 순서) */
  index: number;
  text: string;
  /**
   * 종결 형식 조건의 허용 종결 후보들 (빈 배열 = 기계검사 면제).
   * [W2] 종전 단일 ending 은 "'~하자' 또는 '~합시다'로 끝맺을 것" 류 대안 병기
   * 조건에서 첫 인용만 강제해 정상 선지('…합시다')를 blocking 오차단했다 —
   * 대안 접속(또는/이나/거나)이 있으면 인용 전부를 허용 후보로 수용한다.
   */
  endings: string[];
  includeWords: string[];
  sentence: { count: number; atMost: boolean } | null;
}

const ENDING_KEYWORD_RE = /(끝맺|끝낼|끝내|끝나|맺을|마무리|종결)/;
/** 예시 완화 표현 — 인용이 '그 형태 그대로'를 뜻하지 않으므로 기계검사 제외. */
const HEDGE_RE = /(같이|처럼|따위|등의|등으로)/;
const INCLUDE_KEYWORD_RE = /(포함할 것|포함하여|포함되도록|넣을 것|반드시 쓸 것|사용할 것|활용할 것)/;
const KOREAN_COUNT: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 하나: 1, 둘: 2 };

function quotedSpans(text: string, koText: KoTextUtil): string[] {
  const spans = [...koText.extractQuotedSpansKo(text)];
  const doubleQuoteRe = /["“]([^"”]{2,60})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = doubleQuoteRe.exec(text)) !== null) spans.push(m[1].trim());
  return spans.map((s) => s.replace(/^[~…\-]+/, "").trim()).filter(Boolean);
}

function parseWrCondition(index: number, text: string, koText: KoTextUtil): ParsedWrCondition {
  const hedged = HEDGE_RE.test(text);
  const quoted = hedged ? [] : quotedSpans(text, koText);
  const hasEnding = ENDING_KEYWORD_RE.test(text) && quoted.length > 0;
  // '또는/이나/거나' 대안 병기 조건이면 인용 전부가 허용 종결 후보다.
  const alternates = /(또는|이나|거나)/.test(text);
  const endings = hasEnding
    ? (alternates ? quoted : quoted.slice(0, 1)).map((q) => q.replace(/[.!?…\s]+$/, "")).filter(Boolean)
    : [];
  const includeWords = INCLUDE_KEYWORD_RE.test(text)
    ? hasEnding
      ? alternates
        ? []
        : quoted.slice(1)
      : quoted
    : [];
  const sm = /(한|두|세|네|하나|둘|[0-9]+)\s*문장/.exec(text);
  const count = sm ? (KOREAN_COUNT[sm[1]] ?? Number(sm[1])) : NaN;
  const sentence =
    Number.isFinite(count) && count > 0 ? { count, atMost: /(이내|이하)/.test(text) } : null;
  return { index, text, endings, includeWords, sentence };
}

function isMachineCheckable(cond: ParsedWrCondition): boolean {
  return cond.endings.length > 0 || cond.includeWords.length > 0 || cond.sentence !== null;
}

/** 선지 텍스트의 기계검사 실패 사유 (null = 검사 가능한 제약 전부 충족). */
function optionConditionFailure(
  optionText: string,
  cond: ParsedWrCondition,
  koText: KoTextUtil,
): string | null {
  if (cond.endings.length > 0) {
    const base = optionText
      .trim()
      .replace(/['"’”」』\s]+$/, "")
      .replace(/[.!?…\s]+$/, "");
    // '~하자' 표기는 관행상 청유형 종결('-자') 전반을 지시한다 — '하'로 시작하는
    // 종결 후보는 '하'를 뗀 어미형('자')도 허용해 정상 선지('…잡자') 오차단을 막는다
    // (가짜양성 보수 설계 — 검사는 실패 시에만 blocking 이므로 완화가 안전 방향).
    const candidates = cond.endings.flatMap((e) =>
      e.length >= 2 && e.startsWith("하") ? [e, e.slice(1)] : [e],
    );
    if (!candidates.some((c) => c && base.endsWith(c))) {
      return `종결 조건 '${cond.endings.join("'/'")}' 미충족 (선지 끝: "…${base.slice(-12)}")`;
    }
  }
  for (const word of cond.includeWords) {
    if (!koText.containsSpanKo(optionText, word)) return `포함어 '${word}' 미포함`;
  }
  if (cond.sentence) {
    const n = koText.splitSentencesKo(optionText).length;
    const ok = cond.sentence.atMost ? n <= cond.sentence.count : n === cond.sentence.count;
    if (!ok) {
      return `문장 수 조건(${cond.sentence.count}문장${cond.sentence.atMost ? " 이내" : ""}) 미충족 — 실제 ${n}문장`;
    }
  }
  return null;
}

// --- 오답 해설의 누락 조건 1:1 명시 판정용 토큰 (KO_NS_COND contentTokens 미러) ---

const TOKEN_DROP = new Set([
  "것", "할", "쓸", "및", "또는", "모두", "맞게", "반드시", "위해", "대한", "대해",
  "드러낼", "활용할", "포함할", "작성할", "초고",
]);
const TRAILING_PARTICLE_RE =
  /(으로써|이라는|라는|에서|에게|으로|와|과|을|를|이|가|은|는|의|에|로|도|만)$/;

function conditionTokens(text: string): string[] {
  return text
    .replace(/['"‘’“”]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[^가-힣a-zA-Z0-9]/g, ""))
    .map((t) => t.replace(TRAILING_PARTICLE_RE, ""))
    .filter((t) => t.length >= 2 && !TOKEN_DROP.has(t));
}

const ORDINALS = ["첫 번째", "두 번째", "세 번째", "네 번째"];
const ORDINALS_ALT = ["첫째", "둘째", "셋째", "넷째"];

/** 해설이 누락 조건(1-based idx 목록) 중 하나라도 문면으로 지목하는가. */
function explanationNamesMissedCondition(
  explanation: string,
  missed: number[],
  conditions: string[],
): boolean {
  for (const idx of missed) {
    const refs = [
      `조건 ${idx}`,
      `${idx}번`,
      ORDINALS[idx - 1] ?? "",
      ORDINALS_ALT[idx - 1] ?? "",
    ].filter(Boolean);
    if (refs.some((r) => explanation.includes(r))) return true;
    const line = conditions[idx - 1];
    if (line && conditionTokens(line).some((t) => explanation.includes(t))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// validate — 유형 특화 결정론 게이트
// (공통 게이트: 발문 기본 문법·5지선다 구조·근거 verbatim(지문/보기/자료)·
//  stimulus 필수 결손(ko-stimulus-missing)은 dispatch 선실행 — 중복 금지)
// ---------------------------------------------------------------------------

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[]).map((o) => ({
        label: typeof o.label === "string" ? o.label : "",
        text: typeof o.text === "string" ? o.text : "",
      }))
    : [];

  // --- (1) 발문: 긍정발문 고정 + <보기> 지시 + 자리(slotForm) 정합 ----------
  if (direction && ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "조건 충족 생성형은 긍정발문('…으로 가장 적절한 것은?') 고정 유형입니다 — 부정발문 금지",
    );
  }
  if (direction && !direction.includes("보기")) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 <보기>의 조건을 지시하지 않습니다: "${direction.slice(0, 40)}"`,
    );
  }
  const rawSlot = typeof question.slotForm === "string" ? question.slotForm : "";
  const slotForm =
    rawSlot === "TITLE" || rawSlot === "BODY_BLANK" || rawSlot === "LAST_SENTENCE"
      ? rawSlot
      : direction.includes("제목")
        ? "TITLE"
        : "BODY_BLANK";
  if (slotForm === "TITLE") {
    if (direction && !direction.includes("제목")) {
      add("error", "ko-direction-grammar", "제목형(slotForm=TITLE)인데 발문에 '제목' 지시가 없습니다");
    }
  } else if (direction && !direction.includes("[A]")) {
    add(
      "error",
      "ko-direction-grammar",
      `빈칸형(slotForm=${slotForm})인데 발문이 [A] 를 지시하지 않습니다 — "…[A]에 들어갈 내용으로 가장 적절한 것은?" 골격 필요`,
    );
  }

  // --- (2) <보기> 조건: 2항 이상 + '~할 것' 명사형 종결 관행 ---------------
  const bogi =
    question.bogi && typeof question.bogi === "object"
      ? (question.bogi as Record<string, unknown>)
      : null;
  const conditions =
    bogi && Array.isArray(bogi.lines)
      ? (bogi.lines as unknown[]).filter(
          (l): l is string => typeof l === "string" && l.trim().length > 0,
        )
      : [];
  if (conditions.length < 2) {
    add(
      "error",
      "ko-bogi-missing",
      `<보기> 조건이 ${conditions.length}개 — 내용 포괄+표현법(+관점·형식) 조합으로 최소 2항이 필요합니다`,
    );
  }
  for (const c of conditions) {
    const trimmed = c.trim().replace(/[.。]$/, "");
    if (!trimmed.endsWith("것")) {
      add(
        "warning",
        "ko-option-ending",
        `<보기> 조건 "${trimmed.slice(0, 24)}" 이 '~할 것' 명사형으로 끝나지 않습니다 — 조건 표기 관행 위반`,
      );
    }
  }

  // --- (3) 초고 [A] 토큰 규율 (제목형 금지 / 빈칸형 정확히 1회) ------------
  const blocks = readKoStimulusBlocks(question.koStimulus);
  const draftLines = blocks.flatMap((b) => b.lines);
  const draftText = blocks.map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n")).join("\n");
  if (blocks.length > 0) {
    const blankCount = draftText.split("[A]").length - 1;
    if (slotForm === "TITLE") {
      if (blankCount > 0) {
        add(
          "error",
          "ko-marker-unresolved",
          "제목형(slotForm=TITLE)인데 초고에 [A] 토큰이 있습니다 — 제목 자리는 발문이 지시하므로 [A] 를 쓰지 않습니다",
        );
      }
    } else if (blankCount === 0) {
      add(
        "error",
        "ko-marker-unresolved",
        `빈칸형(slotForm=${slotForm})인데 초고(DRAFT)에 [A] 빈칸 토큰이 없습니다 — 선지가 들어갈 자리가 해소되지 않습니다`,
      );
    } else if (blankCount > 1) {
      add(
        "error",
        "ko-marker-unresolved",
        `초고에 [A] 토큰이 ${blankCount}회 — 정확히 1회여야 합니다(복수 빈칸은 정답 자리 모호)`,
      );
    } else if (
      slotForm === "LAST_SENTENCE" &&
      draftLines.length > 0 &&
      !draftLines[draftLines.length - 1].includes("[A]")
    ) {
      add(
        "warning",
        "ko-marker-order",
        "마지막 문장형(slotForm=LAST_SENTENCE)인데 [A] 가 초고 마지막 행에 있지 않습니다",
      );
    }
  }

  // --- (4) conditionAnalysis 매트릭스 — 정답=전부 충족 / 오답=정확히 일부만 --
  const matrix = new Map<string, { met: number[]; missed: number[] }>();
  const rawMatrix = Array.isArray(question.conditionAnalysis)
    ? (question.conditionAnalysis as Record<string, unknown>[])
    : [];
  for (const raw of rawMatrix) {
    if (!raw || typeof raw !== "object") continue;
    const label = typeof raw.label === "string" ? raw.label : "";
    const met = Array.isArray(raw.metConditions)
      ? (raw.metConditions as unknown[]).filter((n): n is number => typeof n === "number")
      : [];
    const missed = Array.isArray(raw.missedConditions)
      ? (raw.missedConditions as unknown[]).filter((n): n is number => typeof n === "number")
      : [];
    if (label) matrix.set(label, { met, missed });
  }
  if (matrix.size === 0) {
    add(
      "error",
      "ko-condition-rubric-mismatch",
      "conditionAnalysis(선지×조건 매트릭스)가 없습니다 — 조건 충족 생성형의 결정론 검증 필수 산출물",
    );
  } else {
    const missingLabels = OPTION_LABELS.filter((l) => !matrix.has(l));
    if (missingLabels.length > 0) {
      add(
        "error",
        "ko-condition-rubric-mismatch",
        `conditionAnalysis 에 누락된 선지: ${missingLabels.join(" ")} — 5개 선지 전부 판정해야 합니다`,
      );
    }
    const condCount = conditions.length;
    for (const [label, { met, missed }] of matrix) {
      const all = [...met, ...missed];
      if (condCount > 0) {
        const outOfRange = all.filter((n) => n < 1 || n > condCount);
        if (outOfRange.length > 0) {
          add(
            "error",
            "ko-condition-rubric-mismatch",
            `${label} 매트릭스의 조건 번호 ${outOfRange.join(",")} 가 <보기> 조건 범위(1~${condCount}) 밖입니다`,
          );
          continue;
        }
        const covered = new Set(all);
        const uncovered = Array.from({ length: condCount }, (_, i) => i + 1).filter(
          (n) => !covered.has(n),
        );
        if (uncovered.length > 0) {
          add(
            "error",
            "ko-condition-rubric-mismatch",
            `${label} 매트릭스가 조건 ${uncovered.join(",")} 을 판정하지 않았습니다 — 전 조건이 met/missed 한쪽에 있어야 합니다`,
          );
        }
      }
      const overlap = met.filter((n) => missed.includes(n));
      if (overlap.length > 0) {
        add(
          "error",
          "ko-condition-rubric-mismatch",
          `${label} 매트릭스에서 조건 ${overlap.join(",")} 가 met 과 missed 에 동시에 있습니다 — 판정 모순`,
        );
      }
      if (label === correctAnswer) {
        if (missed.length > 0) {
          add(
            "error",
            "ko-condition-rubric-mismatch",
            `정답 ${label} 가 조건 ${missed.join(",")} 을 누락한다고 표기됨 — 정답은 전 조건 충족이어야 합니다(무정답 문항 위험)`,
          );
        }
      } else {
        if (missed.length === 0) {
          add(
            "error",
            "ko-condition-rubric-mismatch",
            `오답 ${label} 의 누락 조건이 없습니다 — 조건을 전부 충족하는 오답은 복수정답입니다`,
          );
        }
        if (met.length === 0) {
          add(
            "error",
            "ko-condition-rubric-mismatch",
            `오답 ${label} 가 충족하는 조건이 하나도 없습니다 — '정확히 일부만 충족' 원리 위반(무관 선지는 즉시 소거되어 변별이 죽습니다)`,
          );
        }
      }
    }
  }

  // --- (5) 따옴표 명시 형식 조건의 기계 검사 -------------------------------
  const parsed = conditions.map((c, i) => parseWrCondition(i + 1, c, ctx.koText));
  const correctOption = options.find((o) => o.label === correctAnswer);
  if (correctOption?.text) {
    for (const cond of parsed) {
      if (!isMachineCheckable(cond)) continue;
      const failure = optionConditionFailure(correctOption.text, cond, ctx.koText);
      if (failure) {
        add(
          "error",
          "ko-condition-rubric-mismatch",
          `정답 ${correctAnswer} 가 조건 ${cond.index}("${cond.text.slice(0, 20)}")을 충족하지 않습니다: ${failure}`,
        );
      }
    }
  }
  // 오답이 '충족한다'고 주장한(met) 기계검사 조건은 실제로도 통과해야 한다.
  for (const o of options) {
    if (!o.text || o.label === correctAnswer) continue;
    const entry = matrix.get(o.label);
    if (!entry) continue;
    for (const idx of entry.met) {
      const cond = parsed[idx - 1];
      if (!cond || !isMachineCheckable(cond)) continue;
      const failure = optionConditionFailure(o.text, cond, ctx.koText);
      if (failure) {
        add(
          "error",
          "ko-condition-rubric-mismatch",
          `${o.label} 매트릭스가 조건 ${idx} 충족(met)이라 표기했지만 기계 검사 실패: ${failure} — 매트릭스 desync`,
        );
      }
    }
  }

  // --- (6) 오답 해설의 누락 조건 1:1 명시 (기출 해설 관행 강제) ------------
  const wrongExpl = Array.isArray(question.wrongOptionExplanations)
    ? (question.wrongOptionExplanations as Record<string, unknown>[]).map((w) => ({
        label: typeof w.label === "string" ? w.label : "",
        explanation: typeof w.explanation === "string" ? w.explanation : "",
      }))
    : [];
  for (const w of wrongExpl) {
    if (!w.label || !w.explanation) continue;
    if (w.label === correctAnswer) {
      add(
        "error",
        "ko-condition-rubric-mismatch",
        `wrongOptionExplanations 에 정답 라벨 ${w.label} 이 들어 있습니다 — 오답 4개만 대상입니다`,
      );
      continue;
    }
    if (!w.explanation.includes("조건") || !/(않|못|누락|없)/.test(w.explanation)) {
      add(
        "error",
        "ko-condition-rubric-mismatch",
        `${w.label} 오답 해설이 누락 '조건'을 명시하지 않습니다 — "…조건을 충족하지 못한다" 골격으로 어느 조건이 빠졌는지 1:1 명시해야 합니다`,
      );
      continue;
    }
    const entry = matrix.get(w.label);
    if (entry && entry.missed.length > 0 && conditions.length > 0) {
      if (!explanationNamesMissedCondition(w.explanation, entry.missed, conditions)) {
        add(
          "error",
          "ko-condition-rubric-mismatch",
          `${w.label} 오답 해설이 매트릭스의 누락 조건(${entry.missed.join(",")})을 문면으로 지목하지 않습니다 — 조건 핵심어 또는 '${ORDINALS[entry.missed[0] - 1] ?? `조건 ${entry.missed[0]}`} 조건' 표현을 인용하세요`,
        );
      }
    }
  }

  // --- (7) 정답 누출 — 초고·<보기>·발문에 정답 선지 연속 4어절 노출 금지 ----
  if (correctOption?.text) {
    const haystack = [direction, ...conditions, draftText].join("\n");
    const eojeols = correctOption.text.split(/\s+/).filter(Boolean);
    const windows: string[] = [];
    if (eojeols.length >= 4) {
      for (let i = 0; i + 4 <= eojeols.length; i++) windows.push(eojeols.slice(i, i + 4).join(" "));
    } else if (correctOption.text.trim().length >= 6) {
      windows.push(correctOption.text.trim());
    }
    for (const window of windows) {
      if (ctx.koText.containsSpanKo(haystack, window)) {
        add(
          "error",
          "ko-answer-leak",
          `초고·<보기>·발문에 정답 선지 구절("${window.slice(0, 30)}")이 그대로 노출되었습니다 — 정답 누출`,
        );
        break;
      }
    }
  }

  // --- (8) 선지 중복 (같은 문구 2회 = 변별 붕괴) ---------------------------
  const seen = new Map<string, string>();
  for (const o of options) {
    const key = o.text.replace(/\s+/g, " ").trim();
    if (!key) continue;
    const prior = seen.get(key);
    if (prior) {
      add("error", "ko-option-count", `${prior} 와 ${o.label} 선지 문구가 동일합니다 — 선지 중복`);
    } else {
      seen.set(key, o.label);
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings, difficulty: KoDifficulty): string {
  const lines: string[] = [];

  const slot = settings.slotForm;
  if (slot === "TITLE") {
    lines.push(
      '- 자리: 제목형(slotForm=TITLE) — 발문 "<보기>를 반영하여 초고의 제목을 작성한다고 할 때 가장 적절한 것은?", 초고에 [A] 를 쓰지 않는다. 선지는 수능 제목 문체("○○, ~하다" / "~한, ○○").',
    );
  } else if (slot === "BODY_BLANK") {
    lines.push(
      '- 자리: 본문 빈칸형(slotForm=BODY_BLANK) — 초고 중간 행에 [A] 를 정확히 1회 두고, 발문은 "<보기>의 조건에 따라 [A]에 들어갈 내용으로 가장 적절한 것은?" 골격.',
    );
  } else if (slot === "LAST_SENTENCE") {
    lines.push(
      "- 자리: 마지막 문장형(slotForm=LAST_SENTENCE, 2026 수능 43번형) — 초고 마지막 행 끝에 [A] 를 두고, 선지는 글 전체를 마무리하는 한 문장으로.",
    );
  } else {
    lines.push(
      "- 자리는 초고 특성에 맞게 선택하라: 논지가 응축될 마무리가 필요하면 LAST_SENTENCE, 핵심어 종합이 필요하면 TITLE, 전개 중간의 필연 문장이면 BODY_BLANK.",
    );
  }

  const rhetoric = settings.rhetoricCondition;
  if (rhetoric === "METAPHOR") {
    lines.push('- 표현법 조건은 "비유적 표현을 활용할 것." 으로 — 정답에 보조 관념이 실재해야 하고, 오답 함정 1개는 비유 없는 직설로.');
  } else if (rhetoric === "PARALLEL") {
    lines.push('- 표현법 조건은 "대구의 형식을 활용할 것." 으로 — 정답은 구조가 짝을 이루는 두 마디, 오답 함정 1개는 반쪽 대구로.');
  } else if (rhetoric === "RHET_QUESTION") {
    lines.push('- 표현법 조건은 "설의적 표현을 활용할 것." 으로 — 정답은 답이 자명한 의문형, 오답 함정 1개는 단순 평서/단순 질문으로.');
  } else {
    lines.push("- 표현법 조건(비유/대구/설의 중 초고 어조에 맞는 것)을 1항 반드시 포함하라.");
  }

  const count = settings.conditionCount;
  if (count === "TWO") {
    lines.push("- <보기> 조건은 정확히 2항(내용 포괄 + 표현법).");
  } else if (count === "THREE") {
    lines.push("- <보기> 조건은 정확히 3항(내용 포괄 + 표현법 + 관점·형식).");
  } else {
    lines.push("- <보기> 조건 수는 난이도에 맞게 2~3항에서 선택하라.");
  }

  if (difficulty === "BASIC") {
    lines.push(
      "- 난이도 기본: 조건 2항. 오답의 누락이 문면에서 즉시 판정되게(표현법 자체가 아예 없음, 중심 내용 무관). 초고 3~4문단.",
    );
  } else if (difficulty === "KILLER") {
    lines.push(
      "- 난이도 킬러: 조건 3항 — 내용 포괄 조건이 복수 문단을 지정('n, m문단의 각 ○○을 포괄하도록 문단별로 단어를 찾아 활용할 것')하고, 오답 4개 전부 사이비 충족(비유 흉내 직설·일부 문단만 포괄·관점 미묘 반전·반쪽 대구)으로 제작해 전 선지 조건 대조를 강제하라. 정답도 표면상 화려하지 않게.",
    );
  } else {
    lines.push(
      "- 난이도 중급: 조건 3항. 오답 4개의 누락 조건 조합을 서로 다르게 분산하고, 사이비 충족 함정을 1~2개 포함하라.",
    );
  }

  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 초고 소재는 수업·학교 생활 맥락(교지 기고·건의문·캠페인 글)으로, 조건은 전부 기계 판정 가능한 문면('~을 활용할 것'에 표현법 명칭 명시)으로 쓰라 — 이 유형은 내신 조건 서술형의 원형이라 채점 시비 차단이 관행이다.",
    );
  } else {
    lines.push(
      "- 수능 모드(기본): 화작 43~45번대 평가원 문체 — [작문 상황] 1행 + 학생 초고, 조건은 간결·중립 문면으로. 배점은 2점 기본(변별 목적이면 3점).",
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// module
// ---------------------------------------------------------------------------

export const KO_WR_COND: KoTypeModule = {
  meta: {
    typeId: "KO_WR_COND",
    area: KO_WR_AREA,
    label: "조건 충족 생성형(작문)",
    formatCategory: "객관식",
    uiGroup: KO_WR_UI_GROUP,
    answerFormat: "MC5",
    includesPassage: false, // 자체자료(초고)만 동봉 — 사용자 지문은 소재 참고
    passageKinds: [
      "READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART",
      "LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL",
      "LIT_ESSAY", "LIT_PLAY", "MIXED",
    ],
    defaultPoints: 2,
    usesBogi: "required",
    usesStimulus: "required",
    stimulusKinds: ["DRAFT"],
    markerFamilies: [], // [A] 는 초고 행 안의 빈칸 리터럴 — 지문 마커 아님
    optionEnding: "any", // 선지 = 신규 창작 제목/문장 (고정 어미 없음)
    needsSolverGate: false,
    description:
      "학생 초고(제목/[A] 빈칸/마지막 문장 자리) + <보기> 조건 2~3항(내용 포괄·표현법·형식) — 정답은 전 조건 충족, 오답 4개는 정확히 일부만 충족하며 누락 조건을 해설에 1:1 명시하는 작문 시그니처",
    setSlot: "화작 작문 세트(43~45번대) 중간 슬롯 — 제목형·마무리 문장형으로 변주, 내신 조건 서술형의 객관식 원형",
    studentTask:
      "학생 초고를 읽고, <보기>의 조건(내용 포괄·표현법·형식)을 모두 충족하면서 [A](또는 제목) 자리에 들어갈 선지를 고릅니다.",
    bestFor: [
      "작문 단원 내신·수능 화작 대비",
      "비유·대구·설의 등 표현법 적용 훈련",
      "글의 논지를 한 문장으로 응축하는 요약·표제 훈련",
    ],
    outputUi: ["[초고] 자료 박스([A] 빈칸)", "〈보기〉 조건 박스", "5지선다(제목/문장형)", "오답별 누락 조건 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "slotForm",
        label: "생성 자리",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(초고 특성)" },
          { value: "TITLE", label: "제목 작성" },
          { value: "BODY_BLANK", label: "본문 [A] 빈칸" },
          { value: "LAST_SENTENCE", label: "마지막 문장" },
        ],
        defaultValue: "AUTO",
        description: "선지가 채울 자리 — 제목형(학평 30번형)·마지막 문장형(2026 수능 43번형)이 실측 최빈",
      },
      {
        key: "rhetoricCondition",
        label: "표현법 조건",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동" },
          { value: "METAPHOR", label: "비유" },
          { value: "PARALLEL", label: "대구" },
          { value: "RHET_QUESTION", label: "설의" },
        ],
        defaultValue: "AUTO",
        description: "<보기> 조건에 명시할 표현법 — 오답 함정(사이비 충족)의 축이 됩니다",
      },
      {
        key: "conditionCount",
        label: "조건 수",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(난이도)" },
          { value: "TWO", label: "2항" },
          { value: "THREE", label: "3항" },
        ],
        defaultValue: "AUTO",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    // 초고(stimulus)가 지문 역할 — 사용자 지문은 동봉하지 않는다(소재 참고 전용).
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
      "조건 2항(내용 포괄 + 표현법). 초고 3~4문단, 오답의 조건 누락이 문면에서 즉시 판정되게(표현법 부재·중심 내용 무관). 사이비 충족 함정 없이 명료하게.",
    INTERMEDIATE:
      "조건 3항(내용 포괄 + 표현법 + 관점·형식). 오답 4개의 누락 조건 조합을 서로 다르게 분산하고 사이비 충족 함정 1~2개(비유 흉내 직설, 일부 문단만 포괄)를 포함하라.",
    KILLER:
      "조건 3항 — 내용 포괄 조건이 복수 문단의 핵심어 활용을 지정('n, m문단에 제시된 각 효과를 포괄하도록 문단별로 단어를 찾아 활용할 것'). 오답 전부를 사이비 충족(반쪽 대구·부분 포괄·관점 미묘 반전)으로 제작해 조건×선지 전수 대조를 강제하라. 정답이 표면상 가장 화려한 선지가 되지 않게 하라.",
  },
};
