// ============================================================================
// 반의어(ANTONYM) md 파서 · 0원 스냅 · 0원 게이트.
// 【신규 유형 승차의 견본(EXEMPLAR)】 정본 규약 답습:
//   파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 이 유형은 지문을 **변형하지 않는다**(어법·어휘와 반대 계약). 따라서
// "변형된 마커 개수 == 정답 개수" 가 아니라 **변형 0** 이 불변식이다 —
// gateMdQuestion 의 어법 분기를 복사하면 100% 반려된다(정찰 R2 경고).
// ============================================================================

import { countWordBoundaryMatches, normalizeWs } from "./parser";
import { findAntonymSurfaceFormIssue } from "@/lib/question-quality/validators/antonym";

/** 전역 정규식은 lastIndex 를 공유하므로 정본 INLINE_MARK_RE 를 재사용하지 않고 로컬 선언. */
export const INLINE_ANTONYM_MARK_RE = /\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g;

export interface MdAntonymPair {
  /** "(A)"~"(J)" */
  label: string;
  /** 지문 축자 표적 단어 */
  word: string;
  /** 선지에 표시할 짝 단어 */
  antonym: string;
}

export interface MdAntonymQuestion {
  kind: "antonym";
  /** [[A:단어]] 로 마킹된 지문 전체 */
  markedPassage: string;
  pairs: MdAntonymPair[];
  /** 반의 관계가 성립하지 않는 쌍의 라벨 — 정답의 유일한 진실원 */
  answer: string;
  /** 정답 자리 단어의 문맥상 실제 반의어 (어법 정본의 `고침:` 대칭) */
  correctAntonym: string;
  explanation: string;
  wrong: { label: string; text: string }[];
}

const LABEL_KEYS = "ABCDEFGHIJ";

function parenLabel(raw: string): string {
  const key = raw.trim().replace(/[()[\].:]/g, "").toUpperCase();
  return key.length === 1 && LABEL_KEYS.includes(key) ? `(${key})` : "";
}

// 라벨로 시작하는 줄만 쌍 후보로 본다. 라벨 앞의 마크다운 장식(불릿·굵게)과
// 표 파이프는 흡수한다 — 모델이 목록을 꾸미는 실측 드리프트.
const PAIR_LINE_HEAD =
  /^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?[([]?([A-Ja-j])[)\].]?(?:\*\*)?\s*(.+)$/;

/**
 * "word - antonym" 을 분리한다. 하이픈 포함 단어(well-being)를 깨지 않도록
 * **공백으로 둘러싸인 대시**를 우선 경계로 삼고, 없을 때만 맨 뒤 맨몸 대시로 폴백한다.
 */
function splitWordAndAntonym(segment: string): { word: string; antonym: string } | null {
  const spaced = segment.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (spaced) return { word: spaced[1].trim(), antonym: spaced[2].trim() };
  const bare = segment.match(/^(.+)[-–—](.+)$/);
  if (bare) return { word: bare[1].trim(), antonym: bare[2].trim() };
  return null;
}

/**
 * `짝:` 섹션을 줄 단위로 관대하게 파싱한다.
 *
 * 형식 단순화(26-07-26 실사용 반려 2연속의 근본 처방): 종전에는 줄마다
 * `| O/X | 바른짝` 칸을 더 받았는데, 정답 정보가 `정답:` 줄과 **중복**이라
 * 계약만 늘고 실패 모드가 늘었다. 실측 두 건이 정확히 그 칸에서 났다
 * (① 줄 유실 → "어휘쌍 3개" ② 모델이 `||` 로 써서 칸이 밀림).
 * 이제 쌍 줄은 `라벨 단어 - 짝단어` **한 형태뿐**이고, 정답과 바른짝은
 * 어법 정본과 동일하게 `정답:` · `바른짝:` 전용 줄이 진실원이다.
 * 줄에 파이프가 남아 있어도(표 형식 드리프트) 첫 칸만 취해 흡수한다.
 */
function parsePairLines(section: string): MdAntonymPair[] {
  const pairs: MdAntonymPair[] = [];
  for (const rawLine of section.split(/\r?\n/)) {
    const head = rawLine.match(PAIR_LINE_HEAD);
    if (!head) continue;
    const label = parenLabel(head[1]);
    if (!label) continue;
    // 파이프가 섞여 오면(표 행·잔여 칸 드리프트) 쌍으로 읽히는 첫 칸을 취한다.
    const split = head[2]
      .split("|")
      .map((seg) => splitWordAndAntonym(seg.trim()))
      .find((r): r is { word: string; antonym: string } => r !== null);
    if (!split) continue;
    pairs.push({ label, word: split.word, antonym: split.antonym });
  }
  return pairs;
}

/**
 * 반의어 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림, 구분자 주변 공백, 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdAntonym(text: string): MdAntonymQuestion {
  const markedPassage =
    text.match(/^밑줄지문:\s*\n([\s\S]*?)(?=^짝:)/m)?.[1]?.trim() ?? "";
  const pairSection = text.split(/^짝:\s*$/m)[1] ?? text.split(/^짝:/m)[1] ?? "";
  const beforeWrong = pairSection.split(/^오답:/m)[0] ?? pairSection;
  const wrongSection =
    text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";

  const answer = parenLabel(
    text.match(/^정답:\s*[([]?([A-Ja-j])[)\].]?/m)?.[1] ?? "",
  );

  const pairs = parsePairLines(beforeWrong);

  const wrong = [...wrongSection.matchAll(/^[([]?([A-Ja-j])[)\].]?\s*(.+)$/gm)]
    .map((m) => ({ label: parenLabel(m[1]), text: m[2].trim() }))
    .filter((w) => w.label && w.label !== answer);

  return {
    kind: "antonym",
    markedPassage,
    pairs,
    answer,
    correctAntonym: text.match(/^바른짝:\s*(.+)$/m)?.[1]?.trim() ?? "",
    explanation:
      text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
      text.match(/^해설:\s*([\s\S]+)$/m)?.[1]?.trim() ??
      "",
    wrong,
  };
}

/** 밑줄지문의 마커를 라벨→표현으로 수집한다(지문 등장 순). */
export function collectAntonymMarks(
  markedPassage: string,
): { label: string; shown: string }[] {
  return [...markedPassage.matchAll(INLINE_ANTONYM_MARK_RE)].map((m) => ({
    label: `(${m[1]})`,
    shown: m[2].trim(),
  }));
}

/** 마커를 걷어낸 순수 지문으로 되돌린다(재구성 대조용). */
export function stripAntonymMarks(markedPassage: string): string {
  return markedPassage.replace(INLINE_ANTONYM_MARK_RE, (_full, _l, expr: string) =>
    String(expr),
  );
}

/**
 * 0원 자동 보정. 이 유형의 진실원은 **밑줄지문의 마커 내용**이다(위치가 이미
 * 지문 안에 확정돼 있으므로). `짝:` 섹션의 word 가 마커와 다르게 적힌 실측
 * 드리프트를 마커 내용으로 갈아 끼운다 — autoSnapGrammarMarks v2 와 동일 사상.
 */
export function autoSnapAntonymPairs(
  q: MdAntonymQuestion,
  passage: string,
): { question: MdAntonymQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const marks = new Map(collectAntonymMarks(q.markedPassage).map((m) => [m.label, m.shown]));
  const pairs = q.pairs.map((p) => {
    const shown = marks.get(p.label);
    if (!shown || normalizeWs(shown) === normalizeWs(p.word)) return p;
    // 보수 가드 — 마커 내용이 원 지문에 단어 경계로 실재할 때만 채택한다.
    // 마커 자체가 오염된 경우(모델이 지문을 고쳐 씀)까지 보정하면 원문과 다른
    // 것을 저장하게 되므로, 그 경우는 손대지 않고 게이트가 반려하게 둔다.
    if (countWordBoundaryMatches(passage, shown) !== 1) return p;
    corrections.push(`${p.label} 표적 단어를 밑줄지문 마커 축자로 보정`);
    return { ...p, word: shown };
  });
  return { question: { ...q, pairs }, corrections };
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdAntonym(
  q: MdAntonymQuestion,
  passage: string,
  options?: { pairCount?: number; requireWrong?: boolean },
): string[] {
  const requireWrong = options?.requireWrong !== false;
  const pairCount = options?.pairCount ?? q.pairs.length;
  const v: string[] = [];
  const pn = normalizeWs(passage);

  // #1 개수 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (q.pairs.length !== pairCount) {
    return [`어휘쌍 ${q.pairs.length}개 (${pairCount}개 필요)`];
  }
  const marks = collectAntonymMarks(q.markedPassage);
  if (marks.length !== pairCount) {
    return [`밑줄 마커 ${marks.length}개 (${pairCount}개 필요)`];
  }

  // #2 지문 재구성 대조 — 마커 밖 무단 편집과 마커 안 변형을 한 번에 잡는다.
  if (!q.markedPassage) {
    v.push("밑줄지문 누락");
  } else if (normalizeWs(stripAntonymMarks(q.markedPassage)) !== pn) {
    v.push("지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 마커 안 단어가 변형됨");
  }

  // #4 라벨 순서 == 지문 등장 순
  const expected = LABEL_KEYS.slice(0, pairCount)
    .split("")
    .map((k) => `(${k})`);
  if (marks.map((m) => m.label).join("") !== expected.join("")) {
    v.push(
      `밑줄 라벨이 지문 등장순 ${expected.join("")} 이 아님 — 실제 ${marks.map((m) => m.label).join("") || "없음"}`,
    );
  }
  if (q.pairs.map((p) => p.label).join("") !== expected.join("")) {
    v.push(`짝 라벨 순서 오류 — ${expected.join("")} 필요`);
  }

  const markByLabel = new Map(marks.map((m) => [m.label, m.shown]));
  const seenWords = new Set<string>();
  const seenPairs = new Set<string>();
  for (const p of q.pairs) {
    if (!p.word) {
      v.push(`${p.label} 표적 단어 누락`);
      continue;
    }
    if (!p.antonym) v.push(`${p.label} 짝 단어 누락`);

    // #3 변형 0 — 짝 섹션의 word 가 마커 내용과 축자 동일해야 한다.
    const shown = markByLabel.get(p.label);
    if (shown !== undefined && normalizeWs(shown) !== normalizeWs(p.word)) {
      v.push(`${p.label} 표적 단어가 밑줄 마커와 불일치 ('${p.word}' vs '${shown}')`);
    }

    // 짝 단어는 한 덩어리 — 설명구가 섞이면 선지가 무너진다.
    if (p.antonym && (p.antonym.split(/\s+/).length > 3 || /[()[\]]/.test(p.antonym))) {
      v.push(`${p.label} 짝 단어가 단어 형태가 아님: '${p.antonym.slice(0, 40)}'`);
    }

    const wordKey = normalizeWs(p.word).toLowerCase();
    const pairKey = normalizeWs(p.antonym).toLowerCase();
    if (seenWords.has(wordKey)) v.push(`표적 단어 중복: '${p.word}'`);
    seenWords.add(wordKey);
    if (pairKey && seenPairs.has(pairKey)) v.push(`짝 단어 중복: '${p.antonym}'`);
    if (pairKey) seenPairs.add(pairKey);

    // #8 표적 단어와 짝 단어가 같으면 쌍이 성립하지 않는다.
    if (wordKey && wordKey === pairKey) v.push(`${p.label} 표적 단어와 짝 단어가 동일`);

    // #9 지문 내 유일 등장 — 밑줄 자리가 유일하게 확정되어야 한다.
    const occurrences = countWordBoundaryMatches(passage, p.word);
    if (occurrences === 0) {
      v.push(`${p.label} 표적 단어가 지문에 축자로 없음(단어 경계 기준): '${p.word}'`);
    } else if (occurrences > 1) {
      v.push(`${p.label} '${p.word}' 가 지문에 ${occurrences}회 등장 — 밑줄 자리가 모호함`);
    }

    // #12 표면형 정합 — md 는 검증기 결과를 차단하지 않으므로 게이트로 승격 이식.
    // ⚠ 과거·분사형 축은 제외한다(26-07-27 실사용 과잉차단 실측):
    //   'natural - forced' · 'raw - unrefined' · 'shared - exclusive' 처럼 -ed 로 끝나는
    //   **형용사**를 시제 불일치로 오인해 정상 쌍을 반려했다. 정본 검증기의
    //   ADJECTIVAL_PARTICIPLES 화이트리스트는 유한해서 계속 새는 축이고, fast 레인도
    //   이 축을 실차단하지 않는다. -s·-ing·-ly·비교급·최상급 축은 기계적으로 명확해
    //   그대로 둔다. 형태 정합의 나머지 책임은 프롬프트가 진다
    //   (게이트는 "깨진 것"만 잡고 "덜 좋은 것"은 프롬프트 소관).
    const surfaceIssue = findAntonymSurfaceFormIssue(p.word, p.antonym);
    if (surfaceIssue && !surfaceIssue.includes("past/participle form")) {
      v.push(`${p.label} 형태 불일치 — ${surfaceIssue}`);
    }
  }

  // #5 정답 — `정답:` 줄이 유일한 진실원이다(어법 정본과 동일 구조).
  const answerPair = q.pairs.find((p) => p.label === q.answer);
  if (!q.answer) v.push("정답 누락");
  else if (!answerPair) v.push(`정답 라벨(${q.answer})이 어휘쌍에 없음`);

  // #6 바른짝 — 정답 자리 단어의 문맥상 실제 반의어(어법의 `고침:` 대칭).
  if (!q.correctAntonym) {
    v.push("바른짝 누락");
  } else if (answerPair) {
    const ca = normalizeWs(q.correctAntonym).toLowerCase();
    if (ca === normalizeWs(answerPair.antonym).toLowerCase()) {
      v.push("바른짝이 정답 쌍의 짝 단어와 동일 — 그 쌍은 오류가 아니게 된다");
    }
    if (ca === normalizeWs(answerPair.word).toLowerCase()) {
      v.push("바른짝이 표적 단어와 동일");
    }
  }

  if (!q.explanation) v.push("해설 누락");

  const wrongNeeded = pairCount - 1;
  if (requireWrong && q.wrong.length !== wrongNeeded) {
    v.push(`오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요)`);
  }
  if (q.answer && q.wrong.some((w) => w.label === q.answer)) {
    v.push("오답해설에 정답 라벨 포함");
  }

  return v;
}
