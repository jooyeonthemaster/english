import type { ReportThemeId } from "./schema";

/**
 * PRIME ANALYSIS 디자인 시스템 — 키컬러 / 타이포 / 간격을 한 곳에서 정의.
 *
 * "여백·정렬·깔끔함은 엔진이 보장" 원칙의 핵심:
 *   - 색/폰트/간격은 토큰으로 고정 → 모든 섹션이 동일 규칙으로 조판됨.
 *   - AI는 이 토큰을 건드리지 않는다 (themeId 선택만 가능).
 */

export interface ReportTheme {
  id: ReportThemeId;
  label: string;
  /** 핵심 네이비 (섹션 헤더 바, 강조 박스) */
  ink: string;
  inkSoft: string;
  /** 앤틱 골드 (액센트 라인, eyebrow, 강조 키워드) */
  gold: string;
  goldSoft: string;
  /** 본문 텍스트 */
  text: string;
  textMuted: string;
  /** 박스/표 배경 틴트 */
  tint: string; // 연한 블루그레이 박스 배경
  tintBorder: string;
  /** 표 헤더 (보통 ink) */
  tableHeadBg: string;
  tableHeadText: string;
  tableStripe: string;
  /** 페이지 배경 */
  page: string;
  rule: string; // 헤더/푸터 구분선
}

export const REPORT_THEMES: Record<ReportThemeId, ReportTheme> = {
  "veritas-navy": {
    id: "veritas-navy",
    label: "베리타스 네이비",
    ink: "#1B2A4A",
    inkSoft: "#2C3E63",
    gold: "#A8853A",
    goldSoft: "#C8A85C",
    text: "#1A2233",
    textMuted: "#5B6678",
    tint: "#F1F4F9",
    tintBorder: "#DDE4EE",
    tableHeadBg: "#1B2A4A",
    tableHeadText: "#FFFFFF",
    tableStripe: "#F6F8FB",
    page: "#FFFFFF",
    rule: "#C9B27A",
  },
  "scholar-ink": {
    id: "scholar-ink",
    label: "스칼라 잉크",
    ink: "#26303A",
    inkSoft: "#3C4956",
    gold: "#8C2F39", // 버건디 액센트
    goldSoft: "#B9606A",
    text: "#1F2730",
    textMuted: "#5E6A75",
    tint: "#F3F4F5",
    tintBorder: "#E0E3E6",
    tableHeadBg: "#26303A",
    tableHeadText: "#FFFFFF",
    tableStripe: "#F7F8F9",
    page: "#FFFFFF",
    rule: "#B9606A",
  },
  "fresh-teal": {
    id: "fresh-teal",
    label: "프레시 틸",
    ink: "#0F3D3E",
    inkSoft: "#1C5658",
    gold: "#0D9488",
    goldSoft: "#5ECfC5",
    text: "#10231F",
    textMuted: "#566B66",
    tint: "#EFF7F6",
    tintBorder: "#D6E8E5",
    tableHeadBg: "#0F3D3E",
    tableHeadText: "#FFFFFF",
    tableStripe: "#F4FAF9",
    page: "#FFFFFF",
    rule: "#5EC9C0",
  },
};

export function getReportTheme(id: ReportThemeId): ReportTheme {
  return REPORT_THEMES[id] ?? REPORT_THEMES["veritas-navy"];
}

/**
 * A4 + 타이포 + 간격 상수 (mm/pt 고정).
 * 레퍼런스 비율에 맞춤 — 본문 10pt, 넉넉한 여백, 일관된 섹션 간격.
 */
export const REPORT_LAYOUT = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginXmm: 18, // 좌우 여백
  marginTopMm: 20, // 본문 시작 (헤더 아래)
  marginBottomMm: 16, // 푸터 위
  headerMm: 12,
  footerMm: 12,
  sectionGapMm: 7, // 섹션 사이 수직 간격
  bodyFontPt: 10,
  smallFontPt: 8.5,
  // 한글 산세리프 / 영문 세리프 — 레퍼런스의 클래식 학술 톤
  fontKo: `"Pretendard", -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`,
  fontEnSerif: `"Noto Serif", "Times New Roman", serif`,
} as const;

/** 난이도 ★ 문자열 (채움/빈 별). */
export function difficultyStars(level: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(level)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

/** 본문 번호 ①②③… (1-base). */
export function circledNo(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  return `(${n})`;
}
