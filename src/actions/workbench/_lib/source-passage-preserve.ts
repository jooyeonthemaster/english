// ============================================================================
// 문항 편집 경로의 structuredData._sourcePassage 보존 — 순수 함수(prisma·서버 의존 0).
//
// 왜 있나(26-09-30, Wave 1 리뷰 PI-R3): 지문을 지우면 연결 문항마다 원문을
// structuredData._sourcePassage = { passageId, title, content, detachedAt } 로 떼어 보관한다
// (passage-delete-guard.ts mergeSourcePassageSnapshot). 그런데 문항 편집 경로
// (questions.ts updateWorkbenchQuestion 의 명시 structuredData·발문 자유 편집 분기,
// question-ai-edit.ts 적용·「새 문항으로 저장」)가 structuredData 를 통째로 다시 만들면서
// 이 키를 버렸다 — 보관한 원문이 편집 한 번에 사라진다.
//
// 규칙: _sourcePassage 는 서버가 관리하는 키다.
//   · 이전 값(DB)이 있으면 새 structuredData 에 그 값을 그대로 이어 붙인다(클라이언트가 보낸 값은 무시).
//   · 이전 값이 없으면 클라이언트가 보낸 _sourcePassage 는 떼어 낸다(위조 방지).
//   · 저장 형태는 유지한다 — 객체면 객체, JSON 객체 문자열이면 문자열 안의 객체에 넣고 다시 문자열.
//   · next 가 undefined/null 이면 그대로 돌려준다(Prisma 가 필드를 건드리지 않으므로 DB 값이 남는다).
//   · 배열·숫자 등 객체가 아닌 값은 키를 넣을 자리가 없어 그대로 돌려준다(삭제 가드의 unsupported 와 같은 부류).
// 입력은 변형하지 않는다.
// ============================================================================

export const SOURCE_PASSAGE_KEY = "_sourcePassage";

type Rec = Record<string, unknown>;

function isPlainRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 객체 그대로, 또는 JSON 객체 문자열을 파싱한 객체. 둘 다 아니면 null. */
function readStructuredRecord(value: unknown): Rec | null {
  if (isPlainRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** structuredData(객체 · JSON 객체 문자열)에 들어 있는 _sourcePassage 객체. 없으면 null. */
export function readSourcePassageSnapshot(structuredData: unknown): Rec | null {
  const rec = readStructuredRecord(structuredData);
  if (!rec) return null;
  const snapshot = rec[SOURCE_PASSAGE_KEY];
  return isPlainRecord(snapshot) ? snapshot : null;
}

function withSnapshot(rec: Rec, snapshot: Rec | null): Rec {
  const { [SOURCE_PASSAGE_KEY]: _dropped, ...rest } = rec;
  void _dropped;
  return snapshot ? { ...rest, [SOURCE_PASSAGE_KEY]: snapshot } : rest;
}

/**
 * 편집으로 새로 만든 structuredData(next)에 이전 structuredData(previous)의 _sourcePassage 를 잇는다.
 * 반환값의 형태는 next 와 같다(객체 → 새 객체, JSON 객체 문자열 → 새 문자열, 그 밖 → next 그대로).
 */
export function preserveSourcePassage<T>(next: T, previous: unknown): T {
  if (next === undefined || next === null) return next;
  const snapshot = readSourcePassageSnapshot(previous);
  if (isPlainRecord(next)) {
    if (!snapshot && !(SOURCE_PASSAGE_KEY in next)) return next;
    return withSnapshot(next, snapshot) as T;
  }
  if (typeof next === "string") {
    const rec = readStructuredRecord(next);
    if (!rec) return next;
    if (!snapshot && !(SOURCE_PASSAGE_KEY in rec)) return next;
    return JSON.stringify(withSnapshot(rec, snapshot)) as T;
  }
  return next;
}
