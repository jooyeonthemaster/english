// 클라이언트 문항 레지스트리 — 「체크 즉시 조판」(docs/gichul-question-bank-spec.md §11.13).
//
// 기출 은행 항목은 체크 순간 DB 행이 없다. 반입(서버 액션, 직렬 큐 1.5~3초)이 끝나기를 기다리지
// 않고 시험지에 바로 그리려면, 조판기가 서버 대신 **여기서** 문항을 찾을 수 있어야 한다.
//
// 흐름
//   1) 호스트가 은행 항목을 BuilderQuestion 으로 조립해 임시 id(`bank:<bankId>`)로 등록한다.
//   2) 임시 id 를 조판 픽(flatPicked)에 넣는다 → 조판기의 resolveQuestionsForPaperInsertion 이
//      서버 fetch 전에 이 레지스트리를 먼저 본다 → 즉시 삽입.
//   3) 반입이 착지하면 호스트가 alias(임시 → 실제 Question.id)를 등록하고 픽의 키를 바꾼다.
//      조판기의 동기화 effect 는 alias 를 보고 「제거+추가」가 아니라 **제자리 개명**으로 처리한다
//      (순서·편집 보존, 서버 재조회 0).
//
// 모듈 스코프 Map 인 이유: 조판기는 페이지당 1인스턴스이고, 호스트(library-pane)와 조판기 사이에
// props 를 두 층(studio-home-client → ExamComposeSurface) 뚫지 않기 위해서다. 키는 접두 `bank:` 로
// 유일하고, alias 는 소비(take)되며 등록은 개명 뒤 지워진다 — 누수 없음.
//
// ⚠ 임시 id 를 가진 항목은 저장 불가(서버가 소유 검증) — 조판기 saveDraft 가 막고, IndexedDB 초안
//   저장에서도 뺀다(세션을 넘는 유령 항목 방지). 인쇄·미리보기는 임시 id 로도 된다.

import type { BuilderQuestion } from "./types";

export const CLIENT_QUESTION_ID_PREFIX = "bank:";

const questions = new Map<string, BuilderQuestion>();
/** 임시 id → 실제 Question.id (반입 착지 시 호스트가 등록, 조판기가 개명하며 소비) */
const aliases = new Map<string, string>();

export function isClientQuestionId(id: string): boolean {
  return id.startsWith(CLIENT_QUESTION_ID_PREFIX);
}

export function clientQuestionIdFor(bankId: string): string {
  return `${CLIENT_QUESTION_ID_PREFIX}${bankId}`;
}

export function registerClientQuestion(id: string, question: BuilderQuestion): void {
  questions.set(id, question);
}

export function getClientQuestion(id: string): BuilderQuestion | undefined {
  return questions.get(id);
}

export function unregisterClientQuestion(id: string): void {
  questions.delete(id);
  aliases.delete(id);
}

/** 반입 착지 — 임시 id 가 실제 id 로 바뀐다. 조판기가 개명할 때 takeQuestionIdAlias 로 소비한다. */
export function registerQuestionIdAlias(tempId: string, realId: string): void {
  aliases.set(tempId, realId);
}

export function peekQuestionIdAlias(tempId: string): string | undefined {
  return aliases.get(tempId);
}

/** alias 를 읽고 지운다(개명 1회). 등록된 임시 문항도 함께 정리한다. */
export function takeQuestionIdAlias(tempId: string): string | undefined {
  const real = aliases.get(tempId);
  if (real !== undefined) {
    aliases.delete(tempId);
    questions.delete(tempId);
  }
  return real;
}
