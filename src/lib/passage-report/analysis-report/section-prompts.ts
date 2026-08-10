import type { AnalysisReportGeneration } from "./schema";
import type { BuildAnalysisReportPromptInput } from "./prompt";

/**
 * 섹션 단위(per-section) 생성 프롬프트 — 회복형 생성기(resilient-generate.ts)가
 * "실패한 섹션 하나만 정확히 다시 만들 때" 쓰는 좁은 프롬프트 모음.
 *
 * 설계 원칙:
 *  - 품질 규칙(노베이스 문체·정의-즉시 등)은 단일 프롬프트(prompt.ts)와 **글자 그대로 동일**하게
 *    공유한다(STYLE_CHARTER). 섹션을 따로 만들어도 품질이 떨어지지 않게.
 *  - 각 섹션 프롬프트는 (1) 공통 문체 헌장 + (2) 이미 확정된 passage 문장(번호 기준점) +
 *    (3) 해당 섹션 스펙 + (4) "이 한 섹션 JSON 객체 하나만" 출력 지시로 구성.
 *  - sentenceNo 를 참조하는 섹션(grammar·exam-focus·parsing·learning-worksheet)은
 *    확정된 passage 문장 목록을 컨텍스트로 받아 번호가 어긋나지 않게 한다.
 */

export type SectionKind =
  | "passage"
  | "learning-worksheet"
  | "summary"
  | "grammar"
  | "exam-focus"
  | "vocabulary"
  | "parsing";

/** 회복형 생성 컨텍스트 — 이미 확정된 섹션들(특히 passage)을 다음 섹션 생성에 넘긴다. */
export interface SectionPromptContext {
  /** 이미 확정된 passage 문장들(번호·원문·해석). 의존 섹션의 sentenceNo 기준점. */
  sentences?: Array<{ n: number; en: string; ko: string }>;
  /** 이미 확정된 핵심 요약(있으면 grammar/exam 등 품질 향상에 활용). */
  summary?: { sentences: string[]; thesisEn: string };
  /** 직전 시도 실패 사유(스키마/품질 검증 메시지) — 재생성 시 교정 지시로 주입. */
  priorError?: string;
}

function levelHint(schoolType?: "MIDDLE" | "HIGH" | null, grade?: number | null): string {
  const lv = schoolType === "MIDDLE" ? "중학교" : schoolType === "HIGH" ? "고등학교" : "고등학교";
  const g = grade ? `${grade}학년` : "";
  return `${lv} ${g}`.trim();
}

/**
 * 모든 섹션 공통 문체 헌장 — prompt.ts 의 "절대 원칙 + 설명 문체 규칙 + 노베이스 금지어"를
 * 글자 그대로 옮겨, 섹션 단위 생성에서도 동일 품질을 보장한다.
 */
const STYLE_CHARTER = `# 절대 원칙 (모든 섹션 공통)
- **이 자료만 보고도 학생이 이 지문 관련 시험을 충분히 대비할 수 있어야 한다.** 강사가 손대지 않고 그대로 배포할 수준.
- **개념·용어 나열 금지.** 모든 설명은 "왜 그런지 / 어떻게 접근하는지"를 풀어줘서, 읽으면 바로 이해되게.

## ⭐ 설명 문체 규칙 (모든 해설·뜻·전략에 일관 적용 — 절대 어기지 마라)
- **대상은 영어 기초가 거의 없는 '노베이스' 학생**이다. **학생은 아무것도 모른다고 가정하라.** 혼자 읽어도 100% 이해되게, 차근차근.
- **문체는 전부 친근한 '~해요' 체로 통일**한다. 격식체('~이다/~한다/~된다/~이며/~입니다')와 반말('~야/~지')을 **한 글자도 섞지 마라.**
- ❗ **'정의-즉시' 규칙: 문법·독해 용어를 쓰면 그 자리에서 바로 괄호로 쉬운 뜻을 단다.** 용어만 던지면 0점. 예: "병렬(and 앞뒤를 똑같은 모양으로 맞추는 거예요)", "분사(동사를 형용사처럼 바꾼 형태예요)".
- ❗❗ **노베이스 금지어 — 아래 용어는 괄호 정의 없이 쓰면 즉시 0점.** 처음 나올 때 반드시 괄호로 쉬운 뜻(짧게): 과거분사/p.p.(동사를 '~된·당한' 뜻으로) · 현재분사/-ing(동사를 '~하는' 뜻으로) · 관계대명사(앞 명사를 뒤 문장이 꾸밀 때 잇는 who/which/that) · 선행사(꾸밈 받는 앞 명사) · 절(주어와 동사가 든 덩어리) · 분사구문(접속사·주어를 빼고 동사를 -ing/-ed로) · 동명사(동사를 -ing로 만들어 명사처럼) · 수일치(주어 단수면 단수동사) · 병렬(and/or 앞뒤를 똑같은 모양으로) · 도치(주어와 동사 자리가 뒤바뀐 것) · 조동사(can/will/must처럼 동사를 돕는 말) · 목적격보어(목적어 뒤에서 그 목적어를 설명) · to부정사(동사 앞 to) · 가주어/진주어(뜻 없는 가짜 주어 it과 뒤의 진짜 주어).
- ❗ **'맨 라벨' 금지**: 라벨만 쓰지 말고 (1) 쉬운 정의 →(2) 왜 시험 포인트인지 →(3) 무엇과 헷갈리는지 →(4) 이 지문에선 무엇이 답인지 까지 풀어라.
- 한 문장은 **짧게**. 어려운 한자어·추상어 피하기. 각 설명은 그 지문의 **구체적인 그 문장/그 단어** 기준으로(일반론 금지).
- ❗ 모든 해설은 '자연스럽게 읽히는 완결된 문장'으로(토막난 명사 나열·번역투·개조식 금지).`;

const OUTPUT_RULES = `# 출력 규칙
- 반드시 **JSON 객체 하나만** 출력한다. 마크다운 코드펜스(\`\`\`)·설명 문장을 절대 붙이지 마라.
- 학원 자료라 정확성이 생명이다. 문법·정답·구문은 정확해야 한다. 추측성/오류 금지.
- **필드 누락 절대 금지**: 명세의 모든 필드를 빠짐없이 채운다. 값이 애매하면 빈 문자열이 아니라 가장 합당한 내용을 생성하라.`;

function passageContextBlock(ctx: SectionPromptContext): string {
  if (!ctx.sentences?.length) return "";
  const lines = ctx.sentences
    .map((s) => `${s.n}. ${s.en}${s.ko ? `  (${s.ko})` : ""}`)
    .join("\n");
  return `\n# 이미 확정된 본문 문장 (sentenceNo 는 반드시 이 번호와 일치시켜라)\n${lines}\n`;
}

function summaryContextBlock(ctx: SectionPromptContext): string {
  if (!ctx.summary) return "";
  return `\n# 글의 핵심 요약 (참고)\n- ${ctx.summary.sentences.join(" / ")}\n- thesis: ${ctx.summary.thesisEn}\n`;
}

function repairBlock(ctx: SectionPromptContext): string {
  if (!ctx.priorError?.trim()) return "";
  return `\n# ❗ 재생성 교정 지시
직전 출력이 아래 품질·형식 기준을 통과하지 못했다. 이 문제를 반드시 고쳐서 다시 생성하라:
${ctx.priorError.trim()}
\n`;
}

// ─── 섹션별 스펙 (prompt.ts 와 동일한 기준을 섹션 단위로 분리) ──────────────────

const PASSAGE_SPEC = `## passage — 원문 + 문장별 한글 해석
{ "kind":"passage",
  "sentences":[ { "n":1, "en":"원문 문장(원문 그대로, 수정 금지)", "ko":"자연스러운 한국어 해석",
                  "chunks":[ {"text":"원문 그대로의 연속 구절","gloss":"직독직해 한글 뜻(아주 짧게)","role":"짧은 구문 역할(주어/동사/목적어/전치사구 등)","emphasis":"core 또는 생략"} ] } ],
  "keywords":["글의 맥을 잡는 주제어 (원문에 실제 등장한 표현 그대로)"] }
- 지문을 의미 단위 문장으로 끊어 1번부터 번호를 매긴다. 원문 단어를 바꾸지 마라.
- chunks(직독직해, 권장): 각 문장을 의미 단위 2~6조각. **text 를 순서대로 이으면 그 문장 en 과 글자 그대로 같아야 한다.** 자신 없으면 그 문장 chunks 를 통째로 생략하라(렌더러가 자동 분할).
- gloss='뜻'(짧은 직독직해), role='문법 역할'(한두 단어).
- **모든 문장에 ko 해석을 반드시 채운다(누락 금지).**
- keywords: 핵심 흐름을 잡는 주제어·반복어·대조어 **6~10개**(원문 표현 그대로).`;

const LEARNING_WORKSHEET_SPEC = `## learning-worksheet — 지문 논리 구조 분석 (문장별 기능표만)
{ "kind":"learning-worksheet",
  "title":"지문 논리 구조 분석",
  "logicRows":[ { "sentenceNo":문장번호, "functionLabel":"그 문장의 글 속 기능(짧은 명사구)", "keyPoint":"그 문장이 글에서 하는 핵심 내용·역할을 한국어 한 줄로" } ] }
- logicRows 는 **5~8개**. 흐름을 따라 "주제 제시 / 통념 / 반박 / 양보 / 역접 / 인과 / 비유 / 결론"처럼 독해·시험에 도움되게.
- functionLabel=글 속 역할(짧게), keyPoint=그 문장이 글에서 무엇을 하는지 한국어 한 줄(구체적으로).
- sentenceNo 는 본문 문장 번호와 정확히 일치.
- ❗ **도식/다이어그램(intro·columns·steps·coreDistinction·conclusion·logicFlow)·workbookSet·cloze·practice·drills·inferenceSet 등 다른 필드는 절대 만들지 마라. logicRows 표만 출력한다.**`;

const SUMMARY_SPEC = `## summary — 핵심 요약 + 영문 주제문
{ "kind":"summary", "sentences":["핵심 요약 한국어 2~4문장"], "thesisEn":"지문 전체를 한 문장으로 압축한 영어 주제문" }`;

const GRAMMAR_SPEC = `## grammar — 어법 핵심 포인트 (표) [객관식 어법 출제 기준과 동일]
{ "kind":"grammar", "note":"※ ⚠ 는 시험에서 자주 틀리는 함정",
  "rows":[ { "sentenceNo":문장번호, "excerpt":"해당 자리가 든 실제 원문 구절", "pointCode":"a~m 중 하나", "point":"(코드) 분류 — 표현", "explanation":"정의→이유→비교→적용 4단계 쉬운 해설", "trap":"⚠ 함정/오답 형태", "example":"그 함정(틀린 형태)을 담은 짧은 영어 예문 1문장", "exampleWrong":"예문 속 틀린 토큰", "exampleCorrect":"그 자리의 정답 토큰",
             "layout":{ "anchorText":"원문 구절", "band":"interline", "priority":2, "lines":["짧은 줄1","짧은 줄2"] } } ] }
- **이 지문에서 객관식 어법으로 실제 출제될 '판단 자리'만** 골라라(단순 용어 나열 금지). **강한 자리 5~8개, 서로 다른 코드 최소 4개 이상.**
- ❗ **출제 자리는 반드시 13개 코드(a~m) 중에서만**:
  (a)정·준동사 (b)관계사 (c)분사 능/수동 (d)수일치 (e)능·수동태 (f)형용사/부사 자리 (g)대명사 일치 (h)목적격보어 (i)병렬 (j)가정법 시제 (k)to-v vs v-ing (l)전치사 vs 접속사 (m)비교구문.
- ❗ **약한 디코이 금지**(형태만 보고 답 보이는 자리): to부정사/동명사 전용동사 뒤, 단순 관사·전치사·고유명사. **강한 자리만.**
- pointCode=a~m 중 하나. point="(코드) 분류 — 핵심 표현". excerpt=그 자리가 든 실제 원문 구절 그대로.
- explanation 4단계: ①무엇을 고르는 자리인지(용어는 괄호 정의) →②왜 →③헷갈리는 형태 →④이 지문 정답.
- trap="⚠ 시험에선/학생들이 자주 ~"로 시작 + 구체 오답 형태 + 왜 틀리는지.
- ❗ **example·exampleWrong·exampleCorrect 3종은 모든 row 에 반드시 채운다.** example=틀린 형태가 든 8~14단어 영어 문장. exampleWrong=그 틀린 토큰(example 안에 글자 그대로 존재), exampleCorrect=정답 토큰. **품사 변경 금지(어간 유지·형태만 변경), exampleWrong≠exampleCorrect.**`;

const EXAM_FOCUS_SPEC = `## exam-focus — 유형별 출제 포인트 (표)
{ "kind":"exam-focus",
  "rows":[ { "sentenceNo":문장번호, "type":"유형", "asks":"무엇을 묻는가(쉽게)", "logicLocation":"이 지문 어디에 + 왜 걸리는지", "strategy":"위치·예상답·함정을 짚는 구체적 대비법",
             "layout":{ "anchorText":"원문 구절(있으면)", "band":"rail", "priority":2, "lines":["짧은 줄1","짧은 줄2"] } } ] }
- type 은 **정확히 다음 8개 중 하나**(변형/합성 금지): 빈칸추론 / 주제 / 제목 / 순서 / 문장삽입 / 함축의미 / 지칭 / 요약. 이 지문에 실제 나올 4~5개.
- ❗ '무관한 문장'·'어법성 판단' 유형은 넣지 마라(어법은 grammar 섹션).
- ❗ **logicLocation·sentenceNo 는 필수.** 이 지문의 정확한 문장 번호 + 그 자리 단서를 적어라.
- ❗ **지문 밖 내용 인용 0점**: logicLocation·strategy 는 반드시 **이 지문에 실제로 있는 표현·문장 번호**만 인용한다. 다른 지문의 예시(관객·실수 등)를 가져오면 0점. (예: "④ 'not opposites but ___' — 대조축이 단서라 추론 가능"처럼 이 지문 구체 문장과 근거를 명시.)
- asks·strategy 도 노베이스 4단계(무엇을 묻나→어디를 보나→정답 패턴→함정 피하기). 이 지문의 실제 문장·표현으로.`;

const VOCABULARY_SPEC = `## vocabulary — 핵심 어휘 (표)
{ "kind":"vocabulary",
  "rows":[ { "headword":"표제어", "pronunciation":"한글 발음", "meaning":"본문 의미 뜻", "tier":"test", "difficulty":3, "synonyms":"reduce, lessen", "antonyms":"increase, raise" } ] }
- 어휘 **25~35개**. 쉬운 단어로 개수만 늘리지 말고, 외우거나 시험에서 변형될 중상 난도 표현 중심.
- 각 headword 는 지문에 실제 등장한 단어·구·연어이거나 그 기본형(본문에 없는 관련어/상위어 금지). 연어·숙어·구동사·논리전환·비유 표현 우선.
- tier 는 "core"|"test"|"challenge" 중 하나(core ≤20%, test 45~55%, challenge 25~35%). difficulty 1~5 정수.
- ❗ pos 금지, 대신 pronunciation 에 한글 발음.
- ❗ **synonyms 는 모든 row 에 채우되 정확히 1~2개**(3개 이상 금지 — 표가 넘치고 정답 후보가 흐려진다). 본문에서 쓰인 의미와 같은 결의 흔한 영어 단어로.
- ❗ **맨 앞 항목이 학생 앱의 "동의어·반의어 연결" 문제에 그대로 출제된다** — 가장 정확한 것을 맨 앞에 두어라.
- ❗ **antonyms 는 전체 row 의 70% 이상에 실제 값이 있어야 한다**(30행이면 최소 21행, "—" 는 최대 9행). 개수는 정확히 1~2개.
- ❗ **반의어 인정 범위는 셋이다**: ①어휘적 반의어(increase↔decrease) ②정도·극성 반의어(significant↔trivial, immediately↔gradually) ③**이 지문이 직접 맞세운 대조축의 반대편 표현**(지문 안에서 실제로 대조될 때만).
- ❗ **그래도 반대말이 없는 표현만 "—".** 중립 명사구·현상 명칭("media effect","buying behavior" 류)이 여기 해당한다. **antonyms 키를 빼거나 빈 문자열로 두지 마라 — 반드시 "—" 를 넣어라.** 근거 없는 반의어보다 "—" 가 낫다.
- ❗ **표제어 선정 단계에서부터 반의어를 고려하라** — 학습 가치가 비슷하면 반의어·대조어가 분명한 쪽을 먼저 넣는다(지문에 없는 단어를 만드는 것은 금지).
- ❗ **한 단어가 여러 표제어의 동의어·반의어로 겹치지 않게 하라** — 겹치면 연결 문제의 정답이 둘이 되어 문항이 깨진다.
- ❗ **출력 직전 자기검증:** ①"—" 행이 30% 초과면 채울 수 있는 행을 다시 채워 30% 이하로. ②항목 3개 이상인 행은 정확한 2개만 남긴다. ③전체 관계어 목록에 중복 단어가 없는지 확인한다.`;

const PARSING_SPEC = `## parsing — 구문 분석 (파스 트리)
{ "kind":"parsing",
  "items":[ { "sentenceNo":번호, "en":"분석 대상 문장 원문", "parts":[ {"label":"[주절]/[관계절] 등","text":"분석 내용"} ], "translation":"→ 해석",
              "layout":{ "anchorText":"원문 구절", "band":"underchunk", "priority":2 } } ] }
- 지문에서 **가장 복잡한 문장 2~3개**만 골라 구조를 끊어 분석. (최대 8개까지)
- sentenceNo 는 본문 문장 번호와 정확히 일치.`;

const SECTION_SPEC: Record<SectionKind, string> = {
  passage: PASSAGE_SPEC,
  "learning-worksheet": LEARNING_WORKSHEET_SPEC,
  summary: SUMMARY_SPEC,
  grammar: GRAMMAR_SPEC,
  "exam-focus": EXAM_FOCUS_SPEC,
  vocabulary: VOCABULARY_SPEC,
  parsing: PARSING_SPEC,
};

const SECTION_NEEDS_PASSAGE: Record<SectionKind, boolean> = {
  passage: false,
  "learning-worksheet": true,
  summary: true,
  grammar: true,
  "exam-focus": true,
  vocabulary: true,
  parsing: true,
};

/** 섹션 하나만 생성하는 좁은 프롬프트. */
export function buildSectionPrompt(
  kind: SectionKind,
  input: BuildAnalysisReportPromptInput,
  ctx: SectionPromptContext = {},
): string {
  const level = levelHint(input.schoolType, input.grade);
  const extra = input.customPrompt?.trim() ? `\n[강사 추가 지시]\n${input.customPrompt.trim()}\n` : "";
  const ctxBlock = SECTION_NEEDS_PASSAGE[kind] ? passageContextBlock(ctx) : "";
  const summaryBlock = kind === "grammar" || kind === "exam-focus" ? summaryContextBlock(ctx) : "";

  return `당신은 한국 최상위 영어 학원의 수석 교재 편집장이다.
주어진 영어 지문으로 A4 분석 보고서의 **"${kind}" 섹션 하나**만 정밀하게 작성한다.
대상 학습자 수준: ${level}. 해설/뜻/요약은 한국어, 영어 원문/예문은 영어로.

${STYLE_CHARTER}

${OUTPUT_RULES}
- ❗ 최상위 kind 값은 정확히 "${kind}" 이어야 한다. 다른 섹션을 만들지 마라.
${repairBlock(ctx)}${ctxBlock}${summaryBlock}
# 작성할 섹션 명세
${SECTION_SPEC[kind]}
${extra}
# 분석할 지문
"""
${input.passageContent}
"""

위 명세대로 "${kind}" 섹션 JSON 객체 하나만 출력하라.`;
}

/** passage 문장 목록을 컨텍스트로 추출(부분 보고서 → SectionPromptContext). */
export function deriveSectionContext(
  partial: Partial<AnalysisReportGeneration> & { sections?: AnalysisReportGeneration["sections"] },
): SectionPromptContext {
  const sections = partial.sections ?? [];
  const passage = sections.find((s) => s.kind === "passage");
  const summary = sections.find((s) => s.kind === "summary");
  return {
    sentences:
      passage?.kind === "passage"
        ? passage.sentences.map((s) => ({ n: s.n, en: s.en, ko: s.ko }))
        : undefined,
    summary:
      summary?.kind === "summary"
        ? { sentences: summary.sentences, thesisEn: summary.thesisEn }
        : undefined,
  };
}
