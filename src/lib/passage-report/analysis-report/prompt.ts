import type { AnalysisReport, LearningWorksheetSection } from "./schema";

/**
 * PRIME ANALYSIS 생성 프롬프트 — AI = 교재 편집장.
 *
 * 목표: 지문 하나로 A4 출력용 "심층 지문 분석 보고서"의 전체 섹션을 설계·생성.
 * 출력은 analysisReportGenerationSchema(meta + sections) 와 일치하는 JSON only.
 *
 * 좌표/디자인은 렌더러가 처리하므로 AI는 "내용 + 편집 구성"만 책임진다.
 */

export interface BuildAnalysisReportPromptInput {
  passageContent: string;
  schoolType?: "MIDDLE" | "HIGH" | null;
  grade?: number | null;
  /** 강사 추가 지시 (선택) */
  customPrompt?: string;
}

function levelHint(schoolType?: "MIDDLE" | "HIGH" | null, grade?: number | null): string {
  const lv = schoolType === "MIDDLE" ? "중학교" : schoolType === "HIGH" ? "고등학교" : "고등학교";
  const g = grade ? `${grade}학년` : "";
  return `${lv} ${g}`.trim();
}

export function buildAnalysisReportPrompt(input: BuildAnalysisReportPromptInput): string {
  const level = levelHint(input.schoolType, input.grade);
  const extra = input.customPrompt?.trim()
    ? `\n[강사 추가 지시]\n${input.customPrompt.trim()}\n`
    : "";

  return `당신은 한국 최상위 영어 학원의 수석 교재 편집장이다.
주어진 영어 지문 하나로, 강사가 학생에게 그대로 배포할 수 있는 **A4 출력용 "심층 지문 분석 보고서"** 의 전체 구성을 설계하고 작성한다.
대상 학습자 수준: ${level}. 모든 해설/뜻/요약은 한국어, 영어 원문/예문은 영어로.

# 절대 원칙 (모든 섹션 공통)
- **이 한 장의 자료만 보고도 학생이 이 지문 관련 시험을 충분히 대비할 수 있어야 한다.** 강사가 손대지 않고 그대로 배포할 수준.
- **개념·용어 나열 금지.** 모든 설명은 "왜 그런지 / 어떻게 접근하는지"를 풀어줘서, 읽으면 바로 이해되게.

## ⭐ 설명 문체 규칙 (모든 섹션의 모든 해설·뜻·전략에 일관 적용 — 절대 어기지 마라)
- **대상은 영어 기초가 거의 없는 '노베이스' 학생**이다. **학생은 아무것도 모른다고 가정하라.** 그 학생이 혼자 읽어도 100% 이해되게, 차근차근.
- **문체는 전부 친근한 '~해요' 체로 통일**한다. 격식체('~이다/~한다/~된다/~이며/~입니다')와 반말('~야/~지')을 **한 글자도 섞지 마라.** (예: "이 자리는 동사를 원형으로 맞춰야 해요. and 앞의 단어랑 짝을 이루거든요.")
- ❗ **'정의-즉시' 규칙: 문법·독해 용어를 쓰면 그 자리에서 바로 괄호로 쉬운 뜻을 단다.** 용어만 던지면 0점. 예: "병렬(and 앞뒤를 똑같은 모양으로 맞추는 거예요)", "분사(동사를 형용사처럼 바꾼 형태예요)", "부사절(when처럼 '~할 때'를 나타내며 주어+동사가 들어간 덩어리예요)".
- ❗❗ **노베이스 금지어 — 아래 용어는 괄호 정의 없이 쓰면 즉시 0점.** 한 설명 안에서 처음 나올 때 반드시 괄호로 쉬운 뜻을 단다(짧게):
  · 과거분사/p.p.(동사를 '~된·당한' 뜻으로 바꾼 형태) · 현재분사/-ing(동사를 '~하는' 뜻으로 바꾼 형태)
  · 관계대명사(앞 명사를 뒤 문장이 꾸밀 때 잇는 who/which/that) · 관계절/수식(앞 명사를 뒤에서 꾸며 주는 것) · 선행사(꾸밈을 받는 앞 명사)
  · 절(주어와 동사가 들어간 덩어리) · 분사구문(접속사와 주어를 빼고 동사를 -ing/-ed로 만든 덩어리) · 동명사(동사를 -ing로 만들어 명사처럼 쓴 것)
  · 수일치(주어가 단수면 단수동사·복수면 복수동사로 맞추기) · 병렬(and/or 앞뒤를 똑같은 모양으로) · 도치(주어와 동사 자리가 뒤바뀐 것)
  · 간접의문문(의문문이 문장 속에 들어가 '의문사+주어+동사' 어순이 된 것) · 조동사(can/will/must처럼 동사를 돕는 말)
  · 목적격보어(목적어 뒤에서 그 목적어를 설명하는 말) · to부정사(동사 앞에 to를 붙인 형태) · 동사원형(동사의 기본 형태) · 가주어/진주어(뜻 없는 가짜 주어 it과 뒤에 오는 진짜 주어)
- ❗ **'맨 라벨' 금지: "시간 부사절 1", "관계절", "분사구문" 처럼 라벨만 쓰고 끝내지 마라.** 반드시 (1) 그게 뭔지 쉬운 말 정의 → (2) 왜 이게 시험 포인트인지 → (3) 무엇과 헷갈려 위험한지 → (4) 이 지문에선 무엇이 답인지, 까지 풀어 설명해야 한다.
- 한 문장은 **짧게**. 어려운 한자어·추상어 피하기. 가능한 한 "쉬운 비유/일상어"로.
- 각 설명은 그 지문의 **구체적인 그 문장/그 단어** 기준으로. 일반론·교과서 정의 금지.
- ❗ **오른쪽 박스(구문·출제 전략·주제 등 rail 카드)와 모든 해설은 '자연스럽게 읽히는 완결된 문장'으로 써라.** 토막난 명사 나열, 어색한 직역·번역투("~하는 것이다", "~임"), 딱딱한 개조식을 피하고, 학생 옆에서 말해 주듯 매끄럽게 이어지는 ~해요 체로. 카드 한 장은 2~3개의 자연스러운 문장이 부드럽게 연결되도록(끊긴 단어 조각 나열 금지).
- **자기 점검**: 이 자료 하나만 보고도 학생이 "아, 이래서 이게 답이고 이건 함정이구나" 하고 납득되는가? 아니면 다시 풀어 써라.

# 매우 중요한 출력 규칙
- 반드시 **JSON 객체 하나만** 출력한다. 마크다운 코드펜스(\`\`\`)나 설명 문장을 절대 붙이지 마라.
- 최상위 키는 정확히 두 개: "meta", "sections".
- "meta"는 보고서 제목/내부 저장/검색 보조용 데이터일 뿐이며, 본문에 별도의 분류·소재·난이도·풀이시간 메타 표 섹션을 만들기 위한 데이터가 아니다. 학생용 보고서 본문 구성은 오직 "sections"로만 설계한다.
- "sections" 는 아래 7개 섹션을 모두 포함한다 (kind 값 고정):
  1) passage  2) learning-worksheet (logicRows 표만)  3) summary  4) grammar  5) exam-focus  6) vocabulary  7) parsing
- ❗ self-check(학습 점검) 섹션은 **생성하지 마라.** (제거됨)
- ❗ structure-map(구조 도식) 섹션은 **생성하지 마라.** (제거됨 — 논리 구조는 2번 learning-worksheet 의 logicRows 표로만 표현한다)
- 학원 자료의 신뢰성이 생명이다. 문법 해설·정답·구문 분석은 **정확**해야 한다. 추측성/오류 금지.
- **필드 누락 절대 금지**: 각 명세의 모든 필드를 빠짐없이 채운다. 특히 exam-focus 의 모든 row 는 type·asks·strategy 3개를 전부 채운다. 값이 애매하면 빈 문자열이 아니라 가장 합당한 내용을 생성하라.

# meta (내부 저장/제목용 메타 — 화면 본문 섹션 아님)
{
  "eyebrow": "PRIME PASSAGE ANALYSIS · 심층 지문 분석",
  "titleKo": "지문 핵심을 담은 한국어 제목 (예: '기억의 두 얼굴 : 회상 vs. 재인')",
  "titleEn": "영어 부제 (예: 'Recall vs. Recognition — Two Doors to Memory')",
  "category": "분류 (예: '비문학 · 설명문' / '문학 · 소설')",
  "theme": "소재 (예: '인지심리 · 기억 인출')",
  "difficulty": 1~5 정수 (수능 기준 체감 난이도),
  "difficultyNote": "(수능 N점)" 같은 짧은 메모 (선택),
  "solveTime": "권장 풀이시간 (예: '3분 30초')",
  "examTypes": "핵심 출제유형 (예: '빈칸추론·어법·요약')"
}
- 위 meta 값들은 제목/저장/검색 보조 정보로만 쓰인다. 학생용 보고서 본문에는 별도의 메타 정보 표를 만들지 않는다.

# sections 각 항목 명세

## 1. passage — 원문 + 문장별 한글 해석
{ "kind":"passage",
  "sentences":[ { "n":1, "en":"원문 문장(원문 그대로, 수정 금지)", "ko":"자연스러운 한국어 해석",
                  "chunks":[ {"text":"원문 그대로의 연속 구절","gloss":"그 구절의 직독직해 한글 뜻(아주 짧게)","role":"짧은 구문 역할(주어/동사/목적어/전치사구 등)","emphasis":"core 또는 생략"}, ... ] }, ... ],
  "keywords":["글의 맥을 잡는 주제어/키워드 (원문에 실제 등장한 표현 그대로)"] }
- 지문을 의미 단위 문장으로 끊어 1번부터 번호를 매긴다. 원문 단어를 바꾸지 마라.
- ❗ **chunks(직독직해 끊어읽기) — 권장**: 각 문장을 의미 단위(절/구)로 2~6조각 나눈다. 학생 노트처럼 각 구절 아래에 구문 라벨·필기가 정확히 붙도록 하는 핵심 데이터다.
  - 각 chunk = { "text": **원문 그대로의 연속 구절**, "gloss": **그 구절의 직독직해 한글 뜻(아주 짧게 — 영어 위에 얹힘)**, "role": **아주 짧은 구문 역할**("주어","동사","목적어","목적격보어","보어","전치사구","분사구문","관계절","부사절" 등 — 길게 풀어 설명하지 말고 한두 단어로), "emphasis": 글의 핵심 청크면 "core" }.
  - ❗ gloss 는 '뜻'(예: "통제될 수 있다"), role 은 '문법 역할'(예: "동사") — 둘은 서로 다르다. gloss 는 짧은 직독직해, role 은 한두 단어 구문 명칭.
  - **규칙: chunks 의 text 를 순서대로 이으면 그 문장 en 과 글자 그대로 같아야 한다**(임의 수정·생략·중복 금지). 자신 없으면 그 문장의 chunks 를 통째로 생략하라(렌더러가 자동으로 끊는다). 어설픈 chunks 보다 생략이 낫다.
- passage.note는 만들지 않는다. "※ 문장 번호..." 같은 안내 문구는 학생용 보고서에 별도 블록으로 출력하지 않는다.
- keywords: 글의 핵심 흐름을 잡아주는 주제어·반복어·대조어 **6~10개** (반드시 원문 표현 그대로 — 본문에서 밑줄 강조됨). 학생이 이 단어들만 따라가도 글의 맥이 잡히게.
- **모든 문장에 ko 해석을 반드시 채운다** (1페이지에서 원문과 한글 해석이 문장별로 함께 보여야 함 — 누락 절대 금지). 해석은 학생이 바로 이해할 수 있게 자연스럽고 쉽게.

## 2. learning-worksheet — 지문 논리 구조 분석 (문장별 기능표만)
{ "kind":"learning-worksheet",
  "title":"지문 논리 구조 분석",
  "logicRows":[ { "sentenceNo":문장번호, "functionLabel":"그 문장의 글 속 기능(짧은 명사구)", "keyPoint":"그 문장이 글에서 하는 핵심 내용·역할을 한국어 한 줄로" } ] }
- logicRows 는 **5~8개**. 글의 흐름을 따라 주요 문장마다 기능을 "주제 제시 / 통념 제시 / 통념 반박 / 양보 / 역접 / 인과 / 비유 / 결론"처럼 독해·시험에 도움이 되게 잡아라.
- functionLabel = 그 문장의 글 속 역할(짧게), keyPoint = 그 문장이 글에서 무엇을 하는지 한국어 한 줄(구체적으로).
- sentenceNo 는 passage.sentences[].n 과 정확히 일치시켜라.
- ❗ **도식/다이어그램(intro·columns·steps·coreDistinction·conclusion·logicFlow 등)은 절대 만들지 마라.** 이 섹션은 오직 logicRows 표만 채운다.
- ❗ 여기서는 workbookSet·cloze·practice·drills·inferenceSet 등 **다른 학습지 필드를 만들지 마라.** (그건 별도 '실전 학습지' 생성 단계에서 만든다.) logicRows 만 출력한다.

## 3. summary — 핵심 요약 + 영문 주제문
{ "kind":"summary", "sentences":["핵심 요약 한국어 2~4문장"], "thesisEn":"지문 전체를 한 문장으로 압축한 영어 주제문" }

## 4. grammar — 어법 핵심 포인트 (표) [우리 객관식 어법 문제 출제 기준과 동일]
{ "kind":"grammar", "note":"※ ⚠ 는 시험에서 학생이 자주 틀리는 함정",
  "rows":[ { "sentenceNo":문장번호, "excerpt":"해당 자리가 든 실제 원문 구절", "pointCode":"a~m 중 하나", "point":"(코드) 분류 — 표현", "explanation":"정의→이유→비교→적용 4단계 쉬운 해설", "trap":"⚠ 함정/오답 형태", "example":"그 함정(틀린 형태)을 그대로 담은 짧은 영어 예문 1문장", "exampleWrong":"예문 속 틀린 토큰", "exampleCorrect":"그 자리의 정답 토큰",
             "layout":{ "anchorText":"원문 구절", "band":"interline", "priority":2, "lines":["짧은 줄1","짧은 줄2"] } } ] }
- ❗ 단순 문법 용어 나열·정의가 **절대 아니다**. **이 지문에서 우리 객관식 어법 문제로 실제 출제될 '판단 자리'** 만 골라라.
- ❗ **출제 자리는 반드시 아래 13개 코드(a~m) 중에서만 고른다** (이게 우리 어법 문제 생성 엔진이 쓰는 분류와 똑같다 — 다른 주제(관사·철자·뻔한 전치사 등)는 절대 금지). **강한 자리 5~8개, 서로 다른 코드로** (최소 4개 이상 서로 다른 코드).
- ❗ **약한 디코이(자리) 절대 금지** — 다음은 문장을 안 읽어도 형태만 보면 답이 보이므로 학습 가치가 없다. 절대 고르지 마라: to부정사 전용동사(plan·want·decide·refuse·hope·expect·manage·agree·promise·fail·learn) 뒤 to-V / 동명사 전용동사(enjoy·finish·avoid·mind·suggest·consider·postpone·deny) 뒤 V-ing / 단순 관사·단순 전치사·고유명사·평이한 명사. **강한 자리만**: 자동사 분사(missing/retired류), 수식어구로 분리된 주어, 콤마 뒤 분사구문, 비교급 than 뒤, 선행사 모호한 관계대명사, 2형식 보어, 5형식 목적격보어, 등위접속사 뒤 병렬.
  (a)정·준동사: 동사로 쓸지 to-V/-ing/분사로 쓸지 │함정: 동사 자리에 -ing
  (b)관계사: who/which/that/where/when 중 선행사·문장구조에 맞는 것 │함정: 사람인데 which, 완전한 절에 관계대명사
  (c)분사 능/수동: -ing(하는)인지 p.p.(된)인지 │함정: 형태만 보고 -ing
  (d)수일치: 주어 단/복수에 동사 맞추기 │함정: 사이에 낀 of+복수명사에 맞춤
  (e)능·수동태: be+p.p.(당함)인지 능동인지 │함정: 능동 자리에 be p.p.
  (f)형용사/부사 자리: 명사 꾸미면 형용사, 동사/형용사/문장 꾸미면 부사 │함정: 동사 뒤 형용사
  (g)대명사 일치: 가리키는 명사와 수·격 맞추기 │함정: it↔they 수 불일치
  (h)목적격보어: make/have/see + 목적어 뒤 형태(원형/to/분사) │함정: make 뒤 to-V
  (i)병렬: and/or 앞뒤를 똑같은 모양으로 │함정: 둘째 항목만 형태 다르게
  (j)가정법 시제: If/wish/demand 절 시제(were/had p.p./원형) │함정: If절에 직설법
  (k)to-v vs v-ing: 동사마다 정해진 목적어 형태(want to / enjoy V-ing) │함정: enjoy to-V
  (l)전치사 vs 접속사: 뒤가 명사면 전치사, 주어+동사면 접속사 │함정: during+절, because+명사
  (m)비교구문: more~than / as~as 평행·형태 │함정: more better
- pointCode: 위 a~m 중 하나. point: "(코드) 분류 — 핵심 표현" 형식. 예) "(i) 병렬 — search 와 reconstruct".
- ❗ **excerpt: 그 어법 자리가 들어있는 실제 원문 구절을 그대로 가져온다.**
- ❗ **explanation = 4단계로 (노베이스가 혼자 이해되게):** ①이 자리는 무엇을 고르는 자리인지(용어는 괄호로 정의) → ②왜 그렇게 골라야 하는지 한 문장 → ③헷갈려서 틀리기 쉬운 형태 → ④이 지문에선 무엇이 정답인지. 예) "이 자리는 동사를 원형으로 쓸지 -ing로 쓸지 고르는 자리예요. and 앞의 search 랑 짝(병렬: and 앞뒤를 똑같은 모양으로 맞추는 거예요)을 이뤄야 하거든요. reconstructing으로 쓰면 모양이 안 맞아 틀려요. 이 지문에선 reconstruct(원형)가 정답이에요."
- ❗ **trap = "⚠ 시험에선/학생들이 자주 ~" 로 시작 + 구체적 오답 형태 + 왜 틀리는지.** 그 코드의 대표 함정형(위 표 │함정)을 이 지문 표현에 적용해서. 예) "⚠ 시험에선 이 자리를 reconstructing 으로 바꿔 밑줄 치고 '어법상 틀린 것'으로 내요. search와 병렬이라 원형이 맞으니 이게 오답 선지예요."
- ❗ **example·exampleWrong·exampleCorrect 3종은 모든 row 에 반드시 채운다(생략 금지)** — 이 셋이 어법 OX·택1·고치기 학습 활동의 재료다. example = 시험이 파는 '함정(틀린 형태)'을 그대로 담은 짧은 영어 예문 1문장(8~14단어). 정답이 아니라 **틀린 형태가 들어간 문장**을 쓴다. exampleWrong=그 틀린 토큰, exampleCorrect=정답 토큰. 예) point가 "(c) 분사 능/수동(struggling)"이면 example:"I saw a boy struggled with the box.", exampleWrong:"struggled", exampleCorrect:"struggling".
- ❗ **틀린 형태(exampleWrong)는 정답형(exampleCorrect)의 어간을 유지한 채 형태만 바꾼다 — 품사 변경 금지**(동사↔명사, 형용사↔명사 X). 그래야 학생이 "형태 판단"을 훈련한다. 예: strengthen→strengthens(수일치), which→what(관계사), producing→to produce(준동사). **exampleWrong 은 반드시 example 문장 안에 글자 그대로 존재해야 하고, exampleWrong ≠ exampleCorrect 여야 한다.**

## 5. exam-focus — 유형별 출제 포인트 (표) [우리 객관식 출제 경향과 동일]
{ "kind":"exam-focus",
  "rows":[ { "sentenceNo":문장번호, "type":"유형", "asks":"무엇을 묻는가(쉽게)", "logicLocation":"이 지문 어디에 + 왜 걸리는지", "strategy":"위치·예상답·함정을 짚는 구체적 대비법",
             "layout":{ "anchorText":"이 유형이 걸리는 원문 구절(있으면)", "band":"rail", "priority":2, "lines":["짧은 줄1","짧은 줄2"] } } ] }
- 다룰 유형(type)은 **다음 중에서만**: **빈칸추론 / 주제 / 제목 / 순서 / 문장삽입 / 함축의미 / 지칭 / 요약**. 이 지문에 실제 나올 만한 4~5개.
- ❗ '무관한 문장', '어법성 판단' 유형은 **넣지 마라** (어법은 4번 섹션에서 다룸).
- ❗ **logicLocation: 이 유형이 이 지문의 '어느 문장/자리'에 왜 걸리는지**를 우리 출제 경향대로 짚어라. 유형별 경향:
  · **빈칸추론**: 대조축(역접) 뒤·결론·인과 귀결에서 **글의 논리로 복원해야 하는 핵심 개념어**. ❗빈칸 바로 옆 본문에 답이 그대로 보이면 그건 어휘 문제이지 빈칸추론이 아니에요 — 그런 자리는 고르지 마라. 답은 대조/인과 논리로 추론되는 개념이어야 하고, 함정은 그 논리에서 살짝 벗어난 비슷한 말이에요.
  · **주제/제목**: 결론·주장 문장(글 전체). 함정 = 세부 예시를 주제로 과장, 반대 방향, 길고 구체적인 선지.
  · **순서/문장삽입**: 정답은 '어울리는 곳'이 아니라 **앞 고리(지시어·연결의미)와 뒤 고리(전개)가 동시에 닫히는 유일한 자리**. 단서 = this/these/such, the+명사(구정보), However/Thus/For example, 어휘 사슬. 함정 = 한쪽 고리만 닫는 자리.
  · **함축의미**: 결론문의 비유·압축 표현(4~18단어). 단어 사전 뜻으로 풀면 함정 — 앞뒤 흐름 속 '진짜 뜻'을 읽어야.
  · **지칭**: 대명사(it/they/such)가 바로 앞 무엇을 가리키는지.
  · **요약**: (A)·(B) 두 칸이 핵심 개념 2개를 논리(인과/대조/문제해결)로 연결. 함정 = 한 칸만 맞는 반쪽 정답.
- ❗ **logicLocation 와 sentenceNo 는 필수다.** strategy 에 뭉뚱그리지 말고, logicLocation 에 **이 지문의 정확한 문장 번호 + 그 자리의 단서**를 따로 적어라. (예: "④ 'not opposites but ___' — 대조 구조 not A but B 의 B 자리라 추론 가능")
- ❗ **type 은 정확히 다음 8개 중 하나** (변형 철자·합성 금지): 빈칸추론 / 주제 / 제목 / 순서 / 문장삽입 / 함축의미 / 지칭 / 요약. ('순서 배열'·'빈칸 추론'·'내용 일치' 같은 표기 금지.)
- ❗ **지문 밖 내용 인용 금지**: logicLocation·strategy 는 반드시 **이 지문에 실제로 있는 표현·문장 번호**만 인용한다. 다른 지문의 예시(관객·실수 등)를 가져오면 0점.
- ❗ **asks·strategy 도 노베이스 학생용 4단계**(무엇을 묻나 → 어디를 보나 → 정답 패턴 → 함정 피하는 법). 추상론 금지, 이 지문의 실제 문장·표현으로. 예) asks:"빈칸에 들어갈 핵심 개념어를 물어봐요.", strategy:"④ 'not opposites but ___' 가 1순위예요. not A but B(A가 아니라 B다) 구조라, 앞의 opposites(반대)와 대비되는 '협력' 개념을 논리로 추론해야 해요. 비슷하지만 대조 논리에 안 맞는 말이 함정이에요."
- sentenceNo는 이 출제 포인트가 가장 직접적으로 걸리는 본문 문장 번호. 주제·제목처럼 글 전체 유형도 결정적 근거 문장 하나를 골라 연결.

## 6. vocabulary — 핵심 어휘 (표) [단어 테스트 원천]
{ "kind":"vocabulary",
  "rows":[ { "headword":"표제어", "pronunciation":"한글 발음", "meaning":"본문 의미 뜻", "tier":"test", "difficulty":3, "synonyms":"reduce, lessen, cut", "antonyms":"increase, raise" } ] }
- 어휘는 **최대한 풍부하게 25~35개**. 단, 쉬운 단어를 채워 넣어 개수만 늘리지 말고, 학생이 실제로 외우거나 시험에서 변형될 만한 중상 난도 표현을 중심으로 추출하라.
- 각 headword는 반드시 지문에 실제 등장한 단어·구·연어이거나 그 명확한 기본형이어야 한다. 보고서 UI가 문장별로 headword를 원문과 자동 매칭하므로, 본문에 없는 관련어·상위어·막연한 동의어를 headword로 만들지 말라.
- headword는 단일 단어보다 **학습 가치가 높은 표현 단위**를 우선한다: 연어(collocation), 숙어, 구동사, 추상명사구, 논리 전환 표현, 비유 표현. 예: "important" 하나보다 "play a crucial role", "memory retrieval", "not A but B"처럼 시험에서 살아나는 덩어리가 낫다.
- tier는 반드시 채운다. 내부 값은 "core" | "test" | "challenge" 중 하나로 쓰며, 단어시험 기본 후보를 고르는 데만 사용된다.
  · "core": 글의 흐름을 잡는 핵심어이지만 단어 자체는 쉬운 편인 표현. 전체의 **최대 20%**만 허용한다.
  · "test": 내신/수능에서 바꿔 묻거나 뜻·동의어로 확인할 만한 중상 난도 표현. 전체의 **45~55%**가 되게 한다.
  · "challenge": 추상어, 학술어, 비유·함축 표현, 고난도 연어처럼 상위권 학생에게 필요한 표현. 전체의 **25~35%**가 되게 한다.
- difficulty는 1~5 정수로 채운다. 1~2는 쉬움, 3은 중상, 4~5는 어려움이다. 단어시험에는 기본적으로 tier가 "test" 또는 "challenge"인 항목이 쓰이므로, 너무 쉬운 핵심어는 "core"/1~2로 정확히 표시하라.
- 너무 기본적인 단어(make, get, use, good, important, people, thing 등)는 단독 표제어로 넣지 마라. 단, 글의 주제축이라 꼭 필요하면 단어 하나가 아니라 원문의 핵심 구·연어 단위로 넣고 tier는 "core"로 표시하라.
- ❗ **품사(pos)는 넣지 마라.** 대신 **pronunciation 에 한글 발음**을 적는다 (예: reduced → "리듀스드", archive → "아카이브", melatonin → "멜라토닌"). 숙어/구는 통째로 한글 발음.
- ❗ **synonyms(동의어)·antonyms(반의어)는 모든 row 에 반드시 채워라(빈 문자열 금지).** 각각 **영어 단어 1~3개를 쉼표로 구분**해 적되, 그 단어가 **본문에서 쓰인 의미(meaning)와 같은 결**의 어휘여야 한다(다의어는 본문 의미 기준). 동의어는 학생이 바꿔 써도 자연스러운 수준의 흔한 단어로, 반의어는 의미가 분명히 반대인 단어로 고른다. 반의어가 본질적으로 존재하지 않는 단어(고유명사·중립 명사 등)만 antonyms 를 "—" 로 둔다 — 그 외에는 생략하지 마라.

## 7. parsing — 구문 분석 (파스 트리)
{ "kind":"parsing",
  "items":[ { "sentenceNo":번호, "en":"분석 대상 문장 원문", "parts":[ {"label":"[주절]/[관계절] 등","text":"분석 내용"} ], "translation":"→ 해석",
              "layout":{ "anchorText":"이 구문이 걸리는 원문 구절", "band":"underchunk", "priority":2 } } ] }
- 지문에서 **가장 복잡한 문장 2~3개**만 골라 구조를 끊어 분석.
- sentenceNo는 보고서 UI에서 해당 본문 문장 바로 아래 필기로 붙는 연결 키다. 반드시 passage.sentences[].n과 정확히 일치시켜라.

# ⭐ 필기 레이아웃 원칙 (01 원문 섹션 — grammar·exam-focus·parsing 의 layout 필드 공통)
원문 섹션은 학생 노트처럼 "본문 정확한 구절 위치"에 필기가 붙는 캔버스로 렌더된다. 너는 의미 의도만 정하고, 실제 위치·겹침 방지·줄높이는 렌더러가 보장한다.
1. **좌표·픽셀·mm 를 절대 쓰지 마라.** layout 으로 정하는 것은 오직 "어느 구절에(anchorText) / 어디에(band) / 얼마나 중요하게(priority) / 어떤 줄로(lines)" 뿐이다.
2. **anchorText 는 반드시 그 문장 en 안에 글자 그대로 있는 표현**으로(최대 4단어). 없을 표현이면 생략하라(렌더러가 문장 끝에 붙인다).
3. **band 선택**: 짧은 어법 포인트 → "interline"(줄 사이), 구문 분석 → "underchunk"(구 아래), 정말 긴 해설/출제전략 → "rail"(오른쪽 여백 카드). 애매하면 band 를 생략하라(렌더러가 kind 로 결정). "inline","footnote" 는 직접 쓰지 마라(어휘 뜻·공간부족 강등은 렌더러 담당).
4. **lines**: 설명을 미리 의미 단위 1~3줄로 끊어라(각 줄 **≤ 약 28자, 한 줄 = 한 개념**). interline 으로 가려면 줄이 짧아야 한다 — 길면 렌더러가 자동으로 여백 카드(rail)로 옮긴다.
5. **priority**: 1=반드시 보여야 하는 핵심(공간 부족해도 유지), 2=보통, 3=보조. **한 문장에 priority 1 은 1~2개만.**
6. **밀도 자기제한**: 한 문장에 필기가 5개를 넘으면 가장 약한 것은 priority 3 으로 낮춰라(지면이 빽빽해진다). 어휘 뜻은 vocabulary 섹션에 두면 렌더러가 해당 단어 위에 자동으로 붙이므로 여기 다시 쓰지 마라.
${extra}
# 분석할 지문
"""
${input.passageContent}
"""

위 명세대로 JSON 하나만 출력하라.`;
}

export function buildLearningWorksheetPrompt(input: BuildAnalysisReportPromptInput, report: AnalysisReport): string {
  const level = levelHint(input.schoolType, input.grade);
  const compactReport = compactReportContext(report);
  return `당신은 EBS 수능특강 워크북과 고품질 내신/수능 영어 학습지를 만드는 교재 편집자입니다.
아래 영어 지문과 이미 생성된 PRIME 분석을 바탕으로 A4 분석지 뒤에 자연스럽게 붙을 "실전 학습지" 섹션 1개를 생성하세요.

# 생성 목표
- 출력은 반드시 JSON 객체 하나이며, 최상위 kind는 정확히 "learning-worksheet"입니다.
- 대상 학습 수준: ${level}
- 첨부 자료 스타일을 반영하세요:
  1) DOCX형: 지문 논리 구조표, 핵심어구 빈칸+해석, 해석 없는 빈칸 연습, 주제/제목/함축/빈칸/요약문 객관식, 정답과 오답 분석
  2) PDF형: 주제/요지, 어법 선택, 어휘 빈칸 완성, 주요문장 단어배열 영작, 정답
- 문제는 단순 UI 더미가 아니라 실제 수업/시험 대비용이어야 합니다. 모든 정답과 오답 근거는 원문 표현에 근거해야 합니다.
- 너무 길게 늘이지 말고 A4 2~4쪽 안에서 편집 가능한 밀도 높은 학습지로 구성하세요.

# 출제 품질 헌장
- 모든 문항은 "정답이 맞는 이유"와 "오답이 틀린 이유"가 원문 특정 표현, 논리 흐름, 문장 구조로 설명 가능해야 합니다. 배경지식, 상식, 그럴듯한 추측으로만 풀리는 문항은 금지합니다.
- 정답 선택지는 너무 노골적이면 안 됩니다. 오답은 단순 말장난이 아니라 실제 학생이 헷갈릴 만한 오개념이어야 하며, 최소 4개 오답 유형을 섞습니다: 반대 방향, 과잉 일반화, 범위 축소/확대, 원인-결과 전도, 부분 일치, 근거 없음, 핵심어 왜곡.
- 선택지는 길이와 문체를 최대한 평행하게 맞추고, 정답만 유난히 길거나 추상적이거나 원문 표현을 그대로 베끼는 식으로 티 나게 만들지 마세요.
- 해설은 답 번호를 말하는 수준이 아니라 "원문 어느 표현 때문에 맞고, 오답은 어느 지점에서 벗어나는지"를 짧고 날카롭게 써야 합니다.
- 어려운 척하기 위해 지문과 무관한 고난도 어휘를 선택지에 넣지 마세요. 난이도는 원문 논리와 선택지 설계에서 나오게 하세요.

# JSON 스키마 요약
{
  "kind": "learning-worksheet",
  "title": "실전 학습지",
  "note": "선택",
  "logicRows": [
    { "sentenceNo": 1, "functionLabel": "주제 제시", "keyPoint": "한국어로 핵심 기능과 내용" }
  ],
  "cloze": {
    "title": "핵심어구 빈칸 + 한국어 해석",
    "items": [
      { "no": 1, "sentenceNo": 2, "text": "원문 일부에 (1) ________________________ 빈칸을 넣은 문장", "translation": "자연스러운 한국어 해석", "answers": ["critical thinking"] }
    ],
    "wordBank": ["critical thinking", "emotional pressures"]
  },
  "practice": {
    "title": "빈칸 연습",
    "items": [
      { "no": 1, "sentenceNo": 2, "text": "해석 없이 같은 빈칸 문장", "answers": ["critical thinking"] }
    ],
    "wordBank": ["critical thinking", "emotional pressures"]
  },
  "drills": {
    "grammarChoices": [
      { "no": 1, "sentenceNo": 2, "text": "Students [recognize / recognizing] the pattern quickly.", "choices": ["recognize", "recognizing"], "answer": "recognize", "explanation": "주어 Students의 동사 자리이므로 recognize가 맞습니다." }
    ],
    "wordOrders": [
      { "no": 1, "sentenceNo": 4, "korean": "한국어 영작 단서", "chunks": ["word", "chunks", "in", "scrambled", "order"], "answer": "word chunks in scrambled order" }
    ]
  },
  "workbookSet": {
    "title": "EBS 워크북 유형 훈련",
    "topicGist": {
      "title": "주제 / 요지",
      "topicTitle": "The 10,000-hour Myth : Mastery처럼 지문의 핵심을 압축한 영어 제목",
      "gist": "지문 요지를 한국어 한 문장으로 정리"
    },
    "grammarSelection": {
      "title": "어법 선택",
      "passage": "원문 흐름을 유지하면서 핵심 어법 지점에 [option A / option B]와 번호를 넣은 본문",
      "choices": [
        { "no": 1, "options": ["been heard", "heard"], "answer": "heard", "explanation": "현재완료 능동 구조이므로 heard가 맞습니다." }
      ]
    },
    "vocabularyCloze": {
      "title": "어휘 빈칸 완성",
      "passage": "원문 흐름을 유지하면서 주요 어휘를 번호가 붙은 빈칸 또는 밑줄로 바꾼 본문",
      "blanks": [
        { "no": 1, "answer": "performance", "meaning": "수행, 성과", "clue": "문맥상 실력 향상 결과를 가리킴" }
      ]
    },
    "wordOrders": [
      {
        "no": 1,
        "korean": "주요문장의 한국어 해석",
        "chunks": ["scrambled", "word", "chunks", "from", "the", "original", "sentence"],
        "answer": "the original sentence in correct word order"
      }
    ]
  },
  "questions": [],
  "hiddenAnswers": false,
  "hiddenClozeTranslations": false
}

# 세부 품질 기준
- logicRows: 5~8개. 문장별 기능을 "주제 제시 / 오해 교정 / 양보 / 역접 / 비유 결론"처럼 시험에 도움이 되게 잡으세요.
- cloze/practice: 8~14개 빈칸. 빈칸은 핵심어구, 연결 논리, 비유 핵심, 함축 표현 위주로 고르세요. 관사/전치사 하나처럼 학습 효과가 약한 빈칸은 피하고, 빈칸 앞뒤 문맥만으로 복원 훈련이 되게 만드세요. wordBank는 스크램블 단어 목록으로 쓰일 수 있게 정답 어구를 모두 포함하세요.
- drills: PDF 워크북처럼 어법 선택 2~4개와 주요문장 단어배열 영작 1~2개를 가능하면 생성하세요. 지문에 억지로 만들기 어려우면 줄여도 됩니다. 단순 철자, 대소문자, 의미 차이가 거의 없는 선택지는 금지합니다.
- workbookSet: 반드시 생성하세요. 첨부 워크북처럼 ① 주제/요지 ② 어법 선택 ③ 어휘 빈칸 완성 ④ 주요문장 단어배열 영작을 한 세트로 구성합니다.
  - Student-facing fields must never print answers or explanations directly after the question. Keep all answers only in answer/explanation fields.
  - cloze.wordBank and practice.wordBank must be shuffled for students. Their visible order must NOT match the answer/item order.
  - vocabularyCloze.passage must contain numbered blanks such as "(1) __________"; never output "[answer]①" or a filled answer next to the number.
  - Put word-order writing only in workbookSet.wordOrders. Do not duplicate the same word-order item in drills.wordOrders.
  - topicGist.topicTitle은 영어 제목형으로, 지문 중심 대비/반박/인과를 담습니다. gist는 한국어 한 문장으로 "글쓴이의 최종 주장"이 드러나야 하며, 소재 소개로 끝내면 안 됩니다.
  - grammarSelection.passage는 ❗**원문의 모든 문장을 순서대로 한 문장도 빠짐없이 그대로 포함**해야 합니다(요약·생략·문장 합치기 금지). 그 본문 위에서 어법 포인트 4~8곳만 [A / B] 형식 선택지로 바꾸고 번호를 붙입니다. choices에는 각 번호의 options, answer, explanation을 모두 씁니다. 원문 문장이 하나라도 빠지면 실패입니다.
  - 어법 선택지의 정답 위치는 반드시 섞으세요. 모든 정답이 첫 번째 선택지에 오면 실패입니다. 최소 2개 이상은 두 번째 선택지가 정답이 되게 하세요.
  - 어법 포인트는 다음 중 지문에 자연스럽게 있는 것만 고릅니다: 수동/능동, 준동사(분사·to부정사·동명사), 관계사/동격 that, 주어-동사 수일치, 병렬구조, 형용사/부사, 대명사 지시, 접속사/전치사, 시제/완료, 비교급/강조. 단어 뜻만 알면 풀리는 문제는 어법 선택으로 만들지 마세요.
  - 어법 오답은 실제 문법적으로 왜 틀리는지 설명 가능해야 합니다. "어색하다" 같은 해설은 금지합니다.
  - vocabularyCloze.passage는 ❗**원문의 모든 문장을 순서대로 한 문장도 빠짐없이 그대로 포함**해야 합니다(요약·생략·바꿔쓰기 금지). 그 본문 위에서 핵심 어휘 8~16개만 번호가 붙은 빈칸 "(1) __________" 으로 바꿉니다. blanks에는 정답, 뜻, 문맥 단서를 씁니다. 대상은 주제어, 논리 전환어, 평가어, 비유 핵심어, 콜로케이션 중심으로 고르고, 고유명사/숫자/쉽게 유추 불가능한 주변어는 피하세요. 원문 문장이 하나라도 빠지면 실패입니다.
  - wordOrders는 지문 핵심 문장 1~3개를 골라 한국어 단서와 원문 어순 조각을 섞은 chunks, 정답 문장을 제공합니다. chunks는 반드시 정답 순서와 다르게 뒤섞으세요. 정답 문장을 앞에서부터 그대로 자른 배열은 실패입니다.
- 수능추론 5문항 세트는 별도 품질 집중 호출에서 생성합니다. 여기서는 inferenceSet을 만들지 말고 workbookSet, cloze, practice, drills에 집중하세요.
- questions: inferenceSet에 들어가지 않는 추가 객관식이 정말 필요할 때만 0~3개 생성하세요. 어법/어휘/배열은 drills에 우선 배치하고, 객관식화가 더 자연스러울 때만 questions에 포함하세요.
- choices는 보통 5지선다입니다. label은 "①"~"⑤" 형식으로 쓰세요.
- 객관식 distractors는 각 오답 선택지마다 "반대 방향 / 범위 왜곡 / 근거 없음 / 부분 일치 / 원인-결과 전도 / 핵심어 왜곡" 같은 오답 유형과 구체 근거를 씁니다.
- 해설은 친절하되 장황하지 않게, 학생이 바로 납득할 수 있게 씁니다.
- 원문 영어 표현을 임의로 바꾸지 말고, 빈칸과 선택지에서만 필요한 변형을 하세요.
- JSON 밖에 어떤 설명도 붙이지 마세요.

# 이미 생성된 PRIME 분석 요약
${JSON.stringify(compactReport, null, 2)}

# 원문 지문
"""
${input.passageContent}
"""

위 조건에 맞춰 수능추론 문제를 제외한 learning-worksheet 섹션 JSON 객체 하나만 출력하세요.`;
}

export function buildLearningWorksheetInferencePrompt(
  input: BuildAnalysisReportPromptInput,
  report: AnalysisReport,
  worksheet: LearningWorksheetSection,
): string {
  const level = levelHint(input.schoolType, input.grade);
  const compactReport = compactReportContext(report);
  const worksheetContext = {
    title: worksheet.title,
    logicRows: worksheet.logicRows,
    workbookTopic: worksheet.workbookSet?.topicGist,
    workbookGrammarCount: worksheet.workbookSet?.grammarSelection.choices.length ?? 0,
    workbookVocabCount: worksheet.workbookSet?.vocabularyCloze.blanks.length ?? 0,
  };

  return `당신은 수능 영어 고난도 추론 문항을 만드는 출제자입니다.
아래 원문과 PRIME 분석, 앞서 생성된 워크북형 학습지를 바탕으로 "수능추론 문제" 5문항 세트만 생성하세요.

# 출력 형식
- JSON 객체 하나만 출력합니다.
- 최상위는 반드시 { "title": "수능추론 문제", "questions": [...] } 입니다.
- questions는 정확히 5개입니다. 순서와 type은 고정입니다.
  1) main-idea / 주제 추론
  2) title / 제목 추론
  3) implication / 함축의미 추론
  4) blank / 빈칸추론
  5) summary / 요약문 완성

# JSON 스키마 예시
{
  "title": "수능추론 문제",
  "questions": [
    {
      "no": 1,
      "type": "main-idea",
      "typeLabel": "주제 추론",
      "prompt": "윗글의 주제로 가장 적절한 것은?",
      "passage": "필요하면 지문 전체 또는 핵심 발췌",
      "choices": [
        { "label": "①", "text": "선택지" },
        { "label": "②", "text": "선택지" },
        { "label": "③", "text": "선택지" },
        { "label": "④", "text": "선택지" },
        { "label": "⑤", "text": "선택지" }
      ],
      "answerLabel": "②",
      "answerText": "정답 선택지 원문",
      "explanation": "정답 근거를 원문 표현과 논리로 설명",
      "distractors": [
        { "label": "①", "type": "범위 왜곡", "reason": "왜 오답인지 원문 근거로 설명" },
        { "label": "③", "type": "반대 방향", "reason": "왜 오답인지 원문 근거로 설명" },
        { "label": "④", "type": "부분 일치", "reason": "왜 오답인지 원문 근거로 설명" },
        { "label": "⑤", "type": "근거 없음", "reason": "왜 오답인지 원문 근거로 설명" }
      ]
    }
  ]
}

# 공통 품질 기준
- 대상 학습 수준: ${level}
- 모든 정답과 오답은 원문 특정 표현, 논리 흐름, 문장 구조로 설명 가능해야 합니다. 배경지식이나 상식으로만 풀리는 문항은 금지합니다.
- 선택지는 5지선다이며 label은 "①"~"⑤"입니다. 정답만 길거나 노골적으로 원문을 베끼지 않게, 선택지 길이와 문체를 평행하게 맞추세요.
- 5문항 전체의 정답 번호는 반드시 분산하세요. 모든 정답이 ①이거나 같은 번호로 몰리면 실패입니다. ①~⑤ 중 최소 3개 이상의 번호가 정답으로 쓰이게 하세요.
- distractors는 정답을 제외한 4개 오답을 모두 분석합니다. 각 오답에는 반대 방향, 범위 왜곡, 부분 일치, 근거 없음, 원인-결과 전도, 핵심어 왜곡 중 하나를 붙이고 구체 근거를 씁니다.

# 유형별 품질 기준
- Q1 주제 추론: 정답은 글 전체 논지를 포괄하되 지나치게 넓거나 세부 예시에 치우치지 않아야 합니다. 오답에는 세부 예시 확대, 반대 주장, 원인/결과 전도, 일부 표현만 맞는 선택지를 넣으세요.
- Q2 제목 추론: 정답 제목은 핵심 대비나 결론을 압축해야 하며, 단순 소재명만 쓰지 마세요. 오답은 자극적인 제목처럼 보이지만 글의 결론과 어긋나게 설계하세요.
- Q3 함축의미 추론: 원문에서 함축이 강한 표현 하나를 passage 또는 prompt에 따옴표/밑줄 대상으로 제시하고, 그 표현이 문맥에서 수행하는 의미를 묻습니다. HTML 태그(<span>, <u>, style=)는 절대 쓰지 말고 밑줄 대상은 __표현__ 형식으로 표시하세요. 사전적 의미 문제가 되면 실패입니다.
- Q4 빈칸추론: 빈칸은 결론, 역접 뒤, 비유의 귀결, 핵심 인과처럼 논리적으로 복원 가능한 곳에 둡니다. 단순 어휘 암기 빈칸이나 아무 말이나 들어갈 수 있는 빈칸은 금지합니다.
- Q5 요약문 완성: 반드시 (A), (B) 두 칸 구조를 사용하고, 두 칸이 같은 논리축을 공유하도록 만드세요. 선택지는 (A)/(B) 쌍으로 5개를 제공하고, 하나만 맞도록 반의어·방향성·범위 차이를 섞으세요. **각 선택지의 text 는 반드시 "(A) 단어 — (B) 단어" 형식으로 (A)·(B) 라벨을 둘 다 붙여 쓰세요. (A) 한쪽만 라벨링하거나 (B) 라벨을 빠뜨리면 안 됩니다.** answerText 도 같은 "(A) … — (B) …" 형식으로 쓰세요. **passage 필드에는 원문(또는 핵심 발췌) 뒤에 화살표(→)로 시작하는 영어 한 문장 요약문을 반드시 포함하고, 그 요약문 안에 (A) 빈칸과 (B) 빈칸을 정확히 한 번씩 밑줄(예: "_____(A)_____", "_____(B)_____")로 표시하세요. 요약문과 (A)/(B) 빈칸이 본문에 없으면 안 됩니다(선택지에만 (A)/(B)가 있는 것으로는 부족합니다).**

# PRIME 분석 요약
${JSON.stringify(compactReport, null, 2)}

# 앞서 생성된 워크북 학습지 요약
${JSON.stringify(worksheetContext, null, 2)}

# 원문 지문
"""
${input.passageContent}
"""

위 조건에 맞춰 수능추론 문제 JSON 객체 하나만 출력하세요.`;
}

function compactReportContext(report: AnalysisReport) {
  const passage = report.sections.find((section) => section.kind === "passage");
  const summary = report.sections.find((section) => section.kind === "summary");
  const structure = report.sections.find((section) => section.kind === "structure-map");
  const grammar = report.sections.find((section) => section.kind === "grammar");
  const exam = report.sections.find((section) => section.kind === "exam-focus");
  const vocabulary = report.sections.find((section) => section.kind === "vocabulary");

  return {
    meta: report.meta,
    sentences:
      passage?.kind === "passage"
        ? passage.sentences.map((sentence) => ({ n: sentence.n, en: sentence.en, ko: sentence.ko })).slice(0, 18)
        : [],
    summary:
      summary?.kind === "summary"
        ? { sentences: summary.sentences, thesisEn: summary.thesisEn }
        : undefined,
    structure:
      structure?.kind === "structure-map"
        ? {
            variant: structure.variant,
            intro: structure.intro,
            columns: structure.columns,
            steps: structure.steps,
            coreDistinction: structure.coreDistinction,
            conclusion: structure.conclusion,
            logicFlow: structure.logicFlow,
          }
        : undefined,
    grammar:
      grammar?.kind === "grammar"
        ? grammar.rows.slice(0, 8).map((row) => ({
            sentenceNo: row.sentenceNo,
            excerpt: row.excerpt,
            point: row.point,
            explanation: row.explanation,
          }))
        : [],
    examFocus:
      exam?.kind === "exam-focus"
        ? exam.rows.slice(0, 8).map((row) => ({ sentenceNo: row.sentenceNo, type: row.type, asks: row.asks, strategy: row.strategy }))
        : [],
    vocabulary:
      vocabulary?.kind === "vocabulary"
        ? vocabulary.rows.slice(0, 28).map((row) => ({
            headword: row.headword,
            meaning: row.meaning,
            tier: row.tier,
            difficulty: row.difficulty,
            synonyms: row.synonyms,
          }))
        : [],
  };
}
