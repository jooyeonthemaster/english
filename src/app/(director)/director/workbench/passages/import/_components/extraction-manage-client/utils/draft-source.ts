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
  // Prefer the booklet's own page number ("1 / 8" → 1) when OCR captured
  // it. Falls back to the upload-order pageIndex+1 for any page whose
  // page-number footer wasn't recognised. This avoids the "input file 6
  // = 시험지 7쪽" mismatch that confuses teachers reading the cards.
  const pages = draft.job?.pages ?? [];
  const examNumberByPageIndex = new Map(
    pages
      .filter((p) => typeof p.examPageNumber === "number")
      .map((p) => [p.pageIndex, p.examPageNumber as number] as const),
  );
  const displayNumbers = draft.sourcePageIndex.map(
    (pageIndex) => examNumberByPageIndex.get(pageIndex) ?? pageIndex + 1,
  );
  const pageLabel = `${displayNumbers.join(", ")}페이지`;
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
