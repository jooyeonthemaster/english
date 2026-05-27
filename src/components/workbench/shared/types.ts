export interface CollectionItem {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  createdAt?: string | Date | null;
  _count: { items: number; children: number };
}

export type DragItemType = "question" | "passage" | "exam";

export interface PaginationData {
  page: number;
  totalPages: number;
  total: number;
}
