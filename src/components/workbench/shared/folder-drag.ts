import type { DragItemType } from "./types";

/**
 * 폴더 드롭 시 "복사 단축키"가 눌렸는지 판정한다. OS의 복사-드래그 관례를 따른다:
 * macOS는 Option(Alt), Windows/Linux는 Ctrl. 둘 중 하나라도 눌렀으면 복사로 본다.
 * 누르지 않았으면 false → 호출부는 평소대로 복사/이동 팝오버를 띄운다.
 *
 * input은 pragmatic-drag-and-drop의 `location.current.input`(드롭 시점 좌표·수정자키).
 */
export function isCopyDragModifier(
  input?: { altKey?: boolean; ctrlKey?: boolean } | null,
): boolean {
  return !!(input?.altKey || input?.ctrlKey);
}

/**
 * 폴더가 이 드래그를 받을 수 있는지. 평소엔 `source.data.type === dragItemType`
 * 한 가지지만, 드래프트(자료)는 단일(`draft`)·다중(`draft-bulk`) 두 페이로드를
 * 쓰므로 dragItemType이 "draft"일 땐 "draft-bulk"도 허용한다.
 */
export function folderDropCanDrop(
  dragItemType: DragItemType,
  sourceType: unknown,
): boolean {
  if (sourceType === dragItemType) return true;
  if (dragItemType === "draft" && sourceType === "draft-bulk") return true;
  return false;
}

/**
 * 드롭된 드래그 페이로드에서 대상 아이템 id(들)를 꺼낸다. 다중(`draft-bulk`)이면
 * 배열(`draftIds`), 그 외엔 단일 키(`dragItemIdKey`) 값. 반환을 그대로 hook의
 * handleDragToFolder(string | string[])에 넘길 수 있다.
 */
export function folderDropItemId(
  data: Record<string, unknown>,
  dragItemIdKey: string,
): string | string[] {
  // 지문 세트 카드 드래그: 멤버 questionId 배열(questionIds)을 통째로 넘겨
  // 세트 전체가 함께 이동/복사된다(일반 단일 드래그는 questionIds가 [자기 id]라 동작 동일).
  const qids = data.questionIds;
  if (Array.isArray(qids) && qids.length > 0) return qids as string[];
  if (data.type === "draft-bulk" && Array.isArray(data.draftIds)) {
    return data.draftIds as string[];
  }
  return data[dragItemIdKey] as string;
}
