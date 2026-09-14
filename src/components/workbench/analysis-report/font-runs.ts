// ============================================================================
// 부분 서식 런(FontRun) 대수 — 순수층(DOM·React 무의존)
//
// `BlockMeta.fontRuns` 는 "몇 번째 편집 필드(f)의 [s,e) 글자에 크기(pt)/글꼴(ff)"
// 이라는 **범위 메타**다. 평문은 건드리지 않으므로 저장·내보내기·AI 가 쓰는 텍스트가
// 서식 마커로 오염되지 않는다(schema.ts fontRuns 주석).
//
// ─── 이 파일이 지키는 불변식: 런은 **서로 겹치지 않는다** ───────────────────────
// 렌더러(editable-field.tsx `editableTextHtml`)가 커서를 앞으로만 밀며 구간을 잘라
// 붙이는 단순 루프라, 겹친 런이 들어오면 뒤엣것이 **조용히 잘려 사라진다**. 그런데
// DOM 왕복(readEditableContent)은 중첩 span(글꼴 span 안의 크기 span)을 만나면
// 자연히 겹치는 런을 만든다. 그래서 입력 경로 **둘 다**가 이 파일을 통과해
// 문자 단위로 펼쳤다가(toCharAttrs) 최소 구간으로 되감는다(fromCharAttrs).
//
// 길이는 편집 필드 하나(문장~문단)라 O(n) 펼침이 실측상 무해하다. 대신 이 단순함이
// 「부분 굵게/부분 글꼴/부분 크기」가 서로를 지우지 않는 유일한 보증이다.
// ============================================================================

import type { FontRun } from "@/lib/passage-report/analysis-report/schema";

/** null = 그 축을 **지운다**, undefined = 그 축은 **건드리지 않는다**. */
export interface FontRunPatch {
  pt?: number | null;
  ff?: string | null;
}

interface Attr {
  pt?: number;
  ff?: string;
}

function sameAttr(a: Attr | undefined, b: Attr | undefined): boolean {
  return (a?.pt ?? null) === (b?.pt ?? null) && (a?.ff ?? null) === (b?.ff ?? null);
}

function emptyAttr(a: Attr | undefined): boolean {
  return !a || (a.pt === undefined && a.ff === undefined);
}

/**
 * 구간 목록 → 문자별 속성 배열.
 *
 * ⚠ **먼저 쓴 쪽이 이긴다(first-writer-wins)**. DOM 왕복이 안쪽 요소를 먼저 push 하기
 *   때문이다(`readEditableContent` 의 walk 는 자식 재귀가 끝난 뒤 자기를 push 한다).
 *   즉 중첩된 안쪽 서식이 바깥쪽을 이긴다 — 브라우저 렌더 결과와 같은 우선순위.
 */
function toCharAttrs(runs: FontRun[], bound: number): Array<Attr | undefined> {
  const out: Array<Attr | undefined> = new Array(bound);
  for (const r of runs) {
    const s = Math.max(0, Math.min(r.s, bound));
    const e = Math.max(s, Math.min(r.e, bound));
    for (let i = s; i < e; i++) {
      const cur = out[i];
      if (!cur) {
        out[i] = { pt: r.pt, ff: r.ff };
        continue;
      }
      if (cur.pt === undefined && r.pt !== undefined) cur.pt = r.pt;
      if (cur.ff === undefined && r.ff !== undefined) cur.ff = r.ff;
    }
  }
  return out;
}

/** 문자별 속성 → 최소 개수의 겹치지 않는 런(연속 동일 구간 병합·빈 속성 제거). */
function fromCharAttrs(attrs: Array<Attr | undefined>, ord: number): FontRun[] {
  const out: FontRun[] = [];
  let i = 0;
  while (i < attrs.length) {
    const a = attrs[i];
    if (emptyAttr(a)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < attrs.length && sameAttr(attrs[j], a)) j++;
    const run: FontRun = { f: ord, s: i, e: j };
    if (a!.pt !== undefined) run.pt = a!.pt;
    if (a!.ff !== undefined) run.ff = a!.ff;
    out.push(run);
    i = j;
  }
  return out;
}

function boundOf(runs: FontRun[], extra = 0): number {
  let max = extra;
  for (const r of runs) if (r.e > max) max = r.e;
  return max;
}

/** 한 필드(ord)의 런들을 겹침 없는 최소 형태로 정규화. */
export function normalizeFontRuns(runs: FontRun[], ord: number): FontRun[] {
  const valid = runs.filter((r) => r.e > r.s && (r.pt !== undefined || r.ff !== undefined));
  if (valid.length === 0) return [];
  return fromCharAttrs(toCharAttrs(valid, boundOf(valid)), ord);
}

/** 블록 전체(여러 ord)의 런 배열을 정규화. 빈 배열이면 undefined(= 필드 제거). */
export function normalizeAllFontRuns(runs?: FontRun[]): FontRun[] | undefined {
  if (!runs || runs.length === 0) return undefined;
  const byOrd = new Map<number, FontRun[]>();
  for (const r of runs) {
    const arr = byOrd.get(r.f);
    if (arr) arr.push(r);
    else byOrd.set(r.f, [r]);
  }
  const out: FontRun[] = [];
  for (const ord of [...byOrd.keys()].sort((a, b) => a - b)) {
    out.push(...normalizeFontRuns(byOrd.get(ord)!, ord));
  }
  return out.length > 0 ? out : undefined;
}

/**
 * 한 필드(ord)의 [start,end) 구간에 서식을 적용한 **블록 전체 런 배열**을 돌려준다.
 * 다른 ord 의 런은 그대로 통과한다(건드리면 같은 블록의 다른 문장 서식이 날아간다).
 */
export function applyFontRunRange(
  all: FontRun[] | undefined,
  ord: number,
  start: number,
  end: number,
  patch: FontRunPatch,
): FontRun[] | undefined {
  if (end <= start) return all && all.length > 0 ? all : undefined;
  const others = (all ?? []).filter((r) => r.f !== ord);
  const mine = (all ?? []).filter((r) => r.f === ord && r.e > r.s);
  const bound = Math.max(boundOf(mine), end);
  const attrs = toCharAttrs(mine, bound);
  for (let i = start; i < Math.min(end, bound); i++) {
    const cur: Attr = { ...(attrs[i] ?? {}) };
    if (patch.pt === null) delete cur.pt;
    else if (patch.pt !== undefined) cur.pt = patch.pt;
    if (patch.ff === null) delete cur.ff;
    else if (patch.ff !== undefined) cur.ff = patch.ff;
    attrs[i] = cur;
  }
  const next = [...others, ...fromCharAttrs(attrs, ord)];
  return next.length > 0 ? next : undefined;
}

/** 한 필드(ord)의 런을 통째로 제거(= 그 문장의 부분 서식 초기화). */
export function clearFontRunsForOrd(all: FontRun[] | undefined, ord: number): FontRun[] | undefined {
  const next = (all ?? []).filter((r) => r.f !== ord);
  return next.length > 0 ? next : undefined;
}

/** 두 런 배열이 같은가(커밋 스킵 판정용 — 순서 무관하게 정규화 후 비교). */
export function sameFontRuns(a: FontRun[], b: FontRun[]): boolean {
  if (a.length !== b.length) return false;
  const key = (r: FontRun) => `${r.f}:${r.s}:${r.e}:${r.pt ?? ""}:${r.ff ?? ""}`;
  const sa = a.map(key).sort();
  const sb = b.map(key).sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}
