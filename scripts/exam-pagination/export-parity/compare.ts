// ============================================================================
// export-parity / compare — 웹 정본 vs 내보내기(HWPX·DOCX) 문항별 대조 로직 (순수 — 단위 테스트 대상)
//
// 네 면(facet)을 문항 id 로 맞춰 비교한다:
//   passage     지문 박스 수 — pre(문항 머리 앞 = 그룹 지문) / inline(문항 머리 뒤 = 문항 안 지문)
//   answerSpace 주관식 답란 — 있음/없음 + 줄 수(셀 수 없는 레거시 박스는 null)
//   metaBadge   [n점 · 유형] 배지
//   answerKey   정답표 표기
// 내보내기 쪽 지문 박스는 probe.ts 의 탐침 토큰 등장(StreamEvent passage)을 문항 머리(head) 위치로 귀속한다.
// ============================================================================

export type PassageFacet = { pre: number; inline: number };
export type AnswerSpaceFacet = { present: boolean; lines: number | null };

export type QuestionFacets = {
  questionId: string;
  /** 그 형식에서 찍힌 문항 번호(없으면 null) */
  orderNum: number | null;
  passage: PassageFacet;
  answerSpace: AnswerSpaceFacet;
  metaBadge: boolean;
  /** 정답표 표기(정답표에 없으면 null) */
  answerKey: string | null;
};

/** 내보내기 본문을 순서대로 걸으며 뽑은 사건. unit = 같은 문단/표 칸 안 중복 토큰을 한 번만 세기 위한 문단 번호. */
export type StreamEvent =
  | { kind: "head"; questionId: string | null; orderNum: number; unit: number }
  | { kind: "passage"; owner: string; unit: number }
  | { kind: "meta"; unit: number }
  | { kind: "answerLine"; unit: number }
  | { kind: "answerBox"; unit: number };

export type StrayPassage = { owner: string; afterQuestion: string | null; beforeQuestion: string | null };

export type StreamFacets = {
  byQuestion: Map<string, Omit<QuestionFacets, "answerKey">>;
  strays: StrayPassage[];
  /** 머리는 찾았는데 문항 id 로 이을 수 없었던 번호들 */
  unmappedHeads: number[];
  /** 첫 머리 앞에서 발견된 답란(귀속 불가) 수 */
  orphanAnswerLines: number;
};

export type MismatchKind =
  | "question.missing"
  | "question.extra"
  | "passage.extra"
  | "passage.missing"
  | "passage.placement"
  | "passage.stray"
  | "answerSpace.presence"
  | "answerSpace.lines"
  | "meta"
  | "answerKey.symbol"
  | "answerKey.absent";

export type Mismatch = {
  questionId: string;
  kind: MismatchKind;
  web: unknown;
  export: unknown;
};

export const FACET_OF_KIND: Record<MismatchKind, "presence" | "passage" | "answerSpace" | "meta" | "answerKey"> = {
  "question.missing": "presence",
  "question.extra": "presence",
  "passage.extra": "passage",
  "passage.missing": "passage",
  "passage.placement": "passage",
  "passage.stray": "passage",
  "answerSpace.presence": "answerSpace",
  "answerSpace.lines": "answerSpace",
  meta: "meta",
  "answerKey.symbol": "answerKey",
  "answerKey.absent": "answerKey",
};

/**
 * 사건 목록 → 문항별 면. 지문 토큰 하나(같은 문단 안 같은 주인은 1회)를 다음 규칙으로 귀속한다:
 *  - 주인 === 직전 머리 문항                      → 그 문항의 inline 후보
 *  - 주인 === 다음 머리 문항 또는 그 웹 그룹 멤버 → 다음 문항의 pre 후보
 *  - 둘 다 후보면 웹 기대치가 덜 찬 쪽(inline 먼저), 둘 다 찼으면 inline(주인 자신)
 *  - 어느 쪽도 아니면 stray(엉뚱한 자리에 찍힌 지문)
 */
export function facetsFromStream(
  events: readonly StreamEvent[],
  opts: {
    webGroupOf: (questionId: string) => ReadonlySet<string> | undefined;
    webExpect: (questionId: string) => PassageFacet | undefined;
  },
): StreamFacets {
  const byQuestion = new Map<string, Omit<QuestionFacets, "answerKey">>();
  const strays: StrayPassage[] = [];
  const unmappedHeads: number[] = [];
  let orphanAnswerLines = 0;

  const headIdx: number[] = [];
  events.forEach((ev, i) => {
    if (ev.kind === "head") headIdx.push(i);
  });
  const facetOf = (qid: string) => {
    let f = byQuestion.get(qid);
    if (!f) {
      f = {
        questionId: qid,
        orderNum: null,
        passage: { pre: 0, inline: 0 },
        answerSpace: { present: false, lines: 0 },
        metaBadge: false,
      };
      byQuestion.set(qid, f);
    }
    return f;
  };

  // 머리 등록(번호) — 등장 순서.
  for (const i of headIdx) {
    const ev = events[i] as Extract<StreamEvent, { kind: "head" }>;
    if (!ev.questionId) {
      unmappedHeads.push(ev.orderNum);
      continue;
    }
    const f = facetOf(ev.questionId);
    if (f.orderNum === null) f.orderNum = ev.orderNum;
  }

  let prevHead: string | null = null;
  let hp = 0; // headIdx 커서
  const seenInUnit = new Set<string>();
  let lastUnit = -1;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    while (hp < headIdx.length && headIdx[hp] <= i) hp += 1;
    const nextHeadEv = hp < headIdx.length ? (events[headIdx[hp]] as Extract<StreamEvent, { kind: "head" }>) : null;
    const nextHead = nextHeadEv?.questionId ?? null;
    if (ev.kind === "head") {
      prevHead = ev.questionId;
      continue;
    }
    if (ev.kind === "meta") {
      if (prevHead) facetOf(prevHead).metaBadge = true;
      continue;
    }
    if (ev.kind === "answerLine" || ev.kind === "answerBox") {
      if (!prevHead) {
        orphanAnswerLines += 1;
        continue;
      }
      const a = facetOf(prevHead).answerSpace;
      a.present = true;
      if (ev.kind === "answerBox") a.lines = null;
      else if (a.lines !== null) a.lines += 1;
      continue;
    }
    // passage
    if (ev.unit !== lastUnit) {
      seenInUnit.clear();
      lastUnit = ev.unit;
    }
    if (seenInUnit.has(ev.owner)) continue;
    seenInUnit.add(ev.owner);
    const candInline = prevHead !== null && ev.owner === prevHead;
    const candPre =
      nextHead !== null && (ev.owner === nextHead || Boolean(opts.webGroupOf(nextHead)?.has(ev.owner)));
    if (candInline && candPre) {
      const prevF = facetOf(prevHead as string);
      const nextF = facetOf(nextHead as string);
      const prevWant = opts.webExpect(prevHead as string)?.inline ?? 0;
      const nextWant = opts.webExpect(nextHead as string)?.pre ?? 0;
      if (prevF.passage.inline < prevWant) prevF.passage.inline += 1;
      else if (nextF.passage.pre < nextWant) nextF.passage.pre += 1;
      else prevF.passage.inline += 1;
    } else if (candInline) {
      facetOf(prevHead as string).passage.inline += 1;
    } else if (candPre) {
      facetOf(nextHead as string).passage.pre += 1;
    } else {
      strays.push({ owner: ev.owner, afterQuestion: prevHead, beforeQuestion: nextHead });
    }
  }
  return { byQuestion, strays, unmappedHeads, orphanAnswerLines };
}

/** 정답표 번호 → 문항 id. 같은 번호가 여러 번이면 등장 순서대로 소비한다. */
export function answerKeyByQuestion(
  entries: ReadonlyArray<{ orderNum: number; answer: string }>,
  questionsByOrderNum: ReadonlyMap<number, readonly string[]>,
): Map<string, string> {
  const cursor = new Map<number, number>();
  const out = new Map<string, string>();
  for (const e of entries) {
    const list = questionsByOrderNum.get(e.orderNum) ?? [];
    const k = cursor.get(e.orderNum) ?? 0;
    cursor.set(e.orderNum, k + 1);
    const qid = list[k];
    if (qid && !out.has(qid)) out.set(qid, e.answer);
  }
  return out;
}

export function normalizeAnswerSymbol(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** 한 시험지·한 형식의 문항별 불일치. web·exp 는 문항 id → 면. */
export function compareFacets(
  web: ReadonlyMap<string, QuestionFacets>,
  exp: ReadonlyMap<string, QuestionFacets>,
  strays: readonly StrayPassage[] = [],
): Mismatch[] {
  const out: Mismatch[] = [];
  for (const [qid, w] of web) {
    const e = exp.get(qid);
    if (!e) {
      out.push({ questionId: qid, kind: "question.missing", web: w.orderNum, export: null });
      continue;
    }
    const wt = w.passage.pre + w.passage.inline;
    const et = e.passage.pre + e.passage.inline;
    if (et > wt) out.push({ questionId: qid, kind: "passage.extra", web: w.passage, export: e.passage });
    else if (et < wt) out.push({ questionId: qid, kind: "passage.missing", web: w.passage, export: e.passage });
    else if (w.passage.pre !== e.passage.pre) {
      out.push({ questionId: qid, kind: "passage.placement", web: w.passage, export: e.passage });
    }
    if (w.answerSpace.present !== e.answerSpace.present) {
      out.push({ questionId: qid, kind: "answerSpace.presence", web: w.answerSpace, export: e.answerSpace });
    } else if (
      w.answerSpace.present &&
      w.answerSpace.lines !== null &&
      e.answerSpace.lines !== null &&
      w.answerSpace.lines !== e.answerSpace.lines
    ) {
      out.push({ questionId: qid, kind: "answerSpace.lines", web: w.answerSpace, export: e.answerSpace });
    }
    if (w.metaBadge !== e.metaBadge) out.push({ questionId: qid, kind: "meta", web: w.metaBadge, export: e.metaBadge });
    if (w.answerKey !== null || e.answerKey !== null) {
      if (w.answerKey === null || e.answerKey === null) {
        out.push({ questionId: qid, kind: "answerKey.absent", web: w.answerKey, export: e.answerKey });
      } else if (normalizeAnswerSymbol(w.answerKey) !== normalizeAnswerSymbol(e.answerKey)) {
        out.push({ questionId: qid, kind: "answerKey.symbol", web: w.answerKey, export: e.answerKey });
      }
    }
  }
  for (const [qid, e] of exp) {
    if (!web.has(qid)) out.push({ questionId: qid, kind: "question.extra", web: null, export: e.orderNum });
  }
  for (const s of strays) {
    out.push({ questionId: s.owner, kind: "passage.stray", web: null, export: s });
  }
  return out;
}

// ── 절대 불변 조건(웹 정본 자체) ──
// compareFacets 는 상대 비교라, 세 출력이 같은 공용 판정(buildPaperItemsFromExam·buildGroups·structuredSegments)을
// 소비하는 한 공용 판정이 틀리면 셋이 똑같이 틀려도 초록이다(AB-R2 실측: 비세트 지문 그룹 선두 TITLE 이 그룹 박스와
// 문항 안 박스로 같은 지문을 두 번 찍는데 불일치 0). 그래서 웹 정본에 형식과 무관한 조건을 따로 건다 — 내보내기는
// compareFacets 가 웹과 같음을 보장하므로 웹에서 한 번만 재면 세 출력 모두를 덮는다.
//   invariant.passage.multiple  한 문항이 자기 지문을 2번 이상 찍는다(pre+inline ≥ 2)
//   invariant.passage.absent    지문을 반드시 실어야 하는 문항(requiresPassage — 호출자가 공용 판정으로 정한다)인데
//                               자기 박스(pre+inline)도, 같은 웹 그룹에 찍힌 그룹 박스도 없다.
//                               「원문 지문 없음」(인쇄할 지문 자체가 없음)은 requiresPassage 에 들지 않는다(따로 집계).
export type InvariantKind = "invariant.passage.multiple" | "invariant.passage.absent";
export type InvariantViolation = { questionId: string; kind: InvariantKind; passage: PassageFacet };

export function passageInvariantViolations(input: {
  facets: ReadonlyMap<string, QuestionFacets>;
  groupOf: (questionId: string) => ReadonlySet<string> | undefined;
  requiresPassage: ReadonlySet<string>;
}): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  for (const [qid, f] of input.facets) {
    const own = f.passage.pre + f.passage.inline;
    if (own > 1) out.push({ questionId: qid, kind: "invariant.passage.multiple", passage: f.passage });
    if (own > 0 || !input.requiresPassage.has(qid)) continue;
    const groupBox = [...(input.groupOf(qid) ?? [])].some((m) => (input.facets.get(m)?.passage.pre ?? 0) > 0);
    if (!groupBox) out.push({ questionId: qid, kind: "invariant.passage.absent", passage: f.passage });
  }
  return out;
}

/**
 * 스트림 면 + 정답표 → 비교용 면 맵. 본문에 머리가 있는 문항만 싣는다(본문에 없는 문항은
 * compareFacets 가 question.missing 으로 잡는다). 정답표에 없는 문항은 answerKey null.
 */
export function withAnswerKeys(
  stream: StreamFacets,
  answerKey: ReadonlyMap<string, string>,
): Map<string, QuestionFacets> {
  const out = new Map<string, QuestionFacets>();
  for (const [qid, f] of stream.byQuestion) out.set(qid, { ...f, answerKey: answerKey.get(qid) ?? null });
  return out;
}
