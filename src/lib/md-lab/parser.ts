// 마크다운 문항 파서 (md-lab 실험 — 26-07-21 O208 계열)
// JSON 스키마 강제 없이 고정 마크다운 형식을 결정형 정규식으로 파싱한다.
// 서버·클라이언트 공용(순수 모듈, 의존성 없음).

export interface MdOption {
  label: string;
  text: string;
}

export interface MdBlankQuestion {
  kind: "blank";
  originalExpression: string;
  options: MdOption[];
  answer: string;
  explanation: string;
  wrong: MdOption[];
}

export interface MdGrammarMark {
  label: string; // "(A)"~"(E)"
  original: string;
  shown: string;
  code: string; // a~k
  /** 위치앵커 — 이 표현 '직전'의 원문 조각. 짧은 단어(is 등)의 자리를 유일 확정한다. */
  anchor?: string;
}

export interface MdGrammarQuestion {
  kind: "grammar";
  marks: MdGrammarMark[];
  /** 지문 복사 방식(v2): 밑줄이 [[A:표현]] 로 인라인 마킹된 지문 전체. */
  markedPassage?: string;
  answer: string; // "(A)"~"(E)"
  fix: string;
  explanation: string;
  wrong: MdOption[];
}

export type MdQuestion = MdBlankQuestion | MdGrammarQuestion;

// 공백 + 유니코드 구두점 정규화 — 모델이 지문을 재출력할 때 곱슬따옴표('' "")를
// 곧은따옴표로 바꾸는 일이 흔해(재구성 대조 오탐 실측 #10), 비교 전용으로 통일한다.
export const normalizeWs = (s: unknown): string =>
  String(s ?? "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();

export function parseMdBlank(text: string): MdBlankQuestion {
  const before = text.split(/^오답:/m)[0] ?? text;
  const options = [...before.matchAll(/^([①②③④⑤])\s*(.+)$/gm)].map((m) => ({
    label: m[1],
    text: m[2].trim(),
  }));
  const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
  const answer = text.match(/^정답:\s*([①②③④⑤])/m)?.[1] ?? "";
  // 드리프트 관용: 모델이 오답 목록에 정답 줄("① (정답)")을 끼워 넣는 실측 —
  // 지시로 안 막혀서 파서가 걸러낸다.
  const wrong = [...wrongSection.matchAll(/^([①②③④⑤])\s*(.+)$/gm)]
    .map((m) => ({ label: m[1], text: m[2].trim() }))
    .filter((w) => w.label !== answer);
  return {
    kind: "blank",
    originalExpression: text.match(/^빈칸원문:\s*(.+)$/m)?.[1]?.trim() ?? "",
    options,
    answer,
    explanation:
      text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
      text.match(/^해설:\s*(.+)$/m)?.[1]?.trim() ??
      "",
    wrong,
  };
}

const INLINE_MARK_RE = /\[\[([A-E]):((?:(?!\]\]).)+)\]\]/g;

export function parseMdGrammar(text: string): MdGrammarQuestion {
  // v2(지문 복사 방식): "밑줄지문:" 섹션이 있으면 인라인 마커에서 마크를 얻는다.
  const markedSection = text.match(/^밑줄지문:\s*\n([\s\S]*?)(?=^원형·포인트:|^원형:)/m)?.[1];
  if (markedSection) {
    const markedPassage = markedSection.trim();
    const metaSection = text.match(/^원형·포인트:\s*\n([\s\S]*?)(?=^정답:)/m)?.[1] ?? "";
    // 관용 파싱: 코드에 괄호·한글 설명이 붙는 드리프트 실측("(c) 분사") 수용.
    const meta = new Map(
      [...metaSection.matchAll(
        /^\((A|B|C|D|E)\)\s*(.+?)\s*\|\s*\(?\s*([a-k])\s*\)?(?:\s+[^|]*)?$/gm,
      )].map((m) => [`(${m[1]})`, { original: m[2].trim(), code: m[3] }]),
    );
    const marks = [...markedPassage.matchAll(INLINE_MARK_RE)].map((m) => {
      const label = `(${m[1]})`;
      const info = meta.get(label);
      return {
        label,
        original: info?.original ?? "",
        shown: m[2].trim(),
        code: info?.code ?? "",
      };
    });
    const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
    const answer = text.match(/^정답:\s*(\([A-E]\))/m)?.[1] ?? "";
    return {
      kind: "grammar",
      marks,
      markedPassage,
      answer,
      fix: text.match(/^고침:\s*(.+)$/m)?.[1]?.trim() ?? "",
      explanation:
        text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
        text.match(/^해설:\s*(.+)$/m)?.[1]?.trim() ??
        "",
      wrong: [...wrongSection.matchAll(/^\(([A-E])\)\s*(.+)$/gm)]
        .map((m) => ({ label: `(${m[1]})`, text: m[2].trim() }))
        .filter((w) => w.label !== answer),
    };
  }
  const before = text.split(/^오답:/m)[0] ?? text;
  const marks = [...before.matchAll(
    /^\((A|B|C|D|E)\)\s*(.+?)\s*\|\s*(.+?)\s*\|\s*([a-k])\s*(?:\|\s*(.+?)\s*)?$/gm,
  )].map((m) => ({
    label: `(${m[1]})`,
    original: m[2].trim(),
    shown: m[3].trim(),
    code: m[4],
    ...(m[5] ? { anchor: m[5].trim() } : {}),
  }));
  const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
  const wrong = [...wrongSection.matchAll(/^\(([A-E])\)\s*(.+)$/gm)].map((m) => ({
    label: `(${m[1]})`,
    text: m[2].trim(),
  }));
  return {
    kind: "grammar",
    marks,
    answer: text.match(/^정답:\s*(\([A-E]\))/m)?.[1] ?? "",
    fix: text.match(/^고침:\s*(.+)$/m)?.[1]?.trim() ?? "",
    explanation:
      text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
      text.match(/^해설:\s*(.+)$/m)?.[1]?.trim() ??
      "",
    wrong,
  };
}

/** 0원 결정형 게이트 — 축자·형상 검사. 빈 배열이면 클린.
 * requireWrong=false 는 "정답 해설만" 모드(오답해설 요구 없음). */
export function gateMdQuestion(
  q: MdQuestion,
  passage: string,
  options?: { requireWrong?: boolean },
): string[] {
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];
  const pn = normalizeWs(passage);
  if (q.kind === "blank") {
    if (!q.originalExpression) v.push("빈칸원문 누락");
    else if (!pn.includes(normalizeWs(q.originalExpression)))
      v.push("빈칸원문이 지문에 축자로 없음");
    if (q.options.length !== 5) v.push(`선지 ${q.options.length}개 (5개 필요)`);
    if (!q.answer) v.push("정답 누락");
    if (!q.explanation) v.push("해설 누락");
    if (requireWrong && q.wrong.length !== 4)
      v.push(`오답해설 ${q.wrong.length}개 (4개 필요)`);
    if (q.answer && q.wrong.some((w) => w.label === q.answer))
      v.push("오답해설에 정답 라벨 포함");
  } else {
    if (q.marks.length !== 5) return [`밑줄 ${q.marks.length}개 (5개 필요)`];
    if (q.markedPassage) {
      // v2(지문 복사 방식): 마커를 원형으로 되돌린 재구성본이 소스 지문과
      // 일치해야 한다 — 위치·축자·무단편집을 한 번에 검사(PASSAGE_TAMPERED 등가).
      for (const m of q.marks) {
        if (!m.original) v.push(`${m.label} 원형 누락(원형·포인트 섹션 불일치)`);
        if (!m.code) v.push(`${m.label} 포인트코드 누락`);
      }
      let reconstructed = q.markedPassage;
      for (const m of q.marks) {
        reconstructed = reconstructed.replace(
          new RegExp(`\\[\\[${m.label[1]}:(?:(?!\\]\\]).)+\\]\\]`),
          () => m.original,
        );
      }
      if (normalizeWs(reconstructed) !== pn) {
        v.push("지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 원형이 틀림");
      }
    } else {
      for (const m of q.marks) {
        const matches = countWordBoundaryMatches(passage, m.original);
        if (matches === 0) {
          v.push(`${m.label} 원문표현이 지문에 축자로 없음(단어 경계 기준)`);
        } else if (matches > 1) {
          if (!m.anchor?.trim())
            v.push(`${m.label} '${m.original}' 위치 모호(${matches}회 등장) — 위치앵커 필요`);
          else if (!locateMark(passage, m.original, m.anchor, 0))
            v.push(`${m.label} 위치앵커로 자리를 확정하지 못함`);
        }
      }
    }
    const changed = q.marks.filter(
      (m) => normalizeWs(m.shown) !== normalizeWs(m.original),
    );
    if (changed.length !== 1) v.push(`변형 밑줄 ${changed.length}개 (정답 1개만 변형)`);
    else if (changed[0].label !== q.answer)
      v.push(`정답 라벨(${q.answer})과 변형 밑줄(${changed[0].label}) 불일치`);
    if (!q.fix) v.push("고침 누락");
    if (!q.explanation) v.push("해설 누락");
    if (requireWrong && q.wrong.length !== 4)
      v.push(`오답해설 ${q.wrong.length}개 (4개 필요)`);
  }
  return v;
}

// ── 마커 위치 확정 (단어 경계 + 위치앵커) ────────────────────────────────────
// 교훈(26-07-21 실사용): "is" 를 순차 indexOf 로 찾으면 art"is"ts 단어 내부에
// 마커가 박힌다. 표현 탐색은 반드시 단어 경계를 지키고, 다중 등장 표현은
// 앵커(직전 문맥)로 자리를 유일 확정해야 한다 — 프로덕션 surroundingText 등가.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryRegex(expr: string): RegExp {
  const body = escapeRegExp(expr.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, "g");
}

function countWordBoundaryMatches(passage: string, expr: string): number {
  if (!expr.trim()) return 0;
  return [...passage.matchAll(wordBoundaryRegex(expr))].length;
}

/** 앵커(있으면 그 직후에서) + 단어 경계로 표현 위치를 찾는다. 실패 시 null. */
export function locateMark(
  passage: string,
  original: string,
  anchor: string | undefined,
  fromIndex: number,
): { index: number; length: number } | null {
  if (!original.trim()) return null;
  if (anchor?.trim()) {
    const anchorRe = new RegExp(
      escapeRegExp(anchor.trim()).replace(/\s+/g, "\\s+"),
      "g",
    );
    const am = anchorRe.exec(passage);
    if (am) {
      const re = wordBoundaryRegex(original);
      re.lastIndex = am.index + am[0].length;
      const m = re.exec(passage);
      // 앵커 직후 80자 안에서만 인정 — 엉뚱한 원거리 매칭 방지.
      if (m && m.index - (am.index + am[0].length) <= 80) {
        return { index: m.index, length: m[0].length };
      }
    }
  }
  const re = wordBoundaryRegex(original);
  re.lastIndex = Math.max(0, fromIndex);
  let m = re.exec(passage);
  if (!m && fromIndex > 0) {
    re.lastIndex = 0;
    m = re.exec(passage);
  }
  return m ? { index: m.index, length: m[0].length } : null;
}

// ── 0원 자동 보정 (LLM 콜 없음) ──────────────────────────────────────────────
// 모델이 밑줄 표현을 지문과 미세하게 다르게 적는 최다 사례: 사이 단어 누락
// ("to justify" vs 원문 "to perhaps justify"). 앵커로 자리를 아는 상태에서, 그
// 근처의 실제 원문 구간으로 표현을 스냅한다. 재생성 콜 없이 코드로 복구.
function snapSpanNearAnchor(
  passage: string,
  m: MdGrammarMark,
): { original: string; shown: string } | null {
  if (!m.anchor?.trim()) return null;
  const anchorRe = new RegExp(
    escapeRegExp(m.anchor.trim()).replace(/\s+/g, "\\s+"),
  );
  const am = anchorRe.exec(passage);
  if (!am) return null;
  const winStart = am.index + am[0].length;
  const window = passage.slice(winStart, winStart + 140);
  const words = m.original.trim().split(/\s+/);
  if (words.length < 2) return null; // 단일 단어 실패는 형태 문제 — 보정 불가
  const firstRe = new RegExp(
    `(?<![A-Za-z])${escapeRegExp(words[0])}(?![A-Za-z])`,
  );
  const fm = firstRe.exec(window);
  if (!fm) return null;
  const rest = window.slice(fm.index);
  const lastRe = new RegExp(
    `(?<![A-Za-z])${escapeRegExp(words[words.length - 1])}(?![A-Za-z])`,
  );
  const lm = lastRe.exec(rest);
  if (!lm) return null;
  const span = rest.slice(0, lm.index + lm[0].length);
  // 폭주 방지: 스냅 구간이 원래 표현보다 3단어 이상 길면 포기.
  if (span.trim().split(/\s+/).length > words.length + 3) return null;
  // 원래 단어들이 스냅 구간에 순서대로 전부 있어야 한다.
  let cursor = 0;
  for (const w of words) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExp(w)}(?![A-Za-z])`, "g");
    re.lastIndex = cursor;
    const mm = re.exec(span);
    if (!mm) return null;
    cursor = mm.index + mm[0].length;
  }
  // 미끼(표시형=원문)면 그대로 스냅. 정답이면 오형 단어만 치환해 재구성.
  if (normalizeWs(m.shown) === normalizeWs(m.original)) {
    return { original: span, shown: span };
  }
  const shownWords = m.shown.trim().split(/\s+/);
  if (shownWords.length !== words.length) return null;
  let newShown = span;
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== shownWords[i]) {
      const re = new RegExp(
        `(?<![A-Za-z])${escapeRegExp(words[i])}(?![A-Za-z])`,
      );
      if (!re.test(newShown)) return null;
      newShown = newShown.replace(re, shownWords[i]);
    }
  }
  return { original: span, shown: newShown };
}

/** 어법 마커 자동 보정 — 축자 실패 마커를 앵커 근처 실제 원문 구간으로 스냅. */
export function autoSnapGrammarMarks(
  q: MdGrammarQuestion,
  passage: string,
): { question: MdGrammarQuestion; corrections: string[] } {
  // v2(지문 복사 방식): 위치 스냅은 불필요. 대신 결정형 교정 하나 —
  // 미끼(정답이 아닌 밑줄)는 정의상 표시형=원형이므로, 모델이 원형을 다르게
  // 적었으면(실측: 마커 "had" 에 원형 "had labeled") 표시형으로 맞춘다.
  if (q.markedPassage) {
    const corrections: string[] = [];
    const marks = q.marks.map((m) => {
      if (m.label !== q.answer && m.original && normalizeWs(m.original) !== normalizeWs(m.shown)) {
        corrections.push(`${m.label} 미끼 원형 교정: '${m.original}' → '${m.shown}'`);
        return { ...m, original: m.shown };
      }
      return m;
    });
    return {
      question: corrections.length > 0 ? { ...q, marks } : q,
      corrections,
    };
  }
  const corrections: string[] = [];
  const marks = q.marks.map((m) => {
    if (!m.original.trim()) return m;
    if (locateMark(passage, m.original, m.anchor, 0)) return m;
    const snapped = snapSpanNearAnchor(passage, m);
    if (!snapped) return m;
    corrections.push(
      `${m.label} 자동 보정: '${m.original}' → '${snapped.original}'`,
    );
    return { ...m, original: snapped.original, shown: snapped.shown };
  });
  return {
    question: corrections.length > 0 ? { ...q, marks } : q,
    corrections,
  };
}

const CIRCLED = ["①", "②", "③", "④", "⑤"] as const;

/** 어법 라벨 (A)~(E) → 시험지 표기 ①~⑤ */
export function circledForMarkIndex(index: number): string {
  return CIRCLED[index] ?? `(${index + 1})`;
}

export interface PassageSegment {
  type: "text" | "blank" | "mark";
  text: string;
  label?: string; // mark 일 때 ①~⑤
}

/**
 * 시험지 렌더용 지문 분해 — 빈칸: originalExpression 첫 등장을 빈칸으로.
 * 어법: 각 밑줄의 원문표현을 등장 순서대로 찾아 표시형(shown)으로 치환 + 라벨.
 * 축자 매칭 실패 시 found=false 로 알린다(게이트가 이미 잡는 케이스).
 */
export function segmentPassage(
  passage: string,
  q: MdQuestion,
): { segments: PassageSegment[]; unmatched: string[] } {
  const unmatched: string[] = [];
  if (q.kind === "blank") {
    const idx = q.originalExpression ? passage.indexOf(q.originalExpression) : -1;
    if (idx < 0) {
      if (q.originalExpression) unmatched.push(q.originalExpression);
      return { segments: [{ type: "text", text: passage }], unmatched };
    }
    return {
      segments: [
        { type: "text", text: passage.slice(0, idx) },
        { type: "blank", text: q.originalExpression },
        { type: "text", text: passage.slice(idx + q.originalExpression.length) },
      ],
      unmatched,
    };
  }
  const segments: PassageSegment[] = [];
  // v2(지문 복사 방식): 마커 위치가 밑줄지문 안에 이미 확정돼 있다 — 그대로 분해.
  // 표시형은 편집 반영을 위해 현재 marks 값에서 라벨로 읽는다.
  if (q.markedPassage) {
    const markByLabel = new Map(q.marks.map((m) => [m.label, m]));
    let cursor = 0;
    for (const m of [...q.markedPassage.matchAll(INLINE_MARK_RE)]) {
      const label = `(${m[1]})`;
      const idx = q.marks.findIndex((x) => x.label === label);
      segments.push({ type: "text", text: q.markedPassage.slice(cursor, m.index) });
      segments.push({
        type: "mark",
        text: markByLabel.get(label)?.shown ?? m[2],
        label: circledForMarkIndex(idx >= 0 ? idx : 0),
      });
      cursor = (m.index ?? 0) + m[0].length;
    }
    segments.push({ type: "text", text: q.markedPassage.slice(cursor) });
    return { segments, unmatched };
  }
  let cursor = 0;
  q.marks.forEach((m, i) => {
    const found = locateMark(passage, m.original, m.anchor, cursor);
    if (!found) {
      unmatched.push(`${m.label} ${m.original}`);
      return;
    }
    if (found.index >= cursor) {
      segments.push({ type: "text", text: passage.slice(cursor, found.index) });
      segments.push({ type: "mark", text: m.shown, label: circledForMarkIndex(i) });
      cursor = found.index + found.length;
    } else {
      // 앵커가 앞쪽 위치를 가리키는 역순 케이스 — 렌더 순서가 깨지므로 미배치로 보고.
      unmatched.push(`${m.label} ${m.original} (순서 역행)`);
    }
  });
  segments.push({ type: "text", text: passage.slice(cursor) });
  return { segments, unmatched };
}
