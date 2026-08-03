// ============================================================================
// 지문 편집 diff — '직접 편집'으로 본문이 바뀌었을 때, 편집 전 원문과 비교해
// "무엇이 바뀌었는지"를 새 본문의 문자 오프셋 구간으로 돌려준다. 마킹 무대가
// 이 구간을 형광펜(변경)·빨간 마커(삭제)로 칠해 사용자가 자기 편집을 눈으로
// 확인하게 한다.
//
// 단어 단위 LCS — 문자 단위 diff 는 단어 중간이 잘려 형광펜이 지저분해지고,
// 공통 접두/접미만 쓰는 단일 구간 규칙(adjustAnnotations)은 떨어진 두 곳을
// 고치면 그 사이 전부를 변경으로 칠해 버린다.
// ============================================================================

export interface EditSpan {
  /** 새 본문 기준 문자 오프셋. kind === "delete" 면 from === to (자리 표시). */
  from: number;
  to: number;
  kind: "change" | "delete";
  /** 이 자리에서 사라진 원문 — 마커 툴팁("지운 내용")으로 보여준다. */
  removed?: string;
}

interface Tok {
  text: string;
  start: number;
  end: number;
}

/** 단어 덩어리(\S+)와 공백 덩어리(\s+)를 각각 토큰 하나로. */
function toks(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s+|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// LCS DP 셀 상한 — 지문 전체를 갈아엎은 경우(변형 지문 적용 등) 폭주 방지.
const LCS_CELL_CAP = 400_000;

/**
 * oldStr → newStr 편집 구간을 새 본문 오프셋으로 반환한다(문서 순).
 * 공백만 걸친 구간은 버리고, 공백으로만 떨어진 이웃 구간은 하나로 합친다.
 */
export function diffEditSpans(oldStr: string, newStr: string): EditSpan[] {
  if (oldStr === newStr) return [];
  const A = toks(oldStr);
  const B = toks(newStr);

  // 공통 접두/접미 토큰은 비교에서 제외 — 대개 지문의 대부분이 여기 해당한다.
  let p = 0;
  while (p < A.length && p < B.length && A[p].text === B[p].text) p += 1;
  let suf = 0;
  while (
    suf < A.length - p &&
    suf < B.length - p &&
    A[A.length - 1 - suf].text === B[B.length - 1 - suf].text
  )
    suf += 1;

  const a = A.slice(p, A.length - suf);
  const b = B.slice(p, B.length - suf);
  if (a.length === 0 && b.length === 0) return [];

  // 삭제 마커가 찍힐 자리 — 변경 구간 뒤에 남은 첫 토큰의 시작(없으면 본문 끝).
  const tailOffset =
    B.length - suf < B.length ? B[B.length - suf].start : newStr.length;
  const offsetAt = (j: number) => (j < b.length ? b[j].start : tailOffset);

  const raw: EditSpan[] = [];

  const removedText = (from: number, to: number) =>
    oldStr.slice(a[from].start, a[to - 1].end);

  if (a.length * b.length > LCS_CELL_CAP) {
    // 사실상 전면 교체 — 통째로 한 구간.
    if (b.length > 0) {
      raw.push({
        from: b[0].start,
        to: b[b.length - 1].end,
        kind: "change",
        removed: a.length > 0 ? removedText(0, a.length) : undefined,
      });
    } else {
      raw.push({
        from: tailOffset,
        to: tailOffset,
        kind: "delete",
        removed: removedText(0, a.length),
      });
    }
  } else {
    const n = a.length;
    const m = b.length;
    const w = m + 1;
    const dp = new Int32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i * w + j] =
          a[i].text === b[j].text
            ? dp[(i + 1) * w + j + 1] + 1
            : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }

    let runFrom = -1;
    let runTo = -1;
    // 이 런에서 사라진 원문 토큰 구간 [delFrom, delTo) — a 인덱스.
    let delFrom = -1;
    let delTo = -1;
    const flush = (jNow: number) => {
      const removed = delFrom >= 0 ? removedText(delFrom, delTo) : undefined;
      if (runFrom >= 0) {
        raw.push({ from: runFrom, to: runTo, kind: "change", removed });
      } else if (delFrom >= 0) {
        const o = offsetAt(jNow);
        raw.push({ from: o, to: o, kind: "delete", removed });
      }
      runFrom = -1;
      runTo = -1;
      delFrom = -1;
      delTo = -1;
    };

    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i].text === b[j].text) {
        flush(j);
        i += 1;
        j += 1;
        continue;
      }
      if (j < m && (i === n || dp[i * w + j + 1] >= dp[(i + 1) * w + j])) {
        // b[j] 삽입 — 변경 구간을 늘린다.
        if (runFrom < 0) runFrom = b[j].start;
        runTo = b[j].end;
        j += 1;
      } else {
        // a[i] 삭제 — 같은 런에 삽입이 있으면 그쪽으로 흡수된다.
        if (delFrom < 0) delFrom = i;
        delTo = i + 1;
        i += 1;
      }
    }
    flush(j);
  }

  // 앞뒤 공백을 잘라내고(형광펜이 여백까지 번지지 않게) 정리한다. 공백만 새로
  // 들어온 구간은 실질적으로 '삭제만'이므로 삭제 마커로 내린다.
  const trimmed: EditSpan[] = [];
  for (const r of raw) {
    if (r.kind === "delete") {
      const last = trimmed[trimmed.length - 1];
      if (last && last.kind === "delete" && last.from === r.from) continue;
      trimmed.push(r);
      continue;
    }
    let from = r.from;
    let to = r.to;
    while (from < to && /\s/.test(newStr[from])) from += 1;
    while (to > from && /\s/.test(newStr[to - 1])) to -= 1;
    if (to > from) trimmed.push({ from, to, kind: "change", removed: r.removed });
    else if (r.removed)
      trimmed.push({ from: r.from, to: r.from, kind: "delete", removed: r.removed });
  }

  // 단어 안에서만 고친 경우를 글자 단위로 좁힌다 — "structured" 에서 d 만
  // 지웠는데 단어 전체가 바뀐 것처럼 보이면 안 된다. 바뀐 텍스트와 사라진
  // 원문의 공통 접두/접미를 잘라내고 실제로 다른 부분만 남긴다.
  const refined: EditSpan[] = [];
  for (const sp of trimmed) {
    if (sp.kind !== "change" || !sp.removed) {
      refined.push(sp);
      continue;
    }
    const cur = newStr.slice(sp.from, sp.to);
    const rem = sp.removed;
    let p = 0;
    while (p < rem.length && p < cur.length && rem[p] === cur[p]) p += 1;
    let s = 0;
    while (
      s < rem.length - p &&
      s < cur.length - p &&
      rem[rem.length - 1 - s] === cur[cur.length - 1 - s]
    )
      s += 1;
    const from = sp.from + p;
    const to = sp.to - s;
    const removed = rem.slice(p, rem.length - s) || undefined;
    if (to > from) refined.push({ from, to, kind: "change", removed });
    else if (removed) refined.push({ from, to: from, kind: "delete", removed });
  }

  // 공백으로만 떨어진 이웃 변경 구간은 하나로(단어 두 개를 연달아 고친 경우).
  const merged: EditSpan[] = [];
  for (const sp of refined) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.kind === "change" &&
      sp.kind === "change" &&
      sp.from - last.to <= 2 &&
      newStr.slice(last.to, sp.from).trim() === ""
    ) {
      last.to = sp.to;
      last.removed = [last.removed, sp.removed].filter(Boolean).join(" … ") || undefined;
      continue;
    }
    merged.push({ ...sp });
  }
  return merged;
}

/** 마커 툴팁용 — 지운 원문을 한 줄로 줄여 보여준다. */
export function formatRemoved(removed: string | undefined, max = 120): string | undefined {
  if (!removed) return undefined;
  const one = removed.replace(/\s+/g, " ").trim();
  if (!one) return undefined;
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * 지운 자리에 되살려 보여줄 '유령 텍스트' — 삭제는 폭이 0이라 칠할 글자가 없으니,
 * 사라진 원문을 그 자리에 빨간 취소선으로 다시 그려 준다(본문에는 포함되지 않는
 * 순수 표시용 — 선택·마킹·생성 어디에도 끼어들지 않는다).
 */
export function ghostRemoved(removed: string | undefined, max = 400): string | null {
  if (!removed) return null;
  const one = removed.replace(/\s+/g, " ").trim();
  if (!one) return null;
  return one.length > max ? `${one.slice(0, max)}…` : one;
}
