/**
 * PASSAGE CANVAS MODEL — 01 원문 섹션의 "필기 캔버스" 순수 레이아웃 로직.
 *
 * 설계 분담 (블루프린트 HLC-Measured):
 *   - LLM = 의미 의도만: 무엇을 / 어떤 구절에(anchorText) / 얼마나 중요하게(priority) / 어떤 줄로(lines).
 *   - 이 파일 = 결정론적 배치 플래너: 문장을 직독직해 청크로 쪼개고, 각 필기를 band(줄사이/구아래/여백/각주)로
 *     라우팅하고, 한 페이지를 넘길 만한 문장은 보수적 추정으로 분할한다.
 *   - 렌더러(React) = 위 플랜을 flex-wrap 청크셀 + 여백 레일로 그린다. 겹침 없음은 브라우저 flow가 보장.
 *
 * 좌표/픽셀은 여기서 다루지 않는다. 이 파일은 React/DOM 의존이 전혀 없다(단위 테스트 가능).
 */

export type CanvasBand = "interline" | "underchunk" | "rail" | "footnote";
export type CanvasNoteKind = "grammar" | "parsing" | "exam" | "logic";

/** 렌더러가 만들어 넘기는 필기 1개의 입력(편집 식별자는 ref 쪽에 별도 보관). */
export interface CanvasNoteInput {
  /** 안정적 식별자 (편집 라우팅 키) */
  key: string;
  kind: CanvasNoteKind;
  /** 이 필기가 가리키는, 문장 원문 en 안의 부분 문자열 힌트 (없으면 미앵커) */
  anchorText?: string;
  /** LLM/기본값이 제안한 band. 플래너가 안전상 덮어쓸 수 있음 */
  band?: CanvasBand | "inline";
  /** 1=핵심(절대 숨김 금지) … 3=보조(공간 부족 시 각주 강등) */
  priority?: number;
  /** 짧은 라벨 (어법 point / 구문 라벨 / 유형 / 논리 기능) */
  role?: string;
  /** 미리 끊은 본문 줄들 */
  lines: string[];
  /** 어법 함정(있으면 빨간 한 줄) */
  trap?: string;
  /** 함정 아래 보여줄 예문(영어 한 문장) — 시험이 파는 '틀린 형태'를 담음 */
  example?: string;
  /** 예문 속 '틀린 토큰' (빨강 취소선으로 강조) */
  exampleWrong?: string;
  /** 그 자리의 '정답 토큰' (초록) */
  exampleCorrect?: string;
}

export interface ResolvedChunk {
  /** en 의 연속 슬라이스 (공백/문장부호 포함, 이어붙이면 en 과 동일) */
  text: string;
  /** 직독직해 한글 뜻 — 영어 청크 위에 작게(v3) */
  gloss?: string;
  /** 구문 라벨 (주어/동사/목적어 등 짧게) — 청크 아래 작게 */
  role?: string;
  emphasis?: "core" | "normal";
  /** en 내 문자 범위 [start, end) */
  start: number;
  end: number;
}

export interface PlacedNote extends CanvasNoteInput {
  band: CanvasBand;
  /** interline/underchunk 일 때 부착된 청크 인덱스 (없으면 마지막 청크) */
  chunkIndex: number;
  anchorRange: { start: number; end: number } | null;
}

export interface SentenceCanvasPlan {
  chunks: ResolvedChunk[];
  /** 청크별 줄사이 필기 목록 (chunks 와 같은 길이) */
  interlineByChunk: PlacedNote[][];
  railNotes: PlacedNote[];
  footnoteNotes: PlacedNote[];
  hasRail: boolean;
  /** 보수적 추정 캔버스 높이(mm) — 분할 판단/디버깅용 */
  estHeightMm: number;
}

// ─── 튜닝 상수 (밀도/안전) ─────────────────────────────────────────────────────
export const CANVAS_TUNING = {
  /** 청크 1개 아래 줄사이 필기 최대 수 (초과 → 각주 강등) */
  maxInterlinePerChunk: 3,
  /** 여백 레일 카드 최대 수 (초과 → 각주 강등) */
  maxRailCards: 5,
  /** 줄사이로 둘 수 있는 본문 최대 줄수 (이보다 길면 레일/각주) */
  maxInterlineLines: 3,
  /** 줄사이 한 줄 최대 글자수 추정 (이보다 길면 레일이 더 적합) */
  interlineSoftChars: 34,
  /** 본문 텍스트 컬럼 폭 기준 글자수(영문 10.2pt, ~118mm) */
  enCharsPerLine: 60,
  /** 한글 해석 폭 기준 글자수(8pt, ~174mm) */
  koCharsPerLine: 74,
  railWidthMm: 42, // CSS .par-canvas-grid.has-rail 2열 실값과 동기(compact-spec §5)
  /** 이 추정 높이를 넘으면 문장을 분할 (페이지=250mm, 넉넉한 마진) */
  splitTriggerMm: 172,
  /** 분할 시 목표 조각 높이(mm) */
  splitTargetMm: 138,
} as const;

/**
 * ─── v3 레일 균형 (R4, 26-08-22) ───────────────────────────────────────────
 * v3 렌더러(sentence-canvas)는 R4부터 출제·논리 필기의 **밴드를 존중**한다:
 * band==="rail" 만 우측 레일 카드, 나머지는 문장 아래 번호 뱃지 목록 행.
 * 여기서는 레일 카드 누적 높이가 본문 열(스태프+어법 목록+해석) 추정을 넘는
 * **첫 카드부터 전부** footnote 로 강등해(prefix 규칙 — 우선순위 상위 연속만 레일 유지)
 * "블록 총높이 = max(본문, 레일)" 그리드가 만드는 문장 사이 백지 띠를 구조적으로 없앤다.
 * 상수는 26-08-22 5샘플 38캔버스 실측 보정(.tmp-worksheet-qa/rail-gap-base-*.json).
 * 편향은 **강등 우선**(본문 과소/레일 과대 추정) — 백지 잔존보다 목록 강등이 낫다.
 */
export const V3_RAIL_BALANCE = {
  /** 레일 있는 본문 폭(≈134mm)에서 영문 한 줄 글자수 — 청크 경계 개행을 감안한 낙관치 */
  enCharsPerRow: 62,
  /** 뜻(gloss)+영문 스태프 한 줄 높이 / 줄 사이 row-gap */
  staffRowMm: 9.0,
  staffRowGapMm: 2.2,
  /** 목록 행 — 균형 판정이 실제로 작동하는 국면은 "레일 잔존" 상태라 1열 폭 ≈134mm 기준
   *  (전폭 ≈170mm 로 계상하면 줄수를 ~32% 과소 계상해 과강등 — R4 검수 Q1). */
  listCharsPerLine: 53,
  listLineMm: 3.8,
  listRowChromeMm: 0.9,
  /** 해석(8.6pt) */
  koCharsPerLine: 70,
  koLineMm: 4.4,
  transChromeMm: 2.1,
  /** 목록 mt·해석 mt 등 잔여 크롬 */
  gridChromeMm: 4.0,
  /** 이만큼의 레일 초과는 허용 — 과강등 방지 */
  slackMm: 6,
  /** 레일 카드(42mm, 8pt, keep-all, role·본문 인라인 흐름 — R4-c CSS 와 동기) */
  railCharsPerLine: 16,
  railLineMm: 3.6,
  railCardChromeMm: 2.4,
  /** 원문 인용 줄(1줄 클램프 — R4-c) */
  railSrcMm: 3.6,
  railGapMm: 1.0,
} as const;

function noteBodyChars(n: PlacedNote): number {
  return (
    (n.role?.length ?? 0) +
    n.lines.reduce((a, l) => a + l.length + 1, 0) +
    (n.trap ? n.trap.length + 2 : 0) +
    (n.example ? n.example.length + 3 : 0)
  );
}

function estRailCardMm(n: PlacedNote): number {
  const B = V3_RAIL_BALANCE;
  const srcMm = n.anchorRange && n.anchorText?.trim() ? B.railSrcMm : 0;
  return Math.max(1, Math.ceil(noteBodyChars(n) / B.railCharsPerLine)) * B.railLineMm + B.railCardChromeMm + srcMm;
}

function estListRowMm(n: PlacedNote): number {
  const B = V3_RAIL_BALANCE;
  // 인용(src)은 렌더러가 anchorRange 있을 때만 그린다 — 같은 조건으로만 계상(검수 C1:
  // 무앵커 어법 노트가 budget 을 부풀려 강등 컷을 늦추는 역편향 방지).
  const srcChars = n.anchorRange && n.anchorText?.trim() ? Math.min(n.anchorText.trim().length, 64) + 3 : 0;
  const chars = 6 + srcChars + noteBodyChars(n);
  return Math.max(1, Math.ceil(chars / B.listCharsPerLine)) * B.listLineMm + B.listRowChromeMm;
}

/**
 * 레일(출제·논리) 카드가 본문 열보다 길어질 초과분을 footnote 밴드로 강등한다(제자리 변경).
 * 순수·결정론 — 같은 입력이면 같은 강등. 렌더러의 밴드 존중 규칙(R4-b)과 한 쌍이다.
 */
function balanceV3Rail(
  en: string,
  ko: string,
  interlineByChunk: PlacedNote[][],
  railNotes: PlacedNote[],
  footnoteNotes: PlacedNote[],
): void {
  const B = V3_RAIL_BALANCE;
  const sideIdx = railNotes.map((n, i) => ({ n, i })).filter(({ n }) => n.kind === "exam" || n.kind === "logic");
  if (!sideIdx.length) return;
  // v3 목록 행 = 모든 어법 노트(밴드 무관 — 렌더러가 kind 로 목록에 모은다)
  const listMm = [...interlineByChunk.flat(), ...railNotes, ...footnoteNotes]
    .filter((n) => n.kind === "grammar")
    .reduce((a, n) => a + estListRowMm(n), 0);
  const rows = Math.max(1, Math.ceil(en.length / B.enCharsPerRow));
  const staffMm = rows * B.staffRowMm + (rows - 1) * B.staffRowGapMm;
  const koRows = ko.trim() ? Math.max(1, Math.ceil(ko.length / B.koCharsPerLine)) : 0;
  const transMm = koRows ? koRows * B.koLineMm + B.transChromeMm : 0;
  const budget = staffMm + listMm + transMm + B.gridChromeMm + B.slackMm;
  let cum = 0;
  let cut = -1;
  for (let k = 0; k < sideIdx.length; k++) {
    const h = estRailCardMm(sideIdx[k].n);
    if (cum + h > budget) {
      cut = k;
      break;
    }
    cum += h + B.railGapMm;
  }
  if (cut < 0) return;
  const demote = new Set(sideIdx.slice(cut).map(({ i }) => i));
  for (const { i } of sideIdx.slice(cut)) footnoteNotes.push({ ...railNotes[i], band: "footnote" });
  for (let i = railNotes.length - 1; i >= 0; i--) if (demote.has(i)) railNotes.splice(i, 1);
}

const KIND_DEFAULT_BAND: Record<CanvasNoteKind, CanvasBand> = {
  grammar: "interline",
  parsing: "underchunk",
  exam: "rail",
  logic: "rail",
};

const KIND_DEFAULT_PRIORITY: Record<CanvasNoteKind, number> = {
  grammar: 2,
  parsing: 2,
  exam: 2,
  logic: 3,
};

// ─── 앵커 매칭 (관대한 정규화 비교) ───────────────────────────────────────────
interface NormChar {
  char: string;
  start: number;
  end: number;
}
function normalizeWithOffsets(value: string): { text: string; chars: NormChar[] } {
  const chars: NormChar[] = [];
  let lastSpace = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (/\s/.test(ch)) {
      if (!lastSpace && chars.length) {
        chars.push({ char: " ", start: i, end: i + 1 });
        lastSpace = true;
      }
      continue;
    }
    chars.push({ char: ch.toLowerCase(), start: i, end: i + 1 });
    lastSpace = false;
  }
  while (chars.at(-1)?.char === " ") chars.pop();
  return { text: chars.map((c) => c.char).join(""), chars };
}

/** anchorText 가 en 안의 어디에 있는지 [start,end) 를 관대하게 찾는다(대소문자/공백 무시). 못 찾으면 null. */
export function resolveAnchorRange(en: string, anchorText: string | undefined | null): { start: number; end: number } | null {
  const phrase = (anchorText ?? "").trim();
  if (phrase.length < 2) return null;
  const src = normalizeWithOffsets(en);
  const needle = normalizeWithOffsets(phrase).text;
  if (!needle) return null;
  const idx = src.text.indexOf(needle);
  if (idx < 0) return null;
  const first = src.chars[idx];
  const last = src.chars[idx + needle.length - 1];
  if (!first || !last) return null;
  return { start: first.start, end: last.end };
}

const WORD_CHAR = /[A-Za-z0-9'’-]/;

/**
 * 단어 경계를 우선하는 앵커 매칭 — 짧은 앵커("it")가 앞선 단어 내부("cr·it·icized")에
 * 걸리는 오탐을 막는다(원페이지 파이널 마크 렌더·게이트 공용).
 * 앞에서부터 모든 일치 후보를 훑어 "양끝이 단어 경계"인 첫 후보를 채택하고,
 * 경계 일치가 하나도 없으면 기존 resolveAnchorRange(첫 일치)로 폴백한다.
 */
export function resolveAnchorRangeWordBoundary(
  en: string,
  anchorText: string | undefined | null,
): { start: number; end: number } | null {
  const phrase = (anchorText ?? "").trim();
  if (phrase.length < 2) return null;
  const src = normalizeWithOffsets(en);
  const needle = normalizeWithOffsets(phrase).text;
  if (!needle) return null;
  for (let idx = src.text.indexOf(needle); idx >= 0; idx = src.text.indexOf(needle, idx + 1)) {
    const first = src.chars[idx];
    const last = src.chars[idx + needle.length - 1];
    if (!first || !last) break;
    const before = first.start > 0 ? en[first.start - 1] : "";
    const after = last.end < en.length ? en[last.end] : "";
    const boundaryBefore = !before || !WORD_CHAR.test(before) || !WORD_CHAR.test(en[first.start] ?? "");
    const boundaryAfter = !after || !WORD_CHAR.test(after) || !WORD_CHAR.test(en[last.end - 1] ?? "");
    if (boundaryBefore && boundaryAfter) return { start: first.start, end: last.end };
  }
  return resolveAnchorRange(en, anchorText);
}

// ─── 청크 분할 ────────────────────────────────────────────────────────────────
interface ChunkSeed {
  text?: string; // LLM 청크 텍스트
  gloss?: string; // 직독직해 한글 뜻
  role?: string;
  emphasis?: "core" | "normal";
}

/** LLM 청크들을 en 위에 순서대로 맞춰 본다. 토큰 단위로 일치하면 오프셋 매핑, 아니면 null. */
function alignSeedChunks(en: string, seeds: ChunkSeed[]): ResolvedChunk[] | null {
  const out: ResolvedChunk[] = [];
  let cursor = 0;
  for (const seed of seeds) {
    const text = (seed.text ?? "").trim();
    if (!text) continue;
    // cursor 이후에서 정규화 기준으로 seed 의 첫 비공백을 찾는다.
    const range = resolveAnchorRange(en.slice(cursor), text);
    if (!range) return null;
    const start = cursor + range.start;
    const end = cursor + range.end;
    if (start < cursor) return null;
    out.push({ text: en.slice(start, end), gloss: seed.gloss?.trim() || undefined, role: seed.role?.trim() || undefined, emphasis: seed.emphasis, start, end });
    cursor = end;
  }
  if (!out.length) return null;
  return out;
}

/** 빈 구간(앵커 사이의 일반 텍스트)을 채워 en 전체를 덮도록 청크를 보정. */
function fillGaps(en: string, anchored: { start: number; end: number; gloss?: string; role?: string; emphasis?: "core" | "normal" }[]): ResolvedChunk[] {
  const sorted = [...anchored].sort((a, b) => a.start - b.start);
  const merged: typeof sorted = [];
  for (const a of sorted) {
    const prev = merged.at(-1);
    if (prev && a.start < prev.end) continue; // 겹침 → 첫 번째 우선
    merged.push(a);
  }
  const chunks: ResolvedChunk[] = [];
  let cursor = 0;
  for (const a of merged) {
    if (a.start > cursor) chunks.push({ text: en.slice(cursor, a.start), start: cursor, end: a.start });
    chunks.push({ text: en.slice(a.start, a.end), gloss: a.gloss, role: a.role, emphasis: a.emphasis, start: a.start, end: a.end });
    cursor = a.end;
  }
  if (cursor < en.length) chunks.push({ text: en.slice(cursor), start: cursor, end: en.length });
  return chunks.filter((c) => c.text.length > 0);
}

/**
 * 문장 청크 결정:
 *  1) LLM seedChunks 가 en 과 정렬되면 그것을 사용(직독직해 의도 그대로).
 *  2) 아니면 앵커 가능한 필기/어휘 범위를 청크 경계로 삼아 파생.
 *  3) 둘 다 없으면 단일 청크(문장 전체).
 */
export function buildChunks(
  en: string,
  seedChunks: ChunkSeed[] | undefined,
  noteAnchors: { range: { start: number; end: number }; role?: string }[],
  vocabRanges: { start: number; end: number }[],
): ResolvedChunk[] {
  if (seedChunks && seedChunks.length) {
    const aligned = alignSeedChunks(en, seedChunks);
    if (aligned && aligned.length && aligned[0].start <= 2 && aligned.at(-1)!.end >= en.trimEnd().length - 1) {
      // seed 가 문장을 충분히 덮으면 빈 구간만 보정해 사용
      return fillGaps(
        en,
        aligned.map((c) => ({ start: c.start, end: c.end, gloss: c.gloss, role: c.role, emphasis: c.emphasis })),
      );
    }
  }
  const anchors = [
    ...noteAnchors.map((a) => ({ start: a.range.start, end: a.range.end, role: a.role })),
    ...vocabRanges.map((r) => ({ start: r.start, end: r.end })),
  ].filter((a) => a.end > a.start);
  if (anchors.length) return fillGaps(en, anchors);
  return [{ text: en, start: 0, end: en.length }];
}

// ─── band 라우팅 (결정론, 측정 없음) ─────────────────────────────────────────
function noteFitsInterline(note: CanvasNoteInput): boolean {
  if (note.lines.length > CANVAS_TUNING.maxInterlineLines) return false;
  // 본문 줄 길이 합으로 판단(긴 줄은 wrap 되므로 총량 기준). 함정(trap)은 자체 줄로 wrap → 거부 사유 아님.
  const totalChars = note.lines.reduce((m, l) => m + l.length, 0);
  if (totalChars > CANVAS_TUNING.interlineSoftChars * CANVAS_TUNING.maxInterlineLines) return false;
  const longest = note.lines.reduce((m, l) => Math.max(m, l.length), 0);
  if (longest > CANVAS_TUNING.interlineSoftChars + 12) return false;
  return true;
}

function preferredBand(note: CanvasNoteInput): CanvasBand {
  const hinted = note.band && note.band !== "inline" ? (note.band as CanvasBand) : undefined;
  const base = hinted ?? KIND_DEFAULT_BAND[note.kind];
  // 줄사이/구아래를 원하지만 너무 길면 레일로 승격
  if ((base === "interline" || base === "underchunk") && !noteFitsInterline(note)) return "rail";
  return base;
}

function findChunkIndex(chunks: ResolvedChunk[], range: { start: number; end: number } | null): number {
  if (!range) return chunks.length - 1;
  // 앵커 시작을 포함하는 청크
  const exact = chunks.findIndex((c) => range.start >= c.start && range.start < c.end);
  if (exact >= 0) return exact;
  // 가장 많이 겹치는 청크
  let best = -1;
  let bestOverlap = 0;
  chunks.forEach((c, i) => {
    const ov = Math.min(c.end, range.end) - Math.max(c.start, range.start);
    if (ov > bestOverlap) {
      bestOverlap = ov;
      best = i;
    }
  });
  return best >= 0 ? best : chunks.length - 1;
}

// ─── 높이 추정 (보수적 = 과대평가, 분할은 안전쪽으로) ─────────────────────────
function estNoteLinesHeight(note: PlacedNote, charsPerLine: number): number {
  let lines = 0;
  for (const l of note.lines) lines += Math.max(1, Math.ceil(l.length / charsPerLine));
  if (note.trap) lines += Math.max(1, Math.ceil(note.trap.length / charsPerLine));
  if (note.role) lines += 1;
  return lines;
}

function estimateHeights(
  en: string,
  ko: string,
  chunks: ResolvedChunk[],
  interlineByChunk: PlacedNote[][],
  railNotes: PlacedNote[],
  footnoteNotes: PlacedNote[],
): number {
  const T = CANVAS_TUNING;
  const enLines = Math.max(1, Math.ceil(en.length / T.enCharsPerLine), chunks.length); // 청크 wrap 보정
  // 줄사이 필기: 같은 줄에 나란히 놓이지만 보수적으로 청크별 스택을 합산
  let interlineUnits = 0;
  interlineByChunk.forEach((notes) => {
    let u = 0;
    notes.forEach((n) => (u += estNoteLinesHeight(n, 18) + 0.6));
    interlineUnits = Math.max(interlineUnits, u); // 한 줄에선 max, 보수적으론 약간 더
  });
  // 보수적으로 줄사이 총량의 절반을 세로 누적으로 가산
  let interlineTotal = 0;
  interlineByChunk.forEach((notes) => notes.forEach((n) => (interlineTotal += estNoteLinesHeight(n, 18) + 0.6)));
  const staffMm = enLines * 6.6 + Math.max(interlineTotal * 3.0 * 0.55, interlineUnits * 3.0) + chunks.length * 0.6;
  let railMm = 0;
  railNotes.forEach((n) => (railMm += estNoteLinesHeight(n, 20) * 3.1 + 3.2));
  let footMm = 0;
  // v3 렌더러는 강등된 출제·논리를 목록 행으로 그린다 — footnote 단가(과대)로 계상하면
  // planSentenceSplit 이 불필요 분할을 낼 수 있어 목록 행 단가로 계산(R4 검수 C1).
  footnoteNotes.forEach((n) => (footMm += n.kind === "exam" || n.kind === "logic" ? estListRowMm(n) : estNoteLinesHeight(n, 36) * 3.0 + 1.0));
  const koMm = Math.max(1, Math.ceil(ko.length / CANVAS_TUNING.koCharsPerLine)) * 4.6 + 3.0;
  return Math.max(staffMm, railMm) + koMm + footMm + 5;
}

// ─── 플랜 메모(모듈 LRU) ─────────────────────────────────────────────────────
/**
 * `buildSentenceCanvasPlan` 은 **순수함수**다 — 입력(en/ko/seed/notes/vocabRanges) 외의 상태에
 * 의존하지 않고(난수·시간·전역 없음), 같은 입력이면 항상 같은 플랜을 만든다. 그래서 결과를
 * 모듈 LRU 에 담아 재사용해도 의미가 바뀌지 않는다.
 *
 * 이득: 보고서가 바뀔 때마다 문서 전체 JSX 를 다시 조립하는데, 대부분의 문장은 입력이 그대로다.
 * 히트하면 (a) 플랜 계산이 사라지고 (b) **플랜 객체 참조가 유지**되어 필기 캔버스의
 * useLayoutEffect(연결선 실측)가 재실행되지 않는다. undo/redo·패널 토글에서 특히 크다.
 *
 * ⚠️ 반환된 플랜은 **여러 호출이 공유**한다. 절대 제자리 변경하지 말 것(현재 소비자는 모두 읽기 전용:
 *    passage-flow.tsx / sentence-canvas.tsx / planSentenceSplit — 전부 map/filter 로 새 배열만 만든다).
 */
const PLAN_CACHE_MAX = 512;
const planCache = new Map<string, SentenceCanvasPlan>();
/** 키 구분자 — 본문에 나올 수 없는 제어문자. 가변 길이 배열은 길이도 함께 넣어 경계 모호성을 없앤다. */
const PLAN_KEY_SEP = String.fromCharCode(1);

function planCacheKey(
  en: string,
  ko: string,
  seedChunks: ChunkSeed[] | undefined,
  notes: CanvasNoteInput[],
  vocabRanges: { start: number; end: number }[],
): string {
  const parts: string[] = [en, ko, String(seedChunks ? seedChunks.length : -1)];
  for (const s of seedChunks ?? []) parts.push(s.text ?? "", s.gloss ?? "", s.role ?? "", s.emphasis ?? "");
  parts.push(String(notes.length));
  for (const n of notes) {
    parts.push(
      n.key, n.kind, n.anchorText ?? "", n.band ?? "", String(n.priority ?? ""), n.role ?? "",
      String(n.lines.length), ...n.lines,
      n.trap ?? "", n.example ?? "", n.exampleWrong ?? "", n.exampleCorrect ?? "",
    );
  }
  parts.push(String(vocabRanges.length));
  for (const r of vocabRanges) parts.push(`${r.start}:${r.end}`);
  return parts.join(PLAN_KEY_SEP);
}

/** 한 문장 → 캔버스 플랜. 같은 입력이면 캐시된(참조까지 동일한) 플랜을 돌려준다. */
export function buildSentenceCanvasPlan(
  en: string,
  ko: string,
  seedChunks: ChunkSeed[] | undefined,
  notes: CanvasNoteInput[],
  vocabRanges: { start: number; end: number }[],
): SentenceCanvasPlan {
  const key = planCacheKey(en, ko, seedChunks, notes, vocabRanges);
  const hit = planCache.get(key);
  if (hit) {
    // 최근 사용으로 승격(Map 은 삽입 순서 유지 → 맨 앞이 가장 오래된 항목).
    planCache.delete(key);
    planCache.set(key, hit);
    return hit;
  }
  const plan = computeSentenceCanvasPlan(en, ko, seedChunks, notes, vocabRanges);
  planCache.set(key, plan);
  if (planCache.size > PLAN_CACHE_MAX) {
    const oldest = planCache.keys().next();
    if (!oldest.done) planCache.delete(oldest.value);
  }
  return plan;
}

/** measureCharsPerLine 등은 보수적. (순수 계산 본체 — 캐시 없이 매번 새 플랜) */
function computeSentenceCanvasPlan(
  en: string,
  ko: string,
  seedChunks: ChunkSeed[] | undefined,
  notes: CanvasNoteInput[],
  vocabRanges: { start: number; end: number }[],
): SentenceCanvasPlan {
  // 1) 앵커 해석
  const withAnchor = notes.map((n) => ({ note: n, anchorRange: resolveAnchorRange(en, n.anchorText) }));

  // 2) 청크 구성
  const chunks = buildChunks(
    en,
    seedChunks,
    withAnchor.filter((w) => w.anchorRange).map((w) => ({ range: w.anchorRange!, role: w.note.role })),
    vocabRanges,
  );

  // 3) band 라우팅 + 캡
  const interlineByChunk: PlacedNote[][] = chunks.map(() => []);
  const railNotes: PlacedNote[] = [];
  const footnoteNotes: PlacedNote[] = [];

  // 우선순위 정렬: priority 오름차순(핵심 먼저), 안정성 위해 원순서 유지
  const ordered = withAnchor
    .map((w, i) => ({ ...w, i, priority: w.note.priority ?? KIND_DEFAULT_PRIORITY[w.note.kind] }))
    .sort((a, b) => a.priority - b.priority || a.i - b.i);

  for (const w of ordered) {
    const band = preferredBand(w.note);
    const placed: PlacedNote = {
      ...w.note,
      priority: w.priority,
      band,
      chunkIndex: findChunkIndex(chunks, w.anchorRange),
      anchorRange: w.anchorRange,
    };
    if (band === "interline" || band === "underchunk") {
      const slot = interlineByChunk[placed.chunkIndex];
      if (slot.length < CANVAS_TUNING.maxInterlinePerChunk) slot.push(placed);
      else if (w.priority <= 1 && railNotes.length < CANVAS_TUNING.maxRailCards) railNotes.push({ ...placed, band: "rail" });
      else footnoteNotes.push({ ...placed, band: "footnote" });
    } else if (band === "rail") {
      if (railNotes.length < CANVAS_TUNING.maxRailCards) railNotes.push(placed);
      else footnoteNotes.push({ ...placed, band: "footnote" });
    } else {
      footnoteNotes.push(placed);
    }
  }

  // R4 — 레일 균형: 출제·논리 카드가 본문 열보다 길면 초과분을 footnote 로 강등(백지 띠 방지)
  balanceV3Rail(en, ko, interlineByChunk, railNotes, footnoteNotes);

  const estHeightMm = estimateHeights(en, ko, chunks, interlineByChunk, railNotes, footnoteNotes);

  return {
    chunks,
    interlineByChunk,
    railNotes,
    footnoteNotes,
    hasRail: railNotes.some((n) => n.kind === "exam" || n.kind === "logic"),
    estHeightMm,
  };
}

/**
 * 분할 판단: 추정 높이가 splitTrigger 를 넘으면, 청크를 연속 그룹 K개로 나눈 경계(청크 인덱스)를 돌려준다.
 * 반환 [] = 분할 불필요. 각 그룹은 자기 청크 + 그 청크에 앵커된 필기만 갖는 별도 캔버스가 된다.
 */
export function planSentenceSplit(plan: SentenceCanvasPlan): number[][] {
  if (plan.estHeightMm <= CANVAS_TUNING.splitTriggerMm) return [];
  if (plan.chunks.length < 2) return []; // 더 못 쪼갬
  const parts = Math.min(plan.chunks.length, Math.max(2, Math.ceil(plan.estHeightMm / CANVAS_TUNING.splitTargetMm)));
  const per = Math.ceil(plan.chunks.length / parts);
  const groups: number[][] = [];
  for (let i = 0; i < plan.chunks.length; i += per) {
    groups.push(Array.from({ length: Math.min(per, plan.chunks.length - i) }, (_, k) => i + k));
  }
  return groups.length > 1 ? groups : [];
}
