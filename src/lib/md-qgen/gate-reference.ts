// ============================================================================
// 지칭 추론(REFERENCE) 0원 결정형 게이트 — 빈 배열이면 클린.
// 계약 문서: docs/md-qgen-type-expansion-spec.md §1-B(형식 설계 철칙)·§4-7
// 파일 500줄 규약에 따라 parser-reference.ts 에서 분리했다(1차 승차분 gate-order 선례).
//
// 이 유형에는 "지문 재구성 대조"가 없다(지문을 재출력하지 않으므로). 그 자리를
// 대신하는 최강 불변식이 **밑줄 자리의 유일 확정**이다:
//   ① 밑줄문장이 원문에 축자로 있고 ② 원문에서 딱 한 번 나오며 ③ 마커가 1개이고
//   ④ 그 자리를 지목하는 문맥 창을 만들 수 있다 — 이 넷이 통과하면 후처리가
//   긋는 밑줄이 모델이 의도한 그 자리임이 증명된다.
//
// 게이트 메시지는 전부 **자리를 지목**한다(규범 §1-B 철칙 5) — 이 문구가 그대로
// 재생성 프롬프트의 피드백으로 실리기 때문이다.
// ============================================================================

import { normalizeWs } from "./parser";
import {
  buildReferenceContext,
  isReferencePronoun,
  locateReferenceTarget,
  referenceContextResolves,
  referenceTargetOf,
  stripReferenceMarks,
  type MdReferenceQuestion,
} from "./parser-reference";

const CIRCLED = ["①", "②", "③", "④", "⑤"] as const;

// ── 대명사 용법 판정 ─────────────────────────────────────────────────────────
// 지칭 대상이 아예 없는 자리를 0원으로 걸러낸다. 오탐이 나면 정상 문항이 죽으므로
// **고정밀 프레임만** 잡는다(넓은 패턴으로 잡으면 "the tool worked because it was
// designed to fit" 같은 정상 문장이 허사로 오인된다).
// ⚠ 파서가 아니라 여기 사는 이유: 이건 파싱이 아니라 **판정**이고, parser-reference
//   가 500줄 규약에 닿아 게이트 쪽으로 옮겼다(의존 방향 gate → parser 는 그대로).

/** 외치 구문의 머리에 오는 평가 형용사. */
const EXPLETIVE_ADJ = String.raw`(?:clear|obvious|evident|apparent|likely|unlikely|possible|impossible|important|essential|crucial|necessary|true|false|difficult|hard|easy|common|rare|useful|helpful|natural|tempting|surprising|striking|remarkable|reasonable|worth|no\s+accident|no\s+coincidence|no\s+surprise)`;
const EXPLETIVE_ADV = String.raw`(?:(?:not|no\s+longer|often|widely|generally|usually|now|still|hardly|therefore|thus|also|indeed|perhaps|probably|certainly|clearly)\s+)*`;
/**
 * 외치 구문의 **후행 요소** — 허사 판정의 필수 조건이다.
 *
 * ⚠ 종전에는 이 후행 요구가 주석·게이트 메시지에만 있고 구현에서 빠져 있었다.
 * 그래서 `It is remarkable for its detail.` `It was clear evidence that ...`
 * `It is common practice among archivists.` `It seems obvious now.` 같은
 * **정상 지칭 it 전부**가 허사로 반려됐다(고정밀 설계 의도의 정반대). it 은 이
 * 유형의 최다 표적이라 반려율을 구조적으로 끌어올리고, 게다가 존재하지도 않는
 * `that/to` 프레임을 지목해 재생성 피드백까지 오도했다.
 *
 * 그래서 형용사 **바로 뒤 토큰**(또는 `for NP` · 동명사 한 칸 건너)만 인정한다.
 * `clear evidence that ...` 처럼 형용사 뒤에 명사구가 오는 서술형은, 뒤쪽에
 * `that` 이 있어도 매칭되지 않는다(그 that 은 명사 보문이지 외치가 아니다).
 */
const EXPLETIVE_TAIL = String.raw`(?:for\s+[^.?!,;]{1,30}?\s+)?(?:\w+ing\s+)?(?:that|to|whether|how|why|when|what)\b`;

const EXPLETIVE_IT_FRAMES: readonly RegExp[] = [
  // it is/was + (부사)* + 평가 형용사 + that/to  — 전형적 외치 구문
  new RegExp(
    `^\\s*(?:is|was|'s|seems|seemed|appears|appeared)\\s+${EXPLETIVE_ADV}${EXPLETIVE_ADJ}\\s+${EXPLETIVE_TAIL}`,
    "i",
  ),
  // it takes/took/requires/costs ... to V
  /^\s*(?:takes|took|requires|required|costs|cost)\s+[^.?!]{0,40}\bto\b/i,
  // it has/had been argued/shown that ... · it is/was argued/said that ...
  /^\s*(?:has|had)\s+(?:long\s+|often\s+|widely\s+)?been\s+(?:argued|shown|suggested|claimed|noted|observed|assumed|believed|thought|said|found|reported|estimated)\b/i,
  /^\s*(?:is|was|'s)\s+(?:often\s+|widely\s+|generally\s+|commonly\s+)?(?:argued|shown|suggested|claimed|noted|observed|assumed|believed|thought|said|found|reported|estimated)\s+that\b/i,
  // it follows/turns out/appears that ...
  /^\s*(?:follows|turned\s+out|turns\s+out)\s+that\b/i,
];

/** that 을 지시대명사로 인정하는 후행 요소(동사·조동사 머리). */
const THAT_PRONOUN_HEADS: ReadonlySet<string> = new Set([
  "is", "was", "isn", "wasn", "s", "has", "had", "will", "would", "can",
  "could", "may", "might", "should", "must", "does", "did", "seems",
  "seemed", "appears", "appeared", "means", "meant", "remains", "remained",
  "explains", "explained", "makes", "made", "leaves", "left", "gives", "gave",
]);

/**
 * 표적이 "가리킬 것이 있는 대명사"인지 판정한다. 문제가 없으면 null.
 * 반환 문자열은 그대로 게이트 메시지가 되므로 자리를 지목하는 문구로 쓴다.
 */
export function referencePronounUsageIssue(
  pronoun: string,
  after: string,
): string | null {
  const lower = pronoun.trim().toLowerCase();
  if (lower === "it" && EXPLETIVE_IT_FRAMES.some((re) => re.test(after))) {
    return "허사 it(it is ... that / it takes ... to) — 가리키는 대상이 없어 지칭 표적이 될 수 없음";
  }
  if (lower === "that") {
    const next = after.trim().match(/^[A-Za-z']+/)?.[0]?.toLowerCase() ?? "";
    if (!THAT_PRONOUN_HEADS.has(next.replace(/'/g, ""))) {
      return "that 이 접속사·관계사·한정사로 읽히는 자리 — 지시대명사 용법(That is ... 류)만 표적으로 허용";
    }
  }
  return null;
}

/**
 * 선지 텍스트를 렌더로 깨뜨리는 마크업(HTML 태그·굵게·밑줄 토큰·표 파이프).
 * `|` 를 포함하는 이유: 파서가 표 행 드리프트의 파이프를 걷어내지만, 칸이 밀린
 * 변종까지 전부 흡수할 수는 없다. 잔여 파이프가 남으면 **자리를 지목해** 반려한다
 * — 종전에는 `'| 계획가들'` 같은 부패한 선지가 그대로 학생 표면에 저장됐다.
 */
const OPTION_MARKUP_RE = /<[^<>]+>|\*\*|__|\|/;
/** 선지 끝 괄호 지칭 — 정답이 선지 텍스트에 그대로 노출된 실측 결함(runIndex 24). */
const OPTION_TRAILING_PAREN_RE = /[(（][^()（）]{1,30}[)）]\s*$/;
/**
 * 표적 대명사가 지문 서두에 있으면 선행사가 지문 밖일 수 있다.
 *
 * 26-08-22 기출 실측(328자리, scripts/_tmp-reference-fp.ts): md 가 실제 출제하는
 * 구조(닫힌집합 내·전방조응)의 관측 최소 오프셋은 39 라 임계 20 은 관측 분포
 * 밖이다 — 완화 불필요. <20 은 3자리뿐인데 전부 md 계약 밖 형식이다: idx=0
 * 문두 후방조응 리들형 2건('These come in ...' / 'This is a very useful
 * instrument ...' — 뒤 내용으로 정체를 맞히는 수수께끼형, md 미출제)과 'my'@5
 * 1건(문두 자리). 프롬프트가 이미 '지문 첫 문장의 대명사 금지'를 지시하므로
 * 이 검사는 그 규칙의 집행 게이트로 차단 유지한다(규범 §1 집행 게이트 경로).
 */
const MIN_TARGET_OFFSET = 20;
/** 밑줄문장은 "문장 하나" 계약 — 지문을 통째로 옮겨 적는 드리프트 차단. */
const MAX_MARKED_SENTENCE_LENGTH = 500;

export interface MdReferenceGateOptions {
  /** answer-only 모드면 false — 오답해설 개수 검사를 끈다. */
  requireWrong?: boolean;
}

function compact(text: string): string {
  return normalizeWs(text).replace(/[\s'"“”‘’「」『』]/g, "");
}

/**
 * 부정·대조 표지 — 인용 **직후**에 오면 그 인용은 "그것이 아니다"라는 뜻이다.
 * 한국어 해설의 전형이 `'A'가 아니라 B를 가리킵니다` 라서, 이걸 안 보면
 * 해설-정답 불일치의 최다 형태가 "인용했다"로 통과한다(적대검수 gate-gap).
 */
const NEGATED_CITATION_RE = /^[가-힣]{0,4}(?:아니|말고|대신)/;

/**
 * 해설이 그 선지를 지칭 대상으로 **긍정 단정**했는가.
 * 부정 표지의 지배 아래 놓인 등장은 인용으로 세지 않는다.
 */
function citedPositively(compactExplanation: string, optionText: string): boolean {
  const needle = compact(optionText);
  if (!compactExplanation || needle.length < 4) return false;
  for (let from = 0; ; ) {
    const at = compactExplanation.indexOf(needle, from);
    if (at < 0) return false;
    if (!NEGATED_CITATION_RE.test(compactExplanation.slice(at + needle.length))) return true;
    from = at + 1;
  }
}

/**
 * 해설이 논증한 지칭 대상과 `정답:` 라벨이 **어긋났다는 적극적 증거**를 찾는다.
 * 증거가 없으면 빈 문자열(= 클린).
 *
 * ⚠ 설계 전환(규범 §1-B 철칙 1 — 한 정보는 한 곳에서만). 종전에는 "정답 선지 문구가
 * 해설에 등장하는가"를 물었다. 그건 '어느 선지가 정답인가'를 `정답:` 줄과 해설
 * 두 곳에서 받는 **중복 계약**이라, 반의어가 `| O/X |` 칸에서 2연속 반려된 것과
 * 같은 실패 계통이었다. 실제로 양방향으로 오작동했다:
 *   · 정답 라벨이 정확한 정상 문항이 해설을 자연스럽게 바꿔 썼다는 이유만으로 반려
 *     (마지막 어절 폴백은 변별력이 없어 구제도 못 했다) → 재생성 1콜 소진 후 환불.
 *   · 정작 `'④'가 아니라 ②를 가리킵니다` 형태의 **진짜 불일치**는 통과.
 * 이제 이 축은 **인용의 부재를 벌하지 않고**, 해설이 정답이 아닌 선지를 긍정 단정한
 * 경우에만 발화한다. 정답의 유일 진실원은 여전히 `정답:` 줄 하나다.
 */
function explanationAnswerConflict(
  q: MdReferenceQuestion,
  answerText: string,
): string {
  const exp = compact(q.explanation);
  if (!exp) return "";
  if (citedPositively(exp, answerText)) return "";
  const conflicting = q.options.filter(
    (o) => o.label !== q.answer && citedPositively(exp, o.text),
  );
  if (conflicting.length === 0) return "";
  return (
    `해설이 지칭 대상으로 단정한 선지는 ${conflicting.map((o) => o.label).join("")} ` +
    `'${conflicting[0].text.slice(0, 30)}' 인데 \`정답:\` 은 ${q.answer} '${answerText.slice(0, 30)}' 이다 ` +
    `— 해설과 정답 라벨이 어긋났다. 어느 쪽이 옳은지 정하고 정답 라벨과 해설을 같은 선지로 맞춰라`
  );
}

export function gateMdReference(
  q: MdReferenceQuestion,
  passage: string,
  options?: MdReferenceGateOptions,
): string[] {
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];

  // ── #1 밑줄문장·마커 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려 ──────
  if (!q.markedSentence) {
    return ["밑줄문장 누락 — `밑줄문장:` 줄에 표적 대명사를 [[ ]] 로 감싼 지문 문장을 그대로 옮겨 적어라"];
  }
  const target = referenceTargetOf(q.markedSentence);
  if (target.markCount !== 1) {
    return [
      `밑줄 마커 ${target.markCount}개 (정확히 1개 필요) — 밑줄문장에서 표적 대명사 한 곳만 [[ ]] 로 감싸라`,
    ];
  }
  if (!target.pronoun) {
    return ["밑줄 마커 안이 비었음 — [[them]] 처럼 대명사 한 단어를 감싸라"];
  }

  const plainSentence = stripReferenceMarks(q.markedSentence);
  if (plainSentence.length > MAX_MARKED_SENTENCE_LENGTH) {
    v.push(
      `밑줄문장이 ${plainSentence.length}자 (문장 하나 ${MAX_MARKED_SENTENCE_LENGTH}자 이내) — 표적이 든 문장 하나만 옮겨 적어라`,
    );
  }

  // ── #2 원문 축자 정합 + 자리 유일 확정 (이 유형의 최강 불변식) ──────────────
  const loc = locateReferenceTarget(passage, target);
  if (!loc) {
    // 발췌를 넉넉히 뜬다(종전 70자). 짧게 자르면 밑줄문장이 삼킨 잔여물(장식된 선지
    // 줄 등)이 피드백에 안 보여, 모델이 '문장을 제대로 베껴라'는 엉뚱한 지시를 받는다.
    v.push(
      `밑줄문장(${plainSentence.length}자)이 지문에 축자로 없음 — 지문에서 그대로 복사하고 표적 대명사만 [[ ]] 로 감싸라: '${plainSentence.slice(0, 200)}'`,
    );
  } else {
    if (loc.matchCount > 1) {
      v.push(
        `밑줄문장이 지문에 ${loc.matchCount}회 등장 — 밑줄 자리가 유일하지 않다. 다른 문장의 대명사를 표적으로 잡아라`,
      );
    }
    if (loc.index < MIN_TARGET_OFFSET) {
      v.push(
        `표적 '${target.pronoun}' 이 지문 맨 앞(${loc.index}자 지점)에 있음 — 선행사가 지문 안에 없을 수 있으니 뒤쪽 대명사를 잡아라`,
      );
    }
    // ── #3 후처리가 같은 자리를 집는지 검산 ──────────────────────────────────
    const context = buildReferenceContext(passage, loc.index, loc.length);
    if (!referenceContextResolves(passage, context, loc.index, loc.length)) {
      v.push(
        `표적 '${target.pronoun}' 의 밑줄 자리를 유일하게 지목하는 문맥을 만들 수 없음 — 같은 대명사가 근처에 반복되지 않는 자리를 잡아라`,
      );
    }
  }

  // ── #4 표적 자격 — 가리킬 것이 있는 대명사인가 ─────────────────────────────
  // 26-08-22 기출 실측(328자리, scripts/_tmp-reference-fp.ts): 집합 밖 표적 19자리
  // 중 1·2인칭·재귀 11자리는 REFERENCE_PRONOUN_LIST 확장(parser-reference.ts)으로
  // 해소했고, 잔여 8자리는 전부 the+명사구('the man'·'the article' 류) 밑줄이다 —
  // 기출 표적 공간이 제품 계약보다 넓다는 실측. md 계약은 마커가 **대명사 한
  // 단어**만 감싸는 것이라(prompts-reference.ts §밑줄문장 작성 규칙, 명사구 마킹
  // 미지원) 이 8건은 제품이 낼 수 없는 형식 = 오반려가 아니며, 이 검사는 프롬프트
  // '허용 목록' 규칙의 집행 게이트로 차단을 유지한다(규범 §1 집행 게이트 경로).
  // 표적 공간을 기출 수준으로 넓히려면 목록 완화가 아니라 명사구 마킹 지원이
  // 선행 조건이다.
  if (!isReferencePronoun(target.pronoun)) {
    v.push(
      `표적 '${target.pronoun}' 이 지칭 추론 대상 대명사가 아님 — it·they·them·their·this·these 류 한 단어만 표적으로 쓸 수 있다`,
    );
  } else {
    const usage = referencePronounUsageIssue(target.pronoun, target.after);
    if (usage) v.push(`표적 '${target.pronoun}': ${usage}`);
  }

  // ── #5 선지 형상 ───────────────────────────────────────────────────────────
  if (q.options.length > CIRCLED.length) {
    // 선지가 5개를 넘는 유일한 실측 경로는 "오답 섹션 라벨을 못 알아봐서 오답 줄이
    // 선지로 읽힌 것"이다. 여기서 그 원인을 지목하지 않으면 모델은 `선지 9개` 와
    // `오답해설 0개(8개 필요)` 라는 따를 수 없는 지시를 받는다(규범 §1-B 철칙 3·5).
    v.push(
      `선지 ${q.options.length}개 (5개 필요) — 오답 섹션 라벨을 인식하지 못해 오답 해설 줄이 선지로 읽혔다. \`오답:\` 을 다른 말 없이 한 줄로 내라`,
    );
  } else if (q.options.length !== 5) {
    v.push(`선지 ${q.options.length}개 (5개 필요) — ①~⑤ 다섯 줄로 내라`);
  }
  const expectedLabels = CIRCLED.slice(0, Math.max(q.options.length, 0));
  const actualLabels = q.options.map((o) => o.label).join("");
  if (q.options.length === 5 && actualLabels !== expectedLabels.join("")) {
    v.push(`선지 라벨 순서 오류 — ①②③④⑤ 필요(실제 ${actualLabels || "없음"})`);
  }

  const seen = new Set<string>();
  for (const option of q.options) {
    const label = option.label || "?";
    if (!option.text) {
      v.push(`${label} 선지 텍스트 누락`);
      continue;
    }
    if (OPTION_MARKUP_RE.test(option.text)) {
      v.push(
        `${label} 선지에 서식·표 문자가 섞임 — 굵게(**)·밑줄(__)·HTML 태그·표 파이프(|)를 쓰지 말고 후보 명사구만 써라: '${option.text.slice(0, 40)}'`,
      );
    }
    if (!/[가-힣]/.test(option.text)) {
      v.push(`${label} 선지가 한국어가 아님 — 지칭 대상을 한국어 명사구로 써라: '${option.text.slice(0, 40)}'`);
    }
    if (OPTION_TRAILING_PAREN_RE.test(option.text)) {
      v.push(
        `${label} 선지 끝 괄호에 지칭 판정이 박힘 — 정답이 선지에 노출된다. 후보 명사구만 써라: '${option.text.slice(0, 40)}'`,
      );
    }
    if (normalizeWs(option.text).length > 80) {
      v.push(`${label} 선지가 너무 김(${normalizeWs(option.text).length}자) — 명사구 하나로 줄여라`);
    }
    const key = compact(option.text).toLowerCase();
    if (key && seen.has(key)) {
      v.push(`선지 중복: '${option.text.slice(0, 40)}'`);
    }
    if (key) seen.add(key);
  }

  // ── #6 정답 — `정답:` 줄이 유일 진실원 ─────────────────────────────────────
  const answerOption = q.options.find((o) => o.label === q.answer);
  if (!q.answer) {
    v.push("정답 누락 — `정답:` 줄에 ①~⑤ 하나를 적어라");
  } else if (!answerOption) {
    v.push(`정답 라벨(${q.answer})이 선지에 없음`);
  } else if (q.options.length === 5) {
    // 정답만 유독 긴 선지는 지문을 안 읽어도 표난다.
    const lengths = q.options.map((o) => normalizeWs(o.text).length);
    const answerLength = normalizeWs(answerOption.text).length;
    const others = lengths.filter((_, i) => q.options[i].label !== q.answer);
    const otherAvg = others.reduce((sum, n) => sum + n, 0) / Math.max(1, others.length);
    if (answerLength >= otherAvg * 2.5 && answerLength - otherAvg >= 20) {
      v.push(
        `정답 선지(${q.answer})만 유독 긺(${answerLength}자 대 오답 평균 ${Math.round(otherAvg)}자) — 길이로 정답이 표난다`,
      );
    }
  }

  // ── #7 해설 ────────────────────────────────────────────────────────────────
  if (!q.explanation) {
    v.push("해설 누락");
  } else if (answerOption) {
    const conflict = explanationAnswerConflict(q, answerOption.text);
    if (conflict) v.push(conflict);
  }

  // ── #8 오답해설 ────────────────────────────────────────────────────────────
  if (requireWrong) {
    // 선지 수를 5로 상한한다 — 선지가 오염돼 9개가 되면 "8개 필요" 같은 파생 숫자가
    // 나와, 모델이 따를 수 없는 지시가 재생성 프롬프트에 실린다.
    const needed = Math.max(0, Math.min(q.options.length, CIRCLED.length) - 1);
    if (q.wrong.length !== needed) {
      v.push(`오답해설 ${q.wrong.length}개 (${needed}개 필요 — 정답 번호 제외 전 선지)`);
    }
    const labels = new Set<string>();
    const optionLabels = new Set(q.options.map((o) => o.label));
    for (const w of q.wrong) {
      if (labels.has(w.label)) v.push(`오답해설 라벨 중복: ${w.label}`);
      labels.add(w.label);
      if (optionLabels.size > 0 && !optionLabels.has(w.label)) {
        v.push(`오답해설 라벨(${w.label})이 선지에 없음`);
      }
    }
  }
  if (q.answer && q.wrong.some((w) => w.label === q.answer)) {
    v.push("오답해설에 정답 라벨 포함");
  }

  return v;
}
