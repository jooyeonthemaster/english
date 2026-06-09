// ============================================================================
// 단어 단위 LCS diff — AI 문장 변형 결과를 원문과 비교해 하이라이트한다.
// 모델이 주는 changes 메타데이터에 의존하지 않는 결정론적 계산.
// ============================================================================

export interface DiffToken {
  text: string;
  type: "same" | "del" | "add";
}

const MAX_WORDS = 400; // 선택 구간은 짧다 — O(n²) LCS 도 충분히 빠른 상한.

/**
 * before → after 단어 diff. 토큰 순서는 "원문 흐름 + 추가 단어 삽입" 순.
 * 너무 긴 입력은 diff 없이 통째 교체로 표시한다.
 */
export function diffWords(before: string, after: string): DiffToken[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (a.length > MAX_WORDS || b.length > MAX_WORDS) {
    return [
      ...a.map((w): DiffToken => ({ text: w, type: "del" })),
      ...b.map((w): DiffToken => ({ text: w, type: "add" })),
    ];
  }

  // 구두점 차이는 동일 단어로 취급해 diff 노이즈를 줄인다.
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] =
        norm(a[i]) === norm(b[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (norm(a[i]) === norm(b[j])) {
      tokens.push({ text: b[j], type: "same" });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ text: a[i], type: "del" });
      i += 1;
    } else {
      tokens.push({ text: b[j], type: "add" });
      j += 1;
    }
  }
  while (i < m) {
    tokens.push({ text: a[i], type: "del" });
    i += 1;
  }
  while (j < n) {
    tokens.push({ text: b[j], type: "add" });
    j += 1;
  }
  return tokens;
}
