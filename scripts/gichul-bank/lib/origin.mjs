// 기출 문제 은행 빌더 — PDF 원형(origin JSON) 파서. 문항 슬라이스 → {stemLines, bodyLines, choiceBlock, footnotes, point}
import { readFileSync, existsSync } from "node:fs";
import { CIRC, hasHangul, tidy } from "./text.mjs";

const FURNITURE_RE = [
  /^\s*(홀수형|짝수형)\s*$/,
  /^\s*\d{1,2}\s*$/, // 페이지 번호
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
  /^\s*하시오\.?\s*$/,
  /^\s*이제 듣기/,
  /^\s*18번부터는/,
  /^\s*영어\s*영역\s*$/,
  /^\s*제\s*\d\s*교시\s*$/,
];
const SET_HEADER_RE = /^\s*\[\s*\d{1,2}\s*[~～∼-]\s*\d{1,2}\s*\]/;
const FOOT_RE = /^\s*[*＊]{1,3}\s*[A-Za-z][^:]{0,40}:\s*\S/;
const POINT_RE = /\[\s*(\d)\s*점\s*\]/;

const cache = new Map();
export function loadOrigin(dir, examId) {
  if (cache.has(examId)) return cache.get(examId);
  const p = `${dir}/${examId}.json`;
  const v = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  cache.set(examId, v);
  return v;
}

/** 슬라이스 줄 정리 — 가구 줄 제거, [3점] 추출, 각주 분리, 다음 세트 머리부터 절단(setHeaderIdx). */
export function cleanSlice(text) {
  const raw = String(text ?? "").split("\n");
  const lines = [];
  const footnotes = [];
  let point = null;
  let stopped = false;
  let trailing = []; // 세트 머리 이후(다음 세트 지문) — 장문 추출용
  let lastWasFoot = false;
  for (let i = 0; i < raw.length; i++) {
    let ln = raw[i];
    if (stopped) { trailing.push(ln); continue; }
    if (i > 0 && SET_HEADER_RE.test(ln)) { stopped = true; trailing.push(ln); continue; }
    if (FURNITURE_RE.some((re) => re.test(ln))) continue;
    const pm = ln.match(POINT_RE);
    if (pm) { point = Number(pm[1]); ln = ln.replace(POINT_RE, " ").trim(); if (!ln) continue; }
    if (FOOT_RE.test(ln)) { footnotes.push(tidy(ln)); lastWasFoot = true; continue; }
    // 각주가 두 줄로 감긴 경우("** heuristics: 휴리스틱(특정 상황에서 … ⏎ 신속하게 사용하는 …)") — 한글 이어짐 줄은 각주에 붙인다
    if (lastWasFoot && hasHangul(ln) && !/^\s*[①-⑤(\[]/.test(ln)) { footnotes[footnotes.length - 1] = tidy(footnotes[footnotes.length - 1] + " " + ln); continue; }
    lastWasFoot = false;
    lines.push(ln);
  }
  // 장문 세트 지문(trailing)에서도 각주·가구 제거 — 단, 그 각주는 **다음 문항의 것**이라 이 슬라이스 각주에 섞지 않는다
  // (검수 실측: 요약문 36건에 이웃 41~42 세트 각주가 혼입됐다). 장문용으로만 trailingFootnotes 로 따로 돌려준다.
  const trail = [];
  const trailingFootnotes = [];
  for (const ln of trailing) {
    if (FURNITURE_RE.some((re) => re.test(ln))) continue;
    if (FOOT_RE.test(ln)) { trailingFootnotes.push(tidy(ln)); continue; }
    trail.push(ln);
  }
  return { lines, footnotes: dedupe(footnotes), point, trailing: trail, trailingFootnotes: dedupe(trailingFootnotes) };
}

function dedupe(a) { return [...new Set(a)]; }

/**
 * 첫 줄들 중 발문(한글 포함) 을 뗀다. "NN." 접두 제거. 번호만 단독 줄이면 발문 없음.
 * 반환 {direction, body(lines)} — direction 은 tidy 된 한 줄.
 */
export function splitStem(lines) {
  const ls = [...lines];
  if (ls.length === 0) return { direction: "", body: [] };
  let first = ls[0].replace(/^\s*\d{1,2}\s*[.．]\s*/, "");
  const dir = [];
  if (first.trim() === "") { ls.shift(); }
  else if (hasHangul(first) || /^\s*\[\s*\d/.test(first)) {
    dir.push(first); ls.shift();
    // 발문이 2~3줄로 이어지는 경우: 다음 줄도 한글을 포함하고 물음표로 아직 안 끝났으면 이어붙임
    while (ls.length && !/[?？]\s*$/.test(dir[dir.length - 1]) && hasHangul(ls[0]) && dir.length < 4) {
      dir.push(ls.shift());
    }
  } else {
    // 발문 없이 본문이 바로 시작(빈칸 32~34, 순서/삽입 등) — "NN." 만 떼고 본문 유지
    ls[0] = first;
  }
  return { direction: tidy(dir.join(" ")), body: ls };
}

/**
 * 선지 블록 파싱 — 줄 배열 뒤쪽에서 ①~⑤ 가 순서대로 나오는 마지막 창을 찾아 5개 텍스트로 자른다.
 * 반환 {choices[5]|null, bodyLines(선지 앞까지)}
 */
export function splitChoices(lines) {
  const joined = lines.join("\n");
  const idxs = [];
  for (const m of joined.matchAll(/[①②③④⑤]/g)) idxs.push({ i: m.index, c: m[0] });
  if (idxs.length < 5) return { choices: null, bodyLines: lines };
  for (let s = idxs.length - 5; s >= 0; s--) {
    const win = idxs.slice(s, s + 5).map((x) => x.c).join("");
    if (win === "①②③④⑤") {
      const start = idxs[s].i;
      // 선지 블록은 줄 머리(또는 줄 안 두 번째 선지)에서 시작해야 한다 — 본문 인라인 마커(무관·삽입)는 제외
      const lineStart = joined.lastIndexOf("\n", start) + 1;
      const head = joined.slice(lineStart, start).trim();
      if (head !== "" && !/^[①②③④⑤]/.test(head)) {
        // 앞에 본문이 있는 줄이면 선지 블록이 아니라 인라인 마커일 가능성 — 단, "(A) - (C) - (B)" 류 선지가 한 줄에 여럿이면 head 가 이전 선지
        if (!/[)]\s*$/.test(head)) continue;
      }
      const block = joined.slice(start);
      const parts = block.split(/(?=[①②③④⑤])/).filter((p) => p.trim());
      if (parts.length < 5) continue;
      const choices = parts.slice(0, 5).map((p) =>
        tidy(p.replace(/^[①②③④⑤]\s*/, "").replace(/\n/g, " "))
          // 마지막 선지 꼬리에 붙는 쪽 가구("8 홀수형 외국어(영어) 영역", "외국어영어영역 (", "6 고1")
          .replace(/\s*\d{0,2}\s*(?:홀수형|짝수형)?\s*(?:외국어\s*\(?영어\)?|영어)\s*영역.*$/, "")
          .replace(/\s*\d{0,2}\s*외국어\s*\(?영어\)?\s*\(?.*$/, "")
          .replace(/\s+\d{1,2}\s*고[123]\s*$/, "")
          .replace(/\s+\d{1,2}$/, ""),
      );
      const bodyText = joined.slice(0, start);
      return { choices, bodyLines: bodyText.split("\n").filter((l, i, a) => !(i === a.length - 1 && l.trim() === "")) };
    }
  }
  return { choices: null, bodyLines: lines };
}

/** 문항 슬라이스(qNum) 의 원형 조각 — 없으면 null */
export function originSlice(origin, qNum) {
  const q = origin?.questions?.[String(qNum)];
  if (!q) return null;
  const cleaned = cleanSlice(q.text);
  return { ...q, cleaned };
}

/** 장문 세트 지문 — 세트 첫 문항(41/43) 직전 문항 슬라이스의 trailing(세트 머리 이후) 에서 뽑는다. */
export function setPassageLines(origin, firstQ) {
  const prev = originSlice(origin, firstQ - 1);
  if (!prev) return null;
  const t = prev.cleaned.trailing;
  if (!t.length) return null;
  // 첫 줄은 세트 머리 "[41～42] 다음 글을 읽고, 물음에 답하시오." — 제거
  const body = t.slice(1);
  return { lines: body, footnotes: prev.cleaned.trailingFootnotes || [], prevSlice: prev };
}

export function markerIndex(ch) { return CIRC.indexOf(ch); }
