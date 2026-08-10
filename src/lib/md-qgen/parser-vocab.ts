// ============================================================================
// 어휘 적절성(VOCAB_CHOICE) md 파서 · 0원 스냅.
// 견본: parser-antonym.ts / 구조 원본: parser.ts 의 어법 v2(지문 복사) 경로.
// 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 0원 결정형 게이트는 **gate-vocab.ts** 로 분리했다(스펙의 "400줄에서 분할 검토"
// 조항 — combo·order 가 이미 gate-combo.ts / gate-order.ts 로 같은 분리를 했다).
// 이 파일은 마크다운 → 구조체(파싱)와 무손실 보정(스냅)까지만 책임진다.
// 의존 방향은 gate-vocab → parser-vocab 단방향이다(여기서 게이트를 재수출하면
// 순환 import 가 된다 — 하지 마라).
//
// ⚠ 정찰 R2 — 어법에서 그대로 복사하면 100% 사고 나는 두 지점:
//   (1) gateMdQuestion 의 `changed.length === answerCount`
//       → SYNONYM_VARIANT 모드는 비정답 자리도 동의어로 치환되므로 변형 자리 수가
//         항상 markerCount 다. 그대로 쓰면 변형 모드가 전부 반려된다.
//         gate-vocab 은 **SOURCE_EXACT 에서만** 정답 축 동기 검사를 돌린다.
//   (2) autoSnapGrammarMarks 의 v2 "미끼 원형 교정"(비정답 original ← shown)
//       → 변형 모드에서 돌리면 원형이 전부 동의어로 덮여 **원문과 다른 지문이
//         저장된다**(지문 재구성 게이트도 같이 무력화). SOURCE_EXACT 전용이다.
//
// ⚠ INLINE_MARK_RE(정본, `[A-J]` 대문자 전용)는 재사용하지 않는다 — 이 유형의
//   라벨 축은 소문자 (a)~(j) 이고, 전역 정규식은 lastIndex 를 공유한다.
// ============================================================================

import {
  countWordBoundaryMatches,
  escapeRegExp,
  normalizeWs,
} from "./parser";
import { VOCAB_MD_LABELS } from "./prompts-vocab";

/** 전역 정규식 — matchAll·replace 전용(exec/test 는 lastIndex 상태를 남긴다). */
export const INLINE_VOCAB_MARK_RE = /\[\[([a-j]):((?:(?!\]\]).)+)\]\]/g;

const LABEL_KEYS = VOCAB_MD_LABELS.join("");

export interface MdVocabMark {
  /** "(a)"~"(j)" — 소문자 축 */
  label: string;
  /** 이 자리의 지문 축자 원문 단어(정답 자리도 원문 단어다) */
  original: string;
  /** 밑줄지문 마커 안에 실제로 표시된 단어 */
  shown: string;
  /** 판단축 코드 n·v·j·d·c */
  code: string;
}

export interface MdVocabQuestion {
  kind: "vocab";
  /** [[a:표시어]] 로 마킹된 지문 전체 */
  markedPassage: string;
  marks: MdVocabMark[];
  /** 정답 라벨 집합 — 지문 등장순 정렬은 하지 않는다(모델 출력 순서 보존) */
  answers: string[];
  /** 라벨별 고침(= 그 자리의 원문 단어). 계약상 원형과 축자 동일해야 한다. */
  fixes: Record<string, string>;
  explanation: string;
  wrong: { label: string; text: string }[];
}

function parenLabel(raw: string): string {
  const key = raw.trim().replace(/[()[\].:]/g, "").toLowerCase();
  return key.length === 1 && LABEL_KEYS.includes(key) ? `(${key})` : "";
}

// 정답 라인의 **선행 라벨 런만** 수집한다(정본 parseGrammarAnswerFix 계승):
// "정답: (c) — (d)는 적절합니다" 의 (d) 를 정답으로 오인하지 않기 위함.
// 대문자 라벨(`정답: (A)`)·한글 접속(`(a) 및 (d)`)은 실측 드리프트다. 여기서 놓치면
// answers 가 비거나 짧아져 하류 스냅·게이트가 **정답 축을 잃은 채** 오진을 낸다.
function parseVocabAnswerLabels(answerLine: string): string[] {
  const labels: string[] = [];
  let rest = answerLine.trim();
  const TOKEN = /^[([]?([a-jA-J])[)\].]?(?![A-Za-z])/;
  const SEP = /^\s*(?:,|、|·|\/|&|\+|와|과|및|그리고|and)\s*/;
  for (;;) {
    const m = TOKEN.exec(rest);
    if (!m) break;
    const label = `(${m[1].toLowerCase()})`;
    if (!labels.includes(label)) labels.push(label);
    rest = rest.slice(m[0].length);
    const s = SEP.exec(rest);
    if (!s) break;
    rest = rest.slice(s[0].length);
  }
  return labels;
}

/**
 * 어휘 md 파싱. 드리프트 관용(실측 패턴):
 * 섹션 헤더 표기 흔들림(`원형·판단축:`/`원형:`/`원형·포인트:`), 라벨 괄호 누락,
 * 판단축 코드에 괄호·한글 설명 부착, 구형 단일 `고침:` 라인,
 * 오답 목록에 정답 줄을 끼워 넣기.
 */
export function parseMdVocab(text: string): MdVocabQuestion {
  const markedPassage =
    text.match(/^밑줄지문:\s*\n([\s\S]*?)(?=^원형|^정답:)/m)?.[1]?.trim() ?? "";
  const metaSection =
    text.match(/^원형[^\n]*:\s*\n([\s\S]*?)(?=^정답:)/m)?.[1] ?? "";

  // 메타 라인은 **2단으로** 판다 — 라벨·원형 확보가 먼저고 코드는 그 다음이다.
  // 단일 정규식으로 둘을 함께 잡으면 코드 표기가 조금만 어긋나도(`| V`,
  // `| v(방향 반전)`) 그 줄의 **원형까지 통째로 사라져**, 게이트가 진짜 원인(#3)이
  // 아니라 허위 "지문 재구성 불일치/원형 누락" 을 1회뿐인 재생성에 되먹인다.
  // 라벨 대소문자 관용은 정답(:70)·고침·오답 세 입구와 **같은 폭**이어야 한다.
  // 여기만 `[a-j]` 로 좁혀 두면 `(A) mitigate | v` 한 줄이 그 자리의 원형을 통째로
  // 지우고, 게이트가 "원형 누락 + 지문 재구성 불일치 + 정답 축 불일치" 라는
  // 허위 3종을 1회뿐인 재생성에 되먹인다(같은 오진이 다른 입구로 들어온다).
  const meta = new Map<string, { original: string; code: string }>();
  for (const rawLine of metaSection.split("\n")) {
    const m = /^[([]?([a-jA-J])[)\].:]\s*(.+)$/.exec(rawLine.trim());
    if (!m) continue;
    const label = `(${m[1].toLowerCase()})`;
    const bar = m[2].indexOf("|");
    const original = (bar >= 0 ? m[2].slice(0, bar) : m[2]).trim();
    if (!original) continue;
    // 코드필드의 첫 알파벳만 소문자로 뽑아 괄호·한글 설명·대소문자를 흡수한다.
    const code =
      bar >= 0 ? (m[2].slice(bar + 1).match(/[A-Za-z]/)?.[0].toLowerCase() ?? "") : "";
    if (meta.get(label)?.code && !code) continue; // 코드 있는 앞줄 보존
    meta.set(label, { original, code });
  }

  const marks: MdVocabMark[] = [...markedPassage.matchAll(INLINE_VOCAB_MARK_RE)].map(
    (m) => {
      const label = `(${m[1]})`;
      const info = meta.get(label);
      return {
        label,
        // 원형을 못 찾아도 조용히 버리지 않는다 — 빈 문자열로 남겨 게이트가
        // "원형 누락" 을 볼 수 있게 한다(견본에서 확인된 함정).
        original: info?.original ?? "",
        shown: m[2].trim(),
        code: info?.code ?? "",
      };
    },
  );

  const answers = parseVocabAnswerLabels(text.match(/^정답:\s*(.+)$/m)?.[1] ?? "");

  const fixes: Record<string, string> = {};
  // 라벨 대소문자 드리프트 흡수 — "고침" 리터럴이 앞에 붙어 있어 오인 위험이 없다.
  for (const m of text.matchAll(/^고침\s*[([]([a-jA-J])[)\]]\s*:\s*(.+)$/gm)) {
    fixes[`(${m[1].toLowerCase()})`] = m[2].trim();
  }
  const legacyFix = text.match(/^고침:\s*(.+)$/m)?.[1]?.trim() ?? "";
  if (Object.keys(fixes).length === 0 && legacyFix && answers[0]) {
    fixes[answers[0]] = legacyFix;
  }

  const wrongSection =
    text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
  const answerSet = new Set(answers);
  const markLabels = new Set(marks.map((m) => m.label));
  const wrong = [...wrongSection.matchAll(/^[([]?([a-jA-J])[)\].:]\s*(.+)$/gm)]
    .map((m) => ({ label: parenLabel(m[1]), text: m[2].trim() }))
    // 정답 줄 끼워넣기 제거 + 실재하지 않는 라벨 줄 무시(정본 어법 규약 동형).
    .filter((w) => w.label && !answerSet.has(w.label) && markLabels.has(w.label));

  return {
    kind: "vocab",
    markedPassage,
    marks,
    answers,
    fixes,
    explanation:
      text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
      text.match(/^해설:\s*([\s\S]+)$/m)?.[1]?.trim() ??
      "",
    wrong,
  };
}

/** 밑줄지문의 마커를 라벨→표시어로 수집한다(지문 등장 순). */
export function collectVocabMarks(
  markedPassage: string,
): { label: string; shown: string }[] {
  return [...markedPassage.matchAll(INLINE_VOCAB_MARK_RE)].map((m) => ({
    label: `(${m[1]})`,
    shown: m[2].trim(),
  }));
}

/** 마커를 각 자리의 **원형**으로 되돌린 재구성 지문 — 최강 게이트의 입력. */
export function reconstructVocabPassage(q: MdVocabQuestion): string {
  let out = q.markedPassage;
  for (const m of q.marks) {
    out = out.replace(
      new RegExp(`\\[\\[${m.label[1]}:(?:(?!\\]\\]).)+\\]\\]`),
      () => m.original,
    );
  }
  return out;
}

/** 후처리 산출과 동일한 `__(a) 표시어__` 렌더 — fast 검증기 승격 재사용용. */
export function buildVocabRenderedPassage(q: MdVocabQuestion): string {
  return q.markedPassage.replace(
    INLINE_VOCAB_MARK_RE,
    (_full, label: string, shown: string) => `__(${label}) ${shown.trim()}__`,
  );
}

// 원형이 지문에 대소문자만 다르게 유일 등장할 때의 축자 스냅 후보를 찾는다.
// (문장 첫 단어를 소문자로 적어 오는 실측 드리프트) 유일하지 않으면 포기 —
// 오스냅이 밑줄 자리를 옮기면 반려보다 나쁘다.
// ⚠ 대조는 **정규화 축**에서 한다. #2 재구성이 normalizeWs 비교인데 여기와 #10 만
//    원시 문자열을 쓰면 곱슬따옴표(city’s↔city's)·en대시(well–being↔well-being) 차이만
//    있는 정상 문항이 #10 에서만 반려된다(후처리 Strategy 4 는 이를 흡수한다).
function caseOnlySnap(passage: string, original: string): string | null {
  const expr = normalizeWs(original);
  if (!expr) return null;
  const pn = normalizeWs(passage);
  if (countWordBoundaryMatches(pn, expr) > 0) return null;
  const body = escapeRegExp(expr).replace(/\s+/g, "\\s+");
  const hits = [...pn.matchAll(new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, "gi"))];
  if (hits.length !== 1) return null;
  const hit = hits[0][0];
  return hit === original.trim() ? null : hit;
}

/**
 * 0원 자동 보정. 세 가지만, 전부 결정형이다.
 *  (1) SOURCE_EXACT 전용 — 비정답 자리의 원형을 마커 표시어로 맞춘다.
 *      이 모드에서 비정답은 정의상 표시어 = 원문이므로 마커가 진실원이다.
 *      **변형 모드에서는 절대 돌리지 않는다**(정찰 R2). ⚠ 또 하나의 전제는
 *      "정답 축이 확정됐다" 이다 — 정답 라벨을 못 읽었거나 설정 개수와 어긋나면
 *      진짜 정답 자리가 비정답으로 분류돼 원형이 오용어로 덮이고, 게이트가 존재하지도
 *      않는 결함을 1회뿐인 재생성 프롬프트에 되먹인다(허위 보정).
 *  (2) 대소문자 전용 스냅 — 원형이 지문에 대소문자만 다르게 유일 등장할 때.
 *      원형을 갈아끼우면 **같은 라벨의 고침도 함께** 갈아끼운다(고침이 스냅 전
 *      원형과 축자로 같을 때만). 안 그러면 게이트 #5 가 옳은 문항을 오반려한다.
 *  (3) 누락된 고침 채우기 — 고침은 계약상 "그 자리의 원형"과 축자 동일이므로,
 *      값이 유일하게 결정된다. 원형 자체는 (2)·재구성 게이트가 지문과 대조한다.
 */
export function autoSnapVocabMarks(
  q: MdVocabQuestion,
  passage: string,
  options?: { synonymVariants?: boolean; answerCount?: number },
): { question: MdVocabQuestion; corrections: string[] } {
  const variant = options?.synonymVariants === true;
  const corrections: string[] = [];
  const answerSet = new Set(q.answers);
  const markLabels = new Set(q.marks.map((m) => m.label));
  // 보수 가드 — 정답 축이 불확실하면 스냅 (1) 을 통째로 끈다(#4 가 정확히 반려한다).
  // 개수만 보면 안 된다: `정답: (f)` 처럼 **마커 밖 라벨**이 1개 오면 개수는 맞아
  // answersReliable 이 서고, 진짜 정답 자리가 비정답으로 분류돼 그 원형이 오용어로
  // 덮인다(실측: '(a) 원형이 지문에 축자로 없음: intensify' 라는 허위 지적이 나온다).
  // 정답 라벨이 **전부 실재 마커 라벨**일 때만 정답 축을 신뢰한다.
  const answersReliable =
    q.answers.length > 0 &&
    q.answers.every((label) => markLabels.has(label)) &&
    (options?.answerCount === undefined || q.answers.length === options.answerCount);

  // 라벨 → { 스냅 전 원형, 스냅 후 원형 }. 고침을 같은 규칙으로 따라가게 하려고 남긴다.
  const originalSnaps = new Map<string, { from: string; to: string }>();
  const marks = q.marks.map((m) => {
    let next = m;
    if (
      !variant && answersReliable && !answerSet.has(m.label) &&
      m.original && normalizeWs(m.original) !== normalizeWs(m.shown)
    ) {
      corrections.push(`${m.label} 비정답 원형 교정: '${m.original}' → '${m.shown}'`);
      next = { ...next, original: m.shown };
    }
    const snapped = caseOnlySnap(passage, next.original);
    if (snapped) {
      const shownFollows = normalizeWs(next.shown) === normalizeWs(next.original);
      corrections.push(`${next.label} 원형 대소문자 스냅: '${next.original}' → '${snapped}'`);
      originalSnaps.set(next.label, { from: next.original, to: snapped });
      next = {
        ...next,
        original: snapped,
        ...(shownFollows ? { shown: snapped } : {}),
      };
    }
    return next;
  });

  const fixes = { ...q.fixes };
  // 스냅이 원형을 갈아끼웠으면 **같은 라벨의 고침도 같은 규칙으로** 따라간다.
  // 고침은 계약상 "그 자리의 원형" 축자다. 원형만 스냅하고 고침을 두면 게이트 #5
  // (고침 == 원형)가 **모델이 옳게 낸 문항을** 반려한다 — 스냅이 스스로 만든 허위
  // 결함이다(실측: 원형·고침을 함께 'Mitigate' 로 낸 정상 출력이 반려됐다).
  // 조건은 shown 이 따라가는 규칙과 동일 — 고침이 스냅 전 원형과 축자로 같을 때만.
  for (const [label, snap] of originalSnaps) {
    const fix = fixes[label];
    if (!fix || normalizeWs(fix) !== normalizeWs(snap.from)) continue;
    fixes[label] = snap.to;
    corrections.push(`고침${label} 원형 스냅 동기화: '${fix}' → '${snap.to}'`);
  }
  for (const label of q.answers) {
    if (fixes[label]?.trim()) continue;
    const mark = marks.find((m) => m.label === label);
    if (!mark?.original) continue;
    fixes[label] = mark.original;
    corrections.push(`고침${label} 누락 — 원형 '${mark.original}' 으로 채움`);
  }

  return {
    question: corrections.length > 0 ? { ...q, marks, fixes } : q,
    corrections,
  };
}
