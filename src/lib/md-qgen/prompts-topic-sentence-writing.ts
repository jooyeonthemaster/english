// ============================================================================
// 주제문 영작(TOPIC_SENTENCE_WRITING) md 프롬프트 — 정본 7블록 골격의 이식본.
// 견본(EXEMPLAR): prompts-antonym.ts · 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// ⚠ 이 유형은 **서술형**이다. 선지가 없으므로 `정답: ①` 줄도 `오답:` 블록도 없다.
//   정답의 진실원은 모드마다 다르다:
//     scrambled → `주제문:` 줄 하나(그 줄이 곧 modelAnswer)
//     cloze     → `정답(A):`·`정답(B):` 줄(모범답안은 파서가 치환으로 합성)
//
// 형식 설계 철칙(규범 §1-B) 적용 기록 — 초안(§7-7) 대비 3곳을 줄였다:
//  [철칙1] cloze 의 `모범답안:` 줄을 **받지 않는다**. 주제문의 (A)(B) 를 정답으로
//          치환하면 결정론으로 나오는 파생값이라, 받는 순간 "모범답안 ≠ 빈칸 정답"
//          이라는 실패 모드가 공짜로 하나 생긴다.
//  [철칙1] `핵심어(A):`(requiredLemmas)를 **받지 않는다**. TSW 의 채점 textMode 는
//          항상 VARIANTS 라(answer-spec.ts:316-329) lemmas 가 조회되지 않고
//          (grade.ts:50-56) 렌더에도 안 나온다 — 아무 데도 안 쓰이는 칸이다.
//          부분점수 서술은 `채점기준:` 한 곳에서만 받는다.
//  [철칙2] 구분자를 **2종으로** 줄였다: 리스트 `- `, 나열 ` / `. 동치 정답도 쉼표가
//          아니라 ` / ` 로 잇는다 — 영어 어구에는 쉼표가 실제로 들어가지만 슬래시는
//          들어가지 않으므로, 쉼표 구분자는 "정답 조각으로 잘못 쪼개진 동치"를 만들어
//          오답을 흡수시킨다(위험 #2 계열의 조용한 사고).
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

export type TswMdMode = "scrambled" | "cloze";
export type TswMdTopicForm = "sentence" | "nounPhrase";
export type TswMdChunking = "word" | "chunk" | "mixed";
export type TswMdFidelity = "verbatim" | "inflected" | "mixed";
export type TswMdHintLooseness = "literal" | "natural" | "gist";
export type TswMdClueMode = "none" | "firstLetter" | "wordCount";
export type TswMdSourceMode = "explicit" | "paraphrase" | "inference";
export type TswMdScoring = "exact" | "keyword" | "rubric";
export type TswMdBlankAssignment = "separate" | "shared";

/** 프롬프트·게이트·어댑터가 공유하는 형식 실값(= resolved 설정의 부분집합). */
export interface TswMdShape {
  mode: TswMdMode;
  topicForm: TswMdTopicForm;
  hintEnabled: boolean;
  hintLooseness: TswMdHintLooseness;
  chunking: TswMdChunking;
  distractors: number;
  fidelity: TswMdFidelity;
  scrambleOrder: "random" | "scrambleStrong";
  blankCount: number;
  blankAssignment: TswMdBlankAssignment;
  clueMode: TswMdClueMode;
  sourceMode: TswMdSourceMode;
  sourceSentenceParaphrase: boolean;
  scoringGranularity: TswMdScoring;
}

export const TOPIC_SENTENCE_WRITING_MD_BLANK_MIN = 1;
export const TOPIC_SENTENCE_WRITING_MD_BLANK_MAX = 2;
export const TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MIN = 0;
export const TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MAX = 3;

export function clampTswMdBlankCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return TOPIC_SENTENCE_WRITING_MD_BLANK_MIN;
  return Math.min(
    TOPIC_SENTENCE_WRITING_MD_BLANK_MAX,
    Math.max(TOPIC_SENTENCE_WRITING_MD_BLANK_MIN, n),
  );
}

export function clampTswMdDistractorCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MIN;
  return Math.min(
    TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MAX,
    Math.max(TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MIN, n),
  );
}

/** 빈칸 라벨 "(A)" "(B)" — 채점 키(StudentInput.texts)와 동일 축이라 괄호 대문자 고정. */
export function tswMdBlankLabels(blankCount: number): string[] {
  return Array.from({ length: clampTswMdBlankCount(blankCount) }, (_, i) =>
    `(${String.fromCharCode(65 + i)})`,
  );
}

const FORM_WORD: Record<TswMdTopicForm, string> = {
  sentence: "주제문(동사가 있는 완전한 문장, 12~14단어)",
  nounPhrase: "주제 명사구(동사 없는 학술 명사구, 12단어 이내)",
};

// ── 블록 2: few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다(정본 확정 결론) ──

const FEWSHOT_SCRAMBLED = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 도시가 밀집 개발과 대중교통 투자를 함께 했을 때만 통근 총량이 줄더라는 도시계획 글.
- 주제 추출: 글은 "밀도"와 "교통 투자"를 따로 말하는 것처럼 보이지만, 마지막 두 문장이 둘을 하나로 묶는다. 주제는 "밀도 자체"가 아니라 **"밀도와 교통 투자의 결합이 통근 부담을 낮춘다"**이다. 한 문장에만 나오는 소재(예시 도시명·연도·수치)는 주제가 아니다.
- 모범답안: \`Dense development paired with transit investment lowers the total commuting burden of a city.\` — 지문 어느 문장과도 연속 6단어가 겹치지 않도록 구문을 재구성했다(원문은 관계절, 답안은 분사 수식).
- 칩 설계: \`lowers the total\` / \`of a city\` / \`Dense development\` / \`commuting burden\` / \`paired with\` / \`transit investment\` — 의미 단위 6청크. 어느 칩도 정답의 절반을 담지 않는다.
- 미끼 설계: \`increases\` 하나. 무관 단어가 아니라 정답 자리(lowers)와 **방향이 반대인 동사**라 실제로 경쟁한다.
- 이 설계가 아름다운 이유: 칩만 훑으면 "밀도가 도시를 키운다"로도 조립될 것처럼 생겼다. 어느 동사가 오는지는 글의 논지를 읽어야만 결정된다 — 배열 과제가 독해 과제로 바뀌는 지점이 여기다.`;

const FEWSHOT_CLOZE = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 데이터가 많아질수록 판단이 좋아진다는 통념을 반박하는 글.
- 주제 추출: 표면 소재는 "표본 크기"지만 결론 두 문장이 문제 삼는 것은 "선별 없는 수집"이다. 주제는 상위 명제 **"수집량이 아니라 선별 기준이 판단의 질을 정한다"**이다.
- 주제문(빈칸판): \`What determines the quality of a judgment is not (A) but (B).\` — 빈칸을 걷어내도 \`What determines the quality of a judgment is not ... but ...\` 라는 골격이 남아 학생이 무엇을 쓸 자리인지 안다. 골격이 \`The (A), (B).\` 뿐이면 발문 자체가 성립하지 않는다(실측 반려).
- 빈칸 정답: (A) \`the sheer volume of collected data\` · (B) \`the criteria used to select it\`
- 보기 설계: 정답 토큰을 흩되 미끼 둘(volume 과 경쟁하는 \`speed\`, criteria 와 경쟁하는 \`sources\`)을 섞었다. 보기를 왼→오로 읽어도 정답 어순이 드러나지 않는다.
- 이 설계가 아름다운 이유: 두 빈칸이 \`not A but B\` 대조의 양극이라 한쪽을 잘못 잡으면 반대쪽이 자동으로 어긋난다. 부분점수가 실제 이해도를 그대로 반영한다.`;

// ── 블록 3: 표적(주제) 설계 — 난이도 3분기 필수 ──

const TOPIC_DESIGN: Record<MdDifficulty, string> = {
  BASIC: `## 주제 설계 (기본 난이도)
- 글이 **명시적으로 말한 결론 문장**을 재료로 삼는다. 첫 문장·마지막 문장 중 논지를 지고 있는 쪽을 골라 그 명제를 그대로 살리되, 표현은 바꿔 쓴다.
- 근거 깊이는 한 문장이면 충분하다. 다만 예시 문장 하나만 커버하는 주제는 실격 — 글 전체를 덮어야 한다.
- 학생이 해야 할 판단은 "재료를 어떻게 놓느냐" 한 겹이다. 어휘 자체가 어려우면 안 된다.`,
  INTERMEDIATE: `## 주제 설계 (중급 난이도)
- 결론 문장 하나를 베끼지 마라. **두 문장 이상의 관계**(대조·인과·조건)를 하나의 명제로 합쳐야 주제가 된다.
- 지문 표면 어휘를 그대로 쓰지 말고 상위어·환언으로 갈아라(예: \`smartphone notifications\` → \`constant digital interruptions\`).
- 학생은 재료 배분과 어순 판단 두 겹을 해야 한다 — 미끼가 그 두 번째 겹을 만든다.`,
  KILLER: `## 주제 설계 — KILLER 의 생명
- 지문의 어느 문장도 그대로는 말하지 않은 **상위 명제**를 세워라. 글 전체를 읽고 문단 사이 논리를 접었을 때만 나오는 한 줄이어야 한다.
- 함정의 핵심은 "그럴듯한 하위 주제"다. 지문의 한 단락만 덮는 명제, 예시에만 맞는 명제는 학생이 먼저 떠올리는 오답 경로다 — 네 주제는 그걸 반드시 포섭해야 한다.
- 대조 구조(\`not A but B\`, \`less X than Y\`)나 조건 구조(\`only when ...\`)를 쓰면 부분 이해로는 못 채운다. 어느 쪽 극에 무엇이 오는지가 곧 독해 판정이 된다.
- 학생 머리 꼭대기에서 설계하라: 학생이 어느 단어를 먼저 집을지, 그때 어디서 어긋나는지를 계산하고 재료를 배치하라.`,
};

const SOURCE_MODE_RULE: Record<TswMdSourceMode, string> = {
  explicit: "- 주제 출처(sourceMode=explicit): 글이 명시한 결론을 근거로 삼는다. 다만 문장을 그대로 옮기지는 마라(구문을 바꿔라).",
  paraphrase: "- 주제 출처(sourceMode=paraphrase): 글의 결론을 **환언**해 세운다. 지문 어휘를 상위어·동의 구문으로 갈아 표면 매칭을 막아라.",
  inference: "- 주제 출처(sourceMode=inference): 지문 어느 문장도 직접 말하지 않은 **추론 명제**를 세운다. 문단 간 논리를 접어야만 도달하는 한 줄이어야 한다.",
};

// ── 블록 4: 미끼·재료 설계 분류학 ──

function materialBlock(shape: TswMdShape): string {
  const chunkRule =
    shape.chunking === "chunk"
      ? "- 재료 단위(chunking=chunk): **의미 단위 청크**로 쪼갠다(4~7덩어리). 한 청크가 정답의 절반 이상을 담으면 과제가 무의미하다."
      : shape.chunking === "word"
        ? "- 재료 단위(chunking=word): **단어 단위**로 쪼갠다. 관사·전치사도 각각 하나의 재료다. 같은 단어가 두 번 필요하면 같은 문자열을 두 개 넣어라(×2 규약)."
        : "- 재료 단위(chunking=mixed): 핵심 어구는 청크로 묶고 기능어는 단어로 쪼갠다. 청크와 단어가 섞여야 한다.";
  const fidelityRule =
    shape.fidelity === "verbatim"
      ? "- 어형 정합(fidelity=verbatim): 재료는 정답에 들어갈 **그 형태 그대로** 준다. 학생이 어형을 바꿀 일이 없어야 한다."
      : shape.fidelity === "inflected"
        ? "- 어형 정합(fidelity=inflected): 재료는 **기본형**(원형·단수)으로 주고 학생이 시제·수일치를 맞춰 쓰게 한다. 단, 틀린 형태를 주고 고치게 하는 어법수정형은 금지다(정상적인 어형 변화만)."
        : "- 어형 정합(fidelity=mixed): 일부는 그대로, 일부는 기본형으로 준다. 어느 쪽이든 학생이 만들 수 있는 정상 어형이어야 한다.";
  // ⚠ verbatim 배열에서는 미끼가 **파생값**이다(칩을 정답에 타일링하고 남는 것).
  // `미끼:` 줄을 따로 받으면 같은 사실을 두 번 받는 중복 계약이 되어, 줄 하나 누락에
  // "미끼 0개"+"미선언 잉여 재료" 두 건이 동시 발화한다(§1-B 철칙1 — 반의어 실사용 반려).
  const derivedDistractors = shape.mode === "scrambled" && shape.fidelity === "verbatim";
  const distractorRule =
    shape.distractors > 0
      ? `- 미끼 ${shape.distractors}개(정확히 ${shape.distractors}개): 정답에 **쓰이지 않는** 재료다. 무관한 단어는 즉시 소거돼 함정이 아니다 — 정답 단어의 동의어·활용형·반대 방향어처럼 **그 자리를 두고 실제로 경쟁**하는 것만 써라.${
          derivedDistractors
            ? " 미끼는 재료 나열 안에 섞어 두기만 하면 된다(정답에 안 쓰이는 재료를 기계가 세어 확정하므로 따로 적지 마라)."
            : " 미끼는 전부 위 재료 나열 안에 실재해야 하고, `미끼:` 줄에 **재료에 적은 문자열과 대소문자까지 똑같이** 다시 적어야 한다(표기가 한 글자라도 다르면 학생 화면에서 그 단어가 두 번 보인다)."
        }`
      : "- 미끼 0개(설정): 여분 재료를 넣지 마라. 발문이 \"쓰지 않는 단어가 포함됨\"을 안내하지 않으므로, 잉여가 있으면 학생은 전부 써야 한다고 읽고 문항이 무효가 된다.";
  const orderRule =
    shape.scrambleOrder === "scrambleStrong"
      ? "- 셔플 강도(scrambleOrder=scrambleStrong): 재료를 왼→오로 읽었을 때 정답 어순의 조각이 이어지면 안 된다. 정답 단어 사이사이에 미끼를 끼워 넣어라."
      : "- 셔플 강도(scrambleOrder=random): 재료를 무작위로 섞어라. 지문 원문 어순으로 나열하는 것도 금지다(섞은 척 원문 순서 유지 — 실측 결함).";
  return `## 재료·미끼 설계 — 하나라도 어긋나면 문항이 채점 불능이 된다
${chunkRule}
${fidelityRule}
${distractorRule}
${orderRule}
- 재료 하나가 정답 전체를 통째로 담으면 안 된다(그 순간 배열·영작이 아니라 받아쓰기다).${
    shape.mode === "scrambled"
      ? "\n- 재료 하나는 **통째로 정답에 들어가거나 통째로 남거나** 둘 중 하나여야 한다. 정답에 쓸 단어와 안 쓸 단어를 한 덩어리에 섞지 마라 — 학생이 통째로 놓을 수도 통째로 뺄 수도 없어 배열이 성립하지 않는다(미끼 덩어리가 정답에 나오는 단어들로 이루어진 것은 괜찮다. 그 단어들을 다른 재료가 이미 공급하기만 하면 된다)."
      : ""
  }
- 구두점만으로 된 재료(\`,\` \`.\` 류)를 만들지 마라.
- 정답 **안쪽**에 쉼표·세미콜론을 쓸 거면 그 부호를 재료에 **붙여서** 줘라(예: \`together,\`). 부호만 재료에서 빠지면 재료를 완벽히 배열한 학생 답안이 정답 문자열과 영원히 어긋난다(문말 마침표는 채점이 알아서 흡수하므로 신경 쓰지 않아도 된다).`;
}

// ── 블록 5·6: 마감 + 자기검산 ──

function closingBlock(shape: TswMdShape): string {
  const hintRule = shape.hintEnabled
    ? `- [주제 힌트](한국어 한 줄)를 반드시 쓴다. 강도는 ${
        shape.hintLooseness === "literal"
          ? "literal — 정답 명제를 쉬운 우리말로 거의 직역해 준다. 단, 정답 어구를 어순 그대로 옮겨 적으면 영작이 받아쓰기가 되므로 영어 어순을 베끼지 마라."
          : shape.hintLooseness === "natural"
            ? "natural — 자연스러운 의역. 정답 어구를 1:1로 옮기지 말고 문장 흐름 속에 녹여라."
            : "gist — 논지의 방향만 가리킨다(예: \"앞 문단과 대조되는 결론\"). 정답 어휘를 노출하지 마라."
      }`
    : "- [주제 힌트]는 쓰지 않는다(설정). \`힌트:\` 줄 자체를 출력하지 마라.";
  const paraphraseRule = shape.sourceSentenceParaphrase
    ? "- 빈칸 밖 프레임(고정 문구)도 지문 표면과 다르게 바꿔 써라(sourceSentenceParaphrase) — 지문을 암기한 학생이 표면 매칭으로 뚫지 못하게."
    : "";
  return `## 마감 — 위반하면 시험 요령으로 뚫린다
- **지문 통째 복사 금지(정답 무효급)**: 정답이 지문 문장의 연속 6단어 이상과 겹치면 실패다. 지문이 문항 안에 함께 인쇄되므로 학생이 찾아 베껴 쓰면 끝난다. 시제·태·구문 전환 또는 상위어 환언을 최소 하나 넣어라.
- 주제는 정확히 **하나**다. 두 개의 주제를 접속사로 이어 붙이지 마라.
- ${FORM_WORD[shape.topicForm]} 규격을 지켜라. ${
    shape.topicForm === "nounPhrase"
      ? "정동사를 넣지 마라 — 명사구는 문장이 아니다."
      : "주어와 정동사가 있는 완결 문장이어야 한다."
  }
${hintRule}${paraphraseRule ? `\n${paraphraseRule}` : ""}
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용). 합니다체 딱 2문장.`;
}

function selfCheckBlock(shape: TswMdShape): string {
  const labels = tswMdBlankLabels(shape.blankCount);
  const modeCheck =
    shape.mode === "scrambled"
      ? `- 칩을 전부 이어 붙였을 때 ${
          shape.fidelity === "verbatim" && shape.distractors === 0
            ? "정답 문장의 단어와 **과부족 없이 정확히 일치**하는지"
            : "정답을 만들 재료가 전부 있는지(미끼를 뺀 나머지로 정답이 조립되는지)"
        } 하나씩 세어 확인하라.
- 칩을 하나씩 짚으며 "이건 정답에 통째로 들어간다 / 이건 통째로 남는다"로 **전부 둘 중 하나**로 갈리는지 확인하라. 반만 쓰이는 칩이 하나라도 있으면 그 칩을 다시 쪼개거나 묶어라.
- 칩을 왼쪽에서 오른쪽으로 그냥 읽었을 때 정답 어순이 드러나지 않는지 확인하라 — 드러나면 다시 섞어라.
- 어떤 칩도 정답 문장 전체를 통째로 담고 있지 않은지 확인하라.`
      : `- 주제문에서 ${labels.join(" · ")} 를 걷어냈을 때 남는 골격에 내용 단어가 3개 이상인지 세어 보라 — 미달이면 주제문을 다시 써라.
- 각 라벨이 주제문에 **정확히 1회**만 있는지 확인하라.
- 빈칸 정답 어구(2단어 이상)가 주제문·힌트·보기 어디에도 통째로 박혀 있지 않은지 확인하라 — 박혀 있으면 그건 영작이 아니라 받아쓰기다.
- 보기 칩만으로 각 빈칸 정답을 실제로 조립할 수 있는지 하나씩 대조하라(전치사·관사까지). 같은 단어가 두 번 필요하면 칩도 두 개여야 한다.${
          shape.clueMode === "firstLetter"
            ? "\n- 단서 모드(clueMode=firstLetter): 학생 화면에는 정답 각 단어의 **첫 글자**가 자동으로 노출된다. 첫 글자만 보고 한 단어로 특정되는 뻔한 정답은 피하라."
            : shape.clueMode === "wordCount"
              ? "\n- 단서 모드(clueMode=wordCount): 학생 화면에는 정답의 **단어 수**만큼 빈칸이 자동으로 노출된다. 단어 수가 곧 단서임을 감안해 설계하라."
              : ""
        }`;
  return `## 출력 전 자기검산 (사고 안에서 수행)
- 네가 세운 주제가 지문의 **한 단락이 아니라 글 전체**를 덮는지 한 줄로 답해 보라 — 못 대면 주제를 다시 세워라.
- 정답 문장과 지문 문장을 나란히 놓고 연속 6단어 이상 겹치는 구간이 있는지 훑어라. 있으면 구문을 더 바꿔라.
${modeCheck}
- 해설 2문장이 ①주제를 어느 논리 흐름에서 도출했는지 ②학생이 어디서 흔들리는지를 각각 말하는지 확인하라.`;
}

// ── 블록 7: 출력 형식 리터럴 (파서와 1:1 계약) ──

function outputFormat(shape: TswMdShape, mode: MdExplanationMode): string {
  const labels = tswMdBlankLabels(shape.blankCount);
  const rubric = shape.scoringGranularity === "rubric" && mode !== "answer-only";
  const lines: string[] = [];

  if (shape.mode === "scrambled") {
    lines.push("방식: scrambled");
    lines.push(
      `주제문: <완성된 영어 ${FORM_WORD[shape.topicForm]} 한 줄. **이 줄이 곧 모범답안이다** — 따로 모범답안 줄을 쓰지 마라>`,
    );
    lines.push("칩: <재료1 / 재료2 / 재료3 / ...>   ← 구분자는 슬래시 하나뿐. 셔플 필수");
    // verbatim 은 미끼가 파생값이라 줄 자체를 받지 않는다(§1-B 철칙1·2 — 칸 하나 = 실패 모드 하나).
    if (shape.distractors > 0 && shape.fidelity !== "verbatim") {
      lines.push(
        `미끼: <${Array.from({ length: shape.distractors }, (_, i) => `미끼${i + 1}`).join(" / ")}>   ← 위 칩 안에 실재하는 문자열 그대로, 정확히 ${shape.distractors}개`,
      );
    }
    if (shape.hintEnabled) lines.push("힌트: <한국어 한 줄>");
    lines.push("허용답:");
    lines.push(
      "- <같은 칩으로 조립되는 등가 어순 문장 — 확신 있는 것만. 없으면 \`허용답:\` 줄과 이 줄을 통째로 생략하라>",
    );
  } else {
    lines.push("방식: cloze");
    lines.push(
      `주제문: <${labels.join(", ")} placeholder 를 각 정확히 1회 포함하는 영어 ${FORM_WORD[shape.topicForm]} 한 줄. 정답 어구는 절대 넣지 마라>`,
    );
    lines.push("보기: <칩1 / 칩2 / 칩3 / ...>   ← 구분자는 슬래시 하나뿐. 셔플 필수");
    if (shape.distractors > 0) {
      lines.push(
        `미끼: <${Array.from({ length: shape.distractors }, (_, i) => `미끼${i + 1}`).join(" / ")}>   ← 위 보기 안에 실재하는 문자열 그대로, 정확히 ${shape.distractors}개`,
      );
    }
    if (shape.hintEnabled) lines.push("힌트: <한국어 한 줄>");
    lines.push("");
    for (const label of labels) {
      lines.push(`정답${label}: <이 빈칸에 들어갈 영어 어구>`);
      lines.push(
        `동치${label}: <같은 뜻으로 인정할 다른 답 / 또 다른 답>   ← 없으면 이 줄을 생략하라`,
      );
    }
  }

  if (rubric) {
    lines.push("채점기준:");
    lines.push("- <부분점수 항목 1>");
    lines.push("- <부분점수 항목 2>");
  }
  lines.push(
    mode === "answer-only"
      ? "해설: <딱 1문장 — 주제를 어느 논리 흐름에서 도출했는지. 합니다체>"
      : "해설: <딱 2문장 — ①이 주제를 지문의 어느 논리 흐름에서 도출했는지 ②학생이 어디서 흔들리는지. 합니다체>",
  );
  return lines.join("\n");
}

/**
 * 주제문 영작 md 프롬프트.
 * 출력 계약(parser-topic-sentence-writing.ts 와 1:1):
 *   scrambled → `방식:` `주제문:`(=모범답안) `칩:` [`미끼:`] [`힌트:`] [`허용답:`] [`채점기준:`] `해설:`
 *   cloze     → `방식:` `주제문:`(placeholder 판) `보기:` [`미끼:`] [`힌트:`]
 *               `정답(A):` [`동치(A):`] … [`채점기준:`] `해설:`
 */
export function buildMdTopicSentenceWritingPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  shape: TswMdShape,
): string {
  const labels = tswMdBlankLabels(shape.blankCount);
  const task =
    shape.mode === "scrambled"
      ? `글의 ${FORM_WORD[shape.topicForm]}을 만들고 그 재료를 섞어 학생이 올바른 순서로 배열하게 하는`
      : `글의 ${FORM_WORD[shape.topicForm]}에서 핵심 어구 ${labels.length}곳(${labels.join(", ")})을 비우고 [보기]로 학생이 직접 영작하게 하는`;
  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 ${task} KILLER 서술형 문항 1개를 설계하라. 재료 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 자리에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 ${task} 서술형 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 논지 통합 필요"})를 설계하라. 재료 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshot =
    shape.mode === "scrambled" ? FEWSHOT_SCRAMBLED : FEWSHOT_CLOZE;

  const clozeExtra =
    shape.mode === "cloze"
      ? `\n\n## 빈칸 설계 (${labels.length}개${
          shape.blankCount >= 2
            ? shape.blankAssignment === "shared"
              ? " · blankAssignment=shared — 두 빈칸이 같은 [보기] 풀을 나눠 쓴다. 어느 단어를 어느 빈칸에 배분할지가 추가 판단이 되게 하라"
              : " · blankAssignment=separate — 빈칸마다 쓰이는 재료가 겹치지 않게 하라"
            : ""
        })
- 빈칸은 **다단어 어구**를 받는 자리다(한 단어 받아쓰기가 아니다). 논지를 지고 있는 어구를 비워라.
- 빈칸을 걷어낸 골격만으로도 문장이 무엇을 말하려는지 읽혀야 한다 — 골격이 \`The (A), (B).\` 수준이면 실격이다.
- ⚠ **모범답안 줄을 쓰지 마라.** 주제문의 ${labels.join(", ")} 를 정답으로 치환하면 기계가 자동 합성한다. 같은 정보를 두 번 받지 않는다.`
      : "";

  return `너는 대한민국 수능·내신 영어 서술형을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshot}

${TOPIC_DESIGN[difficulty]}
${SOURCE_MODE_RULE[shape.sourceMode]}${clozeExtra}

${materialBlock(shape)}

${closingBlock(shape)}

${selfCheckBlock(shape)}

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
- 나열 구분자는 슬래시(\` / \`) **하나뿐**이고, 목록 구분자는 대시(\`- \`) **하나뿐**이다. 표·파이프·번호 매기기를 쓰지 마라.
- 영어 어구 안에 슬래시(\`/\`)를 쓰지 마라(구분자와 충돌한다).
- \`라벨: 값\` 은 아무리 길어도 **줄바꿈 없이 한 줄**로 끝내라. 두 줄로 접으면 값이 잘린 채 저장된다.
${outputFormat(shape, mode)}

## 지문
${passage}`;
}
