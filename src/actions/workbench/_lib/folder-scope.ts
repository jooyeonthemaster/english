// ============================================================================
// 폴더(지문·문제·추출 초안 컬렉션) 액션의 입력 정리 — 순수 함수(prisma·서버 의존 0).
//
// 서버 액션 인자는 신뢰할 수 없는 입력이다(IDOR 수리 26-09-30). 두 가지를 막는다.
//   1) 대량 할당: update 가 클라이언트 객체를 그대로 data 로 넘기면 academyId·parentId·subject 를
//      실어 보내 폴더를 남의 학원으로 옮기거나 남의 폴더 아래로 붙일 수 있다 → 허용 필드만 통과.
//   2) id 목록 오염: 문자열이 아닌 값·중복 → 문자열만, 중복 제거.
// 학원 범위 자체는 각 액션이 세션 academyId 로 where 에 건다(이 모듈은 DB 를 모른다).
// collections-webtoon.ts 의 허용 필드 패턴과 같은 규약이다.
// ============================================================================

export interface FolderPatch {
  name?: string;
  description?: string | null;
  color?: string | null;
}

/** 폴더 수정 입력에서 이름·설명·색만 남긴다. 그 밖의 키(academyId·parentId·subject·id …)는 버린다. */
export function pickFolderPatch(data: unknown): FolderPatch {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  const d = data as Record<string, unknown>;
  const patch: FolderPatch = {};
  if (typeof d.name === "string") patch.name = d.name;
  if (typeof d.description === "string" || d.description === null) {
    patch.description = d.description as string | null;
  }
  if (typeof d.color === "string" || d.color === null) patch.color = d.color as string | null;
  return patch;
}

/** 문자열 id 만, 빈 값·중복 제거. 순서는 처음 나온 순서를 따른다(상한은 두지 않는다 — 전체 선택 무회귀). */
export function sanitizeIdList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
