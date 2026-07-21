// ============================================================================
// 학습지 스터디 모드 — 채점 순수함수 정본 (플레인 모듈, 클라 공유)
// docs/worksheet-study-spec.md §5. Math.random·Date.now·API 호출 금지.
// ============================================================================

import type { StudyItemEvent, StudyWeakness } from "./types";

// ── 영어 정규화 ─────────────────────────────────────────────────────────────

/**
 * 채점용 영어 정규화 — 소문자화 → 스마트따옴표/대시 통일 → 구두점 제거
 * (하이픈·아포스트로피는 단어 일부라 유지) → 공백 축약.
 */
export function normalizeEn(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[.,!?;:"()[\]{}<>…]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const splitWords = (s: string): string[] => s.split(/\s+/).filter(Boolean);

// ── 워드 디프 (타이핑 피드백) ────────────────────────────────────────────────

export type WordDiff = { word: string; state: "same" | "missing" | "extra" | "typo" };

/** 단어 편집거리 ≤1 인지 (typo 판정) — 길이차 ≤1 조기 컷. */
function isNearWord(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  // 한 글자 치환/삽입/삭제 허용 검사
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la === lb) {
      i++;
      j++;
    } else if (la > lb) {
      i++;
    } else {
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/**
 * 정답 단어열 기준 LCS 디프 — 정답에 있는데 빠진 단어(missing), 학생이 더 쓴
 * 단어(extra), 편집거리 1 이내로 빗나간 단어(typo)를 정답 순서대로 표시한다.
 */
export function diffWords(input: string, answer: string): WordDiff[] {
  const a = splitWords(normalizeEn(answer));
  const b = splitWords(normalizeEn(input));
  const n = a.length;
  const m = b.length;
  // LCS 테이블 (typo 는 매치로 취급해 정렬을 살린다)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = isNearWord(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: WordDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (isNearWord(a[i], b[j])) {
      out.push({ word: a[i], state: a[i] === b[j] ? "same" : "typo" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ word: a[i], state: "missing" });
      i++;
    } else {
      out.push({ word: b[j], state: "extra" });
      j++;
    }
  }
  while (i < n) out.push({ word: a[i++], state: "missing" });
  while (j < m) out.push({ word: b[j++], state: "extra" });
  return out;
}

/** 타이핑 판정 — 정답 = 정규화 완전 일치. nearMiss = typo 만 있고 missing/extra 없음. */
export function gradeTyped(
  input: string,
  answer: string,
): { correct: boolean; nearMiss: boolean; diff: WordDiff[] } {
  const correct = normalizeEn(input) === normalizeEn(answer) && normalizeEn(input).length > 0;
  const diff = correct ? [] : diffWords(input, answer);
  const nearMiss =
    !correct && diff.length > 0 && diff.every((d) => d.state === "same" || d.state === "typo");
  return { correct, nearMiss, diff };
}

/** 어순 배열 판정 — 선택 타일 나열이 정답 문장과 정규화 일치. */
export function gradeOrder(picked: string[], answer: string): boolean {
  return normalizeEn(picked.join(" ")) === normalizeEn(answer);
}

/** 빈칸 판정 — 슬롯별 정규화 일치 배열. */
export function gradeCloze(inputs: string[], answerKey: string[]): boolean[] {
  return answerKey.map((ans, i) => normalizeEn(inputs[i] ?? "") === normalizeEn(ans));
}

/** 자기채점 점수 — O=1, △(D)=0.5, X=0. */
export function selfGradeScore(g: "O" | "D" | "X"): number {
  return g === "O" ? 1 : g === "D" ? 0.5 : 0;
}

// ── 스테이지 점수·취약점 롤업 ────────────────────────────────────────────────

/** 이벤트의 획득 점수(0~1) — 채점형은 correct, 자기채점형은 selfGradeScore. */
export function eventScore(e: Pick<StudyItemEvent, "correct" | "selfGrade">): number | null {
  if (typeof e.correct === "boolean") return e.correct ? 1 : 0;
  if (e.selfGrade) return selfGradeScore(e.selfGrade);
  return null;
}

/** 취약점 집계에서 "정답"으로 칠지 — 자기채점 △/X 는 오답으로 센다 (spec §5). */
function eventCountsCorrect(e: Pick<StudyItemEvent, "correct" | "selfGrade">): boolean | null {
  if (typeof e.correct === "boolean") return e.correct;
  if (e.selfGrade) return e.selfGrade === "O";
  return null;
}

export function emptyWeakness(): StudyWeakness {
  return { skills: {}, sentences: {}, words: [], grammar: {} };
}

/**
 * 취약점 증분 누적 — 첫 시도(attempt=1) 이벤트만 반영. 입력 weakness 를 변형하지
 * 않고 새 객체를 반환한다(서버 플러시마다 호출).
 */
export function accumulateWeakness(
  base: StudyWeakness | null | undefined,
  events: StudyItemEvent[],
): StudyWeakness {
  const w: StudyWeakness = base
    ? {
        skills: { ...base.skills },
        sentences: { ...base.sentences },
        words: base.words.map((x) => ({ ...x })),
        grammar: { ...base.grammar },
      }
    : emptyWeakness();
  const wordMap = new Map(w.words.map((x) => [x.word, x]));

  for (const e of events) {
    if (e.attempt !== 1) continue;
    const ok = eventCountsCorrect(e);
    if (ok === null) continue;

    const skill = w.skills[e.skill] ?? { correct: 0, total: 0 };
    skill.total += 1;
    if (ok) skill.correct += 1;
    w.skills[e.skill] = skill;

    if (typeof e.sentenceNo === "number" && e.sentenceNo > 0) {
      const key = String(e.sentenceNo);
      const s = w.sentences[key] ?? { correct: 0, total: 0 };
      s.total += 1;
      if (ok) s.correct += 1;
      w.sentences[key] = s;
    }

    if (e.wordKey) {
      const entry = wordMap.get(e.wordKey) ?? { word: e.wordKey, wrong: 0, total: 0 };
      entry.total += 1;
      if (!ok) entry.wrong += 1;
      if (!wordMap.has(e.wordKey)) wordMap.set(e.wordKey, entry);
    }

    if (e.grammarCode) {
      const g = w.grammar[e.grammarCode] ?? { correct: 0, total: 0 };
      g.total += 1;
      if (ok) g.correct += 1;
      w.grammar[e.grammarCode] = g;
    }
  }

  w.words = [...wordMap.values()].filter((x) => x.wrong > 0).sort((a, b) => b.wrong - a.wrong);
  return w;
}

/**
 * 종합 숙달도 — 완료된 채점 스테이지의 첫시도 정답률을 아이템 수로 가중 평균.
 * 완료된 채점 스테이지가 없으면 null.
 */
export function computeMasteryPct(
  stages: Partial<Record<string, { status?: string; firstCorrect?: number; firstTotal?: number }>>,
): number | null {
  let correct = 0;
  let total = 0;
  for (const s of Object.values(stages)) {
    if (!s || s.status !== "done") continue;
    if (typeof s.firstCorrect !== "number" || typeof s.firstTotal !== "number") continue;
    correct += s.firstCorrect;
    total += s.firstTotal;
  }
  if (total === 0) return null;
  return Math.round((correct / total) * 100);
}
