// md-lab 공예 프롬프트 (grok 원큐·마크다운 출력) — md-oneshot.mjs 실측 형상 그대로.
// 어법 50~65s·빈칸 66~78s / 28~44원, 게이트 위반 0/6 (O208 계열 실측).

export type MdExplanationMode = "full" | "answer-only";

function blankExplanationBlock(mode: MdExplanationMode): string {
  if (mode === "answer-only") {
    return `정답: <①~⑤ 하나>
해설: <딱 2문장 — 근거 문장 연결과 정답 도출만. 합니다체. 오답 해설은 쓰지 마라>`;
  }
  return `정답: <①~⑤ 하나>
해설: <딱 2문장 — 근거 문장 연결과 정답 도출만. 합니다체>
오답:
① <기제이름 — 왜 매력적이고 왜 탈락인지 1문장> (정답 번호는 제외하고 오답 4개만)
...`;
}

function grammarExplanationBlock(mode: MdExplanationMode): string {
  if (mode === "answer-only") {
    return `정답: <(A)~(E) 하나>
고침: <정답 자리를 고친 원형>
해설: <딱 2문장 — 구조 근거와 왜 비문인지만. 합니다체. 오답 해설은 쓰지 마라>`;
  }
  return `정답: <(A)~(E) 하나>
고침: <정답 자리를 고친 원형>
해설: <딱 2문장 — 구조 근거와 왜 비문인지만. 합니다체>
오답:
(A) <학생이 헷갈리는 지점 + 왜 옳은지 1문장> (정답 라벨 제외 4개만)
...`;
}

// 빈칸 few-shot — 기제 분류학이 완전 실행된 실물의 해부(사용자 확정 기준점).
const BLANK_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 전문 지식 공동체(epistemic communities)가 과거의 비밀주의에서 개방으로 이동했지만, 외부인은 수년의 훈련 없이는 공유된 정보를 이해할 수 없다는 글.
- 빈칸: "Nonetheless, for most outsiders ___" — 역접 직후, 글 전체 논지가 수렴하는 자리.
- 정답: "관행의 단순한 가시성만으로는 이해의 내재적 장벽을 허물기에 불충분하다" — 원문 표현("훈련 없이는 이해 불가")의 표면 어휘를 하나도 재사용하지 않은 추상 재진술.
- 오답 설계(기제 각 1개, 중복 없음): ②방향반대 — 앞부분에 후반 핵심어구 '개방으로의 전환'을 그대로 실어 정답처럼 보이게 하고, 뒷부분에서 '장벽을 무력화한다'로 논지를 뒤집으며 전반부 지엽(충성도 테스트)을 결합. ③도입부함정 — 논지 전환 전의 '비밀주의' 서술에 시야가 갇힌 선지. ④범위확대 — 지문에 없는 해결책('공교육이 훈련을 대체')으로 확장. ⑤근거없음 — '유출이 공동체를 파괴한다'는 통념(텍스트 근거 0).
- 이 설계가 아름다운 이유: 오답마다 "이 학생은 왜 이걸 고르는가"의 답이 뚜렷하고, 방향반대 선지가 끝까지 정답과 경합한다.`;

export type MdDifficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

// 비킬러 난이도의 표적·정답 설계 절 — 프로덕션 난이도 루브릭(constants.ts) 정합.
const BLANK_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 표적 설계 (기본 난이도)
- 빈칸은 글의 요지가 드러나는 문장에 뚫되, 빈칸 문장 안 또는 바로 옆 문장의 재진술만으로 정답이 확인되게 하라(근거 깊이 1문장).
- 정답은 원문 근거가 직접 드러나는 명료한 표현. 함정 선지는 명백히 구분되게 하되 각자 그럴듯한 이유는 있어야 한다.
- 빈칸원문은 지문 축자(한 글자도 변경 금지), 문장 통째 삼킴 금지. 첫 문장에는 뚫지 마라.`,
  INTERMEDIATE: `## 표적 설계 (중급 난이도)
- 빈칸은 논지 연결부에 뚫어라 — 인과 또는 대조 논리로 서로 다른 두 문장을 이어야 정답이 도출되게(근거 깊이 2문장). 빈칸 문장 하나만 읽고 풀리면 미달.
- 정답은 쉬운 패러프레이즈(원문 한 문장 복사 금지). 오답은 지문 일부와 연결되지만 핵심 논리에서 어긋나게.
- 빈칸원문은 지문 축자(한 글자도 변경 금지), 문장 통째 삼킴 금지. 첫 문장에는 뚫지 마라.`,
  KILLER: `## 표적 설계
- 빈칸은 글의 논지가 수렴하는 자리(중반 이후의 주제문·결론·인과의 귀결). 첫 문장에는 뚫지 마라.
- 빈칸 바로 앞뒤 문장이 정답을 거의 그대로 풀어 써 놓은 자리는 피하라 — 근거가 서로 다른 문장 2개 이상에 흩어져 있어 종합해야만 풀리는 자리를 골라라.
- 정답은 원문 표면 어휘를 재사용하지 않는 추상 패러프레이즈(핵심 명사·동사 재사용 0개 목표).
- 빈칸원문은 지문 축자(한 글자도 변경 금지), 문장 통째 삼킴 금지.`,
};

export function buildMdBlankPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
): string {
  const headline =
    difficulty === "KILLER"
      ? "아래 지문으로 '빈칸 추론' KILLER 문항 1개를 설계하라. 선지 다섯 개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 지점에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라."
      : `아래 지문으로 '빈칸 추론' 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 선지 다섯 개 하나하나에 명확한 출제 의도가 있어야 한다.`;
  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

${BLANK_FEWSHOT}

${BLANK_TARGET_BY_DIFFICULTY[difficulty]}

## 오답 4개 — 기제 4종을 정확히 1개씩 (같은 기제 2개 금지)
1. 방향반대(최매력 오답): 앞부분에 글의 핵심어구를 그대로 실어 정답처럼 보이게 하고, 뒷부분에서 논지를 뒤집거나 지엽 정보를 결합한다.
2. 도입부함정: 논지 전환(however 류) 이전 내용에 시야가 갇힌 학생이 고르는 선지.
3. 범위확대 또는 세부확대: 지문의 소재를 쓰되 지문이 말하지 않은 범위·해결책·일반화로 확장.
4. 근거없음(통념형): 그럴듯하지만 텍스트에 논리 근거가 없는 서술.
- 소재 구속: 오답 4개 전부 "지문에 실재하는 소재·어휘"를 재료로 만들어라. 지문에 등장하지 않는 다른 분야 개념(예: 지문에 없는 기술 플랫폼·학문 용어·정책 방안)을 들여오면 학생이 지문을 안 읽고도 소거한다 — 그건 함정이 아니라 장식이다.
- 층위 일치: 빈칸이 병렬 나열(to-V, to-V, and ___ 류)의 한 항목이면, 다섯 선지 전부 그 병렬의 문법 형식과 의미 층위(예: "독자가 얻는 것")를 일치시켜라 — 층위가 어긋난 선지는 병렬 구조만 보고 걸러진다.

## 마감 — 위반하면 시험 요령으로 뚫린다
- 즉사 오답 금지: 4개 중 최소 2개는 상위권 학생도 정답과 끝까지 저울질해야 한다. 극성만 확인하면 소거되는 선지를 3개 이상 만들지 마라.
- 절대 표현(completely·never·unconditionally 류)을 오답에만 몰지 마라. 선지 길이는 서로 ±3단어 이내.

## 출력 전 자기검산 (사고 안에서 수행)
- 각 오답이 왜 틀렸는지 지문 근거로 한 줄씩 답해보라 — 근거를 못 대는 오답은 재설계.
- 빈칸 문장 하나만 읽고 풀리는지 검사 — 풀리면 표적 재선정.
- 기제가 겹치는 오답이 없는지 확인.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
빈칸원문: <지문에서 뚫을 원문 구>
① <선지>
② <선지>
③ <선지>
④ <선지>
⑤ <선지>
${blankExplanationBlock(mode)}

## 지문
${passage}`;
}

// ---------------------------------------------------------------------------
// 다중 빈칸 조합형 (blankCount 2~3) — 26-07-23 신설 (md 다중 형식 스펙 v1).
// 형식 리터럴은 parser.ts parseMdMultiBlank 와 1:1 계약 — 빈칸원문(A): 라벨
// 라인, 선지 값 구분자 " …… "(공백+…+…+공백). 단일 빈칸 경로(buildMdBlankPrompt·
// BLANK_FEWSHOT)는 바이트 무변경 — BLANK_FEWSHOT 은 단일 서사라 재사용하지 않는다.
// ---------------------------------------------------------------------------

const MULTI_BLANK_MD_LABELS = ["A", "B", "C"] as const;
const MULTI_BLANK_MD_CIRCLED = ["①", "②", "③", "④", "⑤"] as const;

// 다중 빈칸 해설 블록 — 정답·해설·오답 형식(파서 계약 리터럴).
function multiBlankExplanationBlock(mode: MdExplanationMode): string {
  if (mode === "answer-only") {
    return `정답: <①~⑤ 하나>
해설: <2~3문장 — 각 빈칸의 근거 문장을 연결해 정답 조합을 도출. 합니다체. 오답 해설은 쓰지 마라>`;
  }
  return `정답: <①~⑤ 하나>
해설: <2~3문장 — 각 빈칸의 근거 문장을 연결해 정답 조합을 도출. 합니다체>
오답:
① <어느 빈칸의 어떤 값이 왜 어긋나는지 1문장 — 한 빈칸만 틀린 선지는 그 사실을 명시> (정답 번호는 제외하고 오답 4개만)
...`;
}

// 다중 빈칸 표적 설계 절 — 프로덕션 난이도 루브릭 정합(단일 빈칸 절과 별도:
// 조합형은 "빈칸들이 논지 축을 분담"하는 배치 설계가 핵심이라 서사가 다르다).
function multiBlankTargetSection(
  difficulty: MdDifficulty,
  blankCount: number,
): string {
  if (difficulty === "BASIC") {
    return `## 표적 설계 (기본 난이도)
- 각 빈칸은 글의 요지가 드러나는 문장에 뚫되, 빈칸 문장 안 또는 바로 옆 문장의 재진술만으로 그 빈칸의 값이 확인되게 하라(빈칸별 근거 깊이 1문장).
- 오답 조합은 명백히 구분되게 하되 각자 그럴듯한 이유는 있어야 한다.`;
  }
  if (difficulty === "INTERMEDIATE") {
    return `## 표적 설계 (중급 난이도)
- 빈칸들은 논지의 전개 축 위에 뚫어라 — 최소 한 빈칸은 인과 또는 대조 논리로 서로 다른 두 문장을 이어야 값이 도출되게(근거 깊이 2문장).
- 오답 조합은 지문 일부와 연결되지만 핵심 논리에서 어긋나게.`;
  }
  return `## 표적 설계
- 빈칸 ${blankCount}개는 글의 논지가 지나가는 급소들이다 — 원인·귀결·재진술·대조처럼 논지 축의 서로 다른 마디에 하나씩 뚫어, 전부 맞혀야 글 전체를 재구성한 것이 되게 하라.
- 각 빈칸의 근거가 빈칸 문장 하나에 갇히지 않게 하라 — 앞뒤 문장을 종합해야만 값이 확정되는 자리를 골라라.`;
}

/**
 * 다중 빈칸 조합형 프롬프트 (blankCount 2~3).
 * 출력 계약: 빈칸원문(A)~ 라벨 라인 + 조합 선지 5개(값 " …… " 연결) + 정답/해설/오답.
 * answerMode: PARAPHRASE = 정답 조합 전부 재진술(축자 복사 금지) / SOURCE_EXACT = 축자.
 */
export function buildMdMultiBlankPrompt(
  passage: string,
  mode: MdExplanationMode,
  difficulty: MdDifficulty,
  blankCount: 2 | 3,
  answerMode: "PARAPHRASE" | "SOURCE_EXACT",
): string {
  const labels = MULTI_BLANK_MD_LABELS.slice(0, blankCount);
  const labelsText = labels.map((l) => `(${l})`).join(", ");
  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 빈칸 ${labelsText} 조합형 '빈칸 추론' KILLER 문항 1개를 설계하라. 빈칸 ${blankCount}개와 조합 선지 다섯 개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 빈칸에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 빈칸 ${labelsText} 조합형 '빈칸 추론' 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 빈칸 ${blankCount}개와 조합 선지 다섯 개 하나하나에 명확한 출제 의도가 있어야 한다.`;
  const answerModeSection =
    answerMode === "PARAPHRASE"
      ? `## 정답 조합 — 재진술(PARAPHRASE) 모드
- 정답 선지의 값 ${blankCount}개는 각 빈칸원문의 의미 등가 재진술이어야 한다 — 원문 축자 복사 금지, 원문의 핵심 명사·동사 재사용을 피하라.
- 재진술이라도 그 자리 문법 슬롯에는 정확히 꽂혀야 한다. 오답 값들과 길이·추상도를 맞춰 정답이 표면 단서만으로 드러나지 않게 하라.`
      : `## 정답 조합 — 원문 축자(SOURCE_EXACT) 모드
- 정답 선지의 값 ${blankCount}개는 각 빈칸원문과 축자로 동일해야 한다(한 글자도 변경 금지, ${labelsText} 순서 그대로).
- 오답 값들은 원문과 다른 표현이되 열 병렬을 지켜, 정답이 "원문스러움"만으로 드러나지 않게 하라.`;
  const paraphraseCheck =
    answerMode === "PARAPHRASE"
      ? `\n- 정답 값이 원문과 사실상 동일한 near-verbatim 이 아닌지 확인 — 단어 한두 개 바꾼 것은 재진술이 아니다.`
      : "";
  const sourceLines = labels
    .map((l) => `빈칸원문(${l}): <${l} 빈칸으로 뚫을 원문 구 — 지문 축자>`)
    .join("\n");
  const optionShape = labels.map((l) => `<${l}값>`).join(" …… ");
  const optionLines = MULTI_BLANK_MD_CIRCLED.map((c) => `${c} ${optionShape}`).join("\n");
  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

${multiBlankTargetSection(difficulty, blankCount)}

## 빈칸 공예 — 조합형의 생명
- 빈칸 ${blankCount}개는 반드시 서로 다른 문장에 뚫는다. 한 문장에 두 개 금지, 첫 문장 금지, 문장 통째 삼킴 금지.
- 각 빈칸원문은 지문 축자(한 글자도 변경 금지)이며, 내용어가 든 의미 단위(동사구·수식 명사구·짧은 절)여야 한다 — "doing things" 류의 속 빈 경량구는 실격.
- 빈칸원문(과 그 핵심 부분·가까운 동의어)이 지문의 다른 곳에 다시 등장하는 자리는 금지 — 남은 지문이 정답을 흘리면 문항이 죽는다.
- 한 빈칸을 풀면 나머지가 자동으로 풀리는 배치는 금지 — 빈칸마다 독립된 판단 근거가 있어야 한다.

${answerModeSection}

## 조합 선지 5개 — 열과 행을 모두 설계하라
- 선지마다 ${labelsText} 순서대로 값 ${blankCount}개를 " …… " 로 연결한다(구분자 리터럴 고정, 다른 구분자 금지).
- 열 병렬: 같은 빈칸 자리의 값 다섯은 전부 그 자리의 문법 슬롯에 그대로 꽂혀야 한다(품사·형태 일치). 꽂아 읽었을 때 비문이 되는 값은 실격.
- 오답 조합의 재료는 전부 지문에 실재하는 소재·논리다 — 극성 반전, 범위 확대, 인과 역할 뒤바꿈, 논지 방향 어긋남으로 만들되, 지문 밖 개념 수입 금지.
- near-miss 필수: 정답 조합에서 딱 한 빈칸만 틀린 선지를 최소 1개 만들어라 — 학생이 모든 빈칸을 검증해야만 풀리게 하는 장치다.
- 같은 값 조합의 선지 중복 금지. 열별로 값 길이는 서로 ±3단어 이내.

## 출력 전 자기검산 (사고 안에서 수행)
- 각 빈칸원문이 지문에 한 글자도 다르지 않게 존재하는지, 서로 다른 문장인지 확인.
- 각 빈칸원문(과 그 핵심 부분)이 지문의 다른 곳에 재등장하지 않는지 확인 — 재등장하면 표적 재선정.
- 다섯 선지의 값을 열별로 실제 문장에 꽂아 읽어 전부 문법적으로 성립하는지 확인.
- 한 빈칸만 틀린 near-miss 선지가 있는지 확인 — 없으면 오답 하나를 재설계.
- 각 오답이 어느 빈칸에서 왜 틀렸는지 지문 근거로 한 줄씩 답해보라 — 근거를 못 대는 오답은 재설계.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).${paraphraseCheck}

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
${sourceLines}
${optionLines}
${multiBlankExplanationBlock(mode)}

## 지문
${passage}`;
}

// 검증 A등급 실물 2건 — 사다리 few-shot(결승 블라인드 검증 통과분)에서 이식.
// 규칙 나열보다 실물 예시가 공예를 끌어올린다는 것이 w3 실험의 확정 결론.
const GRAMMAR_FEWSHOT = `## 모범 예시 — 우리 검증을 통과한 A등급 실물 2건 (이 수준을 재현하라. 예시의 지문·표현을 복사하지는 마라)

예시 ① 정답: Choosing → 원형 Choose (정동사vs준동사)
- 정답 설계: "Choosing words that are more expressive, like 'great' or 'terrific' if you want to express pleasure" — 명령문의 정동사 자리에 동명사형을 심음. 관계절·삽입 예시구가 겹쳐 있어, 부사절을 걷어내고 주절을 완성할 정동사가 필요함을 문장 전체 구조에서 판정해야 한다.
- 미끼: frequently(부사 자리 — 형용사로 착각 유도), what(관계사 — that 으로 고치고 싶게), to express(용법 판단), misunderstood(태 — 능동으로 착각 유도). 각 미끼는 학생이 "고칠 이유"를 떠올릴 수 있는 자리다.

예시 ② 정답: appropriate → 원형 appropriately (형용사vs부사)
- 정답 설계: "their needs can't or won't be met appropriately" — 수동태 뒤 부사 자리에 형용사를 심음. be met 의 보어로 착각하면 형용사가 맞아 보인다 — 동사 수식임을 구조로 판정해야 한다.
- 미끼: feeling(분사 — leave O -ing 구조), valid(보어 자리 형용사 — 부사로 착각 유도), shout(원형 — to 뒤 판단), tending(전치사 뒤 동명사). 전부 "왜 이 형태지?" 하고 멈추는 자리다.`;

// 비킬러 어법의 정답 설계 절 — 장거리·복잡 문장 강제를 난이도에 맞게 완화.
const GRAMMAR_ANSWER_BY_DIFFICULTY: Record<Exclude<MdDifficulty, "KILLER">, string> = {
  BASIC: `## 정답 설계 (기본 난이도)
- 출제 포인트는 핵심 10선에서만: (a)정동사vs준동사 (b)관계사 (c)분사 (d)수일치 (e)태 (f)형부 (g)대명사 (h)목적격보어 (i)병렬 (k)to-v/v-ing. 5개 포인트 서로 다르게 분산.
- 정답은 해당 문법 개념을 알면 명확히 판정되는 자리(교과서 수준). 한눈에 보이는 철자 오류 수준은 금지 — 개념 판단은 있어야 한다.`,
  INTERMEDIATE: `## 정답 설계 (중급 난이도)
- 출제 포인트는 핵심 10선에서만: (a)정동사vs준동사 (b)관계사 (c)분사 (d)수일치 (e)태 (f)형부 (g)대명사 (h)목적격보어 (i)병렬 (k)to-v/v-ing. 5개 포인트 서로 다르게 분산.
- 정답은 문장 구조를 한 단계 분석해야 판정되는 자리(수식어구가 낀 수일치, 절 경계 확인이 필요한 관계사 등). 인접 자리의 한눈 비문은 금지.`,
};

// ---------------------------------------------------------------------------
// 어법 비표준(마커 5~10 × 정답 1~N) — 26-07-23 신설 (md 다중 형식 스펙 v1).
// 5·1 기본값이면 buildMdGrammarPrompt 는 기존 문자열과 바이트 동일(무회귀)이며,
// 비표준일 때만 아래 변형 빌더로 분기한다. 형식 리터럴(정답 병기 "(B), (D)"·
// "고침(X):" 라벨 줄·오답 N−K개·K=N이면 오답 섹션 생략)은 parser.ts v2 확장과
// 1:1 계약이다.
// ---------------------------------------------------------------------------

const GRAMMAR_MD_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

const GRAMMAR_MD_POINT_LIST =
  "(a)정동사vs준동사 (b)관계사 (c)분사 (d)수일치 (e)태 (f)형부 (g)대명사 (h)목적격보어 (i)병렬 (k)to-v/v-ing";

// 정답 병기 예시 — 홀수 인덱스 라벨 우선으로 K개를 골라 "(B), (D)" 형태로.
// (A)부터 채우면 모델이 예시 라벨을 실제 정답으로 앵커링하는 것을 피하기 위함.
function grammarAnswerExample(markerCount: number, answerCount: number): string {
  const picked: number[] = [];
  for (let i = 1; i < markerCount && picked.length < answerCount; i += 2) picked.push(i);
  for (let i = 0; i < markerCount && picked.length < answerCount; i += 2) picked.push(i);
  picked.sort((a, b) => a - b);
  return picked.map((i) => `(${GRAMMAR_MD_LABELS[i]})`).join(", ");
}

// 비표준 어법 해설 블록 — 정답 K개 병기·고침(X) 라벨 줄·오답 N−K개 형식.
function grammarVariantExplanationBlock(
  mode: MdExplanationMode,
  markerCount: number,
  answerCount: number,
): string {
  const lastLabel = GRAMMAR_MD_LABELS[markerCount - 1];
  const wrongCount = markerCount - answerCount;
  const answerLine =
    answerCount === 1
      ? `정답: <(A)~(${lastLabel}) 하나>`
      : `정답: <정답 라벨 ${answerCount}개를 ", " 로 병기 — 예: ${grammarAnswerExample(markerCount, answerCount)}>`;
  const fixLine =
    answerCount === 1
      ? "고침: <정답 자리를 고친 원형>"
      : `고침(B): <B 자리를 고친 원형> (정답 라벨마다 이 형식으로 한 줄씩 총 ${answerCount}줄 — 라벨 B 는 예시, 실제 정답 라벨을 쓴다)`;
  const expCore =
    answerCount === 1
      ? "딱 2문장 — 구조 근거와 왜 비문인지만. 합니다체"
      : "정답 라벨당 1~2문장 — 각 정답의 구조 근거와 왜 비문인지. 합니다체";
  if (mode === "answer-only") {
    return `${answerLine}
${fixLine}
해설: <${expCore}. 오답 해설은 쓰지 마라>`;
  }
  if (wrongCount === 0) {
    return `${answerLine}
${fixLine}
해설: <${expCore}. 모든 밑줄이 정답이므로 오답 섹션은 쓰지 마라>`;
  }
  return `${answerLine}
${fixLine}
해설: <${expCore}>
오답:
(A) <학생이 헷갈리는 지점 + 왜 옳은지 1문장> (정답 라벨 제외 ${wrongCount}개만)
...`;
}

// 비표준 어법 변형 프롬프트 본체 — buildMdGrammarPrompt 가 5·1 이 아닐 때만 호출.
function buildMdGrammarVariantPrompt(
  passage: string,
  mode: MdExplanationMode,
  difficulty: MdDifficulty,
  markerCount: number,
  answerCount: number,
): string {
  const labels = GRAMMAR_MD_LABELS.slice(0, markerCount);
  const lastLabel = labels[labels.length - 1];
  const wrongCount = markerCount - answerCount;
  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 밑줄 ${markerCount}개 중 어법상 틀린 것 ${answerCount}개짜리 KILLER 문항 1개를 설계하라. 밑줄 하나하나에 명확한 의도를 담고 절대 겹치지 않게, 학생이 무엇과 헷갈릴지 정확히 계산하라.`
      : `아래 지문으로 밑줄 ${markerCount}개 중 어법상 틀린 것 ${answerCount}개짜리 문항 1개(난이도: ${difficulty === "BASIC" ? "기본" : "중급"})를 설계하라. 밑줄 하나하나에 명확한 의도를 담고 포인트가 겹치지 않게 하라.`;
  const pointSpreadRule = `- 포인트 분산: 밑줄 ${markerCount}개의 코드는 최소 3종, 같은 코드는 최대 2회(검증기 상한과 동기 — 3회는 결함 기록된다). 미끼의 포인트 코드는 정답 포인트 코드와 중복 금지.${answerCount >= 2 ? ` 정답 ${answerCount}곳의 포인트는 서로 다르게 하라.` : ""}`;
  let answerDesign: string;
  if (difficulty === "KILLER") {
    answerDesign = [
      "## 정답 설계 — KILLER 의 생명",
      `- 출제 포인트는 핵심 10선에서만: ${GRAMMAR_MD_POINT_LIST}. 정답 포인트는 반드시 이 10선.`,
      pointSpreadRule,
      ...(answerCount >= 2
        ? [
            `- 정답 ${answerCount}곳은 서로 다른 문장에 흩어 놓아라 — 한 문장을 해부하면 정답 두 개가 같이 나오는 배치는 금지.`,
          ]
        : []),
      `- 각 정답은 지문에서 구조가 복잡한 문장(삽입구·관계절·병렬이 겹친 자리)에 둔다. 밑줄만 보면 자연스러워 보이고, 진짜 주어의 핵·선행사·병렬 시작점 같은 "밑줄에서 멀리 떨어진 단서"를 추적해야만 틀렸음이 드러나야 한다.`,
      "- 금지: 주어 바로 옆 수일치, who/which 단순교체, 진행형 뒤 -ing 겹치기 같은 한눈 비문 — 그건 킬러가 아니다.",
    ].join("\n");
  } else if (difficulty === "BASIC") {
    answerDesign = [
      "## 정답 설계 (기본 난이도)",
      `- 출제 포인트는 핵심 10선에서만: ${GRAMMAR_MD_POINT_LIST}.`,
      pointSpreadRule,
      "- 각 정답은 해당 문법 개념을 알면 명확히 판정되는 자리(교과서 수준). 한눈에 보이는 철자 오류 수준은 금지 — 개념 판단은 있어야 한다.",
    ].join("\n");
  } else {
    answerDesign = [
      "## 정답 설계 (중급 난이도)",
      `- 출제 포인트는 핵심 10선에서만: ${GRAMMAR_MD_POINT_LIST}.`,
      pointSpreadRule,
      "- 각 정답은 문장 구조를 한 단계 분석해야 판정되는 자리(수식어구가 낀 수일치, 절 경계 확인이 필요한 관계사 등). 인접 자리의 한눈 비문은 금지.",
    ].join("\n");
  }
  let decoySection: string;
  if (wrongCount === 0) {
    decoySection = `## 전 밑줄 정답 — 미끼 없음
- 이 문항은 밑줄 ${markerCount}곳 전부가 오형이다. 자리마다 서로 다른 문법 판단을 묻도록 포인트를 분산하고, 각 오형은 그 자리에서 로컬로 자연스러워 보여야 한다(한눈 비문 나열 금지).`;
  } else if (difficulty === "KILLER") {
    decoySection = `## 미끼 설계 — 미끼 ${wrongCount}개가 문항의 품격을 결정한다
- 각 미끼는 "학생이 구체적으로 무엇으로 잘못 고치고 싶어지는 자리"여야 한다. 출제 전에 미끼마다 오인 시나리오를 스스로 답하라: 이 학생은 이걸 왜 틀렸다고 생각하는가? 무엇으로 고치려 드는가?
- 미끼들의 오인 축을 서로 다르게: 예) 삽입구로 멀어진 수일치 착각 / 능·수동 태 착각 / 관계사·접속사 혼동 / 분사 형태 착각 / 규범 혼동(단수 they 류).
- 관성 미끼 제한: 어느 지문에나 붙는 자리(동격 that·성중립 their 류)는 최대 1개만. 나머지는 이 지문 고유의 구조가 만드는 자리여야 한다(-ly 형태의 형용사, p.p.와 과거형이 같은 동사, 준사역 뒤 원형 등 지문이 실제로 제공하는 함정).
- 답이 될 이유를 하나도 떠올릴 수 없는 장식 자리(단순 전치사·관사 옆 명사 등)는 미끼 실격.`;
  } else {
    decoySection = `## 미끼 설계 — 미끼 ${wrongCount}개가 문항의 품격을 결정한다
- 각 미끼는 "학생이 구체적으로 무엇으로 잘못 고치고 싶어지는 자리"여야 한다.
- 답이 될 이유를 하나도 떠올릴 수 없는 장식 자리(단순 전치사·관사 옆 명사 등)는 미끼 실격.`;
  }
  const selfCheck = [
    "## 출력 전 자기검산 (사고 안에서 수행)",
    ...(wrongCount > 0
      ? [
          `- 미끼 ${wrongCount}개 각각이 표준 어법상 흠결 없이 옳은지 재파싱으로 확인 — 논쟁 가능한 자리는 교체.`,
        ]
      : []),
    `- 라벨 (A)~(${lastLabel}) 를 하나씩 대조해 정답 ${answerCount}곳만 오형이고 나머지는 원문 그대로인지 확인 — 개수가 어긋나면 문항 전체가 무효다.`,
    `- ${answerCount >= 2 ? "각 정답 밑줄이" : "정답 밑줄이"} 주어 바로 뒤처럼 한눈에 드러나는 자리면 재설계 — 수식어·삽입이 끼어 오형이 로컬로 자연스러워 보이는 자리로 옮겨라.`,
    "- 마커 밖의 지문 텍스트가 원문과 한 글자도 다르지 않은지 확인.",
    ...(wrongCount > 0 ? ["- 오답 목록에 정답 라벨을 절대 포함하지 마라."] : []),
    "- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).",
  ].join("\n");
  const underlineContract =
    wrongCount === 0
      ? `<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 ${markerCount}곳만 [[A:표현]] ~ [[${lastLabel}:표현]] 로 감싼다. ${markerCount}곳 전부가 표현이 원문과 다른 오형이다. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다.>`
      : `<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 ${markerCount}곳만 [[A:표현]] ~ [[${lastLabel}:표현]] 로 감싼다. 정답 ${answerCount}곳만 표현이 원문과 다른 오형이고, 나머지 ${wrongCount}곳은 원문 그대로다. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다.>`;
  const scaffold = [
    "(A) <이 자리의 원문 형태(정답 자리는 고친 원형, 미끼는 마커 안 표현과 동일)> | <포인트코드: a~k 한 글자만, 괄호·설명 금지>",
    ...labels.slice(1).map((l) => `(${l}) ...`),
  ].join("\n");
  const fewshotBlock =
    difficulty === "KILLER"
      ? `${GRAMMAR_FEWSHOT}${answerCount >= 2 ? "\n- 정답이 여러 곳인 문항에서도 각 정답 자리를 이 수준으로 독립 설계하라 — 정답끼리 판정 근거가 겹치면 실격." : ""}\n\n`
      : "";
  return `너는 대한민국 수능 영어 어법 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}${answerDesign}

${decoySection}

${selfCheck}

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
${underlineContract}

원형·포인트:
${scaffold}
${grammarVariantExplanationBlock(mode, markerCount, answerCount)}

## 지문
${passage}`;
}

export function buildMdGrammarPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { markerCount?: number; answerCount?: number },
): string {
  const markerCount = Math.min(10, Math.max(5, Math.round(opts?.markerCount ?? 5)));
  const answerCount = Math.min(markerCount, Math.max(1, Math.round(opts?.answerCount ?? 1)));
  if (markerCount !== 5 || answerCount !== 1) {
    // 비표준 형상만 변형 빌더로 — 기본 5·1 은 아래 기존 경로(바이트 무회귀).
    return buildMdGrammarVariantPrompt(passage, mode, difficulty, markerCount, answerCount);
  }
  const headline =
    difficulty === "KILLER"
      ? "아래 지문으로 밑줄 5개 '어법상 틀린 것' KILLER 문항 1개를 설계하라. 밑줄 하나하나에 명확한 의도를 담고 절대 겹치지 않게, 학생이 무엇과 헷갈릴지 정확히 계산하라."
      : `아래 지문으로 밑줄 5개 '어법상 틀린 것' 문항 1개(난이도: ${difficulty === "BASIC" ? "기본" : "중급"})를 설계하라. 밑줄 하나하나에 명확한 의도를 담고 포인트가 겹치지 않게 하라.`;
  const answerSection =
    difficulty === "KILLER" ? null : GRAMMAR_ANSWER_BY_DIFFICULTY[difficulty];
  if (answerSection) {
    return `너는 대한민국 수능 영어 어법 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${answerSection}

## 미끼 설계 — 미끼 4개가 문항의 품격을 결정한다
- 각 미끼는 "학생이 구체적으로 무엇으로 잘못 고치고 싶어지는 자리"여야 한다.
- 답이 될 이유를 하나도 떠올릴 수 없는 장식 자리(단순 전치사·관사 옆 명사 등)는 미끼 실격.

## 출력 전 자기검산 (사고 안에서 수행)
- 미끼 4개 각각이 표준 어법상 흠결 없이 옳은지 재파싱으로 확인 — 논쟁 가능한 자리는 교체.
- 정답 밑줄이 주어 바로 뒤처럼 한눈에 드러나는 자리면 재설계 — 수식어·삽입이 끼어 오형이 로컬로 자연스러워 보이는 자리로 옮겨라.
- 마커 밖의 지문 텍스트가 원문과 한 글자도 다르지 않은지 확인.
- 오답 목록에 정답 라벨을 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 5곳만 [[A:표현]] ~ [[E:표현]] 로 감싼다. 정답 한 곳만 표현이 원문과 다른 오형이고, 나머지 4곳은 원문 그대로다. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다.>

원형·포인트:
(A) <이 자리의 원문 형태(정답 자리는 고친 원형, 미끼는 마커 안 표현과 동일)> | <포인트코드: a~k 한 글자만, 괄호·설명 금지>
(B) ...
(C) ...
(D) ...
(E) ...
${grammarExplanationBlock(mode)}

## 지문
${passage}`;
  }
  return `너는 대한민국 수능 영어 어법 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${GRAMMAR_FEWSHOT}

## 정답 설계 — KILLER 의 생명
- 출제 포인트는 핵심 10선에서만: (a)정동사vs준동사 (b)관계사 (c)분사 (d)수일치 (e)태 (f)형부 (g)대명사 (h)목적격보어 (i)병렬 (k)to-v/v-ing. 정답 포인트는 반드시 이 10선. 5개 포인트 서로 다르게 분산.
- 사고 안에서 서로 다른 포인트의 정답 후보를 2개 이상 설계해 비교하고, 더 아름다운 쪽(장거리 단서가 길고 오형이 로컬로 자연스러운 쪽)을 선택하라. (a)정동사vs준동사에 습관적으로 정착하지 마라 — 지문이 (b)(c)(e)(i) 등 더 좋은 자리를 주면 그쪽이 우선이다.
- 정답은 지문에서 구조가 가장 복잡한 문장(삽입구·관계절·병렬이 겹친 자리)에 둔다. 밑줄만 보면 자연스러워 보이고, 진짜 주어의 핵·선행사·병렬 시작점 같은 "밑줄에서 멀리 떨어진 단서"를 추적해야만 틀렸음이 드러나야 한다.
- 금지: 주어 바로 옆 수일치, who/which 단순교체, 진행형 뒤 -ing 겹치기 같은 한눈 비문 — 그건 킬러가 아니다.

## 미끼 설계 — 미끼 4개가 문항의 품격을 결정한다
- 각 미끼는 "학생이 구체적으로 무엇으로 잘못 고치고 싶어지는 자리"여야 한다. 출제 전에 미끼마다 오인 시나리오를 스스로 답하라: 이 학생은 이걸 왜 틀렸다고 생각하는가? 무엇으로 고치려 드는가?
- 4개 미끼의 오인 축을 서로 다르게: 예) 삽입구로 멀어진 수일치 착각 / 능·수동 태 착각 / 관계사·접속사 혼동 / 분사 형태 착각 / 규범 혼동(단수 they 류).
- 관성 미끼 제한: 어느 지문에나 붙는 자리(동격 that·성중립 their 류)는 최대 1개만. 나머지는 이 지문 고유의 구조가 만드는 자리여야 한다(-ly 형태의 형용사, p.p.와 과거형이 같은 동사, 준사역 뒤 원형 등 지문이 실제로 제공하는 함정).
- 답이 될 이유를 하나도 떠올릴 수 없는 장식 자리(단순 전치사·관사 옆 명사 등)는 미끼 실격.

## 출력 전 자기검산 (사고 안에서 수행)
- 미끼 4개 각각이 표준 어법상 흠결 없이 옳은지 재파싱으로 확인 — 논쟁 가능한 자리는 교체.
- 정답 밑줄이 주어 바로 뒤처럼 한눈에 드러나는 자리면 재설계 — 수식어·삽입이 끼어 오형이 로컬로 자연스러워 보이는 자리로 옮겨라.
- 마커 밖의 지문 텍스트가 원문과 한 글자도 다르지 않은지 확인.
- 오답 목록에 정답 라벨을 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 5곳만 [[A:표현]] ~ [[E:표현]] 로 감싼다. 정답 한 곳만 표현이 원문과 다른 오형이고, 나머지 4곳은 원문 그대로다. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다.>

원형·포인트:
(A) <이 자리의 원문 형태(정답 자리는 고친 원형, 미끼는 마커 안 표현과 동일)> | <포인트코드: a~k 한 글자만, 괄호·설명 금지>
(B) ...
(C) ...
(D) ...
(E) ...
${grammarExplanationBlock(mode)}

## 지문
${passage}`;
}
