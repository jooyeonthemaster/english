// 기출 문제 은행 빌더 — 텍스트 유틸(순수 함수). 비교용 정규화와 출력용 정리를 구분한다.

export const CIRC = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
export const BLANK = "_____";

/** 출력용 정리 — 공백 접기·인용부호는 원문 유지·구두점 앞 공백 제거. */
export function tidy(s) {
  return String(s ?? "")
    .replace(/­/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?)\]”’])/g, "$1")
    .replace(/([(\[“‘])\s+/g, "$1")
    .trim();
}

/** 비교용 정규화 — 인용부호·대시 통일, 공백 접기, 구두점 앞 공백 제거. 대소문자는 유지. */
export function norm(s) {
  return String(s ?? "")
    .replace(/­/g, "")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?)\]"'])/g, "$1")
    .replace(/([(\["])\s+/g, "$1")
    .trim();
}

/** 문자 단위 유사도(0~1) — 짧은 편집거리 근사(빠른 토큰 자카드 + LCS 혼합). */
export function similarity(a, b) {
  const A = norm(a), B = norm(b);
  if (A === B) return 1;
  if (!A || !B) return 0;
  const ta = A.toLowerCase().replace(/[-‐‑–—―]/g, "").split(/[^a-z0-9']+/).filter(Boolean);
  const tb = B.toLowerCase().replace(/[-‐‑–—―]/g, "").split(/[^a-z0-9']+/).filter(Boolean);
  const sa = new Set(ta), sb = new Set(tb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const jac = inter / Math.max(1, new Set([...sa, ...sb]).size);
  // 순서 민감도: 공통 접두 토큰 비율
  let run = 0;
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i++) { if (ta[i] === tb[i]) run++; else break; }
  const pre = run / Math.max(1, Math.max(ta.length, tb.length));
  return Math.max(jac, (jac + pre) / 2);
}

/**
 * 정규화 공간에서 needle 을 찾아 **원문 hay 의 오프셋**으로 돌려준다.
 * 원문→정규화 문자 매핑을 유지해 치환 위치가 원문 인용부호를 보존한다.
 */
export function findInText(hay, needle, from = 0) {
  const map = []; // norm index -> hay index
  let out = "";
  let prevSpace = true;
  for (let i = 0; i < hay.length; i++) {
    let ch = hay[i];
    if (ch === "­") continue;
    if (/[‘’´`]/.test(ch)) ch = "'";
    else if (/[“”]/.test(ch)) ch = '"';
    else if (/[–—―]/.test(ch)) ch = "-";
    else if (ch === " ") ch = " ";
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      // 구두점 앞 공백은 정규화에서 사라짐 — 다음 글자를 보고 결정
      const nx = hay.slice(i + 1).match(/^\s*(.)/);
      if (nx && /[.,;:!?)\]"']/.test(nx[1])) continue;
      out += " "; map.push(i); prevSpace = true; continue;
    }
    if (/[(\["]/.test(ch)) { out += ch; map.push(i); prevSpace = true; continue; }
    out += ch; map.push(i); prevSpace = false;
  }
  const nd = norm(needle);
  if (!nd) return null;
  const idx = out.indexOf(nd, from);
  if (idx < 0) return null;
  const start = map[idx];
  const endN = idx + nd.length - 1;
  const end = map[endN] + 1;
  return { start, end, count: countOcc(out, nd) };
}

function countOcc(s, n) {
  let c = 0, i = 0;
  while ((i = s.indexOf(n, i)) >= 0) { c++; i += n.length; }
  return c;
}

/** 대소문자 무시 찾기(첫 글자 대소문자만 다른 정답구 등). */
export function findInTextCI(hay, needle) {
  const r = findInText(hay, needle);
  if (r) return r;
  const alt = needle.charAt(0).toUpperCase() === needle.charAt(0)
    ? needle.charAt(0).toLowerCase() + needle.slice(1)
    : needle.charAt(0).toUpperCase() + needle.slice(1);
  return findInText(hay, alt);
}

/** 문장 분할(영어) — 마침표/물음표/느낌표 + 닫는 인용부호까지. 약어(Mr. Dr. e.g.)는 보수적으로 붙인다. */
export function splitSentences(text) {
  const t = tidy(text);
  const out = [];
  let buf = "";
  const parts = t.split(/(?<=[.!?]["”’']?)\s+(?=[A-Z“"‘'(\[])/);
  for (const p of parts) {
    const cand = buf ? buf + " " + p : p;
    if (/\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|vs|etc|e\.g|i\.e|No|U\.S|U\.K)\.$/.test(cand) || /\b[A-Z]\.$/.test(cand)) {
      buf = cand; continue;
    }
    out.push(cand); buf = "";
  }
  if (buf) out.push(buf);
  return out.filter(Boolean);
}

export function hasHangul(s) { return /[가-힣]/.test(String(s ?? "")); }

export function wordCount(s) { return tidy(s).split(" ").filter(Boolean).length; }

/** 토큰 비교용 — 소문자, 하이픈·구두점 제거(PDF 하이픈 유실 "below-zero"↔"belowzero" 를 같게 본다) */
function tokNorm(w) {
  return w.toLowerCase().replace(/[‘’´`'"“”]/g, "").replace(/[-‐‑–—―]/g, "").replace(/[^a-z0-9]/g, "");
}

/** 코퍼스 토큰 인덱스(오프셋 보존) — alignToCorpus 가 재사용한다 */
export function tokenIndex(text) {
  const toks = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) {
    const n = tokNorm(m[0]);
    if (n) toks.push({ n, start: m.index, end: m.index + m[0].length });
  }
  return toks;
}

/**
 * 원형(PDF) 조각을 코퍼스 본문의 **깨끗한 원문 슬라이스**로 정렬한다.
 * 앞 k 토큰과 뒤 k 토큰(하이픈·구두점 무시)을 코퍼스 토큰열에서 찾아 그 사이 원문을 돌려준다.
 * 실패하면 null(호출자는 원형 조각을 그대로 쓴다). 하이픈 유실로 붙은 토큰은 코퍼스 토큰 2~3개를 이어 붙여 대조한다.
 */
export function alignToCorpus(segment, corpus, idx = null, k = 4) {
  const toks = idx || tokenIndex(corpus);
  const seg = tokenIndex(segment);
  if (seg.length === 0 || toks.length === 0) return null;
  const head = seg.slice(0, Math.min(k, seg.length)).map((t) => t.n);
  const tail = seg.slice(Math.max(0, seg.length - k)).map((t) => t.n);
  const findSeq = (needle, from = 0) => {
    for (let i = from; i < toks.length; i++) {
      let ci = i, ok = true, lastEnd = i;
      for (const n of needle) {
        let acc = "", j = ci, matched = false;
        while (j < toks.length && j < ci + 3) { acc += toks[j].n; if (acc === n) { matched = true; break; } if (!n.startsWith(acc)) break; j++; }
        if (!matched) { ok = false; break; }
        lastEnd = j; ci = j + 1;
      }
      if (ok) return { start: i, end: lastEnd };
    }
    return null;
  };
  const h = findSeq(head);
  if (!h) return null;
  const t = findSeq(tail, h.start);
  if (!t) return null;
  const s = toks[h.start].start, e = toks[t.end].end;
  if (e <= s) return null;
  const nTok = t.end - h.start + 1;
  if (nTok < seg.length * 0.75 - 2 || nTok > seg.length * 1.25 + 2) return null;
  return corpus.slice(s, e);
}
