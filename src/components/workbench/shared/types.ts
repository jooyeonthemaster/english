export interface CollectionItem {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  createdAt?: string | Date | null;
  _count: { items: number; children: number };
  /**
   * 하위 폴더까지 합친 카드 장수(중복 포함). useFolderManager가 cumulativeCounts
   * 옵션일 때만 채워진다. 없으면 _count.items(직속)만 사용.
   */
  totalItems?: number;
  /**
   * 하위 폴더 누적에서 같은 아이템이 여러 폴더에 복사돼 생긴 중복 배치 건수
   * (totalItems - 고유수). cumulativeCounts일 때만 채워진다.
   */
  duplicateCount?: number;
}

export type DragItemType = "question" | "passage" | "exam" | "draft";

export interface PaginationData {
  page: number;
  totalPages: number;
  total: number;
}
