import type { CollectionItem } from "./types";

export interface ResolvedFolderCount {
  /** 배지 헤드라인 숫자. 하위 폴더가 있으면 카드 장수(중복 포함), 없으면 직속. */
  display: number;
  /** 이 폴더에 직접 들어있는 아이템 수(하위 폴더 제외). */
  direct: number;
  /** 하위 폴더까지 합친 고유 아이템 수(중복 제거). */
  distinct: number;
  /** 중복 배치 건수(display - distinct). 같은 문제를 복사해 여러 폴더에 둔 수. */
  duplicates: number;
  /** display가 하위 폴더까지 합산한 누적 수치인지 여부. */
  includesSubfolders: boolean;
  /** 배지 보조 라벨: 중복이 있으면 "중복 N", 아니면 하위 폴더가 있을 때 "하위 포함". */
  note: string | null;
  /** note 강조 색 구분용(중복=경고/노랑, 하위 포함=파랑). */
  noteTone: "duplicate" | "subfolder" | null;
  /** title 속성에 넣을 직속/누적/중복 내역 설명. */
  tooltip: string;
}

/**
 * 폴더 배지에 무엇을 보여줄지 한곳에서 결정한다. chip·card·list-row가 동일한
 * 규칙(카드 장수 헤드라인 + "중복 N" 고지)을 쓰도록 공유한다.
 *
 * 헤드라인은 사용자가 폴더 트리를 훑을 때 실제로 마주치는 "카드 장수"(중복 포함)다.
 * 같은 문제를 복사해 하위 폴더에 둔 경우 그 차이를 "중복 N"으로 고지해, 카드 수와
 * 고유 문제 수의 간극을 설명한다.
 *
 * 누적값은 하위 폴더가 실제로 있을 때만 의미가 있으므로, 자식이 없는 폴더는 항상
 * 직속 수치를 그대로 쓴다(고지도 불필요).
 */
export function resolveFolderCount(
  collection: CollectionItem,
  unit = "개",
): ResolvedFolderCount {
  const direct = collection._count.items;
  const hasSubfolders = (collection._count.children ?? 0) > 0;
  const includesSubfolders =
    hasSubfolders && typeof collection.totalItems === "number";

  if (!includesSubfolders) {
    return {
      display: direct,
      direct,
      distinct: direct,
      duplicates: 0,
      includesSubfolders: false,
      note: null,
      noteTone: null,
      tooltip: `${direct}${unit}`,
    };
  }

  const display = collection.totalItems as number;
  const duplicates = collection.duplicateCount ?? 0;
  const distinct = display - duplicates;
  const note =
    duplicates > 0 ? `중복 ${duplicates}` : "하위 포함";
  const noteTone = duplicates > 0 ? "duplicate" : "subfolder";
  const tooltip =
    duplicates > 0
      ? `하위 폴더 포함 카드 ${display}${unit} · 이 폴더에 직접 ${direct}${unit} · 고유 ${distinct}${unit}(복사된 중복 ${duplicates}건)`
      : `하위 폴더 포함 ${display}${unit} · 이 폴더에 직접 ${direct}${unit}`;

  return {
    display,
    direct,
    distinct,
    duplicates,
    includesSubfolders: true,
    note,
    noteTone,
    tooltip,
  };
}
