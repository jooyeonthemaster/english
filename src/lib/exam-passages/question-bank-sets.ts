import "server-only";

// 기출 문항 은행 — **장문 세트**(41-42 · 43-45) 서버 전용 로더(§12.2).
// 정본 데이터: src/data/exam-passages/question-sets.json (scripts/gichul-bank/assemble-sets.mjs 산출).
// 멤버 항목 자체는 questions.json 에 그대로 있고 `setKey` 로 이 세트와 연결된다(중복 적재 금지).
// 클라이언트 컴포넌트는 이 파일을 import 하지 말 것(브라우저는 /api/exam-passages/questions 의 `sets` 를 쓴다).
// 설계는 ./question-bank.ts 와 같다 — 모듈 스코프 1회 적재 + Map 인덱스.

import setsJson from "@/data/exam-passages/question-sets.json";
import type { ExamBankSet } from "./question-bank-types";

// 방어적 필터 — 조립 미완/파싱 실패분(키·표시 베이스·멤버 결손)은 부팅에서 걸러 라우트 500 을 막는다
// (questions.json 의 null 선지 1건이 라우트 전체를 죽였던 26-09-07 실측과 같은 방어).
const ALL_SETS: ExamBankSet[] = (setsJson as unknown as ExamBankSet[]).filter(
  (s) =>
    s &&
    typeof s.key === "string" &&
    s.key.length > 0 &&
    typeof s.displayedPassage === "string" &&
    s.displayedPassage.trim().length > 0 &&
    Array.isArray(s.memberIds) &&
    s.memberIds.length > 0 &&
    Array.isArray(s.qNums) &&
    s.qNums.length > 0 &&
    !!s.layout &&
    typeof s.layout.fullPassage === "string",
);

const BY_KEY = new Map<string, ExamBankSet>(ALL_SETS.map((s) => [s.key, s]));

/** 세트 전체(정본 정렬 그대로) — 렌더 전수 검증 하네스·게이트용. */
export function getAllExamBankSets(): readonly ExamBankSet[] {
  return ALL_SETS;
}

/** 세트 1건. 없으면 null. */
export function getExamBankSet(key: string): ExamBankSet | null {
  return BY_KEY.get(key) ?? null;
}

/** 세트 여러 건 — 입력 순서 유지, 없는 키는 조용히 건너뛴다(중복 키는 1회만). */
export function getExamBankSetsByKeys(keys: readonly string[]): ExamBankSet[] {
  const seen = new Set<string>();
  const out: ExamBankSet[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const set = BY_KEY.get(key);
    if (set) out.push(set);
  }
  return out;
}

/** 멤버 bankId → 그 멤버가 속한 세트. 목록 응답의 `sets` 조립용(§12.2). */
const BY_MEMBER_ID = new Map<string, ExamBankSet>();
for (const set of ALL_SETS) {
  for (const memberId of set.memberIds) BY_MEMBER_ID.set(memberId, set);
}

export function getExamBankSetForMember(memberId: string): ExamBankSet | null {
  return BY_MEMBER_ID.get(memberId) ?? null;
}
