// ============================================================================
// 단어 단위 diff (LCS) — before/after 에서 "무엇이 바뀌었는지" 인라인 강조용
// ============================================================================
// 순수 함수(React 무관). change-log-panel(상세 내역)과 블럭 변경 마크 펼침이 공유한다.
// ============================================================================

export interface DiffSeg {
  text: string;
  changed: boolean;
}

function tokenize(t: string): string[] {
  // 공백을 유지하면서 토큰화(공백도 토큰) → 재조합 시 원문 보존.
  return t.split(/(\s+)/).filter((x) => x.length > 0);
}

/** before/after 를 단어 단위 LCS 로 비교해 변경 세그먼트를 표시한다. */
export function diffWords(before: string, after: string): { b: DiffSeg[]; a: DiffSeg[] } {
  const B = tokenize(before);
  const A = tokenize(after);
  // 너무 길면(병리적 비용) 강조 생략 — 통짜 표시.
  if (B.length + A.length > 600) {
    return { b: [{ text: before, changed: true }], a: [{ text: after, changed: true }] };
  }
  const m = B.length;
  const n = A.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = B[i] === A[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const b: DiffSeg[] = [];
  const a: DiffSeg[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (B[i] === A[j]) {
      b.push({ text: B[i], changed: false });
      a.push({ text: A[j], changed: false });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      b.push({ text: B[i], changed: true });
      i++;
    } else {
      a.push({ text: A[j], changed: true });
      j++;
    }
  }
  while (i < m) b.push({ text: B[i++], changed: true });
  while (j < n) a.push({ text: A[j++], changed: true });
  return { b, a };
}
