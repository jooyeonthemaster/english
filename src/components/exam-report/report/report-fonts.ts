// ============================================================================
// 학생 시험 리포트 — 리포트 톤 폰트 카탈로그 + 로더
//
// 웹툰 폰트 인프라(@/lib/webtoon-text/fonts)의 카탈로그·로더를 재사용하되,
// 리포트 문서 톤에 맞는 한글 sans/serif 서브셋만 노출한다(손글씨·코믹 제외).
// family 문자열은 웹툰 카탈로그와 동일해야 injectFontCss 가 실로드한다.
//
// 로딩 정책:
//  - 문서 마운트: ensureReportFonts([제목, 본문]) — 선택된 1~3 패밀리만 실로드
//    (유령 폰트 박멸 — navy-classic 명조가 기기 폴백으로 렌더되던 결함의 수리).
//  - 폰트 피커가 열릴 때만 injectReportFontPreviewCss() 로 서브셋 일괄 주입 허용.
//    injectAllFontCss(60패밀리)는 리포트 경로에서 금지.
// ============================================================================

import { ensureWebtoonFont, fontFamilyStack, injectFontCss } from "@/lib/webtoon-text/fonts";

export interface ReportFontOption {
  /** 웹툰 카탈로그와 동일한 정확한 family 명 */
  family: string;
  /** 피커 표시 라벨(한글) */
  label: string;
  category: "sans" | "serif";
  /** 한 줄 성격 설명 */
  vibe: string;
}

/** 리포트에서 선택 가능한 한글 폰트 12종 — sans 6 + serif 6. */
export const REPORT_FONT_FAMILIES: ReportFontOption[] = [
  // ── 고딕(sans) ──
  { family: "Pretendard", label: "프리텐다드", category: "sans", vibe: "기본 · 중립적인 현대 고딕" },
  { family: "Noto Sans KR", label: "노토 산스", category: "sans", vibe: "표준 본문 고딕" },
  { family: "IBM Plex Sans KR", label: "IBM 플렉스 산스", category: "sans", vibe: "테크니컬 · 대시보드 감각" },
  { family: "Gowun Dodum", label: "고운돋움", category: "sans", vibe: "부드러운 휴머니스트" },
  { family: "Gothic A1", label: "고딕 A1", category: "sans", vibe: "다재다능한 밀도 고딕" },
  { family: "Nanum Gothic", label: "나눔고딕", category: "sans", vibe: "친근한 중립 고딕" },
  // ── 명조(serif) ──
  { family: "Noto Serif KR", label: "노토 세리프", category: "serif", vibe: "단정한 표준 명조" },
  { family: "Nanum Myeongjo", label: "나눔명조", category: "serif", vibe: "클래식 문서 명조" },
  { family: "Gowun Batang", label: "고운바탕", category: "serif", vibe: "따뜻한 바탕체" },
  { family: "Hahmlet", label: "함렛", category: "serif", vibe: "묵직한 현대 세리프 · 매거진" },
  { family: "Song Myung", label: "송명", category: "serif", vibe: "가늘고 품격 있는 명조" },
  { family: "Diphylleia", label: "디필리아", category: "serif", vibe: "섬세한 붓 세리프" },
];

const REPORT_FAMILY_SET = new Set(REPORT_FONT_FAMILIES.map((f) => f.family));

/** CSS font-family 스택 문자열(한글 폴백 포함) — 웹툰 스택 규약 재사용. */
export function reportFontStack(family: string): string {
  return fontFamilyStack(family);
}

/** 스택 문자열("\"Hahmlet\", …")이든 단일 family 명이든 첫 패밀리를 추출한다. */
function firstFamilyOf(value: string): string {
  const m = value.match(/^\s*"?([^",]+)"?/);
  return (m?.[1] ?? "").trim();
}

/**
 * 선택된 폰트 패밀리들을 실제 로드 보장(@font-face 주입 + document.fonts.load).
 * 서버(SSR)에서는 no-op. 인자는 family 명 또는 스택 문자열 둘 다 허용.
 */
export async function ensureReportFonts(families: string[]): Promise<void> {
  if (typeof document === "undefined") return;
  const unique = [...new Set(families.map(firstFamilyOf).filter((f) => f.length > 0))];
  await Promise.all(unique.map((family) => ensureWebtoonFont(family)));
}

/**
 * 폰트 피커 전용 — 리포트 서브셋(12종)의 CSS 를 일괄 주입해 in-face 미리보기를
 * 가능하게 한다. 피커가 열리는 순간에만 호출할 것(문서 렌더 경로 호출 금지).
 */
export function injectReportFontPreviewCss(): void {
  if (typeof document === "undefined") return;
  for (const family of REPORT_FAMILY_SET) injectFontCss(family);
}
