// ---------------------------------------------------------------------------
// 시험 관리 페이지에서 카드/행이 공유하는 라벨/색상 상수
// ---------------------------------------------------------------------------

export const TYPE_LABELS: Record<string, string> = {
  OFFLINE: "오프라인",
  ONLINE: "온라인",
  VOCAB: "단어",
  MOCK: "모의",
};

export const TYPE_COLORS: Record<string, string> = {
  OFFLINE: "bg-slate-100 text-slate-600",
  ONLINE: "bg-blue-100 text-blue-600",
  VOCAB: "bg-violet-100 text-violet-600",
  MOCK: "bg-teal-100 text-teal-600",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "초안",
  PUBLISHED: "배포됨",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  ARCHIVED: "보관",
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  PUBLISHED: "bg-blue-100 text-blue-600",
  IN_PROGRESS: "bg-emerald-100 text-emerald-600",
  COMPLETED: "bg-emerald-100 text-emerald-600",
  ARCHIVED: "bg-gray-100 text-gray-500",
};
