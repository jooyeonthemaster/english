/**
 * 어법 해설의 메타 누설(생성/출제 과정 서술·내부 필드명)을 추가 LLM 호출 없이
 * 결정형으로 제거한다. 후처리 단계에서 explanation·answerLogic·keyPoints·
 * wrongOptionExplanations 에 적용한다.
 *
 * 전략(의미 보존 우선 — 안전한 것만 자르고, 못 고치는 구조적 누설은 게이트
 * 재시도에 맡긴다):
 *   1) 내부 필드명/가이드 토큰 제거 (errorExpression·pointCode·출제 포인트·1순위 등)
 *   2) 변형/설계 수식어구 제거 ("잘못 변형된", "변형 형태인", "~포인트로 설계된")
 *   3) 순수 변형-서사 *문장* 드롭 (문법 근거가 담긴 다른 문장이 남을 때만)
 * 절삭 후 본문이 비거나 거의 사라지면 원본을 반환(상위 게이트가 재시도 처리).
 */

// 1) 내부 식별자/가이드 토큰 — 뒤따르는 조사까지 같이 제거.
const INTERNAL_FIELD_TOKENS =
  /\b(errorExpression|correctExpression|wrongExpression|markedExpressions?|pointCode|_?typeId|subType|optionPlan|slotValues?|invariants?)\b\s*(?:인|은|는|이|가|을|를|의|라는|라고)?\s*/gi;

// 2) 출제/생성 메타 어휘 — 경계가 분명한 수식어/명사구만.
const META_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  // "1순위/2순위/최빈출 (어법) 포인트(인/로/를...)"
  [/(?:1순위|2순위|3순위|최빈출|고빈출)\s*(?:어법\s*)?포인트(?:인|로|를|의|에서|이)?\s*/g, ""],
  // "출제 의도/포인트/설계(인/로/를/상...)"
  [/출제\s*(?:의도|포인트|설계)(?:인|로|를|의|에서|상|를\s*활용)?\s*/g, ""],
  // "(이번 문제의) 의도된/의도한 (정답) 포인트인"
  [/(?:정작\s*)?(?:이번|이)?\s*(?:문제|문항)?의?\s*(?:의도된|의도한)\s*(?:정답\s*)?포인트(?:인|로|를|의|에서)?\s*/g, ""],
  // "...포인트로 설계된/설계하여"
  [/(?:수일치|시제|관계사|분사|대명사|병렬|태|어순)?\s*포인트로\s*설계(?:된|되어|하여|함|한)\s*/g, ""],
  [/(?:정답\s*)?포인트\s*설계\s*지시(?:에\s*따라)?\s*/g, ""],
  [/(?:정답\s*)?포인트\s*설정(?:에\s*따라|으로|에서|을)?\s*/g, ""],
  [/정답으로\s*지정(?:된|되어)\s*/g, ""],
  [/설계에\s*따라\s*/g, ""],
  [/정답\s*설계(?:에\s*따라|으로|상)?\s*/g, ""],
  // "변형 형태인 / 변형된 형태의" (명사구 수식) — '형태' 수반형 먼저.
  [/변형(?:된)?\s*형태(?:인|의|로|를|가|는)?\s*/g, ""],
  // "정답으로 변형된 / 잘못 변형한 / (자리의) 변형인" (관형 수식어).
  // ⚠️ 뒤가 인용부호·영어인 경우만 제거 — "변형한 것/부분" 같은 한글 의존명사 앞에서
  //    잘라내면 문장이 파손되므로(그건 아래 문장-드롭이 처리).
  [
    /(?:정답으로|정답형으로|오답으로|능동으로|수동으로|잘못|틀리게|오류로|의도적으로)?\s*변형(?:된|한|인)\s+(?=['"]?[A-Za-z])/g,
    "",
  ],
  // "원문/원래 표현인 'X'" — 원형이 무엇이었는지 누설.
  [/원(?:문|래)\s*표현(?:인|은|의|을|를)?\s*/g, ""],
  // 가이드 메타
  [/지시문(?:의|에서|에)?\s*/g, ""],
  [/가이드라인(?:의|에서|에|에\s*따라)?\s*/g, ""],
  [/유도하는\s*함정(?:으로|을|이)?\s*/g, ""],
  [/함정으로\s*(?:만들|변형|유도|구성)(?:어|하여|해서|기\s*위해)?\s*/g, ""],
];

// 3a) 변형-서사 *절* — 쉼표로 끝나는 "…을/를 …(으)로 …변형/바꾸…(하면/하여/했), " 절.
//     문장 중간의 출제 서사를 통째로 들어낸다(뒤따르는 문법 근거 절은 보존).
//     주의: "Y로 고쳐야/바꿔야 한다"(교정 지시)는 ‘야’ 어미라 매칭 안 됨.
const NARRATION_CLAUSE =
  /[^.!?,]*?(?:을|를|위치를|자리를)[^.!?,]*?(?:로|으로)\s*(?:잘못\s*)?(?:변형|바꾸|바꿔|치환|교체)(?:하면|하여|하였|했|하므로|해서)\s*,\s*/g;

// 3b) 변형-서사 *문장* 식별 — 문장 전체가 "출제 시 무엇을 바꿨는지"인 경우.
const NARRATION_SENTENCE =
  /(원문은|원(?:문|래)\s*(?:형태|단어|문장|표현)|정답형(?:인|을|이|은)|출제(?:한|하였|했|된|\s*과정)|문제에서(?:는|의)|문제를?\s*설계(?:했|하였|한)|(?:실제\s*)?본문에서(?:의)?\s*올바른|올바른\s*표현은\s*['"]?[A-Za-z]|정답으로\s*(?:지정|변형)(?:된|되어|하여)?|(?:정답\s*)?포인트\s*설계|설계\s*지시|(?:정답\s*)?포인트인\b|지정된\s*\d\s*순위|\d\s*순위[^.]*?어법\s*포인트|어법\s*포인트의\s*검토|고친\s*형태|변형(?:되어|되었|됨)|변형하게\s*되면|변형(?:한|된|인)\s*(?:것|부분|결과|점|표현|단어|버전)|(?:을|를|위치를|자리를)[^.]*?(?:로|으로)\s*(?:잘못\s*)?(?:변형|치환|교체|바꾸|바꿔)(?:하였|했|하면|하여|해서|한|게\s*되면)|(?:으로|로)\s*(?:잘못\s*)?(?:바꾸|바꿔|변형|치환|고치)(?:면|어|아|하면|하여|하였|했|한|게\s*되면)[^.]*?(?:어법상\s*|문법상\s*)?(?:틀[린립려리렸림]|비문|오류|오답|어긋|없[어이]|사라))/;

/** 문장을 의미 단위로 분리 (종결부호·한국어 종결어미 기준). */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。]|(?:다|요|음))\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function collapseSpaces(text: string): string {
  return text
    .replace(/\s+([,.)\]])/g, "$1") // 절삭으로 생긴 "단어 ," 류 공백 정리
    .replace(/\(\s+/g, "(")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,(?=[가-힣A-Za-z])/g, ", ") // 쉼표 뒤 공백 보장
    .replace(/([가-힣][다요음])([.!?])(?=[가-힣])/g, "$1$2 ") // 종결어미 뒤 공백 복원(한글 앞만)
    .replace(/([가-힣])('[A-Za-z])/g, "$1 $2") // 한글+영어인용 붙음 분리 ("자리의'X'"→"자리의 'X'")
    .replace(/([가-힣])(\([A-E]\))/g, "$1 $2") // 한글+라벨 붙음 분리 ("으로(E)"→"으로 (E)")
    .replace(/^\s*[,·]\s*/g, "")
    .trim();
}

/** 어법 해설 한 문자열의 메타 누설을 제거한다. */
export function sanitizeGrammarExplanationMeta(input: unknown): string {
  if (typeof input !== "string") return "";
  const original = input;
  if (!original.trim()) return original;

  // 1) 내부 필드명 제거
  let text = original.replace(INTERNAL_FIELD_TOKENS, "");
  // 2) 메타 수식어 제거
  for (const [pattern, replacement] of META_PHRASE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  // 3a) 문장 중간의 변형-서사 절(…변형하면, ) 컷 — 단, 컷 후 그 문장에 내용이 남을 때만.
  text = text.replace(NARRATION_CLAUSE, (match, offset: number, full: string) => {
    const after = full.slice(offset + match.length);
    // 컷 지점 뒤에 같은 문장 내용(다음 종결부호 전)이 충분히 남으면 절을 제거.
    const restOfSentence = after.split(/[.!?]/)[0] ?? "";
    return restOfSentence.trim().length >= 8 ? "" : match;
  });

  // 3b) 순수 변형-서사 문장 드롭 — 단, 변형 서사가 아닌 문장이 하나 이상 남을 때만.
  const sentences = splitSentences(text);
  if (sentences.length > 1) {
    const kept = sentences.filter((s) => !NARRATION_SENTENCE.test(s));
    if (kept.length > 0 && kept.length < sentences.length) {
      text = kept.join(" ");
    }
  }

  // 제거가 전혀 없었으면(메타 무관 클린 해설) 원본을 바이트 그대로 반환 —
  // 멀쩡한 해설의 공백·구두점을 건드리지 않는다.
  if (text === original) return original;

  text = collapseSpaces(text);

  // 절삭 결과가 비었거나 원본의 30% 미만으로 쪼그라들면(과절삭) 원본 유지 →
  // 상위 게이트가 재시도로 처리하도록.
  if (!text || text.length < Math.min(20, original.trim().length * 0.3)) {
    return original;
  }
  return text;
}

/** keyPoints 배열 등 문자열 묶음에 일괄 적용. */
export function sanitizeGrammarExplanationList(
  values: unknown,
): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  return values.map((v) => sanitizeGrammarExplanationMeta(v));
}

/** wrongOptionExplanations(Record<label, text>)에 일괄 적용. */
export function sanitizeGrammarExplanationRecord(values: unknown): unknown {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return values;
  }
  return Object.fromEntries(
    Object.entries(values as Record<string, unknown>).map(([k, v]) => [
      k,
      sanitizeGrammarExplanationMeta(v),
    ]),
  );
}
