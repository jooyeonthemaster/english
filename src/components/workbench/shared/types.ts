export interface CollectionItem {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  _count: { items: number; children: number };
}

export type DragItemType = "question" | "passage" | "exam";

export interface CollectionActions {
  create: (data: { name: string; parentId?: string }) => Promise<{ success: boolean; id?: string; error?: string }>;
  update: (id: string, data: { name?: string; description?: string }) => Promise<{ success: boolean; error?: string }>;
  delete: (id: string) => Promise<{ success: boolean; error?: string }>;
  addItems: (collectionId: string, itemIds: string[]) => Promise<{ success: boolean; error?: string }>;
  removeItems: (collectionId: string, itemIds: string[]) => Promise<{ success: boolean; error?: string }>;
}

export interface PaginationData {
  page: number;
  totalPages: number;
  total: number;
}
