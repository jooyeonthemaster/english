// ============================================================================
// 글의 순서(SENTENCE_ORDER) md 파서 · 0원 스냅 · 축자 좌표 유틸 · 변형본 판정.
// 견본: parser-antonym.ts / 정밀 스펙: docs/md-qgen-recon-synthesis.md §3-C4·C5
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 계약 방향이 다른 유형과 반대다. 순서는 "지문을 변형 없이 네 조각으로 무손실
// 분할했는가"가 전부라, 최강 불변식이 하나 있다 —
//   주어진 글 + (원문 순서로 이어 붙인 세 단락) == 지문 전체
// 이 한 줄이 통과하면 축자 분할·비중첩·무손실·전량 커버가 동시에 증명된다.
//
// ⚠ 단락 변형(prefixVariationCount≥1)은 **2단 출력**으로 이 불변식을 지킨다:
//   `단락(A):` 는 언제나 축자(불변식 검사용), `단락(A,변형):` 은 첫 문장만 재진술한
//   학생 표면본이다. 축자 게이트는 축자 줄로 그대로 돌고, 변형 줄은 전용 검사만
//   받는다(gate-order #11) — 정답 키 검증은 조금도 약해지지 않는다. 이 파일은 그
//   판정에 쓰이는 좌표·문장 계산(첫 문장 절단·꼬리 재적재·표시면 선택)을 소유하고,
//   단서·어간 계산과 #11 정책은 gate-order-variant.ts 로 나갔다(500줄 규약).
//
// ⚠ 게이트 본체는 gate-order.ts 로 분리했다(파일 500줄 규약). 의존 방향은
//   gate-order → parser-order 단방향이다(재수출로 순환을 만들지 마라).
// ⚠ 후처리(PASSTHROUGH_TYPES)가 전혀 없다 — 게이트에서 못 잡으면 그대로 출하된다.
// ============================================================================

export interface MdOrderParagraph {
  /** "(A)"|"(B)"|"(C)" — 리터럴 고정(렌더러·검증기가 이 문자열을 그대로 본다) */
  label: string;
  text: string;
}

/** 단락 변형본 — `단락(A,변형):` 줄. 첫 문장만 재진술하고 나머지는 축자 그대로. */
export interface MdOrderVariant {
  label: string;
  text: string;
}

export interface MdOrderOption {
  /** "①"~"⑤" */
  label: string;
  /** 모델이 적은 원문 그대로(진단용) */
  text: string;
  /** 정규화 순열 ["(B)","(C)","(A)"] — 해석 실패 시 빈 배열 */
  order: string[];
}

export interface MdOrderQuestion {
  kind: "sentenceOrder";
  /** 제시문 — 언제나 지문 축자다(변형 대상이 아니다) */
  given: string;
  /** 단락 변형본(prefixVariationCount>=1 일 때만) — 라벨 순서대로 앞에서 N개 */
  variants: MdOrderVariant[];
  paragraphs: MdOrderParagraph[];
  options: MdOrderOption[];
  answer: string;
  explanation: string;
  wrong: { label: string; text: string }[];
}

export const ORDER_LABELS: readonly string[] = ["(A)", "(B)", "(C)"];
/** 조각 식별 키(진단 문구에 그대로 노출된다) — 단락은 라벨 자체가 키다. */
export const GIVEN_KEY = "주어진 글";

/** (A)(B)(C) 순열 해석 — validators 재사용 금지(레이어 분리)라 로컬 복제 + 관용 확장. */
export function parseOrderPermutation(value: unknown): string[] | null {
  const text = String(value ?? "").toUpperCase();
  let labels = [...text.matchAll(/[（([]\s*([ABC])\s*[）)\]]/g)].map((m) => `(${m[1]})`);
  if (labels.length !== 3) {
    // 괄호를 빠뜨린 드리프트("A-B-C" / "A → B → C") 흡수.
    const bare = text.match(/\b([ABC])\b/g) ?? [];
    if (bare.length !== 3) return null;
    labels = bare.map((l) => `(${l})`);
  }
  const unique = new Set(labels);
  return unique.size === 3 && ORDER_LABELS.every((l) => unique.has(l)) ? labels : null;
}

/** 순열 배열 → 저장·표시 리터럴 "(B)-(C)-(A)". */
export function orderPermutationText(order: string[]): string {
  return order.join("-");
}

/**
 * 순서 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 괄호 표기 흔들림, 콜론 전각, `단락` 머리표 뒤 공백, 단락 본문 개행,
 * 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdSentenceOrder(text: string): MdOrderQuestion {
  const given =
    text.match(/^주어진\s*글\s*[:：]\s*(.+)$/m)?.[1]?.trim() ??
    text.match(/^제시문\s*[:：]\s*(.+)$/m)?.[1]?.trim() ??
    "";
  // 한 줄 계약이 기본. 실패(3개 미만)일 때만 개행 드리프트 폴백으로 흡수한다 —
  // 폴백을 먼저 돌리면 정상 출력에서도 뒤 라인들을 삼킬 위험이 있다.
  const head = /^단락\s*[(（[]?\s*([ABCabc])\s*[)）\]]?\s*[:：]\s*/;
  const stop = `(?=^단락\\s*[(（[]?\\s*[ABCabc]|^[①②③④⑤]|^정답\\s*[:：]|^해설\\s*[:：]|$(?![\\s\\S]))`;
  const singleLine = [...text.matchAll(new RegExp(`${head.source}(.+)$`, "gm"))];
  const matches =
    singleLine.length >= 3
      ? singleLine
      : [...text.matchAll(new RegExp(`${head.source}([\\s\\S]*?)${stop}`, "gm"))];
  // 개행 폴백 경로의 여러 줄은 한 줄로 접는다(저장 형상은 항상 한 줄).
  const paragraphs: MdOrderParagraph[] = matches.map((m) => ({
    label: `(${m[1].toUpperCase()})`,
    text: m[2].replace(/\s+/g, " ").trim(),
  }));

  // 변형본 줄 `단락(A,변형):` — 라벨과 콜론 사이에 `변형` 이 끼므로 위 head 정규식과
  // 서로 배타적이다(축자 줄이 변형 줄을 삼키지 않는다). 표기 흔들림만 흡수한다.
  const varHead =
    /^단락\s*[(（[]?\s*([ABCabc])\s*[)）\]]?\s*[,，、]?\s*[(（[]?\s*변형\s*[)）\]]?\s*[:：]\s*/;
  const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
  const varMulti = new Map(
    [...text.matchAll(new RegExp(`${varHead.source}([\\s\\S]*?)${stop}`, "gm"))].map((m) => [
      m.index ?? -1,
      collapse(m[2]),
    ]),
  );
  const variants: MdOrderVariant[] = [
    ...text.matchAll(new RegExp(`${varHead.source}(.+)$`, "gm")),
  ].map((m) => {
    const one = collapse(m[2]);
    // 개행 드리프트를 축자 줄과 **같은 2단 전략**으로 흡수한다. 확장 조건은 "한 줄
    // 포획이 문장 미완결" 로 좁힌다 — 정상 출력에서 뒤 라인을 삼키지 않으면서 접힌
    // 줄만 복원한다(변형 줄만 잘려 variation>0 에서만 잡이 죽던 비대칭 봉합).
    const many = varMulti.get(m.index ?? -1) ?? "";
    const folded = !/[.!?]["'”’)\]]*$/.test(one) && many.startsWith(one) && many.length > one.length;
    return { label: `(${m[1].toUpperCase()})`, text: folded ? many : one };
  });

  const beforeWrong = text.split(/^오답\s*[:：]/m)[0] ?? text;
  const answer = text.match(/^정답\s*[:：]\s*([①②③④⑤])/m)?.[1] ?? "";
  const optionLine = /^([①②③④⑤])\s*(.+)$/gm;
  const options: MdOrderOption[] = [...beforeWrong.matchAll(optionLine)].map((m) => ({
    label: m[1],
    text: m[2].trim(),
    order: parseOrderPermutation(m[2].trim()) ?? [],
  }));

  const wrongSection =
    text.split(/^오답\s*[:：]\s*$/m)[1] ?? text.split(/^오답\s*[:：]/m)[1] ?? "";
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  // 이 필터는 "조용한 데이터 버림"이 아니다: 게이트 #12 가 남은 라벨 **집합**을
  // 선지-정답 집합과 대조하므로(gate-order.ts), 필터로 생긴 결손·중복은 전부
  // 게이트에 드러난다. 무해한 드리프트만 흡수하고 결함은 흡수하지 않는 경계다.
  const wrong = [...wrongSection.matchAll(optionLine)]
    .map((m) => ({ label: m[1], text: m[2].trim() }))
    .filter((w) => w.label !== answer);

  const explanation =
    text.match(/^해설\s*[:：]\s*([\s\S]*?)(?=^오답\s*[:：])/m)?.[1]?.trim() ??
    text.match(/^해설\s*[:：]\s*([\s\S]+)$/m)?.[1]?.trim() ??
    "";
  return { kind: "sentenceOrder", given, variants, paragraphs, options, answer, explanation, wrong };
}

// ── 축자 분할 판정용 fold + 원문 좌표 역매핑 ────────────────────────────────
// 구두점 무관 대조(alnum+공백만)는 fast 검증기의 실측 교훈이다: 모델이 곱슬따옴표·
// em-dash·말줄임을 정규화하면 축자 대조가 깨져 정상 문항이 전멸했다(validators/
// sentence-order.ts:674-682). 단어 수준 재작성은 여전히 잡힌다. 여기서는 fold 인덱스 →
// 원문 인덱스 역매핑까지 만들어, fold 로 자리를 찾은 뒤 원문 문자 그대로 조각을
// 복원(스냅)하고 **절단선이 문장 경계인지**까지 원문 좌표에서 판정한다.

/** map[i] = folded[i] 에 대응하는 원문 인덱스. */
function foldWithMap(source: string): { folded: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < source.length; i += 1) {
    const lower = source[i].toLowerCase();
    const c = lower.length === 1 ? lower : " ";
    if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9"))) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && chars.length > 0) {
      chars.push(" ");
      map.push(i);
    }
    pendingSpace = false;
    chars.push(c);
    map.push(i);
  }
  return { folded: chars.join(""), map };
}

/** 구두점 무관 비교용 정규화(alnum + 단일 공백). */
export function foldForOrderMatch(source: string): string {
  return foldWithMap(source).folded;
}

/** fold 문자열의 토큰 수 — 유실·중복 구간 진단 문구에 쓴다. */
export function countFoldTokens(folded: string): number {
  return (folded.match(/[a-z0-9]+/g) ?? []).length;
}

/** fold 좌표 [start, end) 구간. */
export interface OrderChunkSpan {
  key: string;
  start: number;
  end: number;
}

function allOccurrences(haystack: string, needle: string): number[] {
  const starts: number[] = [];
  if (!needle) return starts;
  for (let from = 0; ; from = starts[starts.length - 1] + 1) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    starts.push(index);
  }
  return starts;
}

/**
 * 조각(주어진 글·단락 3개)의 fold 구간을 원문에서 확정한다. 첫 등장 고정은 반복 구
 * 에서 가짜 중복/누락을 만든다(fast 검증기 W2-D 정정) — 겹치지 않는 배치를 완전탐색
 * (조각 4개, 후보 소수)으로 고르고, 여럿이면 전체 폭이 최소인 가장 촘촘한 타일링을
 * 택한다. 겹치지 않는 배치가 아예 없으면(진짜 중복) 첫 등장 배치로 폴백한다.
 */
export function locateOrderChunks(
  passage: string,
  chunks: { key: string; text: string }[],
): { spans: OrderChunkSpan[]; missing: string[] } {
  const foldedPassage = foldForOrderMatch(passage);
  const missing: string[] = [];
  const pool: Array<{ key: string; length: number; starts: number[] }> = [];
  for (const chunk of chunks) {
    const folded = foldForOrderMatch(chunk.text);
    const starts = folded ? allOccurrences(foldedPassage, folded) : [];
    if (starts.length === 0) missing.push(chunk.key);
    else pool.push({ key: chunk.key, length: folded.length, starts });
  }
  if (missing.length > 0 || pool.length === 0) return { spans: [], missing };

  const span = (key: string, start: number, len: number): OrderChunkSpan => ({ key, start, end: start + len });
  const fallback = pool.map((p) => span(p.key, p.starts[0], p.length));
  const overlaps = (a: OrderChunkSpan, b: OrderChunkSpan) => a.start < b.end && b.start < a.end;
  const combos: OrderChunkSpan[][] = [];
  const current: OrderChunkSpan[] = [];
  const recurse = (index: number) => {
    if (combos.length > 64) return; // 폭주 방지 — 반복 구가 많은 지문 방어
    if (index === pool.length) return void combos.push(current.map((s) => ({ ...s })));
    for (const start of pool[index].starts) {
      const candidate = span(pool[index].key, start, pool[index].length);
      if (current.some((placed) => overlaps(placed, candidate))) continue;
      current.push(candidate);
      recurse(index + 1);
      current.pop();
    }
  };
  recurse(0);
  if (combos.length === 0) return { spans: fallback, missing };
  const width = (c: OrderChunkSpan[]) =>
    Math.max(...c.map((s) => s.end)) - Math.min(...c.map((s) => s.start));
  return { spans: combos.reduce((a, b) => (width(b) < width(a) ? b : a)), missing };
}

/**
 * fold 구간 → **원문 문자 좌표** [start, end). 절단선이 문장 경계인지 판정하려면
 * fold(구두점을 지운 축)로는 볼 수 없다 — 이음매의 마침표가 fold 에서 사라지기
 * 때문이다. 게이트 #6-b 가 이 좌표로 원문 이음매 문자열을 직접 읽는다.
 */
export function orderSourceBounds(
  passage: string,
  spans: OrderChunkSpan[],
): Array<{ key: string; start: number; end: number }> {
  const { map } = foldWithMap(passage);
  return spans.map((s) => ({
    key: s.key,
    start: map[s.start] ?? 0,
    end: (map[s.end - 1] ?? passage.length - 1) + 1,
  }));
}

/** 학생 표시면(=PASSTHROUGH 저장·인쇄 형상) — 변형본이 있는 라벨은 변형본, 없으면 축자.
 *  게이트와 어댑터가 **이 함수 하나**를 공유해야 두 면이 어긋날 수 없다. */
export function orderDisplayParagraphs(q: MdOrderQuestion): MdOrderParagraph[] {
  const byLabel = new Map(q.variants.map((x) => [x.label, x.text]));
  return q.paragraphs.map((p) => ({ label: p.label, text: byLabel.get(p.label) || p.text }));
}

// ── 첫 문장 절단 · 응집 단서 추출 ────────────────────────────────────────────

/** 문장 끝처럼 보이지만 뒤에 말이 더 오는 약어(gate-order #6-b 사전과 같은 계통). */
const ORDER_FIRST_SENTENCE_ABBR =
  /(?:^|\s)(?:mr|mrs|ms|dr|prof|rev|gen|sen|rep|gov|col|lt|sgt|capt|fig|vol|vs|cf|viz|sr|jr|st|no|e\.g|i\.e)\.$/i;

/**
 * 첫 문장과 나머지를 가른다. 변형 계약("첫 문장만 재진술, 2번째 문장부터 축자")을
 * 기계로 판정하려면 이 경계가 필요하다. 소수점·이니셜(U.S.)·약어 마침표는 문장 끝이
 * 아니다. 경계를 못 찾으면 tail 이 빈 문자열이다(= 1문장 단락, 게이트 #4 가 담당).
 */
export function splitOrderFirstSentence(text: string): { head: string; tail: string } {
  const s = text.trim();
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    if (ch === ".") {
      const prefix = s.slice(0, i + 1);
      if (/\d/.test(s[i - 1] ?? "") && /\d/.test(s[i + 1] ?? "")) continue;
      if (ORDER_FIRST_SENTENCE_ABBR.test(prefix)) continue;
      // 이니셜·압축 라틴 약어(U.S. · A. Smith): 한 글자 + 마침표 뒤에 글자가 이어진다.
      if (/(?:^|\s)[A-Za-z]\.$/.test(prefix) && /^[A-Za-z]/.test(s.slice(i + 1).trim())) continue;
    }
    let end = i + 1;
    while (end < s.length && /[.!?”’"')\]]/.test(s[end])) end += 1;
    const tail = s.slice(end).trim();
    if (tail) return { head: s.slice(0, end).trim(), tail };
  }
  return { head: s, tail: "" };
}

/**
 * 변형본의 **꼬리**(2번째 문장 이후)를 새 축자 꼬리로 갈아 끼운다. 실패하면 null.
 * 스냅이 축자 줄만 보정하면 두 줄이 어긋나 게이트 #11-(1)이 반려하는데, 그 드리프트는
 * variation=0 에서는 조용히 흡수되던 것이라 설정 하나 때문에 잡이 죽는다(적대검수 실증).
 */
function reattachOrderVariantTail(variant: string, oldTail: string, newTail: string): string | null {
  const [varFold, oldFold] = [foldForOrderMatch(variant), foldForOrderMatch(oldTail)];
  if (!oldFold || !newTail || !varFold.endsWith(oldFold)) return null;
  const { map } = foldWithMap(variant);
  let cut = map[varFold.length - oldFold.length] ?? -1;
  if (cut < 0) return null;
  // 꼬리 앞의 공백·여는 따옴표는 꼬리 쪽 문자다(닫는 따옴표는 머리 쪽이라 건드리지 않는다).
  while (cut > 0 && /[\s“‘([]/.test(variant[cut - 1])) cut -= 1;
  const head = variant.slice(0, cut).trim();
  return head ? `${head} ${newTail}` : null;
}

/** fold 구간 → 원문 축자 조각(앞뒤 인용부호·종결 구두점까지 보수적으로 복원). */
function sliceOriginal(passage: string, s: OrderChunkSpan): string {
  const { map } = foldWithMap(passage);
  let start = map[s.start] ?? 0;
  let end = (map[s.end - 1] ?? passage.length - 1) + 1;
  for (let i = 0; i < 2 && start > 0 && /["'“‘([]/.test(passage[start - 1]); i += 1) start -= 1;
  for (let i = 0; i < 4 && end < passage.length && /[^\sA-Za-z0-9]/.test(passage[end]); i += 1) end += 1;
  return passage.slice(start, end).trim();
}

/**
 * 0원 자동 보정. 반려 주계통 두 가지를 흡수한다 — (1) 단락 제시 순서 뒤바뀜은 라벨
 * 기준으로 (A)(B)(C) 정렬(제시 순서의 진실원은 라벨이다), (2) 구두점 정규화 드리프트는
 * fold 로 자리를 찾은 뒤 원문 문자 그대로 재적재(곱슬따옴표·em-dash 를 곧은 문자로 바꿔
 * 적는 실측 패턴). 단어 수준 재작성은 fold 단계에서 자리를 못 찾아 보정되지 않고 게이트로
 * 간다 — "애매하면 그대로 두고 게이트가 반려하게 한다"는 정본 보수 가드 그대로다.
 */
export function autoSnapOrderChunks(
  q: MdOrderQuestion,
  passage: string,
): { question: MdOrderQuestion; corrections: string[] } {
  const corrections: string[] = [];
  let paragraphs = q.paragraphs;
  const rank = (l: string) => ORDER_LABELS.indexOf(l);
  if (
    paragraphs.length === 3 &&
    paragraphs.map((p) => p.label).join("") !== ORDER_LABELS.join("") &&
    new Set(paragraphs.map((p) => p.label)).size === 3 &&
    paragraphs.every((p) => rank(p.label) >= 0)
  ) {
    paragraphs = [...paragraphs].sort((a, b) => rank(a.label) - rank(b.label));
    corrections.push("단락 제시 순서를 (A)(B)(C) 로 정렬");
  }

  // 변형 줄도 같은 축으로 정렬한다 — 단락을 정렬해 놓고 변형 줄만 뒤바뀐 채 두면
  // 게이트 #11 의 라벨 순서 검사가 무해한 제시 드리프트를 반려로 만든다.
  let variants = q.variants;
  const variantRun = variants.map((x) => x.label).join("");
  if (variants.length > 1 && new Set(variants.map((x) => x.label)).size === variants.length) {
    const sorted = [...variants].sort((a, b) => rank(a.label) - rank(b.label));
    if (sorted.map((x) => x.label).join("") !== variantRun) {
      variants = sorted;
      corrections.push("단락 변형본 제시 순서를 (A)(B)(C) 로 정렬");
    }
  }

  let given = q.given;
  if (paragraphs.length === 3 && given) {
    const chunks = [
      { key: GIVEN_KEY, text: given },
      ...paragraphs.map((p) => ({ key: p.label, text: p.text })),
    ];
    const { spans, missing } = locateOrderChunks(passage, chunks);
    if (missing.length === 0 && spans.length === chunks.length) {
      const byKey = new Map(spans.map((s) => [s.key, s]));
      const exactOf = (key: string, current: string): string => {
        const span = byKey.get(key);
        const exact = span ? sliceOriginal(passage, span) : "";
        if (!exact || exact === current) return current;
        corrections.push(`${key} 을(를) 지문 축자로 보정(구두점 드리프트)`);
        return exact;
      };
      given = exactOf(GIVEN_KEY, given);
      const before = new Map(paragraphs.map((p) => [p.label, p.text]));
      paragraphs = paragraphs.map((p) => ({ ...p, text: exactOf(p.label, p.text) }));
      // 축자 줄을 보정했으면 같은 라벨 변형본의 꼬리도 같은 축으로 옮긴다. 모델은 두
      // 줄에 같은 드리프트를 일관되게 쓰므로, 축자만 보정하면 정합이 깨진다.
      const after = new Map(paragraphs.map((p) => [p.label, p.text]));
      variants = variants.map((x) => {
        const [old, next] = [before.get(x.label) ?? "", after.get(x.label) ?? ""];
        if (!old || !next || old === next) return x;
        const fixed = reattachOrderVariantTail(
          x.text,
          splitOrderFirstSentence(old).tail,
          splitOrderFirstSentence(next).tail,
        );
        if (!fixed || fixed === x.text) return x;
        corrections.push(`${x.label} 변형본 꼬리를 지문 축자로 보정(구두점 드리프트)`);
        return { ...x, text: fixed };
      });
    }
  }

  return {
    question: corrections.length > 0 ? { ...q, given, paragraphs, variants } : q,
    corrections,
  };
}
