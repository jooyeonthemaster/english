import type { CollectionItem } from "@/components/workbench/shared/types";

export type WorkPanel = "jobs" | null;
export type InputMode = "file" | "text";
export type FileSourceType = "PDF" | "IMAGES";

export interface Props {
  academyId: string;
  initialCreditBalance: number;
  initialCollections: CollectionItem[];
  initialCollectionMembership: Record<string, Set<string>>;
  /** 과목 스코프 — "KOREAN"=국어 라우트(/director/korean/extraction)에서 마운트.
   *  업로드/텍스트 잡 생성에 subject="KOREAN"을 실어 metadata.subject 로 전파하고,
   *  하단 자료 관리·이어하기 네비게이션을 국어 라우트로 스코프한다. 미전달
   *  (undefined)=영어 기본으로 기존 동작이 한 줄도 달라지지 않는다(무회귀). */
  subjectScope?: "KOREAN";
}
