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
- **대상은 영어 기초가 거의 없는 '노베이스' 학생**이다. 그 학생이 혼자 읽어도 100% 이해되게.
- **문체는 전부 친근한 '~해요' 체로 통일**한다. 격식체('~이다/~한다/~된다/~이며')와 반말('~야/~지')을 **섞지 마라.** (예: "이 자리는 동사를 원형으로 맞춰야 해요. and 앞의 단어랑 짝을 이루거든요.")
- **문법·독해 용어를 쓰면 그 자리에서 바로 쉬운 말로 풀어준다.** 예: "병렬(and 앞뒤를 똑같은 모양으로 맞추는 거예요)", "분사(동사를 형용사처럼 바꾼 형태예요)". 용어만 던지고 끝내면 안 됨.
- 한 문장은 **짧게**. 어려운 한자어·추상어 피하기. 가능한 한 "쉬운 비유/일상어"로.
- 각 설명은 그 지문의 **구체적인 그 문장/그 단어** 기준으로. 일반론·교과서 정의 금지.

# 매우 중요한 출력 규칙
- 반드시 **JSON 객체 하나만** 출력한다. 마크다운 코드펜스(\`\`\`)나 설명 문장을 절대 붙이지 마라.
- 최상위 키는 정확히 두 개: "meta", "sections".
- "sections" 는 아래 7개 섹션을 **이 순서대로** 모두 포함한다 (kind 값 고정):
  1) passage  2) structure-map  3) summary  4) grammar  5) exam-focus  6) vocabulary  7) parsing
- ❗ self-check(학습 점검) 섹션은 **생성하지 마라.** (제거됨)
- 학원 자료의 신뢰성이 생명이다. 문법 해설·정답·구문 분석은 **정확**해야 한다. 추측성/오류 금지.
- **필드 누락 절대 금지**: 각 명세의 모든 필드를 빠짐없이 채운다. 특히 (a) exam-focus 의 모든 row 는 type·asks·strategy 3개를 전부, (b) structure-map 의 conclusion.text 와 coreDistinction.label 을 반드시 채운다. 값이 애매하면 빈 문자열이 아니라 가장 합당한 내용을 생성하라.

# meta (문서 메타)
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

# sections 각 항목 명세

## 1. passage — 원문 + 문장별 한글 해석
{ "kind":"passage", "note":"※ 문장 번호 ①–⑪는 ... (선택)",
  "sentences":[ { "n":1, "en":"원문 문장(원문 그대로, 수정 금지)", "ko":"자연스러운 한국어 해석" }, ... ],
  "keywords":["글의 맥을 잡는 주제어/키워드 (원문에 실제 등장한 표현 그대로)"] }
- 지문을 의미 단위 문장으로 끊어 1번부터 번호를 매긴다. 원문 단어를 바꾸지 마라.
- keywords: 글의 핵심 흐름을 잡아주는 주제어·반복어·대조어 **6~10개** (반드시 원문 표현 그대로 — 본문에서 밑줄 강조됨). 학생이 이 단어들만 따라가도 글의 맥이 잡히게.
- **모든 문장에 ko 해석을 반드시 채운다** (1페이지에서 원문과 한글 해석이 문장별로 함께 보여야 함 — 누락 절대 금지). 해석은 학생이 바로 이해할 수 있게 자연스럽고 쉽게.

## 2. structure-map — 한눈에 보는 지문 구조 (도식)
{ "kind":"structure-map",
  "note":"※ ... 구조 한 줄 설명 (선택)",
  "variant":"compare" 또는 "sequence",   // ❗ 지문 구조에 맞게 먼저 고른다
  "intro": { "eyebrow":"도입부 라벨(영문 대문자, 선택)", "label":"도입/소재 비유 한 줄" },
  // variant="compare" 일 때만:
  "branchLabel":"두 갈래로 나뉘는 지점 라벨 (선택)",
  "columns":[
     { "titleEn":"개념A 영문", "titleKo":"개념A 한글", "bullets":["특징 3~4개(한·영 병기)"], "footer":"한 줄 요약(선택)" },
     { "titleEn":"개념B 영문", "titleKo":"개념B 한글", "bullets":["특징 3~4개(한·영 병기)"], "footer":"한 줄 요약(선택)" } ],
  // variant="sequence" 일 때만 (columns 대신):
  "steps":[ { "titleKo":"1단계: ... ", "titleEn":"...", "detail":"단계 설명 (한글 + 핵심 영어 표현)" }, ... 2~6개 ],
  "coreDistinction": { "eyebrow":"라벨(선택)", "label":"compare=두 축을 가르는 기준 / sequence=핵심 원리·동력", "detail":"보충 한 줄(선택)" },
  "conclusion": { "eyebrow":"결론 라벨(선택)", "text":"글이 도달하는 결론/주제 한 줄" },
  "logicFlow":"논리 흐름을 ▶로 연결한 한 줄 요약" }
- ❗ **variant 를 먼저 판단**: 대조·비교·인과·문제해결·주장처럼 **두 축**이 자연스러우면 "compare" (columns 사용). 시간순·단계·절차처럼 **순서대로 진행**되는 글이면 "sequence" (steps 사용). **억지로 2분할하지 마라** — 순차 과정을 2열로 욱여넣으면 어색하다.
- compare: intro → columns(2축) → coreDistinction → conclusion. sequence: intro → steps(단계 흐름) → coreDistinction(핵심 원리) → conclusion.
- ❗ **모든 bullet 과 titleKo·label 은 한글 + 핵심 영어 표현을 함께** 적는다: 예) "단서 없이 처음부터 재구성 (reconstruct from scratch)", "백지에 쓰기 (a blank page)". **한글만 또는 영문만 금지** — 학생이 영어 표현까지 같이 익혀야 실제 공부가 됨.
- 각 bullet 은 지문 근거가 분명한 사실만, 한눈에 이해되게 간결히.

## 3. summary — 핵심 요약 + 영문 주제문
{ "kind":"summary", "sentences":["핵심 요약 한국어 2~4문장"], "thesisEn":"지문 전체를 한 문장으로 압축한 영어 주제문" }

## 4. grammar — 어법 핵심 포인트 (표) [시험 출제 관점]
{ "kind":"grammar", "note":"※ ⚠ 는 시험에서 학생이 자주 틀리는 함정",
  "rows":[ { "sentenceNo":문장번호, "excerpt":"해당 자리가 든 실제 원문 구절", "point":"어법 판단 자리 + 표현", "explanation":"아주 쉬운 해설", "trap":"⚠ 함정/오답 형태" } ] }
- ❗ 단순 문법 용어 나열·정의가 **절대 아니다**. **이 지문에서 수능/내신 어법 문제로 실제 출제될 '판단 자리'** 만 골라라 (실제 시험 출제자의 눈).
- 출제 자리 분류 — 이 중 강한 자리 **5~8개** 선정(가능한 한 서로 다른 분류로):
  (a)정·준동사 (b)관계사 (c)분사 능/수동 (d)수일치 (e)능·수동태 (f)형용사/부사 자리 (g)대명사 (h)목적격보어 (i)병렬 (j)가정법 시제 (k)to-v vs v-ing (l)전치사 vs 접속사 (m)비교구문
- ❗ **excerpt: 그 어법 자리가 들어있는 실제 원문 구절을 그대로 가져온다** (학생이 문장 번호 찾아 헤매지 않게). 예) "you must search ... and reconstruct information". 판단 대상 표현이 그 안에 보이게.
- point: 어느 표현이 어떤 판단을 묻는지 짧게. 예) "reconstruct — search 와 병렬".
- explanation: **중3도 이해할 만큼 쉽게, 친근한 말로** — 예) "여기서는 동사를 원형으로 쓸지 -ing로 쓸지 고르는 자리야. and 앞의 search 랑 짝을 맞춰야 하니까 reconstruct(원형)가 맞아."
- trap: **시험에서 어떻게 오답으로 출제되는지** 구체적으로. 예) "시험에선 이 자리를 reconstructing 으로 바꿔 밑줄 치고 '어법상 틀린 것을 고르라'고 내 — 앞 search 와 병렬이라 원형이 맞으니까 이게 오답 선지가 돼".

## 5. exam-focus — 유형별 출제 포인트 (표)
{ "kind":"exam-focus",
  "rows":[ { "type":"유형", "asks":"무엇을 묻는가(쉽게)", "strategy":"이 지문 기준 구체적 대비 전략 + 예시" } ] }
- 다룰 유형: **빈칸추론 / 주제·제목 / 순서·문장삽입 / 함축·지칭 / 요약** 중 이 지문에 실제 나올 만한 4~5개.
- ❗ '무관한 문장', '어법성 판단' 유형은 **넣지 마라** (어법은 4번 섹션에서 다룸).
- strategy 는 추상론 금지 — **이 지문 기준 구체적으로**: 실제 위치·예상 답·근거를 짚어 학생이 "어디를 보고 뭘 준비할지" 알게. 예) "빈칸은 ⑨ '…the presence of ___' 가 1순위 → 답 cues (대조축이 단서 유무이므로)".

## 6. vocabulary — 핵심 어휘 (표) [단어 테스트 원천]
{ "kind":"vocabulary",
  "rows":[ { "headword":"표제어", "pronunciation":"한글 발음", "meaning":"본문 의미 뜻", "synonyms":"동의어(선택)" } ] }
- 어휘는 **최대한 풍부하게 25~35개**. 핵심 단어뿐 아니라 학생이 모를 만한 단어·숙어·구동사·연어까지 폭넓게 추출하라 (지문에 나온 학습 가치 있는 표현은 빠뜨리지 말 것).
- ❗ **품사(pos)는 넣지 마라.** 대신 **pronunciation 에 한글 발음**을 적는다 (예: reduced → "리듀스드", archive → "아카이브", melatonin → "멜라토닌"). 숙어/구는 통째로 한글 발음.

## 7. parsing — 구문 분석 (파스 트리)
{ "kind":"parsing",
  "items":[ { "sentenceNo":번호, "en":"분석 대상 문장 원문", "parts":[ {"label":"[주절]/[관계절] 등","text":"분석 내용"} ], "translation":"→ 해석" } ] }
- 지문에서 **가장 복잡한 문장 2~3개**만 골라 구조를 끊어 분석.
${extra}
# 분석할 지문
"""
${input.passageContent}
"""

위 명세대로 JSON 하나만 출력하라.`;
}
