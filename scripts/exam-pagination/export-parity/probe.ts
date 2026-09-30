// ============================================================================
// export-parity / probe — 문항별 「지문 탐침(sentinel)」 주입·검출 (순수, DB·렌더러 무의존)
//
// 왜 탐침인가: 내보내기(HWPX IR·DOCX 문서 객체)에서 「지문 박스가 몇 번, 어느 문항 앞/안에 찍혔는지」를
// 글자 비교로 재면 내장형 문항(빈칸·순서·삽입 — 발문에 지문 전문이 들어 있다)과 구분이 안 된다.
// 그래서 **입력 데이터의 지문 본문 끝에만** 문항 고유 토큰을 붙인다. 발문(questionText)에는 붙이지 않으므로
// 출력에서 토큰이 보이면 그것은 「지문 필드에서 온 지문 박스」다.
//
// 판정 불변 조건(passage-policy 실측): 지문 본문은 판정에 「비어 있는지(trim)」로만 쓰인다
// (shouldForceSourcePassage·resolvePrintablePassage·questionHasEmbeddedPassage 는 발문·structuredData 로 판정).
// 비어 있는 지문에는 토큰을 붙이지 않으므로 모든 판정이 바뀌지 않는다. 끝에 붙이므로 세트 span·KO 마커의
// 앞쪽 오프셋도 그대로다. 토큰은 소문자 영문뿐이라 서식 파서(**·__·원문자 변환)에 걸리지 않는다.
// ============================================================================

export const SENTINEL_PREFIX = "qzxv";
const SENTINEL_RE = /qzxv([a-z]{4})/g;

/** 0 → "aaaa", 1 → "aaab" … (4자리 26진, 문항 456,976개까지). */
export function sentinelToken(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 26 ** 4) {
    throw new Error(`sentinel index out of range: ${index}`);
  }
  let n = index;
  let code = "";
  for (let i = 0; i < 4; i++) {
    code = String.fromCharCode(97 + (n % 26)) + code;
    n = Math.floor(n / 26);
  }
  return `${SENTINEL_PREFIX}${code}`;
}

/** 비어 있지 않은 지문 끝(뒤쪽 공백 앞)에 토큰을 붙인다. 빈 문자열·공백뿐이면 그대로 돌려준다. */
export function appendSentinel(content: unknown, token: string): unknown {
  if (typeof content !== "string" || !content.trim()) return content;
  return content.replace(/\s*$/, (tail) => ` ${token}${tail}`);
}

/** 텍스트 안의 탐침 토큰 전부(등장 순서). */
export function findSentinels(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SENTINEL_RE)) out.push(m[0]);
  return out;
}

/** 탐침을 지운 텍스트(비교·보고용). */
export function stripSentinels(text: string): string {
  return text.replace(/\s?qzxv[a-z]{4}/g, "");
}

type Loose = Record<string, unknown>;

function isPlainObject(v: unknown): v is Loose {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** structuredData._sourcePassage.content 에 토큰(객체·JSON 문자열 둘 다). 입력은 바꾸지 않는다. */
export function sentinelizeStructuredData(structuredData: unknown, token: string): unknown {
  const patch = (obj: Loose): Loose | null => {
    const sp = obj._sourcePassage;
    if (!isPlainObject(sp) || typeof sp.content !== "string" || !sp.content.trim()) return null;
    return { ...obj, _sourcePassage: { ...sp, content: appendSentinel(sp.content, token) } };
  };
  if (isPlainObject(structuredData)) return patch(structuredData) ?? structuredData;
  if (typeof structuredData === "string" && structuredData.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(structuredData);
      if (isPlainObject(parsed)) {
        const next = patch(parsed);
        return next ? JSON.stringify(next) : structuredData;
      }
    } catch {
      return structuredData;
    }
  }
  return structuredData;
}

/** 탐침 주입 대상 — 서버 Prisma include 모양(웹 getExam·HWPX/DOCX 라우트 공통의 최소형). */
export type ProbeExamQuestion = {
  orderNum: number;
  points: number;
  question: {
    id: string;
    structuredData?: unknown;
    passage: ({ content: string } & Loose) | null;
  } & Loose;
} & Loose;

export type ProbeResult<Q extends ProbeExamQuestion> = {
  examQuestions: Q[];
  /** 저장 설정(JSON 문자열 그대로 · 없으면 null). 스냅숏 passageContent 에 같은 토큰을 붙였다. */
  settingsRaw: string | null;
  /** 토큰 → 문항 id */
  ownerByToken: Map<string, string>;
  /** 문항 id → 토큰 */
  tokenByQuestion: Map<string, string>;
  /** 토큰을 실제로 붙인 자리 수(지문 DB·스냅숏·보관본) — 진단용 */
  injected: { db: number; snapshot: number; detached: number };
};

function sentinelizeSavedList(list: unknown, tokenByQuestion: Map<string, string>, counter: { n: number }) {
  if (!Array.isArray(list)) return list;
  return list.map((entry) => {
    if (!isPlainObject(entry) || typeof entry.questionId !== "string") return entry;
    const token = tokenByQuestion.get(entry.questionId);
    if (!token || typeof entry.passageContent !== "string" || !entry.passageContent.trim()) return entry;
    counter.n += 1;
    return { ...entry, passageContent: appendSentinel(entry.passageContent, token) };
  });
}

/**
 * 시험 문항·저장 설정에 문항별 탐침을 심은 **사본**을 만든다(원본 불변).
 * 같은 문항이 설정의 items·blocks 에 모두 있으면 둘 다 같은 토큰을 받는다.
 */
export function injectPassageSentinels<Q extends ProbeExamQuestion>(
  examQuestions: readonly Q[],
  settingsRaw: string | null,
): ProbeResult<Q> {
  const ownerByToken = new Map<string, string>();
  const tokenByQuestion = new Map<string, string>();
  const injected = { db: 0, snapshot: 0, detached: 0 };
  examQuestions.forEach((eq) => {
    if (tokenByQuestion.has(eq.question.id)) return;
    const token = sentinelToken(tokenByQuestion.size);
    tokenByQuestion.set(eq.question.id, token);
    ownerByToken.set(token, eq.question.id);
  });

  const nextQuestions = examQuestions.map((eq) => {
    const token = tokenByQuestion.get(eq.question.id) as string;
    const passage = eq.question.passage;
    let nextPassage = passage;
    if (passage && typeof passage.content === "string" && passage.content.trim()) {
      nextPassage = { ...passage, content: appendSentinel(passage.content, token) as string };
      injected.db += 1;
    }
    const nextSd = sentinelizeStructuredData(eq.question.structuredData, token);
    if (nextSd !== eq.question.structuredData) injected.detached += 1;
    return {
      ...eq,
      question: { ...eq.question, passage: nextPassage, structuredData: nextSd },
    } as Q;
  });

  let nextSettings = settingsRaw;
  if (typeof settingsRaw === "string" && settingsRaw.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(settingsRaw);
      if (isPlainObject(parsed)) {
        const counter = { n: 0 };
        const next = {
          ...parsed,
          items: sentinelizeSavedList(parsed.items, tokenByQuestion, counter),
          blocks: sentinelizeSavedList(parsed.blocks, tokenByQuestion, counter),
        };
        if (!("items" in parsed)) delete (next as Loose).items;
        if (!("blocks" in parsed)) delete (next as Loose).blocks;
        injected.snapshot = counter.n;
        nextSettings = JSON.stringify(next);
      }
    } catch {
      nextSettings = settingsRaw;
    }
  }

  return { examQuestions: nextQuestions, settingsRaw: nextSettings, ownerByToken, tokenByQuestion, injected };
}
