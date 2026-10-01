// qgen-lab 시드 난수 — 넛지 등 프로덕션의 Math.random 자리를 재현 가능하게 바꾼다.
// 같은 (지문, rep) 은 팔이 달라도 같은 시드 → 같은 정답 위치 넛지(paired 비교 공정성, LAB-SPEC §3-1).

/** 32비트 문자열 해시(FNV-1a, UTF-16 코드 유닛 단위). 시드 = fnv1a32(`${passageId}#${rep}`). */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — [0,1) 균등 난수 생성기. 같은 seed 는 같은 수열. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
