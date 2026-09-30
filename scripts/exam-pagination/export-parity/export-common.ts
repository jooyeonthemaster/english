// ============================================================================
// export-parity / export-common — HWPX·DOCX 어댑터 공용 조각(순수).
// ============================================================================
import type { StreamEvent } from "./compare";

/** 문항 메타 배지 「[n점]」·「[n점 · 유형]」 — 런 텍스트 전체가 배지일 때만(발문 속 [3점] 은 제외). */
export const META_BADGE_RE = /^\[\s*\d+(?:\.\d+)?\s*점(?:\s*·\s*[^\]]+)?\s*\]$/;

/** 어댑터가 본문·정답표에서 뽑은 원자료. */
export type ExportProbe = {
  events: StreamEvent[];
  answerEntries: Array<{ orderNum: number; answer: string }>;
  answerKeyFound: boolean;
};

export type GlueCheck = { route: string; entry: string; ok: boolean; missing: string[] };

export function squashWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * 라우트 소스가 감사가 부르는 진입점을 같은 인자로 부르는지(공백 무시 부분 문자열 앵커).
 * 하나라도 빠지면 라우트가 다른 조립을 하고 있다는 뜻이라 감사 결과가 라우트를 대변하지 못한다 — 호출자가 멈춘다.
 */
export function assertRouteGlue(route: string, source: string, anchors: readonly string[], entry: string): GlueCheck {
  const flat = squashWhitespace(source);
  const missing = anchors.filter((a) => !flat.includes(squashWhitespace(a)));
  return { route, entry, ok: missing.length === 0, missing };
}

/**
 * 본문 머리 번호 → 문항 id, **순서대로만**. 파이프라인 자신의 문항 순서(list)에서 다음 차례(빠진 문항을 건너뛰는
 * lookahead 칸 안)와 번호가 같을 때만 머리로 인정한다. 발문 속 「[조건] 1. …」 같은 굵은 번호 목록은 차례 번호가
 * 아니라 null(머리 아님)이 된다.
 */
export function makeHeadMatcher(list: ReadonlyArray<{ orderNum: number; questionId: string }>, lookahead = 3) {
  let next = 0;
  return {
    take(orderNum: number): string | null {
      for (let k = next; k < Math.min(list.length, next + lookahead + 1); k++) {
        if (list[k].orderNum === orderNum) {
          next = k + 1;
          return list[k].questionId;
        }
      }
      return null;
    },
  };
}

/** 번호 → 문항 id(같은 번호가 여러 번이면 등장 순서대로 소비). 정답표 번호 대응용. */
export function makeOrderConsumer(list: ReadonlyArray<{ orderNum: number; questionId: string }>) {
  const byNum = new Map<number, string[]>();
  for (const it of list) {
    const arr = byNum.get(it.orderNum) ?? [];
    arr.push(it.questionId);
    byNum.set(it.orderNum, arr);
  }
  const cursor = new Map<number, number>();
  return {
    byNum,
    take(orderNum: number): string | null {
      const arr = byNum.get(orderNum);
      if (!arr) return null;
      const k = cursor.get(orderNum) ?? 0;
      cursor.set(orderNum, k + 1);
      return arr[k] ?? null;
    },
  };
}
