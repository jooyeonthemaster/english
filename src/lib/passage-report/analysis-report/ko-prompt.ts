import {
  KO_LITERATURE_KINDS,
  KO_PASSAGE_KIND_LABELS,
  KO_VERSE_KINDS,
  type KoPassageKind,
} from "@/lib/korean/core/passage-meta";

/**
 * PRIME_KO 생성 프롬프트 — 국어 지문분석 학습지 (전면 국어 신작).
 *
 * 영어 prompt.ts(buildAnalysisReportPrompt)는 한 글자도 건드리지 않는다
 * (anthropic 프롬프트 캐시 byte-identical 보존 — KO-PORT-MAP 위험 6위).
 * 오케스트레이션 골격(홀리스틱 초안 + 섹션 단위 재생성)만 미러하고
 * 문체 헌장·섹션 명세·개념어 은행은 국어 교과 기준으로 새로 쓴다.
 */

export interface BuildKoAnalysisReportPromptInput {
  passageContent: string;
  /** 갈래 (Passage.tags 의 KO_KIND 태그) — null 이면 독서(비문학)로 취급 */
  koKind?: KoPassageKind | null;
  schoolType?: "MIDDLE" | "HIGH" | null;
  grade?: number | null;
  /** 강사 추가 지시 (선택) */
  customPrompt?: string;
}

export function isKoLiteraryKind(kind: KoPassageKind | null | undefined): boolean {
  return !!kind && KO_LITERATURE_KINDS.has(kind);
}

export function isKoVerseKind(kind: KoPassageKind | null | undefined): boolean {
  return !!kind && KO_VERSE_KINDS.has(kind);
}

function levelHint(schoolType?: "MIDDLE" | "HIGH" | null, grade?: number | null): string {
  const lv = schoolType === "MIDDLE" ? "중학교" : schoolType === "HIGH" ? "고등학교" : "고등학교";
  const g = grade ? `${grade}학년` : "";
  return `${lv} ${g}`.trim();
}

function kindHint(kind?: KoPassageKind | null): string {
  if (!kind) return "갈래 미지정 — 지문을 보고 독서(비문학)/문학을 스스로 판정하되, 판정 결과를 ko-overview.genre 에 명시하라.";
  return `갈래: ${KO_PASSAGE_KIND_LABELS[kind]}`;
}

/**
 * 모든 KO 섹션 공통 문체 헌장 — 국어 내신·수능을 준비하는 학생용 자료 기준.
 * (영어판 STYLE_CHARTER 와 병렬 구조이나 내용은 국어 교과로 전면 신작.)
 */
export const KO_STYLE_CHARTER = `# 절대 원칙 (모든 섹션 공통)
- **이 자료만 보고도 학생이 이 지문 관련 내신·수능 국어 시험을 대비할 수 있어야 한다.** 교사가 손대지 않고 그대로 배포할 수준.
- **개념·용어 나열 금지.** 모든 설명은 "왜 그런지 / 시험에서 어떻게 나오는지"까지 풀어 쓴다.

## ⭐ 설명 문체 규칙 (모든 해설·뜻풀이·전략에 일관 적용)
- **대상은 국어 개념이 약한 학생**이다. 혼자 읽어도 이해되게, 차근차근.
- **문체는 친근한 '~해요' 체로 통일**한다. 격식체('~이다/~한다')와 반말('~야/~지')을 섞지 마라.
- ❗ **'정의-즉시' 규칙: 문학·문법·독서 개념어를 쓰면 그 자리에서 괄호로 쉬운 뜻을 단다.**
  예: "설의(답을 알면서도 일부러 묻는 표현이에요)", "수미상관(처음과 끝에 같은 구절을 놓는 구성이에요)",
  "통념(사람들이 흔히 그렇다고 믿는 생각이에요)", "감정이입(화자의 감정을 다른 대상에 옮겨 담는 거예요)".
- ❗ **근거 없는 해석 금지**: 모든 설명·근거는 **이 지문에 실제로 있는 표현·구절**만 인용한다.
  지문 밖 배경지식·다른 작품 내용을 끌어오면 0점. 문학 해석은 보수적으로 — 공인 해석 범위 안에서만.
- 한 문장은 짧게. 어려운 한자어는 괄호로 풀이. 각 설명은 이 지문의 **구체적인 그 문단/그 구절** 기준으로(일반론 금지).
- ❗ 원문을 인용할 때는 **원문 글자 그대로**(맞춤법·띄어쓰기 포함) 인용한다. 임의 수정·요약 인용 금지.`;

/** 문학 기법 개념어 은행 (닫힌 집합) — KO_LIT_EXPR TECHNIQUE_BANK 원형과 일치. */
export const KO_DEVICE_BANK_HINT = `**기법 개념어 은행 (닫힌 집합 — 이 밖의 개념어 사용 금지)**:
대구 · 설의 · 영탄 · 반어 · 역설 · 의인화 · 활유 · 직유 · 은유 · 비유 · 상징 · 대유 · 과장 · 언어유희 ·
수미상관 · 색채어 · 색채 대비 · 음성상징어 · 감정이입 · 객관적 상관물 · 시선의 이동 · 공간의 이동 ·
어조 변화 · 반복 · 열거 · 점층 · 대조 · 도치 · 문답 · 돈호 · 시각적 심상 · 청각적 심상 · 촉각적 심상 ·
후각적 심상 · 미각적 심상 · 공감각적 심상 · 계절감 소재 · 음보율 · 선경후정 · 시상 전환 · 시간의 흐름
(산문 서술 특징은: 1인칭/3인칭 시점 · 서술자 개입 · 내적 독백 · 요약적 제시 · 장면 제시(보여주기) ·
역순행적 구성 · 대화 중심 서술 · 의식의 흐름 중에서만.)`;

export const KO_OUTPUT_RULES = `# 출력 규칙
- 반드시 **JSON 객체 하나만** 출력한다. 마크다운 코드펜스(\`\`\`)·설명 문장을 절대 붙이지 마라.
- 학원 배포 자료라 정확성이 생명이다. 원문 인용·정답·개념어는 정확해야 한다. 추측성 서술 금지.
- 필드 누락 금지: 명세의 필수 필드를 빠짐없이 채운다.`;

/** 홀리스틱 초안(전체 보고서 1콜) 프롬프트 — 회복형 생성기의 1단계. */
export function buildKoAnalysisReportPrompt(input: BuildKoAnalysisReportPromptInput): string {
  const level = levelHint(input.schoolType, input.grade);
  const literary = isKoLiteraryKind(input.koKind);
  const extra = input.customPrompt?.trim() ? `\n[강사 추가 지시]\n${input.customPrompt.trim()}\n` : "";

  const sectionsList = literary
    ? `"ko-overview", "ko-paragraph", "ko-concept-vocab", "ko-structure", "ko-literary-device", "ko-speaker", "ko-exam-points", "ko-check-quiz"`
    : `"ko-overview", "ko-paragraph", "ko-concept-vocab", "ko-structure", "ko-exam-points", "ko-check-quiz"`;

  const literarySpecs = literary
    ? `\n${KO_SECTION_SPECS["ko-literary-device"]}\n\n${KO_SECTION_SPECS["ko-speaker"]}\n`
    : "";

  return `당신은 한국 최상위 국어 학원의 수석 교재 편집장이다.
주어진 국어 지문 하나로, 교사가 학생에게 그대로 배포할 수 있는 **A4 출력용 "국어 지문분석 학습지"** 전체를 설계하고 작성한다.
대상 학습자 수준: ${level}. ${kindHint(input.koKind)}

${KO_STYLE_CHARTER}

${KO_OUTPUT_RULES}
- 최상위 키는 정확히 두 개: "meta", "sections".
- sections 배열에는 다음 kind 를 이 순서대로 하나씩 넣는다: ${sectionsList}

# meta 명세
{ "titleKo":"학습지 제목(지문 핵심을 담은 한국어)", "titleEn":"부제 — 작가·출전 또는 핵심 대비축(없으면 빈 문자열)",
  "category":"갈래(예: 문학 · 현대시 / 독서 · 사회)", "theme":"제재", "difficulty":1~5 정수,
  "solveTime":"권장 학습시간(예: 15분)", "examTypes":"핵심 예상 출제유형 2~4개(· 구분)" }

# 섹션 명세
${KO_SECTION_SPECS["ko-overview"]}

${KO_SECTION_SPECS["ko-paragraph"]}

${KO_SECTION_SPECS["ko-concept-vocab"]}

${KO_SECTION_SPECS["ko-structure"]}
${literarySpecs}
${KO_SECTION_SPECS["ko-exam-points"]}

${KO_SECTION_SPECS["ko-check-quiz"]}
${extra}
# 분석할 지문
"""
${input.passageContent}
"""

위 명세대로 meta 와 sections 를 담은 JSON 객체 하나만 출력하라.`;
}

// ─── 섹션별 명세 (홀리스틱 초안과 섹션 단위 재생성이 글자 그대로 공유) ─────────

export const KO_SECTION_SPECS: Record<string, string> = {
  "ko-overview": `## ko-overview — 개관 (갈래·제재·주제·해제)
{ "kind":"ko-overview", "genre":"갈래(예: 현대시 / 독서 — 사회·경제)", "genreDetail":"갈래 세부·성격(예: 자유시, 서정시 / 성찰적)",
  "subjectMatter":"제재(글감)", "theme":"주제 한 문장", "commentary":"해제 3~6문장" }
- theme 는 시험 답안 수준으로 정확하게(문학은 '~을 통해 드러나는 ~' 구조 권장).
- commentary(해제)는 이 지문이 무엇을 어떻게 다루는지 + 시험에서 어디가 중요한지를 '~해요' 체로 풀어 쓴다.`,

  "ko-paragraph": `## ko-paragraph — 문단/연별 요지
{ "kind":"ko-paragraph", "unitLabel":"문단|연|수|장면 중 하나", "rows":[ { "no":번호, "heading":"(선택) 소제목·(가)(나) 라벨", "gist":"요지 한두 문장" } ] }
- 산문·독서 = 문단 단위, 운문(시·시가) = **연(또는 수) 단위**, 극 = 장면 단위.
- 지문의 실제 문단/연 수와 rows 수를 일치시켜라(임의 병합·누락 금지). 복합지문은 heading 에 "(가)"/"(나)" 표기.
- gist 는 그 문단이 글 전체에서 하는 일(주장/근거/예시/전환/절정)까지 담는다.`,

  "ko-concept-vocab": `## ko-concept-vocab — 핵심 개념어·어휘 (한자어 병기 + 뜻풀이)
{ "kind":"ko-concept-vocab", "rows":[ { "term":"개념어·어휘(지문 실제 표현)", "hanja":"한자 병기(한자어일 때만, 예: 信用)", "meaning":"본문 문맥 뜻풀이", "note":"(선택) 유의어·시험 포인트" } ] }
- **8~15개.** 지문 이해의 열쇠가 되는 개념어·한자어·고유어를 고른다(쉬운 단어로 개수 채우기 금지).
- term 은 지문에 실제 등장한 표현 그대로. 한자어는 hanja 에 한자를 병기하고, 고유어·외래어는 hanja 생략.
- meaning 은 사전 뜻 복사가 아니라 **이 지문 문맥에서의 뜻**을 '~해요' 체 없이 간결한 뜻풀이로.`,

  "ko-structure": `## ko-structure — 지문 구조도 (문단/연 기능표)
{ "kind":"ko-structure", "note":"(선택) 구조 한 줄 요약(예: 통념 → 반박 → 사례 → 결론)",
  "rows":[ { "no":문단/연 번호, "functionLabel":"글 속 기능(짧은 명사구)", "keyPoint":"그 문단/연이 하는 일 한 줄" } ] }
- rows 는 ko-paragraph 의 번호와 일치. functionLabel 예: 화제 제시/통념/반박/예시/비교/결론(독서), 선경/후정/시상 전환/수미상관(운문), 발단/전개/위기(서사).
- keyPoint 는 요지 반복이 아니라 **논리 전개상의 역할**을 쓴다.`,

  "ko-literary-device": `## ko-literary-device — 표현·서술상 특징 (문학 전용)
{ "kind":"ko-literary-device", "rows":[ { "device":"기법 개념어(은행 원형 그대로)", "evidence":"근거 구절 — 원문에서 글자 그대로 인용", "effect":"작품 내적 효과 한 줄" } ] }
- **3~7개.** ${KO_DEVICE_BANK_HINT}
- ❗ evidence 는 **원문에 글자 그대로 존재하는 연속 구절**이어야 한다(띄어쓰기 포함). 원문에 없는 인용은 그 행 전체가 반려된다.
- effect 는 "~하여 ~을 드러내요"처럼 기법→효과가 이어지게. 지문에 없는 기법을 지어내지 마라.`,

  "ko-speaker": `## ko-speaker — 화자·인물 정리 (문학 전용)
{ "kind":"ko-speaker", "rows":[ { "target":"화자/인물 지칭(예: 화자, '나', 어머니)", "role":"(선택) 상황·역할", "emotion":"정서(체념·달관·자조·연민·의지·회한·그리움 등)", "attitude":"태도(성찰적·비판적·예찬적 등)", "evidence":"(선택) 근거 구절·장면" } ] }
- 운문 = 화자 중심(1~3행), 산문 = 주요 인물별(2~5행).
- 정서·태도는 **동일 극성 안에서 정확한 개념어**를 고른다(안정감↔적막함처럼 비슷해 보여도 다른 개념 주의).
- evidence 를 쓸 때는 원문 표현을 그대로 인용.`,

  "ko-exam-points": `## ko-exam-points — 예상 출제 포인트 (유형 슬롯별)
{ "kind":"ko-exam-points", "rows":[ { "slot":"유형 라벨", "typeId":"(선택) KO_ 유형 코드", "asks":"무엇을 묻는가", "basis":"이 지문 어느 문단/연/구절이 근거인지 + 왜", "bogiIdea":"(선택) <보기> 소재 제안" } ] }
- **4~6개.** slot 은 갈래에 맞게:
  · 독서 = 내용 일치(KO_RD_FACT) / 전개 방식(KO_RD_STRUCT) / 개념 비교(KO_RD_CONCEPT) / 추론(KO_RD_INFER) / 비판적 이해(KO_RD_CRIT) / <보기> 사례 적용(KO_RD_APPLY) / 어휘 문맥 의미(KO_RD_VOCAB)
  · 문학 = 표현상 특징(KO_LIT_EXPR) / 서술상 특징(KO_LIT_NARR) / 내용·인물 이해(KO_LIT_FACT) / 심리·태도(KO_LIT_PSYCH) / 구절 의미(KO_LIT_PHRASE) / <보기> 감상(KO_LIT_BOGI) / 소재 기능(KO_LIT_MOTIF) / 말하기 방식(KO_LIT_SPEECH)
  · 서답형 = 빈칸 복원(KO_NS_CLOZE) / 발췌 서술(KO_NS_EXTRACT) / 조건 서술(KO_NS_COND)
- basis 는 반드시 이 지문의 실제 문단/연 번호와 실제 표현을 인용한다(지문 밖 내용 0점).
- <보기> 적용/감상 슬롯은 bogiIdea 에 외적 준거(이론·사례·작가 배경) 소재를 1~2문장으로 제안하라.`,

  "ko-check-quiz": `## ko-check-quiz — 확인 문제 (OX/단답 5개) + 정답
{ "kind":"ko-check-quiz", "questions":[ { "no":1, "format":"OX|단답", "prompt":"문항(정답 단서·정답 문구 포함 금지)", "answer":"정답", "explanation":"(선택) 한 줄 해설" } ], "hiddenAnswers":true }
- **정확히 5문항** (OX 2~3개 + 단답 2~3개 혼합).
- OX 는 지문 핵심 정보의 참/거짓(거짓 문항은 주체 바꿔치기·극성 반전 등 실제 오답 원리로), 단답은 지문에서 찾아 쓰는 확인형.
- ❗ prompt 안에 answer 문구가 그대로 들어가면 0점(정답 누출 금지). 정답은 지문 근거로 유일하게 결정돼야 한다.
- hiddenAnswers 는 항상 true 로 출력한다(정답 공개는 교사가 편집기에서 토글).`,
};
