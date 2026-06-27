export const PREVIEW_PAGE_GAP = 20;

// v2: bumped so the wider default left panel applies for everyone (old saved
// widths from v1 are discarded).
export const PANEL_WIDTH_STORAGE_KEY = "smoat.examPaperBuilder.panelWidths.v2";

export const RIGHT_PANEL_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.rightPanelCollapsed.v1";

export const LEFT_PANEL_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.leftPanelCollapsed.v1";

// 패널 여닫기/폭 조절 겸용 세로 핸들의 컬럼 폭(버튼 w-4 + 좌우 mx-1).
export const PANEL_TOGGLE_HANDLE_WIDTH = 24;

// 핸들 클릭(여닫기)과 드래그(폭 조절)를 구분하는 이동 임계값(px).
export const PANEL_DRAG_THRESHOLD = 4;

export const PANEL_MIN_CENTER = 420;

export const PANEL_DEFAULT_WIDTHS = { left: 560, right: 320 };

export const PANEL_LIMITS = {
  left: { min: 280, max: 880 },
  right: { min: 260, max: 440 },
};

// 미리보기 페이지 썸네일(세로 목록) 패널.
export const THUMBNAILS_WIDTH_STORAGE_KEY =
  "smoat.examPaperBuilder.thumbnailsWidth.v1";

export const THUMBNAILS_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.thumbnailsCollapsed.v1";

export const THUMBNAILS_WIDTH_DEFAULT = 96;

export const THUMBNAILS_WIDTH_MIN = 64;

export const THUMBNAILS_WIDTH_MAX = 240;

export const BUILDER_HEADER_AUTO_HIDE_DELAY_MS = 2000;

export const BUILDER_HEADER_HIDE_ZONE_PX = 96;

export const BUILDER_DRAFT_AUTOSAVE_DELAY_MS = 900;

// 정렬 — questions 페이지의 정렬 옵션(최신순/오래된순/난이도/중요)과 동일.
export const DIFFICULTY_RANK: Record<string, number> = {
  BASIC: 1,
  INTERMEDIATE: 2,
  KILLER: 3,
};
