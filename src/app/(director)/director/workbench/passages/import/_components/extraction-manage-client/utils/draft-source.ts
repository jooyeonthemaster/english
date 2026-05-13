import type { M1PassageDraftWithJob } from "../types";

export function getDraftSourceFileNames(draft: M1PassageDraftWithJob): string[] {
  const pages = draft.job?.pages ?? [];
  const byPage = new Map(pages.map((page) => [page.pageIndex, page.sourceFileName] as const));
  return [
    ...new Set(
      draft.sourcePageIndex
        .map((pageIndex) => byPage.get(pageIndex))
        .filter((name): name is string => typeof name === "string" && name.length > 0),
    ),
  ];
}

export function getDraftSourceLabel(draft: M1PassageDraftWithJob): string {
  const fileNames = getDraftSourceFileNames(draft);
  const pageLabel = `${draft.sourcePageIndex.map((page) => page + 1).join(", ")}페이지`;
  if (fileNames.length === 1) return `${fileNames[0]} · ${pageLabel}`;
  if (fileNames.length > 1) return `${fileNames[0]} 외 ${fileNames.length - 1}개 · ${pageLabel}`;
  return `${draft.job?.originalFileName ?? "원본 파일"} · ${pageLabel}`;
}

export function getDraftSourceShortLabel(draft: M1PassageDraftWithJob): string {
  const fileNames = getDraftSourceFileNames(draft);
  if (fileNames.length === 1) return fileNames[0];
  if (fileNames.length > 1) return `${fileNames[0]} 외 ${fileNames.length - 1}개`;
  return draft.job?.originalFileName ?? `${draft.job?.totalPages ?? 0}페이지 작업`;
}
