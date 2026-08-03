// 단어 훈련 — 철자 채점 보조 (순수 함수, 서버·클라 공용).
//
// 정책: 대소문자·양끝 공백·연속 공백은 무시한다. **오타는 허용하지 않는다**
// (편집거리 1 을 허용하면 lead/read, form/from 처럼 실제로 다른 표제어가 정답
//  처리된다 — 코퍼스에 둘 다 존재한다). 대신 "한 글자 차이" 는 오답이되
//  판정 화면에서 학생에게 알려주는 쪽이 학습에 낫다(nearMiss).

export function normalizeLemmaForSpell(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 레벤슈타인 거리 — nearMiss 표시 전용(채점 판정에는 쓰지 않는다). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 오답이지만 한 글자 차이인가 — "아깝습니다" 안내용. */
export function isNearMiss(answer: string, correct: string): boolean {
  const a = normalizeLemmaForSpell(answer);
  const c = normalizeLemmaForSpell(correct);
  if (!a || a === c) return false;
  return editDistance(a, c) === 1;
}
