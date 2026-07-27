// ============================================================================
// 글의 순서 — 단락 변형(#11) 전용 계산·정책. gate-order.ts 에서 분리(500줄 규약).
// 의존 방향은 gate-order → gate-order-variant → parser-order 단방향이다.
//
// 이 축의 계약: `단락(X):` 는 언제나 지문 축자(정답 키 검증용), `단락(X,변형):` 은
// 첫 문장만 재진술한 **학생 표시면**이다. SENTENCE_ORDER 는 PASSTHROUGH_TYPES 라
// 표시면이 곧 저장·인쇄 형상이므로, 축자에만 걸린 검사는 표시면에서 전부 무방비다 —
// 적대검수가 이 사각으로 순서 번호 노출·분량 불균형·문장 융합을 실증했다. 그래서
// 여기서 (a) 변형본 전용 검사와 (b) **표시면 재집행**을 함께 소유한다.
// ============================================================================

import {
  SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES,
  SENTENCE_ORDER_MIN_PARAGRAPH_WORDS,
  countDisplaySentences,
  countWords,
} from "@/lib/question-quality/core";
import { SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO } from "@/lib/question-quality/validators/sentence-order";
import { normalizeWs } from "./parser";
import {
  GIVEN_KEY,
  foldForOrderMatch,
  orderDisplayParagraphs,
  splitOrderFirstSentence,
  type MdOrderQuestion,
} from "./parser-order";

// ── 변형 판정용 텍스트 계산 ─────────────────────────────────────────────────

/** 변형본에만 있는 토큰 수 — "축자를 그대로 옮기지 않았는가"의 0원 판정축. */
export function orderAddedTokenCount(source: string, variant: string): number {
  const bag = new Map<string, number>();
  for (const w of source.split(" ")) if (w) bag.set(w, (bag.get(w) ?? 0) + 1);
  let added = 0;
  for (const w of variant.split(" ")) {
    if (!w) continue;
    const n = bag.get(w) ?? 0;
    if (n > 0) bag.set(w, n - 1);
    else added += 1;
  }
  return added;
}

/** 재진술 정박 판정용 내용어 어간 집합(기능어 제외 + 경량 어미 절단). */
const ORDER_FUNCTION_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "in", "on", "at", "to", "for",
  "from", "by", "with", "without", "into", "onto", "over", "under", "about", "as",
  "that", "this", "these", "those", "such", "it", "its", "they", "them", "their",
  "he", "she", "his", "her", "we", "our", "you", "your", "is", "are", "was", "were",
  "be", "been", "being", "has", "have", "had", "do", "does", "did", "not", "no",
  "than", "then", "so", "too", "very", "more", "most", "much", "many", "out", "up",
  "down", "off", "only", "also", "any", "all", "both", "each", "other", "some",
  "there", "here", "when", "where", "while", "who", "whom", "whose", "which", "what",
]);

const stemOf = (w: string): string =>
  w.length < 3 ? "" : w.replace(/(?:ies|es|ed|ing|s)$/, "").slice(0, 6);

export function orderContentStems(folded: string): Set<string> {
  const out = new Set<string>();
  for (const w of folded.split(" ")) {
    if (w.length < 3 || ORDER_FUNCTION_WORDS.has(w)) continue;
    out.add(stemOf(w));
  }
  return out;
}

// 위치를 결정하는 응집 단서. 종류와 **방향**이 함께 보존돼야 순서가 유일하게 결정된다.
// 방향이 있는 종류는 `종류(방향)` 로 표기해 대조·진단에 그대로 쓴다 — later↔earlier 처럼
// 방향만 뒤집힌 재진술은 종류만 보면 통과하고, 표시면이 정답 키와 반대 순서를 지시한다
// (적대검수 실증). 사전은 유한 목록이라 **넓게** 잡는다: 좁으면 정상 재진술이 반려되고,
// 반려는 재생성 1회 뒤 잡 실패·환불이라 이 노브를 다시 고실패율로 되돌린다.
const ORDER_CUE_KINDS: Array<{ ko: string; re: RegExp }> = [
  { ko: "역접", re: /\b(?:however|nevertheless|nonetheless|but|yet|instead|conversely|whereas|although|though|even so|even though|in contrast|by contrast|by comparison|on the contrary|on the other hand|still|rather than|in spite of|despite|all the same|for all that)\b/ },
  { ko: "인과(결과)", re: /\b(?:therefore|thus|hence|consequently|accordingly|as a result|as a consequence|in consequence|that is why|which is why|so that|thereby)\b/ },
  { ko: "인과(원인)", re: /\b(?:because of (?:this|that|these|those|it)|for (?:this|that) reason|owing to (?:this|that|it)|due to (?:this|that|it)|that is because)\b/ },
  { ko: "예시", re: /\b(?:for example|for instance|to illustrate|in particular|a case in point|one case|one example|take the case of|one such|such cases|namely)\b/ },
  { ko: "부연", re: /\b(?:moreover|furthermore|in addition|besides|likewise|similarly|what is more|not only)\b/ },
  { ko: "시간·순서(후행)", re: /\b(?:then|later|afterward|afterwards|subsequently|finally|eventually|soon|in turn|by then|from then on|ultimately|in the end|no longer|ever since)\b/ },
  { ko: "시간·순서(선행)", re: /\b(?:earlier|initially|at first|previously|beforehand|originally|to begin with|at the outset|until then|before that)\b/ },
  { ko: "시간·순서", re: /\b(?:meanwhile|at the same time|over time|as time passed)\b/ },
];
const ORDER_EXPLETIVE_IT =
  /\bit (?:is|was|has been|had been|will be|would be|seems|seemed|appears|appeared|takes|took)\b(?:\s+[a-z]+){0,4}\s+(?:that|to)\b/g;
/** 맨 대명사 — 사실상 모든 영어 문장에 있어 위치 결정력이 낮다(약한 단서). */
const ORDER_PRONOUN_RE = /\b(?:it|its|they|them|their|theirs|he|she|him|her|hers)\b/;
const ORDER_DEMONSTRATIVES = new Set(["this", "these", "those", "such", "that"]);
/** 지시사 뒤가 이것이면 명사구가 아니다(this is … / such was …). */
const ORDER_NP_BLOCK = new Set([
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "will", "would",
  "can", "could", "may", "might", "must", "should", "do", "does", "did", "seems", "seemed",
  "appears", "appeared", "means", "meant", "makes", "made", "who", "which", "when", "where",
]);
/** 이 동사 뒤 `that` 은 보문절이지 지시사가 아니다(showed that scholars …). */
const ORDER_THAT_COMPLEMENT_VERBS = new Set([
  "show", "shows", "showed", "shown", "find", "finds", "found", "argue", "argues", "argued",
  "suggest", "suggests", "suggested", "mean", "means", "meant", "know", "knows", "knew",
  "believe", "believes", "believed", "say", "says", "said", "claim", "claims", "claimed",
  "note", "notes", "noted", "report", "reports", "reported", "think", "thinks", "thought",
  "assume", "assumes", "assumed", "conclude", "concludes", "concluded", "reveal", "reveals",
  "revealed", "imply", "implies", "implied", "ensure", "ensures", "ensured", "recall",
  "recalls", "recalled", "observe", "observes", "observed", "admit", "admits", "admitted",
  "agree", "agrees", "agreed", "so", "such", "now", "given", "except", "provided",
]);
// ⚠ 전치사 `in`(in that layered record)은 목록에서 뺀다 — 넣으면 'in that + 명사구'
//   되받기를 전부 놓친다(픽스처 실증). 보문 'in that ~' 은 그보다 드물다.

/**
 * 지시 명사구(this/these/those/such/that + (관사) + 명사구)의 **머리 어간**들.
 * 비면 지시 되받기가 없다는 뜻이다. 두 가지로 쓰인다 —
 *  (1) 강한 단서 '후방참조' 판정(맨 대명사는 여기 들어오지 않는다). 종전엔 it/they 까지
 *      후방참조로 세어, 이 검사가 "대명사가 하나라도 남았는가"로 퇴화해 있었다.
 *  (2) 되받는 **선행어**가 그대로인지 대조. 종류만 보면 'those remarks' → 'those copying
 *      errors' 처럼 지시 대상만 다른 조각으로 돌린 2단어 교체가 통과해 복수정답이 된다.
 * ⚠ 보문절 that 은 앞 동사로 배제한다. 완벽하진 않지만, 빼면 that-되받기·어휘 사슬이
 *   유일 단서인 첫 문장이 통째로 **무검사 구간**이 된다(적대검수 실증).
 */
export function orderDemonstrativeStems(folded: string): Set<string> {
  const t = folded.split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < t.length; i += 1) {
    if (!ORDER_DEMONSTRATIVES.has(t[i])) continue;
    if (t[i] === "that" && i > 0 && ORDER_THAT_COMPLEMENT_VERBS.has(t[i - 1])) continue;
    let j = i + 1;
    // 관사가 붙을 수 있는 지시사는 `such` 뿐이다. `that the margin mattered` ·
    // `the hours that the owner had agreed` 처럼 that/this + 관사는 언제나 보문절·
    // 관계절이라 여기서 값싸게 배제된다(보문절 오탐의 주계통).
    if (t[i] === "such" && (t[j] === "a" || t[j] === "an" || t[j] === "the")) j += 1;
    else if (t[j] === "a" || t[j] === "an" || t[j] === "the") continue;
    if (!t[j] || t[j].length < 2 || ORDER_NP_BLOCK.has(t[j])) continue;
    // 수식어 + 머리명사 2토큰까지만 본다(넓히면 뒤 동사·부사를 삼켜 대조가 흐려진다).
    for (let k = j; k < Math.min(j + 2, t.length); k += 1) {
      if (ORDER_FUNCTION_WORDS.has(t[k])) break;
      const stem = stemOf(t[k]);
      if (stem) out.add(stem);
    }
  }
  return out;
}

/**
 * 위치 결정력이 큰 단서 종류(방향 표기를 뗀 기준명). 시간·부연·맨 대명사는 보조라,
 * 강한 단서가 하나라도 살아 있으면 함께 떨어져도 순서는 결정된다 — 전부 보존을
 * 요구하면 정상 재진술을 대량 오탐한다(프로브 실증: 'But this narrow role soon
 * widened.' → 'But that limited role did not stay narrow for long.').
 */
const ORDER_STRONG_CUE_KINDS = new Set(["역접", "인과", "예시", "후방참조"]);

/** `인과(결과)` → `인과` — 강한 단서 판정·방향 뒤집힘 판정의 기준명. */
const orderCueBase = (cue: string): string => cue.replace(/\(.*$/, "");

/** fold 된 문장에서 위치 결정 단서 목록을 뽑는다(방향이 있는 종류는 `종류(방향)`). */
export function orderCohesionCues(folded: string): string[] {
  const kinds = ORDER_CUE_KINDS.filter((c) => c.re.test(folded)).map((c) => c.ko);
  if (orderDemonstrativeStems(folded).size > 0) kinds.push("후방참조");
  // 허사 it(it is … that/to)은 되받기가 아니다 — 세면 정상 재진술을 오탐한다.
  if (ORDER_PRONOUN_RE.test(folded.replace(ORDER_EXPLETIVE_IT, " "))) kinds.push("대명사");
  return kinds;
}

/**
 * 축자 → 변형본에서 **방향만 뒤집힌** 단서(같은 종류의 반대 방향이 새로 생겼고 축자에는
 * 그 방향이 없었다). 뒤집히면 표시면이 정답 키와 반대 순서를 지시해 이의신청 사안이 된다.
 */
export function orderFlippedCue(srcCues: string[], varCues: string[]): string | null {
  for (const cue of srcCues) {
    const dir = cue.match(/\(([^)]+)\)$/)?.[1];
    if (!dir) continue;
    const base = orderCueBase(cue);
    const opposite = varCues.find(
      (c) => orderCueBase(c) === base && /\([^)]+\)$/.test(c) && !c.endsWith(`(${dir})`),
    );
    if (opposite && !srcCues.includes(opposite)) return `${cue} → ${opposite}`;
  }
  return null;
}

// ── #11 정책 ────────────────────────────────────────────────────────────────

const VARIANT_WORD_RATIO: [number, number] = [0.6, 1.7];
const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const SENTENCE_END_RE = /[.!?]["'”’)\]]*$/;

/** 정답 배열에서 label 바로 앞에 오는 조각의 본문(첫 단락이면 주어진 글). */
function precedingChunk(q: MdOrderQuestion, sourceOrder: string[], label: string): string {
  const at = sourceOrder.indexOf(label);
  if (at < 0) return "";
  if (at === 0) return q.given;
  return q.paragraphs.find((p) => p.label === sourceOrder[at - 1])?.text ?? "";
}

/**
 * 변형본이 되받는 **선행어**가 그대로인지 — 지시 명사구의 머리 어간이 축자에서는 앞
 * 조각을 가리켰는데 변형본에서는 다른 조각을 가리키면, 표시면에서 다른 배열도 성립해
 * 복수정답이 된다. "앞 조각을 가리키던 어간이 사라졌고 + 다른 조각의 어간이 새로
 * 박혔을 때"만 반려한다(단순 동의어 교체는 통과 — 정상 재진술을 죽이지 않는다).
 */
function anchorRelocation(
  q: MdOrderQuestion,
  sourceOrder: string[],
  label: string,
  srcFold: string,
  varFold: string,
): string | null {
  if (sourceOrder.length !== 3) return null;
  const prev = precedingChunk(q, sourceOrder, label);
  if (!prev) return null;
  const prevStems = orderContentStems(foldForOrderMatch(prev));
  const srcAnchor = [...orderDemonstrativeStems(srcFold)].filter((s) => prevStems.has(s));
  if (srcAnchor.length === 0) return null; // 어휘로 확인 가능한 선행어가 없다 — 판정 보류.
  const varDem = orderDemonstrativeStems(varFold);
  if (srcAnchor.some((s) => varDem.has(s))) return null;
  const others: Array<{ key: string; text: string }> = [
    { key: GIVEN_KEY, text: q.given },
    ...q.paragraphs.filter((p) => p.label !== label && p.text !== prev).map((p) => ({ key: p.label, text: p.text })),
  ].filter((c) => c.text && c.text !== prev);
  for (const other of others) {
    const stems = orderContentStems(foldForOrderMatch(other.text));
    const hit = [...varDem].filter((s) => stems.has(s) && !prevStems.has(s));
    if (hit.length > 0) return other.key;
  }
  return null;
}

/**
 * 변형본 전용 검사 — 뒷문장 축자 동일 · 언어 · 1문장 · 종결부호 · 첫 문장 실제 변경 ·
 * 축자 통째 포함 금지 · 지문 축자 복사 금지 · 분량 · 단서 종류와 **방향** 보존 ·
 * 되받는 선행어 유지 · 내용 정박. 축자 줄 검사(#1~#6·#13)는 그대로 도므로 정답 키
 * 검증은 조금도 약해지지 않는다.
 */
export function orderVariantIssues(
  q: MdOrderQuestion,
  passage: string,
  sourceOrder: string[],
): string[] {
  const v: string[] = [];
  const byLabel = new Map(q.paragraphs.map((p) => [p.label, p.text]));
  const foldedPassage = foldForOrderMatch(passage);
  for (const variant of q.variants) {
    const key = `단락 ${variant.label} 변형본`;
    const source = byLabel.get(variant.label);
    if (!source) continue; // 라벨 결손은 게이트 #1·#11 이 이미 말한다.
    const { head: srcHead, tail: srcTail } = splitOrderFirstSentence(source);
    if (!srcTail) {
      v.push(`${key}: 축자 단락이 1문장이라 '첫 문장만 재진술'이 성립하지 않음`);
      continue;
    }
    const [varNorm, tailNorm] = [normalizeWs(variant.text), normalizeWs(srcTail)];
    if (!varNorm.endsWith(tailNorm)) {
      v.push(`${key}의 2번째 문장 이후가 축자와 다름 — 첫 문장만 재진술하고 나머지 문장은 '단락${variant.label}:' 줄을 한 글자도 바꾸지 말고 이어 붙여라`);
      continue;
    }
    const varHead = varNorm.slice(0, varNorm.length - tailNorm.length).trim();
    if (!varHead) {
      v.push(`${key}에 재진술된 첫 문장이 없음 — 축자 본문을 그대로 옮겨 적었다`);
      continue;
    }
    const [srcWords, varWords] = [countWords(srcHead), countWords(varHead)];
    if (varWords === 0) {
      v.push(`${key} 첫 문장에 영어 단어가 없음 — 지문과 같은 언어로 재진술하라`);
      continue;
    }
    // 한·영 혼용 — countWords 는 라틴 토큰만 세어 '영어 단어 0개' 검사를 비껴간다.
    if (HANGUL_RE.test(varHead)) {
      v.push(`${key} 첫 문장에 한글이 섞임 — 지문과 같은 언어(영어)로만 재진술하라`);
      continue;
    }
    // 문장 수는 **1문장 고정**이다. +1 을 허용하면 축자 첫 문장을 그대로 두고 앞에
    // 필러 한 문장만 붙여 '새 토큰 있음 + 지문 부분문자열 아님' 을 동시에 만족시키는
    // 우회가 열린다 — 암기 대상 문장이 바이트 그대로 살아남아 노브가 무력화된다.
    const varSentences = countDisplaySentences(varHead);
    if (splitOrderFirstSentence(varHead).tail) {
      v.push(`${key}이 첫 문장 하나를 ${varSentences}문장으로 늘림 — 변형본의 첫 문장은 1문장이어야 한다`);
      continue;
    }
    if (!SENTENCE_END_RE.test(varHead)) {
      v.push(`${key} 첫 문장이 종결부호로 끝나지 않음 — 마침표를 빠뜨리면 표시면에서 뒷문장과 한 문장으로 붙는다`);
      continue;
    }
    const [srcFold, varFold] = [foldForOrderMatch(srcHead), foldForOrderMatch(varHead)];
    if (orderAddedTokenCount(srcFold, varFold) === 0) {
      v.push(`${key} 첫 문장에 새 표현이 없음 — 축자를 그대로 옮기면 암기 무력화 효과가 없다`);
      continue; // 복사본에는 아래 검사가 전부 무의미하다.
    }
    if (varFold.includes(srcFold)) {
      v.push(`${key} 첫 문장이 축자 첫 문장을 통째로 품고 있음 — 앞뒤에 말을 덧붙이는 것은 재진술이 아니다`);
      continue;
    }
    if (foldedPassage.includes(varFold)) {
      v.push(`${key} 첫 문장이 지문 축자 구간을 그대로 옮겨 옴 — 자기 문장으로 다시 써라`);
    }
    if (srcWords > 0 && (varWords < srcWords * VARIANT_WORD_RATIO[0] || varWords > srcWords * VARIANT_WORD_RATIO[1])) {
      v.push(`${key} 첫 문장 분량 이탈 (${varWords}단어 vs 축자 ${srcWords}단어 — ${VARIANT_WORD_RATIO.join("~")}배 안에서 재진술하라)`);
    }
    // 단서 보존 — "자리를 결정하는 **그 단서**"가 종류도 방향도 그대로여야 한다.
    const srcCues = orderCohesionCues(srcFold);
    const varCues = orderCohesionCues(varFold);
    // ⚠ 완화(26-07-27 실사용 과잉차단 실측): 종전에는 **같은 종류의** 단서가
    // 그대로 남아야 통과였는데, 단서 사전이 유한해서 사전 밖 표현으로 옮긴 정상
    // 재진술을 반려했다(실측: KILLER 글의 순서 98s 소모 후 1차·2차 같은 사유로 사망).
    // 이제는 **단서가 통째로 사라진 경우**만 막는다 — 그건 순서가 정말 결정 불가다.
    // 종류는 남았는데 방향이 뒤집힌 경우는 아래 orderFlippedCue 가 따로 잡으므로
    // 정답 키 안전성은 유지된다.
    const strong = srcCues.filter((c) => ORDER_STRONG_CUE_KINDS.has(orderCueBase(c)));
    const need = strong.length > 0 ? strong : srcCues;
    if (need.length > 0 && varCues.length === 0) {
      v.push(`${key}에서 위치를 결정하는 응집 단서(${need.join("·")})가 모두 사라짐 — 최소 하나는 종류와 방향을 그대로 둔 채 주변 표현만 바꿔라. 단서가 없으면 순서가 결정되지 않는다`);
    }
    const flipped = orderFlippedCue(srcCues, varCues);
    if (flipped) {
      v.push(`${key}이 단서의 **방향**을 뒤집음 (${flipped}) — 종류만 같고 방향이 반대면 표시면이 정답 키와 반대 순서를 지시한다`);
    }
    const relocated = anchorRelocation(q, sourceOrder, variant.label, srcFold, varFold);
    if (relocated) {
      v.push(`${key}의 지시 대상이 앞 조각이 아니라 ${relocated} 쪽으로 옮겨감 — 되받는 선행어는 축자와 같은 것을 가리켜야 한다(다른 배열도 성립해 복수정답이 된다)`);
    }
    // 내용 정박 — '재진술'이 '다른 문장'으로 미끄러지는 것을 막는 축. 절대 하한을 높이면
    // "같은 뜻 다른 표현" 지시와 정면충돌해 이 노브를 다시 100% 실패로 만든 프롬프트↔
    // 게이트 자기모순이 재발한다(정찰 X3) — 그래서 1~2개로 낮게 잡는다.
    const [srcStems, varStems] = [orderContentStems(srcFold), orderContentStems(varFold)];
    const shared = [...varStems].filter((s) => srcStems.has(s)).length;
    const minShared = srcStems.size >= 8 ? 2 : 1;
    if (srcStems.size >= 3 && shared < minShared) {
      v.push(`${key}이 축자 첫 문장과 내용상 이어지지 않음 (공통 내용어 ${shared}개 — ${minShared}개 이상 필요). 같은 문장을 다시 쓰라는 뜻이지 다른 문장을 쓰라는 뜻이 아니다`);
    }
    // 단서가 하나도 안 잡히는 첫 문장(어휘 사슬형)은 종전에 **무검사**였다. 앞 조각과만
    // 공유하는 어휘를 대체 앵커로 삼아 최소 검사를 건다. 앵커는 "앞 조각에는 있고 다른
    // 조각에는 없는" 어간으로 좁힌다 — 모든 조각에 흔한 낱말(read·time…)을 세면 우연한
    // 한 개가 남았다는 이유로 진짜 사슬 삭제를 통과시키고(프로브 실증), 반대로 좁히면
    // 동의어 교체도 **앞 조각의 다른 고유 어휘**를 집으면 통과한다(오탐도 함께 준다).
    if (need.length === 0 && sourceOrder.length === 3) {
      const prev = precedingChunk(q, sourceOrder, variant.label);
      const elsewhere = new Set(
        [{ label: "", text: q.given }, ...q.paragraphs]
          .filter((c) => c.text && c.text !== prev && c.label !== variant.label)
          .flatMap((c) => [...orderContentStems(foldForOrderMatch(c.text))]),
      );
      const prevOnly = [...orderContentStems(foldForOrderMatch(prev))].filter((s) => !elsewhere.has(s));
      const chain = [...srcStems].filter((s) => prevOnly.includes(s));
      if (chain.length > 0 && !prevOnly.some((s) => varStems.has(s))) {
        v.push(`${key}이 앞 조각과 이어 주던 어휘 사슬(${chain.slice(0, 3).join("·")})을 전부 지움 — 이 문장에는 연결사도 지시사도 없어 그 사슬이 유일한 자리 근거다`);
      }
    }
    // 정박 **대상** — 다른 단락과 훨씬 더 겹치면 그 단락의 재진술이고, 학생 표면에는
    // 엉뚱한 구간이 이 단락 첫 문장으로 실려 문항이 죽는다(축자 복사 검사로는 못 잡는다).
    const closest = q.paragraphs
      .filter((p) => p.label !== variant.label)
      .map((p) => ({ label: p.label, n: [...varStems].filter((s) => orderContentStems(foldForOrderMatch(p.text)).has(s)).length }))
      .reduce((a, b) => (b.n > a.n ? b : a), { label: "", n: 0 });
    if (closest.n >= 3 && closest.n >= shared + 2) {
      v.push(`${key}이 자기 축자 첫 문장보다 단락 ${closest.label} 과(와) 훨씬 더 겹침 (공통 내용어 ${closest.n}개 vs ${shared}개) — 재진술 대상은 그 단락 자신의 첫 문장이다`);
    }
  }
  return v;
}

/**
 * #4·#5 를 **표시면**(변형본이 있으면 변형본)에서 한 번 더 집행한다. 축자는 균형인데
 * 표시면만 하한 미달·불균형인 문항이 그대로 출하되던 사각을 메운다 — 학생은 유독 긴
 * 단락을 결론 자리로 찍는 분량 추정이 가능해지고, fast 검증기가 내는
 * paragraph-too-thin 은 md-stream 이 기록만 하므로 차단하지 못한다.
 */
export function orderDisplayShapeIssues(q: MdOrderQuestion): string[] {
  const v: string[] = [];
  const shown = orderDisplayParagraphs(q);
  if (shown.length !== 3 || shown.some((p) => !p.text)) return v;
  const words: number[] = [];
  for (const p of shown) {
    const [sentences, count] = [countDisplaySentences(p.text), countWords(p.text)];
    words.push(count);
    if (sentences < SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES) {
      v.push(`표시면 기준 단락 ${p.label} 이 ${sentences}문장 (${SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES}문장 이상 필요) — 학생이 보는 것은 변형본이다`);
    }
    if (count < SENTENCE_ORDER_MIN_PARAGRAPH_WORDS) {
      v.push(`표시면 기준 단락 ${p.label} 이 ${count}단어 (${SENTENCE_ORDER_MIN_PARAGRAPH_WORDS}단어 이상 필요) — 재진술로 줄이지 마라`);
    }
  }
  const spread = Math.max(...words) / Math.min(...words);
  if (Math.min(...words) > 0 && spread > SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO) {
    v.push(`표시면 기준 단락 분량 불균형 (${words.join("/")}단어 — 최대/최소 ${SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO} 이하 필요). 축자는 균형이어도 변형본 분량이 어긋나면 분량으로 답이 드러난다`);
  }
  return v;
}
