import type { CollectionItem } from "@/components/workbench/shared/types";

export type WorkPanel = "jobs" | null;
export type InputMode = "file" | "text";
export type FileSourceType = "PDF" | "IMAGES";

export interface Props {
  academyId: string;
  initialCreditBalance: number;
  initialCollections: CollectionItem[];
  initialCollectionMembership: Record<string, Set<string>>;
}
