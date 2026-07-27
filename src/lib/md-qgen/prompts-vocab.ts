// ============================================================================
// 어휘 적절성(VOCAB_CHOICE) md 프롬프트 — 정본 7블록 골격의 이식본.
// 견본: prompts-antonym.ts / 구조 원본: prompts.ts buildMdGrammarVariantPrompt.
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-2 · recon-synthesis §3-A2·A3.
//
// 왜 어법에서 이식하는가: 이 유형의 출력 형상은 어법과 동형이다 —
//   밑줄지문(지문 전체 축자 + [[라벨:표시어]] 인라인 마킹) → 원형·판단축 → 고침.
// 다른 것은 판단의 축뿐이다. 어법은 "이 형태가 문법적으로 성립하는가"를 묻고,
// 어휘는 "이 단어가 이 문맥의 의미를 지고 있는가"를 묻는다. 그래서 어법의
// "포인트코드 a~k(문법 범주)"가 여기서는 "판단축 코드 n·v·j·d·c(의미 범주)"로
// 번역된다 — 코드 집합만 갈아 끼우면 파서·게이트·재구성 검사가 그대로 산다.
//
// ⚠ 라벨 축은 **소문자 (a)~(j)** 다(VOCAB_CHOICE_LABELS 정본). 어법의 대문자
//   (A)~(J) 축과 다르므로 정규식·스캐폴드를 복사할 때 반드시 소문자로 바꾼다.
//
// 설계 결정(감독 보고 대상): 정본 어법은 5·1 기본 경로 문자열을 얼어붙이려고
// buildMdGrammarVariantPrompt 를 따로 뒀다(기존 실측 성능이 붙은 문자열 보존).
// 어휘는 신설 유형이라 보존할 기준선이 없고, 200줄짜리 프롬프트를 두 벌 두면
// 반드시 서로 드리프트한다. 그래서 **단일 파라미터 빌더**로 두고, 5·1·비변형
// 기본 경로의 산출 문자열은 픽스처(scripts/_test-md-vocab.ts)가 고정한다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 지문 밑줄 라벨 축 — 소문자 (a)~(j). VOCAB_CHOICE_LABELS 정본과 동일 순서. */
export const VOCAB_MD_LABELS = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j",
] as const;

export const VOCAB_MD_MARKER_COUNT_MIN = 5;
export const VOCAB_MD_MARKER_COUNT_MAX = 10;
export const VOCAB_MD_ANSWER_COUNT_MIN = 1;

/** 판단축 코드 닫힌 집합 — 파서·게이트와 1:1 계약(파서가 이 집합 밖을 반려한다). */
export const VOCAB_MD_AXIS_CODES = ["n", "v", "j", "d", "c"] as const;

const VOCAB_MD_AXIS_LIST =
  "(n)지시대상·의미장 (v)동작 방향·극성 (j)정도·평가 극성 (d)논리 연결(인과·양보·조건) (c)연어·공기제약";

export function clampVocabMdMarkerCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return VOCAB_MD_MARKER_COUNT_MIN;
  return Math.min(VOCAB_MD_MARKER_COUNT_MAX, Math.max(VOCAB_MD_MARKER_COUNT_MIN, n));
}

export function clampVocabMdAnswerCount(value: unknown, markerCount: number): number {
  const marker = clampVocabMdMarkerCount(markerCount);
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return VOCAB_MD_ANSWER_COUNT_MIN;
  return Math.min(marker, Math.max(VOCAB_MD_ANSWER_COUNT_MIN, n));
}

// 정답 예시 라벨은 홀수 인덱스부터 뽑는다 — (a) 부터 채우면 모델이 예시 라벨을
// 실제 정답으로 앵커링한다(정본 grammarAnswerExample 선례, prompts.ts:257-265).
function vocabAnswerExample(markerCount: number, answerCount: number): string {
  const picked: number[] = [];
  for (let i = 1; i < markerCount && picked.length < answerCount; i += 2) picked.push(i);
  for (let i = 0; i < markerCount && picked.length < answerCount; i += 2) picked.push(i);
  picked.sort((a, b) => a - b);
  return picked.map((i) => `(${VOCAB_MD_LABELS[i]})`).join(", ");
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다(정본 확정 결론).
// 반드시 "이 설계가 아름다운 이유" 1줄을 포함한다.
const VOCAB_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 지문·표현을 복사하지는 마라)
지문: 도시 가로수가 여름 지표 온도를 낮추지만 관리 비용 때문에 지자체가 식재를 미룬다는 글.
- 표적 선정: mitigates · postpone · substantial · offset · scarce — 전부 논지를 지고 있는 내용어이고, 지문 전체에서 **딱 한 번씩만** 등장한다. 관사·전치사, 그리고 두 번 이상 나오는 단어는 밑줄 자리가 유일하게 확정되지 않아 처음부터 후보에서 뺐다.
- 정답 자리 설계(방향 반전, 축 v): 원문 "canopy cover mitigates summer heat" 의 mitigates 를 intensifies 로 바꿨다. 바로 다음 문장이 "그늘이 지표 온도를 3도 낮춘다"고 결과를 명시하므로 방향이 뒤집혔음이 확정되지만, 밑줄 문장만 떼어 읽으면 heat 와 intensifies 의 연어가 오히려 자연스러워 표면 매칭으로는 걸리지 않는다.
- 미끼 설계(축 분산): postpone(d — 비용 때문에 "미룬다"가 인과에 맞는가) · substantial(j — "상당한"이 뒤의 수치와 맞는가) · offset(v 이지만 정답과 다른 문장) · scarce(n — 예산의 "부족"이라는 의미장). 넷 다 학생이 한 번은 멈춰 문장으로 되돌아가야 하는 자리다.
- 이 설계가 아름다운 이유: 정답을 확정하려면 밑줄이 있는 문장이 아니라 **그다음 문장의 수치**까지 읽어야 한다. 단어 뜻만 아는 학생은 intensifies 를 자연스럽다고 넘기고, 문맥을 읽은 학생만 방향이 뒤집힌 것을 본다. 즉 이 문항은 어휘력이 아니라 독해를 채점한다.`;

// 표적 설계 — 난이도 3분기. 공통 불변식(위치 유일성·기능어 배제)은 세 갈래
// 모두에 싣는다(게이트가 실제로 검사하는 항목이라 빠지면 반려율이 뛴다).
function vocabTargetSection(difficulty: MdDifficulty, markerCount: number): string {
  const common = [
    `- 밑줄 ${markerCount}곳은 지문 전역에 흩어라 — 한 문장에 두 개 금지, 첫 문장 금지.`,
    "- 각 자리의 원문 단어는 지문 전체에서 **딱 한 번만** 등장해야 한다. 두 번 이상 나오는 단어를 고르면 밑줄 자리가 확정되지 않고, 남은 지문이 정답 단어를 그대로 흘려 문항이 죽는다.",
    "- 밑줄은 내용어(동사·명사·형용사·부사)만. 관사·전치사·접속사·대명사·조동사·고유명사·숫자는 실격이다.",
  ];
  if (difficulty === "BASIC") {
    return [
      "## 표적 설계 (기본 난이도)",
      ...common,
      "- 정답 자리는 **그 문장 안에서** 의미가 어긋남이 드러나는 자리로 고른다(근거 깊이 1문장). 교과서 수준의 확인형이면 충분하다.",
      "- 비정답 자리는 뜻이 명확한 단어로 두되, 지문 없이도 소거되는 초등 기초 어휘로 전 칸을 채우지는 마라.",
    ].join("\n");
  }
  if (difficulty === "INTERMEDIATE") {
    return [
      "## 표적 설계 (중급 난이도)",
      ...common,
      "- 정답 자리는 앞뒤 두 문장의 논리 방향(인과·대조·양보)을 맞대봐야 어긋남이 드러나는 자리로 고른다(근거 깊이 2문장). 밑줄 문장 하나만 읽고 판별되면 미달이다.",
      "- 오용어는 반의어 1:1 교체가 아니라 **근접 오용**이어야 한다 — 같은 의미장의 이웃어, 정도·범위 이동, 연어 위반 중에서 고른다.",
    ].join("\n");
  }
  return [
    "## 표적 설계",
    ...common,
    "- 정답 자리는 글의 논지가 수렴하는 문장(중반 이후의 주제문·인과의 귀결)에 둔다. 근거는 서로 다른 문장 2개 이상에 흩어져 있어 종합해야만 어긋남이 확정되게 하라.",
    "- 오용어는 **밑줄 문장 안에서는 완벽히 자연스러워야 한다** — 품사·굴절·연어가 전부 맞아서, 그 문장만 읽으면 오히려 원문보다 매끄러워 보이는 단어를 골라라. 어긋남은 오직 지문 논리로만 드러나야 한다.",
    "- 학생이 표면 매칭(밑줄 단어와 옆 명사의 흔한 연어)으로 뚫으려 할 지점을 먼저 계산하고, 그 매칭이 성립하는 단어를 정답으로 심어라. 학생 머리 꼭대기에서 설계한다는 것이 이 뜻이다.",
  ].join("\n");
}

// 오용 기제 분류학 — 정답 K곳에 서로 다른 축을 배분시키는 닫힌 집합.
function vocabMisuseTaxonomy(difficulty: MdDifficulty, answerCount: number): string {
  const head =
    answerCount >= 2
      ? `## 오용 기제 분류학 — 정답 ${answerCount}곳에 서로 다른 축을 배분하라 (같은 축 두 번 금지)`
      : "## 오용 기제 분류학 — 정답 자리의 축을 하나 정해 그 축만 배반시켜라";
  const tail =
    difficulty === "BASIC"
      ? "- 기본 난이도는 1(방향 반전)·2(의미장 이웃어)로 충분하다. 다만 철자만 비슷한 단어를 넣는 식의 형태 함정은 금지 — 그건 어휘 판단이 아니다."
      : "- 반의어 1:1 교체(increase → decrease 로 끝나는 설계)는 금지다. 3·4·5 를 우선하고, 1·2 를 쓰더라도 밑줄 문장 안에서는 자연스럽게 읽히는 단어로 골라라.";
  return [
    head,
    "1. **방향 반전 (v)**: 동작·변화의 방향이나 극성을 뒤집는다. 결과를 명시한 다음 문장이 반증이 되게 배치하라.",
    "2. **의미장 이웃어 (n)**: 같은 주제 영역에 속하지만 지시 대상이 다른 단어로 갈아 끼운다. 주제어만 보면 어울려 보인다.",
    "3. **정도·범위 이동 (j)**: 강도·범위·평가 극성을 옮긴다(전면적↔부분적, 필수적↔선택적, 칭찬↔폄하).",
    "4. **논리 연결 배반 (d)**: 인과·양보·조건의 방향을 배반하는 단어를 넣는다(원인 자리에 결과어, 양보 자리에 순접어).",
    "5. **연어 위반 (c)**: 문법은 성립하지만 그 명사·전치사와 실제로 공기하지 않는 동사·형용사. 문장을 소리 내어 읽어야 걸린다.",
    "- 소재 구속: 오용어는 전부 이 지문의 소재·논리 안에서 만들어라. 지문에 없는 분야 개념을 수입하면 학생이 지문을 안 읽고도 소거한다 — 그건 함정이 아니라 장식이다.",
    "- 층위 일치: 오용어는 원문 단어와 품사·굴절·수·시제가 완전히 같아야 한다. 형태가 튀면 문맥 판단 없이 정답이 드러나 실격이다.",
    "- 구동사 주의: 원문이 `leave out` 같은 구동사면 머리만 바꾸지 마라(`include out` 같은 비존재 결합이 만들어져 문법 파손만으로 정답이 노출된다). 통째로 바꾸거나 그 자리를 피하라.",
    tail,
  ].join("\n");
}

// 동의어 변장 모드(synonymVariants) — base 의 "비정답은 원문 그대로" 지시를
// 뒤집으므로 헤더에 우선순위를 명시한다(정본 설정 블록 규약).
function vocabVariantSection(markerCount: number, answerCount: number): string {
  const wrongCount = markerCount - answerCount;
  return [
    "## 동의어 변장 모드 (교사 설정 — 위 '밑줄지문' 의 '나머지는 원문 그대로' 지시보다 우선한다)",
    `- 목적: 지문을 통째로 외운 학생이 "원문과 다른 단어 = 정답" 이라는 표면 매칭으로 뚫는 길을 막는다. 그래서 밑줄 ${markerCount}곳 **전부**의 표시어가 원문 단어와 달라야 한다.`,
    `- 비정답 ${wrongCount}곳: 그 자리에 완벽히 들어맞는 근접 동의어로 표시한다. 품사·굴절·수·시제·연어가 원문 단어와 같아야 하고, 문장에 되꽂아 읽었을 때 논쟁의 여지 없이 옳아야 한다. 고풍스럽거나 문체가 튀는 단어를 고르면 그 자체가 오류처럼 읽혀 실격이다.`,
    `- 정답 ${answerCount}곳: 계약 그대로다 — 원형은 지문 축자 원문 단어, 표시어는 문맥상 틀린 단어.`,
    "- 🚫 비정답의 표시어가 어떤 정답 자리의 원문 단어와 같으면 정답이 통째로 노출된다 — 실격.",
    "- 표시어 전체의 난이도·문체 대역을 맞춰라. 정답 자리만 낯선 단어면 변장의 의미가 없다.",
    "- ⚠ '원형·판단축' 의 원형은 변장 여부와 무관하게 **항상 지문 축자 원문 단어**다. 그것이 밑줄 자리를 찾는 유일한 열쇠이고, 여기에 동의어를 적으면 문항 전체가 저장 단계에서 죽는다.",
  ].join("\n");
}

// 해설 블록 — 정답/고침/해설/오답 형식 리터럴(parser-vocab.ts 와 1:1 계약).
function vocabExplanationBlock(
  mode: MdExplanationMode,
  markerCount: number,
  answerCount: number,
): string {
  const lastLabel = VOCAB_MD_LABELS[markerCount - 1];
  const wrongCount = markerCount - answerCount;
  const fixExample = vocabAnswerExample(markerCount, 1);
  const answerLine =
    answerCount === 1
      ? `정답: <(a)~(${lastLabel}) 하나>`
      : `정답: <정답 라벨 ${answerCount}개를 ", " 로 병기 — 예: ${vocabAnswerExample(markerCount, answerCount)}>`;
  const fixLine =
    answerCount === 1
      ? `고침${fixExample}: <그 자리의 원문 단어 — '원형·판단축' 의 같은 라벨 원형과 한 글자도 다르면 안 된다. 라벨 ${fixExample} 는 예시이고 실제 정답 라벨을 쓴다>`
      : `고침${fixExample}: <그 자리의 원문 단어 — 정답 라벨마다 이 형식으로 한 줄씩 총 ${answerCount}줄. 라벨 ${fixExample} 는 예시이고 실제 정답 라벨을 쓴다>`;
  const expCore =
    answerCount === 1
      ? "딱 2문장 — 그 자리가 요구하는 의미축이 무엇이고 표시된 단어가 왜 그 축을 배반하는지. 근거 문장을 지목할 것. 합니다체"
      : `정답 라벨당 1~2문장 — 각 정답이 배반하는 의미축과 근거 문장. 합니다체`;
  if (mode === "answer-only") {
    return `${answerLine}\n${fixLine}\n해설: <${expCore}. 오답 해설은 쓰지 마라>`;
  }
  if (wrongCount === 0) {
    return `${answerLine}\n${fixLine}\n해설: <${expCore}. 모든 밑줄이 정답이므로 오답 섹션은 쓰지 마라>`;
  }
  return `${answerLine}
${fixLine}
해설: <${expCore}>
오답:
(a) <이 자리 단어가 이 문맥에서 왜 적절한지, 학생이 어디서 헷갈리는지 1문장> (정답 라벨은 제외하고 ${wrongCount}개만)
...`;
}

/**
 * 어휘 적절성 md 프롬프트.
 * 출력 계약(parser-vocab.ts 와 1:1): `밑줄지문:` [[a:표시어]] 인라인 마킹 +
 * `원형·판단축:` 라벨 라인(`(a) 원문단어 | 축코드`) + `정답:` + `고침(x):` +
 * `해설:` + `오답:`.
 */
export function buildMdVocabPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { markerCount?: number; answerCount?: number; synonymVariants?: boolean },
): string {
  const markerCount = clampVocabMdMarkerCount(opts?.markerCount ?? VOCAB_MD_MARKER_COUNT_MIN);
  const answerCount = clampVocabMdAnswerCount(
    opts?.answerCount ?? VOCAB_MD_ANSWER_COUNT_MIN,
    markerCount,
  );
  const synonymVariants = opts?.synonymVariants === true;
  const labels = VOCAB_MD_LABELS.slice(0, markerCount);
  const lastLabel = labels[labels.length - 1];
  const wrongCount = markerCount - answerCount;

  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 밑줄 ${markerCount}곳 중 "문맥상 낱말의 쓰임이 적절하지 않은 것" ${answerCount}개짜리 KILLER 문항 1개를 설계하라. 밑줄 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 자리에서 표면 매칭으로 뚫으려 할지를 계산하고 그 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 밑줄 ${markerCount}곳 중 "문맥상 낱말의 쓰임이 적절하지 않은 것" ${answerCount}개짜리 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 한 문장 안의 문맥 확인형" : "중급 — 앞뒤 두 문장의 논리 방향을 대조해야 드러나는 형"})를 설계하라. 밑줄 하나하나에 명확한 출제 의도가 있어야 한다.`;

  // BASIC 은 few-shot 생략 — 정본 어법 빌더 선례(prompts.ts:386-389).
  const fewshotBlock = difficulty === "BASIC" ? "" : `${VOCAB_FEWSHOT}\n\n`;

  const variantBlock = synonymVariants
    ? `${vocabVariantSection(markerCount, answerCount)}\n\n`
    : "";

  const closingRules = [
    "## 마감 — 위반하면 시험 요령으로 뚫린다",
    wrongCount > 0
      ? `- 즉사 오답 금지: 비정답 ${wrongCount}곳 중 최소 2곳은 상위권도 한 번은 의심하고 문장으로 되돌아가야 한다. 눈에 띄게 평범한 단어로만 채우면 정답이 소거로 드러난다.`
      : `- 밑줄 ${markerCount}곳 전부가 정답인 문항이다. 자리마다 서로 다른 의미축을 배반시키고, 각 오용어는 그 문장 안에서 로컬로 자연스러워 보여야 한다.`,
    "- 정답 자리의 원문 단어(= 고침 값)가 지문의 다른 곳에 또 등장하면 안 된다. 대소문자만 다른 형태(문두 대문자)도 등장으로 친다 — 남은 지문이 정답을 흘리면 문항이 죽는다.",
    "- 밑줄에 표시하는 단어(오용어·동의어 포함)는 다른 밑줄의 표시어·원문 단어와 절대 같으면 안 된다. 선지 두 개가 글자까지 같아지면 정답이 유일하지 않아 실격이다.",
    "- 밑줄 표시어와 원형은 각각 한 단어(또는 하이픈으로 결합된 한 덩어리)로 쓴다. 구·절·괄호 뜻풀이·설명구 금지.",
    "- 밑줄 단어들의 난이도·길이 대역을 맞춰라. 정답 자리만 유독 낯설거나 길면 그 자체가 단서가 된다.",
  ].join("\n");

  const selfCheck = [
    "## 출력 전 자기검산 (사고 안에서 수행)",
    "- 밑줄지문의 마커를 전부 '원형·판단축' 의 원형으로 되돌린 텍스트가 원 지문과 한 글자도 다르지 않은지 확인하라 — 구두점·대소문자·띄어쓰기 포함. 마커 밖 문장을 하나라도 고쳐 썼다면 그 시점에 문항은 무효다.",
    "- 각 원형이 지문에 정확히 1회 등장하는지 세어보라(대소문자 무시하고 센다). 2회 이상이면 그 표적을 버리고 다른 단어를 골라라.",
    "- 밑줄 표시어를 전부 모아 같은 단어가 두 번 나오는지, 다른 밑줄의 원문 단어와 겹치는지 대조하라 — 하나라도 겹치면 그 자리를 다시 설계하라.",
    `- 라벨 (a)~(${lastLabel}) 이 지문 등장 순서대로 붙었는지, 원형·판단축 섹션도 같은 순서인지 확인하라.`,
    "- '고침(x):' 값이 '원형·판단축' 의 같은 라벨 원형과 축자로 같은지 대조하라 — 다르면 저장 단계에서 반려된다.",
    `- 정답 ${answerCount}곳 각각에 대해 "이 단어가 어긋난다는 근거 문장은 무엇인가"를 한 줄로 답해보라 — 못 대면 표적 재설계.`,
    ...(wrongCount > 0
      ? [
          `- 비정답 ${wrongCount}곳 각각에 대해 "이 단어가 이 자리에 맞는 이유"를 한 줄로 답해보라 — 못 대는 자리는 밑줄을 옮겨라.`,
          "- 오답 목록에 정답 라벨을 절대 포함하지 마라.",
        ]
      : []),
    ...(synonymVariants
      ? [
          "- 비정답 표시어가 전부 원문과 다른 근접 동의어인지, 그리고 어떤 정답 자리의 원형과도 같지 않은지 확인하라.",
        ]
      : ["- 비정답 표시어가 전부 원문 단어와 축자로 같은지 확인하라(정답 자리만 달라야 한다)."]),
    "- 해설에 \"무엇을 무엇으로 바꿨다\"는 출제 과정을 쓰지 마라 — 학생에게는 왜 이 문맥에 어긋나는지만 설명한다.",
    "- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).",
  ].join("\n");

  const underlineContract = synonymVariants
    ? `<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 ${markerCount}곳만 [[a:표시어]] ~ [[${lastLabel}:표시어]] 로 감싸되, 표시어는 **${markerCount}곳 모두** 원문 단어와 다른 단어여야 한다. 비정답 ${wrongCount}곳은 그 자리에 완벽히 들어맞는 근접 동의어(품사·굴절·수·시제·연어 동일)로, 정답 ${answerCount}곳은 문맥상 틀린 단어로 바꿔라. 비정답 동의어가 어떤 정답 자리의 원문 단어와 같으면 실격이다. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다 — 문장 추가·삭제·재배열·구두점 변경 전부 금지.>`
    : `<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 ${markerCount}곳만 [[a:표시어]] ~ [[${lastLabel}:표시어]] 로 감싼다. 정답 ${answerCount}곳만 표시어가 원문과 다른 오용어이고, 나머지 ${wrongCount}곳은 원문 단어 그대로다. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다 — 문장 추가·삭제·재배열·구두점 변경 전부 금지.>`;

  const scaffold = [
    `(a) <이 자리의 원문 단어(지문 축자 그대로 — 정답 자리도 마커 안 오용어가 아니라 원문 단어를 적는다)> | <판단축 코드: ${VOCAB_MD_AXIS_CODES.join("·")} 중 한 글자만, 괄호·설명 금지>`,
    ...labels.slice(1).map((l) => `(${l}) ...`),
  ].join("\n");

  return `너는 대한민국 수능 영어영역 어휘 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}${vocabTargetSection(difficulty, markerCount)}

## 판단축 코드 — 각 밑줄이 무엇을 묻는지 한 글자로 선언하라
- 닫힌 집합: ${VOCAB_MD_AXIS_LIST}
- 밑줄 ${markerCount}곳의 축은 최소 3종으로 분산하라. 같은 축만 늘어놓으면 학생이 한 가지 요령으로 전부 처리한다.

${vocabMisuseTaxonomy(difficulty, answerCount)}

${variantBlock}${closingRules}

${selfCheck}

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
${underlineContract}

원형·판단축:
${scaffold}
${vocabExplanationBlock(mode, markerCount, answerCount)}

## 지문
${passage}`;
}
