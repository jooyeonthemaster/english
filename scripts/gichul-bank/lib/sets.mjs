// 기출 문제 은행 — **장문 세트**(41-42 · 43-45 현대형 + 2005~2013 구형 46-48/49-50 등) 추출 라이브러리.
// 정본: docs/gichul-question-bank-spec.md §12(§12.2 데이터 계약 · §12.3 파이프라인 · §12.5 함정).
// 기존 단일 문항 파이프라인(origin.mjs·handlers.mjs·serialize.mjs·text.mjs)은 수정하지 않고 **import 재사용**한다.
// 여기 있는 것만 세트 전용 신규 헬퍼다.
import { createHash } from "node:crypto";
import { BLANK, findInTextCI, hasHangul, norm, similarity, tidy, wordCount } from "./text.mjs";
import { originSlice, splitChoices, splitStem } from "./origin.mjs";
import { CANON, SUBTYPE_OF, mcAnswer, mcOptions } from "./serialize.mjs";

// ── 0. 상수 ────────────────────────────────────────────────────────────────────

/** §12.3 세트 헤더 정규식(정본). 붙임표는 ～ ~ ∼ - – 를 모두 허용하고, **붙임표가 통째로 빠진**
 *  「[46 48]」 도 받는다 — 일부 PDF 는 텍스트 레이어에서 붙임표 글리프를 공백으로 떨군다(26-09-08 완전성
 *  비평 실측 16세트: ebsi_go1_20090617 · go2_20090618 · go2_20060602 · go3_20090714 · go3_20120711 ·
 *  go1/go2_20120904 …). 오탐 위험은 낮다 — 세트 인정은 이 정규식만이 아니라 머리말(SET_PROMPT_RE)과
 *  꼬리 영어 100단어(MIN_SET_WORDS)를 함께 요구하고, 「[36~37] 다음 글이 시사하는 바로…」 류 묶음
 *  지시문 842건은 꼬리 어수 0~1 이라 전부 걸러진다. 【 】 괄호(2006 3월 학평)도 함께 허용한다. */
export const SET_HEADER_RE = /[[【]\s*(\d{1,2})\s*(?:[～~∼\-–]\s*)?(\d{1,2})\s*[\]】]/;
/** 장문 세트 머리말 — 「다음 글을 읽고, 물음에 답하시오.」 계열만 지문 공유 세트다.
 *  ([36~37] 「주어진 글 다음에 이어질…」 류는 **묶음 지시문**일 뿐 지문을 공유하지 않는다 — 실측 오탐 545건) */
const SET_PROMPT_RE = /(글|의견)을?\s*읽고/;
/** 세트 지문으로 인정하는 최소 영단어 수(묶음 지시문 헤더는 꼬리 어수가 0~1이다) */
const MIN_SET_WORDS = 100;

/** cleanSlice 가 놓친 헤더를 직접 훑을 때만 쓰는 가구/각주 규칙(origin.mjs 사본 — 폴백 전용) */
const FALLBACK_FURNITURE_RE = [
  /^\s*(홀수형|짝수형)\s*$/,
  /^\s*\d{1,2}\s*$/,
  /^\s*(고[123])?\s*영어\s*영역\s*(\d{1,2})?\s*$/,
  /^\s*\d{1,2}\s*(고[123])?\s*영어\s*영역\s*(\d{1,2})?\s*(고[123])?\s*$/,
  /^\s*고[123]\s*영어\s*영역.*$/,
  /^\s*고[123]\s*$/,
  /^\s*\d{1,2}\s*고[123]\s*$/,
  /^[━─═\-]{6,}\s*$/,
  /^\s*이 문제지에 관한 저작권/,
  /^\s*(홀수형|짝수형)?\s*외국어\s*\(?영어\)?\s*영역.*$/,
  /^\s*외국어영어영역.*$/,
  /^\s*\*\s*확인\s*사항/,
  /^\s*◦?답안지의 해당란/,
];
const FALLBACK_FOOT_RE = /^\s*[*＊]{1,3}\s*[A-Za-z][^:]{0,40}:\s*\S/;

/** 세트 멤버로 지원하는 유형(화이트리스트 — §12.1-3 + 구형 generic). 밖은 unsupportedQNums. */
export const SET_MEMBER_TYPES = new Set(["제목", "주제", "요지", "주장", "어휘", "빈칸추론", "글의순서", "지칭", "내용일치"]);

/**
 * 세트 전용 표준 발문 후보 — PDF 자간이 통째로 무너진 구형 학평/수능 발문 복구에만 쓴다.
 * **축약(공백 제거) 문자열이 완전히 같을 때만** 치환한다(글자를 만들지 않는다). 극성(일치/불일치)이
 * 다른 자구는 별도 후보로 둔다 — 잘못 붙으면 CONTENT_MATCH matchType 이 뒤집힌다.
 */
const SET_CANON = {
  "제목": ["윗글의 제목으로 가장 적절한 것은?", "위 글의 제목으로 가장 적절한 것은?"],
  "주제": ["윗글의 주제로 가장 적절한 것은?", "위 글의 주제로 가장 적절한 것은?"],
  "요지": ["윗글의 요지로 가장 적절한 것은?", "위 글의 요지로 가장 적절한 것은?"],
  "주장": ["윗글에서 필자가 주장하는 바로 가장 적절한 것은?", "위 글에서 필자가 주장하는 바로 가장 적절한 것은?"],
  "어휘": ["밑줄 친 (a)~(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은?", "밑줄 친 (a)~(e) 중에서 문맥상 쓰임이 적절하지 않은 것은?"],
  "지칭": ["밑줄 친 (a)~(e) 중에서 가리키는 대상이 나머지 넷과 다른 것은?"],
  "글의순서": [
    "주어진 글 (A)에 이어질 내용을 순서에 맞게 배열한 것으로 가장 적절한 것은?",
    "위 글 (A)에 이어질 내용을 순서에 맞게 배열한 것으로 가장 적절한 것은?",
    "위 글 (A)에 이어질 내용을 순서대로 바르게 배열한 것은?",
  ],
  "빈칸추론": [
    "윗글의 빈칸에 들어갈 말로 가장 적절한 것은?",
    "위 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
    "빈칸에 들어갈 말로 가장 적절한 것은?",
  ],
  "내용일치": [
    "윗글에 관한 내용으로 적절하지 않은 것은?",
    "위 글에 관한 내용으로 적절하지 않은 것은?",
    "윗글의 내용과 일치하지 않는 것은?",
    "위 글의 내용과 일치하지 않는 것은?",
    "윗글의 내용과 일치하는 것은?",
    "위 글의 내용과 일치하는 것은?",
  ],
};

const squash = (s) => String(s ?? "").replace(/\s+/g, "").replace(/[～~∼]/g, "~");

/** 인쇄 글리프 정규화 — ⒜~⒠(U+249C~U+24A0 괄호친 소문자)를 「(a)」~「(e)」 로 편다(실측: 2015 고2 학평 등). */
export function normalizeLetterGlyphs(s) {
  return String(s ?? "").replace(/[⒜-⒠]/g, (ch) => `(${String.fromCharCode(97 + ch.charCodeAt(0) - 0x249c)})`);
}

/**
 * 선지 번호 글리프 복구 — 일부 학평 PDF 는 ①~⑤ 를 **한자 사설 매핑**으로 심는다.
 * 실측 1회차(ebsi_go2_20171122, origin 316개 중 유일): 檾檿櫀櫁櫂 = ①②③④⑤ (q43 순열·q45 선지 전멸).
 * 세트 경로에서만 편다 — extract-forms.py 의 delig 표를 고치면 316 회차 전량 재추출이 필요하고
 * 1차 은행(3,076 단일 문항)의 무회귀 증명 범위가 커진다(§12.1-8). 감독 보고 대상.
 */
const CIRCLED_GLYPH_MAP = { "檾": "①", "檿": "②", "櫀": "③", "櫁": "④", "櫂": "⑤" };
const CIRCLED_GLYPH_RE = /[檾檿櫀櫁櫂]/g;
/** `g` 플래그 없는 판정용(테스트용으로 g 정규식을 쓰면 lastIndex 가 남아 격줄로 실패한다) */
const CIRCLED_GLYPH_TEST = /[檾檿櫀櫁櫂]/;
export function normalizeCircledGlyphs(s) {
  return String(s ?? "").replace(CIRCLED_GLYPH_RE, (ch) => CIRCLED_GLYPH_MAP[ch]);
}

// ── 1. 세트 후보 탐색 ──────────────────────────────────────────────────────────

/**
 * origin 1개에서 **지문 공유 장문 세트 후보**를 전부 찾는다.
 * 헤더는 세트 첫 문항 **직전 문항 슬라이스의 꼬리**에 있다(§12.0 실측).
 * @returns [{ from, to, qNums, prevQ, headerLine, rawWords }]
 */
export function findSetCandidates(origin) {
  const qs = origin?.questions || {};
  const nums = Object.keys(qs).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  const out = [];
  for (const n of nums) {
    const lines = String(qs[n].text || "").split("\n");
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(SET_HEADER_RE);
      if (!m) continue;
      const from = Number(m[1]), to = Number(m[2]);
      if (!(to - from >= 1 && to - from <= 5)) continue;
      if (from <= n) continue; // 헤더는 뒤 문항을 가리킨다
      if (from < 20) continue; // 듣기(1~17) 묶음 지시문 배제
      const rest = lines.slice(i + 1).join("\n");
      const rawWords = rest.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
      const headerLine = lines[i] + (lines[i + 1] && hasHangul(lines[i + 1]) ? " " + lines[i + 1] : "");
      // 지문 공유 세트 판정: 머리말이 「글을 읽고」 계열이고 꼬리에 실제 지문이 있어야 한다
      if (!SET_PROMPT_RE.test(squash(headerLine).replace(/,/g, "")) && rawWords < MIN_SET_WORDS) continue;
      if (rawWords < MIN_SET_WORDS) continue;
      const qNums = [];
      for (let q = from; q <= to; q++) qNums.push(q);
      out.push({ from, to, qNums, prevQ: n, headerLine: tidy(lines[i]), rawWords });
    }
  }
  return out;
}

// ── 2. 세트 지문(원형 스트림) 추출 ─────────────────────────────────────────────

/**
 * 세트 지문 줄 + 각주. 1순위는 origin.mjs cleanSlice 의 trailing(가구 제거·각주 분리 완료),
 * cleanSlice 가 헤더를 못 잡았을 때만(en dash 등) 원본 줄을 직접 훑는 폴백을 쓴다.
 * @returns { lines, footnotes, prevSlice, source: "cleanSlice"|"fallback" } | null
 */
export function extractSetPassage(origin, cand) {
  const prev = originSlice(origin, cand.prevQ);
  if (!prev) return null;
  const trail = prev.cleaned.trailing || [];
  if (trail.length) {
    const m = String(trail[0]).match(SET_HEADER_RE);
    if (m && Number(m[1]) === cand.from && Number(m[2]) === cand.to) {
      const r = scrubSetLines(trail.slice(1), prev.cleaned.trailingFootnotes || []);
      return { ...r, prevSlice: prev, source: "cleanSlice" };
    }
  }
  // 폴백 — 원본 줄에서 헤더를 직접 찾아 같은 규칙으로 청소
  const raw = String(prev.text || "").split("\n");
  let idx = -1;
  for (let i = 1; i < raw.length; i++) {
    const m = raw[i].match(SET_HEADER_RE);
    if (m && Number(m[1]) === cand.from && Number(m[2]) === cand.to) { idx = i; break; }
  }
  if (idx < 0) return null;
  const lines = [], footnotes = [];
  for (const ln of raw.slice(idx + 1)) {
    if (FALLBACK_FURNITURE_RE.some((re) => re.test(ln))) continue;
    if (FALLBACK_FOOT_RE.test(ln)) { footnotes.push(tidy(ln)); continue; }
    lines.push(ln);
  }
  const r = scrubSetLines(lines, footnotes);
  return { ...r, prevSlice: prev, source: "fallback" };
}

/**
 * 세트 지문 줄 2차 청소 — cleanSlice(줄 머리 규칙)가 못 잡는 두 계통을 뗀다(실측 11세트):
 *  ① 줄 **꼬리**에 붙은 각주("…preserving it. * tendril: (식물의) 덩굴손") — 콜론 없는 구형 표기 포함
 *  ② 머리에 남은 한국어 전용 지시문 줄(헤더가 두 줄로 접힌 회차)
 * 지문 본문은 순수 영어라 「* + 라틴 표제어 + 한글」 은 각주로 확정할 수 있다.
 */
function scrubSetLines(lines, footnotes) {
  const fn = [...footnotes];
  const out = [];
  const TAIL_FOOT_RE = /[*＊]{1,3}\s*[A-Za-z][^*＊]*$/;
  // 줄 **가운데**에 끼어든 각주("… station. * draft: 징병 The soldiers…") — 콜론 + 한글 주석이 있고
  // 다음 라틴 글자 앞에서 끝난다. 콜론을 요구해 오삭제를 막는다.
  const MID_FOOT_RE = /[*＊]{1,3}\s*[A-Za-z][A-Za-z0-9'’\-.() ]{0,40}[:：]\s*[^A-Za-z]*[가-힣][^A-Za-z]*/g;
  // 상단 가구 — A/B형 병행 시험지의 형 라벨("(A 형)")이 지문 한가운데 끼어든다(실측 2013 고3 학평)
  const FORM_TAG_RE = /\(\s*[AB]\s*형\s*\)/g;
  for (let ln of lines) {
    if (out.length === 0 && hasHangul(ln) && !/[A-Za-z]/.test(ln)) continue; // ② 머리 한국어 지시문
    ln = normalizeLetterGlyphs(String(ln)).replace(FORM_TAG_RE, " ");
    const m = ln.match(TAIL_FOOT_RE);
    if (m && hasHangul(m[0])) {
      for (const piece of m[0].split(/(?=[*＊]{1,3}\s*[A-Za-z])/)) if (tidy(piece)) fn.push(tidy(piece));
      ln = ln.slice(0, m.index);
    }
    ln = ln.replace(MID_FOOT_RE, (hit) => { if (tidy(hit)) fn.push(tidy(hit)); return " "; });
    if (tidy(ln)) out.push(ln);
  }
  return { lines: out, footnotes: [...new Set(fn)] };
}

/**
 * (A)~(D) 단독 줄(또는 줄 머리 「(A) 본문」)로 블록 분할. 라벨은 A 부터 **연속**이어야 인정한다.
 * @returns { blocks: [{label,text}], pre: string[] }
 */
export function splitBlocks(lines) {
  const blocks = [];
  const pre = [];
  let cur = null;
  for (const ln of lines) {
    const m = String(ln).match(/^\s*\(([A-D])\)\s*(.*)$/);
    const expect = String.fromCharCode(65 + blocks.length);
    if (m && m[1] === expect) {
      cur = { label: `(${m[1]})`, lines: [] };
      blocks.push(cur);
      if (m[2] && m[2].trim()) cur.lines.push(m[2]);
      continue;
    }
    if (cur) cur.lines.push(ln);
    else pre.push(ln);
  }
  return { blocks: blocks.map((b) => ({ label: b.label, text: tidy(stripPua(b.lines.join(" "))) })), pre };
}

// ── 3. 표시 베이스(displayedPassage) ───────────────────────────────────────────

/** 사설영역(PUA) 글리프·화살표 잡음 제거 — 요약 박스 마커 등이 세트 지문에 끼는 일은 없어야 한다 */
const stripPua = (s) => String(s).replace(/[\p{Co}\u{F0000}-\u{FFFFD}]/gu, " ");

/**
 * 인쇄본 표시 베이스. 43-45 는 「(A) 본문」 을 단락 머리로 두고 "\n\n" 으로 나눈다.
 * 41-42(및 블록 없는 구형)는 한 단락 — PDF 줄 스트림에 들여쓰기 정보가 없어 단락 경계를 알 수 없다(계기 한계).
 */
export function buildDisplayed(blocks, plainLines) {
  if (blocks && blocks.length >= 2) {
    return blocks.map((b) => `${b.label} ${tidy(stripPua(b.text))}`).join("\n\n");
  }
  return tidy(stripPua(String(plainLines.join(" "))));
}

/**
 * 빈칸형 세트(42 단일 빈칸 · 구형 47/49)의 표시 베이스에 `_____` 를 심는다.
 * 1순위 = 원형 blanks[] 의 좌우 이웃(after/before), 2순위 = 인쇄 스트림의 긴 공백 런.
 * @returns { text, source } | null  (심을 자리를 못 찾으면 null — 추측 금지)
 */
export function insertBlank(displayed, blanks) {
  // 2순위 감지를 먼저 계산(공백 런은 tidy 이전 원문에만 남는다 — buildDisplayed 가 이미 접었으므로 여기선 blanks 우선)
  for (const b of blanks || []) {
    const after = tidy(b.after || b.afterPrev || "");
    if (!after || hasHangul(after)) continue;
    const before = b.before ? tidy(b.before) : null;
    const ai = indexOfWords(displayed, after);
    if (ai == null) continue;
    const pos = ai.end;
    const rest = displayed.slice(pos);
    let gapEnd = pos;
    if (before) {
      const bi = indexOfWords(rest, before);
      if (bi != null) gapEnd = pos + bi.start;
    }
    // 빈칸은 **그려진 선**이라 인쇄 스트림에 글자가 없다 — 좌/우 이웃 사이에 글자가 남아 있으면
    // 앵커가 어긋난 것이고, 그대로 삼키면 지문이 통째로 사라진다.
    // (실측 26-09-08: after="the" 같은 1단어 앵커가 앞쪽 오탐에 걸려 ebsi_go2_20120517 212단어·
    //  ebsi_go3_20130313_A 188단어·ebsi_go2_20110310 124단어를 삭제 — S5:wc 로만 드러났다.)
    if (/[A-Za-z0-9]/.test(displayed.slice(pos, gapEnd))) continue;
    const text = normalizeBlankSpacing(displayed.slice(0, pos) + " " + BLANK + " " + displayed.slice(gapEnd));
    if ((text.match(/_{3,}/g) || []).length === 1) return { text, source: "pdf-gap" };
  }
  // 구형 PDF 는 빈칸이 밑줄 문자열로 인쇄된다
  if (/_{4,}/.test(displayed)) {
    const text = normalizeBlankSpacing(displayed.replace(/\s*_{4,}\s*/g, ` ${BLANK} `));
    if ((text.match(/_{3,}/g) || []).length === 1) return { text, source: "underscore" };
  }
  return null;
}

/**
 * **감독 확정 앵커 파일**(`.tmp-gichul-bank/sets/blank-anchors.json`)로 빈칸을 심는다 — 3순위 폴백.
 * 앵커는 자연어 의미다: `before` = 빈칸 **앞** 어구, `after` = 빈칸 **뒤** 어구
 * (origin blanks[] 규약은 after=왼쪽/before=오른쪽으로 뒤집혀 있다 — 여기서 섞지 말 것).
 * 두 어구가 표시 베이스에서 **붙어 있는 자리**가 정확히 하나일 때만 삽입한다(복수·0 이면 null — 추측 금지).
 * @param {string} displayed 표시 베이스
 * @param {{before?:string, after?:string}} anchor
 * @returns {{text:string, source:string}|null}
 */
export function insertBlankAtAnchor(displayed, anchor) {
  if (!anchor) return null;
  const B = anchorTokens(anchor.before || "");
  const A = anchorTokens(anchor.after || "");
  if (B.length === 0 || A.length === 0) return null;
  const D = anchorTokenize(displayed);
  const hits = [];
  for (let i = 0; i + B.length + A.length <= D.tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < B.length; j++) if (D.tokens[i + j] !== B[j]) { ok = false; break; }
    if (!ok) continue;
    for (let j = 0; j < A.length; j++) if (D.tokens[i + B.length + j] !== A[j]) { ok = false; break; }
    if (ok) hits.push(i + B.length);
  }
  if (hits.length !== 1) return null;
  const cut = D.starts[hits[0]];           // 뒤 어구 첫 토큰의 **원문 오프셋**
  const end = D.ends[hits[0] - 1];         // 앞 어구 마지막 토큰의 원문 끝
  const text = normalizeBlankSpacing(displayed.slice(0, end) + " " + BLANK + " " + displayed.slice(cut));
  if ((text.match(/_{3,}/g) || []).length !== 1) return null;
  return { text, source: "anchor-file" };
}

/** 앵커 매칭 전용 토큰화 — 구두점을 독립 토큰으로 떼고 곡선따옴표·대시를 정규화한다(indexOfWords 와 같은 정규화 축). */
function anchorNormChar(ch) {
  if (ch === "­") return "";
  if (/[‘’´`]/.test(ch)) return "'";
  if (/[“”]/.test(ch)) return '"';
  if (/[–—―]/.test(ch)) return "-";
  return ch;
}
const ANCHOR_PUNCT = /[.,;:!?"'()\[\]-]/;
/** 원문 오프셋을 보존하는 토큰화. @returns {{tokens:string[], starts:number[], ends:number[]}} */
function anchorTokenize(src) {
  const s = String(src);
  const tokens = [], starts = [], ends = [];
  let cur = "", curStart = -1;
  const flush = (endPos) => { if (cur) { tokens.push(cur); starts.push(curStart); ends.push(endPos); cur = ""; curStart = -1; } };
  for (let i = 0; i < s.length; i++) {
    const ch = anchorNormChar(s[i]);
    if (!ch) continue;
    if (/\s/.test(ch)) { flush(i); continue; }
    if (ANCHOR_PUNCT.test(ch)) { flush(i); tokens.push(ch); starts.push(i); ends.push(i + 1); continue; }
    if (curStart < 0) curStart = i;
    cur += ch;
  }
  flush(s.length);
  return { tokens, starts, ends };
}
/** 앵커 어구 → 토큰 배열(오프셋 불필요) */
function anchorTokens(phrase) {
  return anchorTokenize(phrase).tokens;
}

/**
 * 원형 blanks[] 가 비었을 때(추출기 미검출) **코퍼스 정본 + 정답 선지**로 빈칸 이웃을 역산한다.
 * 코퍼스에 정답구가 유일하게 있을 때만 — 없거나 중복이면 null(추측 금지).
 * 반환 모양은 origin blanks[] 규약을 따른다(after = 앞 이웃, before = 뒤 이웃).
 */
export function blankAnchorsFromCorpus(corpusText, answerText) {
  if (!corpusText || !answerText) return null;
  const hit = findInTextCI(corpusText, answerText);
  if (!hit || (hit.count ?? 1) > 1) return null;
  const left = corpusText.slice(0, hit.start).split(/\s+/).filter(Boolean).slice(-4).join(" ");
  const right = corpusText.slice(hit.end).split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  if (!left || !right) return null;
  return { after: left, before: right, afterPrev: null };
}

function normalizeBlankSpacing(s) {
  return String(s)
    .split("\n\n")
    .map((p) => tidy(p).replace(/\s+([.,;:!?])/g, "$1").replace(/_{6,}/g, BLANK))
    .join("\n\n");
}

/** 공백 정규화 공간에서 문자열 위치를 찾되 **원문 오프셋**으로 돌려준다(구두점/따옴표 보존). */
function indexOfWords(hay, needle) {
  const nd = norm(needle);
  if (!nd) return null;
  // 원문 → 정규화 매핑
  const map = [];
  let out = "", prevSpace = true;
  for (let i = 0; i < hay.length; i++) {
    let ch = hay[i];
    if (ch === "­") continue;
    if (/[‘’´`]/.test(ch)) ch = "'";
    else if (/[“”]/.test(ch)) ch = '"';
    else if (/[–—―]/.test(ch)) ch = "-";
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      const nx = hay.slice(i + 1).match(/^\s*(.)/);
      if (nx && /[.,;:!?)\]"']/.test(nx[1])) continue;
      out += " "; map.push(i); prevSpace = true; continue;
    }
    if (/[(\["]/.test(ch)) { out += ch; map.push(i); prevSpace = true; continue; }
    out += ch; map.push(i); prevSpace = false;
  }
  const idx = out.indexOf(nd);
  if (idx < 0) return null;
  return { start: map[idx], end: map[idx + nd.length - 1] + 1 };
}

// ── 4. (a)~(e) 스팬 ────────────────────────────────────────────────────────────

const LETTERS = ["a", "b", "c", "d", "e"];

/** 원형 벡터 밑줄에서 (a)~(e) 별 다단어 스팬 후보를 뽑는다(줄바꿈 이어짐 병합). 없으면 null. */
export function vectorLetterSpans(slice) {
  const uls = (slice?.underlines || []).filter((u) => !hasHangul(String(u.words || "")));
  uls.sort((a, b) => a.page - b.page || a.col - b.col || a.y - b.y || a.x0 - b.x0);
  const spans = [];
  for (const u of uls) {
    const words = tidy(normalizeLetterGlyphs(u.words));
    const pm = normalizeLetterGlyphs(String(u.prev || "")).trim().match(/^\(([a-e])\)$/);
    if (pm) { spans.push({ k: LETTERS.indexOf(pm[1]), text: words, page: u.page, col: u.col, y: u.y }); continue; }
    const last = spans[spans.length - 1];
    if (last && last.page === u.page && last.col === u.col && u.y - last.y > 8 && u.y - last.y < 26 && words) {
      last.text = tidy(last.text + " " + words); last.y = u.y;
    }
  }
  const byK = new Map();
  for (const s of spans) if (s.k >= 0 && !byK.has(s.k)) byK.set(s.k, stripSpanPunct(s.text));
  return LETTERS.map((_, k) => byK.get(k) || null);
}

function stripSpanPunct(s) {
  return tidy(String(s)).replace(/^[“”‘’"'(\[]+/, "").replace(/[.,;:!?”’"')\]]+$/g, "").trim();
}

const isWordChar = (ch) => !!ch && /[A-Za-z0-9_]/.test(ch);

/** base 안에서 word 를 단어 경계로 세되 위치 목록을 돌려준다 */
function wordOccurrences(base, word) {
  const out = [];
  if (!word) return out;
  let i = 0;
  while ((i = base.indexOf(word, i)) !== -1) {
    if (!isWordChar(base[i - 1]) && !isWordChar(base[i + word.length])) out.push(i);
    i += 1;
  }
  return out;
}

/**
 * 표시 베이스에서 (a)~(e) 5개 스팬(+주변 창) 을 확정한다.
 * 스팬 정본 = 스트림의 「(a) word」 토큰. 벡터 밑줄(prev="(a)")이 그 자리에서 실제로 이어지면 다단어로 확장한다(§12.0).
 * @returns { spans: (Anchor|null)[5], issues: string[] }
 */
export function letterSpans(displayed, slice) {
  const vec = vectorLetterSpans(slice);
  const spans = [];
  const starts = [];
  const issues = [];
  for (let k = 0; k < 5; k++) {
    const L = LETTERS[k];
    // ⚠ 실측: 라벨이 단어에 붙어 인쇄되는 회차가 있다("(b)you", "(e)he") → 라벨 뒤 공백은 0개도 허용
    const labelRe = new RegExp(`\\(${L}\\)\\s*`, "g");
    const hits = [...displayed.matchAll(labelRe)];
    if (hits.length !== 1) {
      issues.push(hits.length === 0 ? `라벨 (${L}) 없음` : `라벨 (${L}) ${hits.length}회 중복`);
      spans.push(null); starts.push(null);
      continue;
    }
    let afterIdx = hits[0].index + hits[0][0].length;
    // 스팬 앞 여는 따옴표/괄호는 밑줄 밖이다("(c) “I have had bites…" → 스팬은 I)
    while (afterIdx < displayed.length && /[“”‘’"'(\[]/.test(displayed[afterIdx])) afterIdx++;
    const rest = displayed.slice(afterIdx);
    let spanText = null;
    const v = vec[k];
    if (v) {
      // 벡터 밑줄이 라벨 바로 뒤에서 시작하면 그대로 채택(공백/따옴표 차이는 정규화로 흡수)
      const cand = rest.slice(0, v.length + 6);
      const pos = indexOfWords(cand, stripSpanPunct(v));
      if (pos && pos.start === 0) spanText = displayed.slice(afterIdx, afterIdx + pos.end);
    }
    if (!spanText) {
      const m = rest.match(/^(\S+)/);
      if (!m) { issues.push(`(${L}) 라벨 뒤 토큰 없음`); spans.push(null); starts.push(null); continue; }
      spanText = m[1];
    }
    spanText = stripSpanPunct(spanText);
    if (!spanText) { issues.push(`(${L}) 스팬 비어 있음`); spans.push(null); starts.push(null); continue; }
    const start = displayed.indexOf(spanText, afterIdx);
    if (start !== afterIdx) { issues.push(`(${L}) 스팬 위치 불일치`); spans.push(null); starts.push(null); continue; }
    const end = start + spanText.length;
    const surroundingText = windowAround(displayed, start, end, 6, 30);
    const occ = wordOccurrences(displayed, spanText);
    const anchor = {
      kind: "UNDERLINE",
      spanText,
      passageForm: spanText,
      surroundingText,
      findStrategy: "wordStrict",
    };
    const oi = occ.indexOf(start);
    if (occ.length > 1 && oi >= 0) anchor.occurrenceIndex = oi;
    spans.push(anchor); starts.push(start);
  }
  return { spans, starts, issues };
}

/**
 * 표시 베이스에서 [start,end) 앞뒤 ±k단어 창을 **원문 그대로 잘라** 돌려준다(≥minLen 자).
 * 단락("\n\n") 경계를 넘지 않는다 — reconstruct 의 findSurroundingContextIndex 는 indexOf 라 축자 일치가 필수다.
 *
 * ⚠ 함정(실측 65세트): findWithSurroundingContext 는 창을 찾은 뒤 **창 안의 첫 단어 경계 일치**를 집는다
 * (text-utils.ts findInSlice). 창 왼쪽에 같은 대명사("he"/"her")가 하나라도 더 있으면 밑줄이 그리로 간다.
 * → 왼쪽 경계를 「스팬보다 앞선 같은 토큰」 뒤로 당기고, 모자란 길이는 오른쪽으로만 늘린다.
 */
export function windowAround(base, start, end, k = 6, minLen = 30) {
  const paraStart = (() => { const i = base.lastIndexOf("\n\n", Math.max(0, start - 1)); return i < 0 ? 0 : i + 2; })();
  const paraEnd = (() => { const i = base.indexOf("\n\n", end); return i < 0 ? base.length : i; })();
  const span = base.slice(start, end);
  const stepLeft = (s) => {
    let j = s - 1;
    while (j > paraStart && /\s/.test(base[j - 1])) j--;
    while (j > paraStart && !/\s/.test(base[j - 1])) j--;
    return j;
  };
  const stepRight = (e) => {
    let j = e;
    while (j < paraEnd && /\s/.test(base[j])) j++;
    while (j < paraEnd && !/\s/.test(base[j])) j++;
    return j;
  };
  /** 창 [s,start) 안에 같은 토큰이 또 있으면 그 뒤로 왼쪽 경계를 당긴다 */
  const clampLeft = (s) => {
    const prior = wordOccurrences(base.slice(s, start), span);
    if (prior.length === 0) return s;
    let j = s + prior[prior.length - 1] + span.length;
    while (j < start && /\s/.test(base[j])) j++;
    return j;
  };
  let words = k;
  for (let attempt = 0; attempt < 10; attempt++) {
    let s = start, e = end;
    for (let i = 0; i < words && s > paraStart; i++) s = stepLeft(s);
    s = clampLeft(s);
    for (let i = 0; i < words && e < paraEnd; i++) e = stepRight(e);
    if (base.slice(s, e).length < minLen) {
      while (base.slice(s, e).length < minLen && e < paraEnd) e = stepRight(e);
    }
    const win = base.slice(s, e);
    if (win.length >= minLen || (s === start && e === paraEnd)) return win;
    words += 4;
  }
  return base.slice(clampLeft(paraStart), paraEnd);
}

// ── 5. S3 게이트 — reconstruct.ts 결의 규칙 이식(findWithSurroundingContext) ──
// src/lib/question-postprocess/text-utils.ts findWithSurroundingContext + findInSlice 의 축자 포팅.
// findStrategy "wordStrict" 는 surroundingText 로만 찾고 실패하면 null 이다(reconstruct.ts:53, text-utils.ts:347).

function findInSlicePort(text, expression, requireTokenBoundaries) {
  const candidates = [expression, expression.trim()].filter(Boolean);
  for (const cand of candidates) {
    let idx = text.indexOf(cand);
    while (idx !== -1) {
      if (!requireTokenBoundaries || (!isWordChar(text[idx - 1]) && !isWordChar(text[idx + cand.length]))) return { index: idx, length: cand.length };
      idx = text.indexOf(cand, idx + 1);
    }
  }
  const lower = text.toLowerCase();
  for (const cand of candidates) {
    const lc = cand.toLowerCase();
    let idx = lower.indexOf(lc);
    while (idx !== -1) {
      if (!requireTokenBoundaries || (!isWordChar(text[idx - 1]) && !isWordChar(text[idx + cand.length]))) return { index: idx, length: cand.length };
      idx = lower.indexOf(lc, idx + 1);
    }
  }
  return null;
}

/** reconstructPassageView(base, [anchor]) 가 이 스팬을 어디에 놓는가 — 위치(index)만 돌려준다. null=미해결. */
export function locateWordStrict(base, spanText, surroundingText) {
  if (!surroundingText || !surroundingText.trim()) return null;
  let contextIdx = base.indexOf(surroundingText);
  if (contextIdx === -1) contextIdx = base.toLowerCase().indexOf(surroundingText.toLowerCase());
  if (contextIdx === -1) return null;
  const preferWordBoundary = /^[A-Za-z][A-Za-z'-]*$/.test(spanText.trim());
  const exact = base.slice(contextIdx, contextIdx + surroundingText.length);
  const inCtx = findInSlicePort(exact, spanText, preferWordBoundary);
  if (inCtx) return contextIdx + inCtx.index;
  const margin = 50;
  const ws = Math.max(0, contextIdx - margin);
  const we = Math.min(base.length, contextIdx + surroundingText.length + margin);
  const inWin = findInSlicePort(base.slice(ws, we), spanText, preferWordBoundary);
  if (inWin) return ws + inWin.index;
  return null;
}

// ── 6. 멤버 분류·직렬화 ───────────────────────────────────────────────────────

/** 발문 → typeGroup. 공백이 무너진 구형 학평 발문도 잡도록 축약 문자열로 판정한다. 화이트리스트 밖은 null. */
export function classifyMemberDirection(direction) {
  const d = squash(direction);
  if (!d) return null;
  if (/순서에?맞게|이어질글의순서|순서로가장적절|순서대로바르게배열|이어질내용을순서/.test(d)) return "글의순서";
  if (/가리키는대상/.test(d)) return "지칭";
  if (/낱말의쓰임|어휘|문맥상쓰임이적절하지/.test(d)) return "어휘";
  if (/어법/.test(d)) return null; // 세트 어법은 화이트리스트 밖(§12.1-3)
  if (/제목으로/.test(d)) return "제목";
  if (/주제로/.test(d)) return "주제";
  if (/요지로/.test(d)) return "요지";
  if (/주장하는바로|필자가주장/.test(d)) return "주장";
  if (/빈칸에들어갈말/.test(d)) return "빈칸추론";
  if (/내용과일치|관한내용|내용으로적절|내용과관련|일치하지않는|일치하는것/.test(d)) return "내용일치";
  return null;
}

/** 인쇄 발문 확정 — 공백이 통째로 무너진 발문만 표준 자구로 되돌린다(축약 일치할 때만, 창작 금지). */
export function resolveSetDirection(printed, typeGroup) {
  const s = tidy(String(printed || "")).replace(/^\s*\d{1,2}\s*[.．]\s*/, "").trim();
  if (!s) return { direction: CANON[typeGroup] || "", note: "발문 없음 — 표준 지시문 사용" };
  const cands = [...(SET_CANON[typeGroup] || []), CANON[typeGroup]].filter(Boolean);
  for (const c of cands) if (squash(s) === squash(c)) return { direction: c, note: null };
  if (!/\s/.test(s)) return { direction: s, note: "NOTE:direction-squashed(자간 붕괴 발문 원문 유지)" };
  return { direction: s, note: null };
}

/**
 * 인쇄 순열 파서(세트판) — 43 은 (B)(C)(D) 3원소다. handlers.parseOrderPerms 를 글자 클래스 인자로 일반화.
 * "① (B) - (D) - (C) …" 와 격자("(B) (D) (C) (C) (B) (D)" + "① - - ② - -") 를 모두 읽는다.
 */
export function parseSetOrderPerms(text, letters) {
  if (!text) return null;
  const cls = `[${letters.join("")}]`;
  const t = String(text).replace(/\n/g, " ");
  const out = [];
  const re = new RegExp(`([①-⑤])\\s*\\(?(${cls})\\)?\\s*[-－–]?\\s*\\(?(${cls})\\)?\\s*[-－–]?\\s*\\(?(${cls})\\)?`, "g");
  let m;
  const CIRC5 = ["①", "②", "③", "④", "⑤"];
  while ((m = re.exec(t))) { const k = CIRC5.indexOf(m[1]); if (k >= 0 && !out[k]) out[k] = m[2] + m[3] + m[4]; }
  const dense = Array.from({ length: 5 }, (_, i) => out[i]);
  if (dense.every((x) => typeof x === "string") && new Set(dense).size === 5 && dense.every((x) => new Set(x).size === 3)) return dense;
  const labels = [...t.matchAll(new RegExp(`\\((${cls})\\)`, "g"))].map((x) => x[1]);
  const markers = [...t.matchAll(/[①-⑤]/g)].map((x) => x[0]);
  if (labels.length === 15 && markers.length === 5 && markers.join("") === "①②③④⑤") {
    const perms = [];
    for (let i = 0; i < 5; i++) perms.push(labels.slice(i * 3, i * 3 + 3).join(""));
    if (new Set(perms).size === 5 && perms.every((x) => new Set(x).size === 3)) return perms;
  }
  return null;
}

/**
 * 선지 꼬리 가구 제거 — 시험지 맨 끝 「※ 확인 사항 / ◦답안지의 해당란에 …」 안내문이 마지막 문항의 ⑤ 선지에
 * 통째로 붙는다(실측 119건). origin.mjs FURNITURE_RE 는 「하시오.」 단독 줄만 잡아 「…했는지 확인」 줄을 놓친다.
 * (기존 단일 문항 파이프라인도 같은 오염을 갖지만 그 파일은 이 단위에서 건드리지 않는다 — 감독 보고 대상.)
 */
const CHECK_FOOTER_RE = /\s*(?:[※*＊○◦]\s*)?(?:확인\s*사항|답안지의?\s*해당란|문제지와\s*답안지|했는지\s*확인)[\s\S]*$/;
export function scrubOptionText(text) {
  const t = tidy(String(text ?? "").replace(CHECK_FOOTER_RE, ""));
  return t;
}

/** 42/44 의 「① (a) ② (b) …」 한 줄 선지 */
export function letterOptions() {
  return LETTERS.map((L, i) => ({ label: String(i + 1), text: `(${L})` }));
}

/** 멤버 슬라이스 파싱 — {printedDirection, body, choices, point} */
export function parseMemberSlice(origin, qNum) {
  const raw = originSlice(origin, qNum);
  if (!raw) return null;
  // 사설 매핑 한자 선지번호를 ①~⑤ 로 편 **사본**을 쓴다(원형 캐시 객체는 건드리지 않는다).
  const slice = CIRCLED_GLYPH_TEST.test(String(raw.text || ""))
    ? { ...raw,
        text: normalizeCircledGlyphs(raw.text),
        wtext: normalizeCircledGlyphs(raw.wtext),
        cleaned: { ...raw.cleaned, lines: (raw.cleaned.lines || []).map(normalizeCircledGlyphs) } }
    : raw;
  let { direction, body } = splitStem(slice.cleaned.lines);
  // 발문 끝 물음표가 **다음 줄**로 넘어간 회차(구형 학평): cleanSlice 가 「[3점]」을 떼어내면
  // 남는 줄이 "?" 하나뿐이라 splitStem 의 hasHangul 이어붙임 조건에 걸리지 않는다.
  // 인쇄된 물음표를 제자리로 되돌릴 뿐 글자를 만들지 않는다(§12.1-6).
  // 실측: ebsi_go3_20130313_B q41·q42 · ebsi_go2_20100311 q47 · ebsi_go2_20090312 q47.
  if (direction && !/[?？]\s*$/.test(direction) && body.length) {
    const m = String(body[0]).match(/^\s*[,，]?\s*([?？])\s*$/);
    if (m) { direction = tidy(direction) + m[1]; body = body.slice(1); }
  }
  const { choices, bodyLines } = splitChoices(body);
  return { slice, printedDirection: direction, body: bodyLines, choices, point: slice.cleaned.point ?? null };
}

// ── 7. canonical ──────────────────────────────────────────────────────────────

/** 표시 베이스에서 라벨((a)~(e) · (A)~(D))을 걷어낸 평문 */
export function stripLabels(text) {
  return String(text)
    .split("\n\n")
    .map((p) => tidy(p.replace(/^\(([A-D])\)\s*/, "").replace(/\(([a-e])\)\s+/g, "")))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 블록을 정답 순열대로 재배열해 이어붙인 정본 후보 */
export function canonicalFromBlocks(blocks, perm, opts = {}) {
  const byLabel = new Map(blocks.map((b) => [b.label.replace(/[()]/g, ""), b.text]));
  // fullPerm = 구형 전순열(첫 단락 (A) 도 순열 원소) — 기본은 현대형(A 고정 + 순열 3개).
  const order = opts.fullPerm ? perm.split("") : ["A", ...perm.split("")];
  const parts = order.map((L) => byLabel.get(L));
  if (parts.some((x) => !x)) return null;
  return tidy(parts.join(" "));
}

// ── 8. 지문 제목·키 ───────────────────────────────────────────────────────────

/** src/lib/exam-passages/format.ts formatExamTitle 미러(§12.2 passageTitle 정본) */
export function formatSetTitle(meta, qNums) {
  const q = `${qNums[0]}-${qNums[qNums.length - 1]}`;
  const examLabel = { "수능": "수능", "6월": "6월 모평", "9월": "9월 모평", "예비": "예비시행" }[meta.exam] || meta.exam;
  const formTag = meta.form ? ` ${meta.form}형` : "";
  const gradeTag = meta.board === "학력평가" && meta.grade ? `${meta.grade} ` : "";
  return `${meta.year}학년도 ${gradeTag}${examLabel}${formTag} 영어 ${q}번 · 장문`;
}

export function setKeyOf(examId, qNums) { return `${examId}-q${qNums.join("-")}`; }

export function sha256(obj) { return createHash("sha256").update(typeof obj === "string" ? obj : JSON.stringify(obj)).digest("hex"); }

export { LETTERS, SUBTYPE_OF, mcAnswer, mcOptions, similarity, tidy, wordCount, hasHangul };
