// ============================================================================
// 학생 시험 리포트 — 테마 6종 (팔레트 + 폰트 페어링 + 커버 스타일 = 하나의 컨셉)
//
// 테마는 색 필터가 아니라 문서의 인격이다: 팔레트·서체 페어링·커버 스타일이
// 정합적으로 묶여 통째로 바뀐다. 문서 루트 style 로 주입하는 CSS 변수(--rpt-*)만
// 전 섹션·차트가 참조하므로 테마 교체 = 변수 교체(리렌더 없음).
//
//   --rpt-primary      액센트(헤딩 룰·바·게이지·강조)
//   --rpt-ok           정답/성공
//   --rpt-bad          오답/보완
//   --rpt-neutral      중립 텍스트/미입력 축
//   --rpt-tint         가장 옅은 배경 틴트(바 트랙·행 배경)
//   --rpt-surface      카드/패널 배경 톤(tint 보다 종이에 가까움)
//   --rpt-line         헤어라인/구분선
//   --rpt-accent-soft  보조 틴트(칩·하이라이트 — tint 보다 채도 있음)
//   --rpt-heading-font 제목 폰트 스택
//   --rpt-body-font    본문 폰트 스택
//
// 전 테마 인쇄 안전(밝은 배경 기반). 금지: 주황/앰버, 흰 배경 보라 그라데이션.
// ============================================================================

import type { CSSProperties } from "react";
import {
  REPORT_THEME_IDS,
  type ReportThemeId,
  type ReportTypography,
} from "@/lib/exam-report/report-schema";
import { fontFamilyStack } from "@/lib/webtoon-text/fonts";

/** 테마가 권장하는 기본 커버 스타일(커버 templateId 매핑은 report-cover 몫). */
export type ReportCoverStyle = "gradient-band" | "minimal-line" | "editorial-ink";

export interface ReportThemeVars {
  primary: string;
  ok: string;
  bad: string;
  neutral: string;
  tint: string;
  surface: string;
  line: string;
  accentSoft: string;
  /** CSS 스택 문자열(변수 주입용) */
  headingFont: string;
  bodyFont: string;
  /** 카탈로그 family 명(폰트 실로드·피커 라벨용) */
  headingFamily: string;
  bodyFamily: string;
  coverStyle: ReportCoverStyle;
}

/** family 명 → 스택 문자열(한글 폴백 포함). */
const stack = fontFamilyStack;

export const REPORT_THEMES: Record<ReportThemeId, ReportThemeVars> = {
  // 컨설팅 스탠다드 — 딥 블루 네이비. 숫자가 신뢰를 만드는 문서.
  // "흰 배경 보라 그라데이션 금지" 준수: 인디고가 아니라 blue-700 계열로 고정.
  "indigo-consult": {
    primary: "#1D4ED8",
    ok: "#059669",
    bad: "#E11D48",
    neutral: "#64748B",
    tint: "#EFF4FF",
    surface: "#F8FAFE",
    line: "#DBE3F2",
    accentSoft: "#C9D9F7",
    headingFont: stack("Pretendard"),
    bodyFont: stack("Pretendard"),
    headingFamily: "Pretendard",
    bodyFamily: "Pretendard",
    coverStyle: "gradient-band",
  },
  // 모노크롬 프로 — 흑백 대비 + 기능색만. tabular-nums 대시보드 감각.
  "slate-pro": {
    primary: "#1E293B",
    ok: "#047857",
    bad: "#BE123C",
    neutral: "#64748B",
    tint: "#F1F5F9",
    surface: "#F8FAFC",
    line: "#CBD5E1",
    accentSoft: "#E2E8F0",
    headingFont: stack("IBM Plex Sans KR"),
    bodyFont: stack("IBM Plex Sans KR"),
    headingFamily: "IBM Plex Sans KR",
    bodyFamily: "IBM Plex Sans KR",
    coverStyle: "minimal-line",
  },
  // 그로스 코치 — 밝은 틸, 성장 서사. 제목만 부드러운 고운돋움으로 온도를 올린다.
  "teal-fresh": {
    primary: "#0D9488",
    ok: "#059669",
    bad: "#E11D48",
    neutral: "#64748B",
    tint: "#F0FDFA",
    surface: "#F6FDFB",
    line: "#CBE9E3",
    accentSoft: "#99F6E4",
    headingFont: stack("Gowun Dodum"),
    bodyFont: stack("Pretendard"),
    headingFamily: "Gowun Dodum",
    bodyFamily: "Pretendard",
    coverStyle: "gradient-band",
  },
  // 에디토리얼 클래식 — 명조 저널. 헤어라인 룰과 지면의 품격.
  "navy-classic": {
    primary: "#1E3A5F",
    ok: "#0F766E",
    bad: "#B91C1C",
    neutral: "#475569",
    tint: "#EEF2F7",
    surface: "#F5F7FA",
    line: "#D3DCE7",
    accentSoft: "#C3D3E4",
    headingFont: stack("Noto Serif KR"),
    bodyFont: stack("Gowun Batang"),
    headingFamily: "Noto Serif KR",
    bodyFamily: "Gowun Batang",
    coverStyle: "minimal-line",
  },
  // 먹색 매거진 — 잉크 블랙 대비, 큰 세리프 타이포. 색이 아니라 활자가 주인공.
  "ink-editorial": {
    primary: "#18181B",
    ok: "#15803D",
    bad: "#BE123C",
    neutral: "#52525B",
    tint: "#F4F4F5",
    surface: "#FAFAF9",
    line: "#D4D4D8",
    accentSoft: "#E4E4E7",
    headingFont: stack("Hahmlet"),
    bodyFont: stack("Pretendard"),
    headingFamily: "Hahmlet",
    bodyFamily: "Pretendard",
    coverStyle: "editorial-ink",
  },
  // 딥 그린 멘토 — 포레스트 그린 + 아이보리 지면. 차분한 멘토링의 온도.
  "forest-tutor": {
    primary: "#166534",
    ok: "#059669",
    bad: "#E11D48",
    neutral: "#57534E",
    tint: "#F1F5EC",
    surface: "#FAF9F3",
    line: "#DDD9C9",
    accentSoft: "#D5E3CE",
    headingFont: stack("Pretendard"),
    bodyFont: stack("Pretendard"),
    headingFamily: "Pretendard",
    bodyFamily: "Pretendard",
    coverStyle: "minimal-line",
  },
};

export interface ReportThemeMeta {
  id: ReportThemeId;
  label: string;
  /** 피커 카드에 쓰는 한 줄 컨셉 설명 */
  description: string;
  /** "제목 / 본문" 페어링 라벨 */
  fontLabel: string;
  /** 대표색(구 스와치 계약 유지) */
  swatch: string;
  /** 실렌더 값에서 파생한 3스와치: [primary, accentSoft, tint] — 드리프트 불가 */
  swatches: [string, string, string];
  headingFamily: string;
  bodyFamily: string;
  coverStyle: ReportCoverStyle;
}

const THEME_LABELS: Record<ReportThemeId, { label: string; description: string }> = {
  "indigo-consult": { label: "컨설팅 블루", description: "딥 블루 · 신뢰의 컨설팅 스탠다드" },
  "slate-pro": { label: "모노크롬 프로", description: "흑백 대비 · 정밀한 대시보드" },
  "teal-fresh": { label: "그로스 코치", description: "밝은 틸 · 경쾌한 성장 서사" },
  "navy-classic": { label: "클래식 저널", description: "명조 페어링 · 품격 있는 지면" },
  "ink-editorial": { label: "잉크 매거진", description: "먹색 타이포 · 매거진 에디토리얼" },
  "forest-tutor": { label: "포레스트 멘토", description: "딥 그린 · 아이보리 멘토링" },
};

/** 피커(R8)용 메타 — 라벨·설명·스와치 전부 REPORT_THEMES 실값에서 파생. */
export const REPORT_THEME_META: ReportThemeMeta[] = REPORT_THEME_IDS.map((id) => {
  const t = REPORT_THEMES[id];
  return {
    id,
    label: THEME_LABELS[id].label,
    description: THEME_LABELS[id].description,
    fontLabel:
      t.headingFamily === t.bodyFamily
        ? t.headingFamily
        : `${t.headingFamily} / ${t.bodyFamily}`,
    swatch: t.primary,
    swatches: [t.primary, t.accentSoft, t.tint],
    headingFamily: t.headingFamily,
    bodyFamily: t.bodyFamily,
    coverStyle: t.coverStyle,
  };
});

/** 알 수 없는 id(구 문서·손상값)는 기본 테마로 강등. */
export function resolveReportTheme(themeId: ReportThemeId | string | undefined): ReportThemeVars {
  if (themeId && (REPORT_THEME_IDS as readonly string[]).includes(themeId)) {
    return REPORT_THEMES[themeId as ReportThemeId];
  }
  return REPORT_THEMES["indigo-consult"];
}

/**
 * 문서 루트에 주입할 CSS 변수 style 객체.
 * typography(문서 폰트 오버라이드)가 있으면 테마 기본 페어링을 덮는다.
 */
export function reportThemeStyle(
  themeId: ReportThemeId | string | undefined,
  typography?: ReportTypography,
): CSSProperties {
  const t = resolveReportTheme(themeId);
  const headingFont = typography?.headingFamily
    ? stack(typography.headingFamily)
    : t.headingFont;
  const bodyFont = typography?.bodyFamily ? stack(typography.bodyFamily) : t.bodyFont;
  return {
    "--rpt-primary": t.primary,
    "--rpt-ok": t.ok,
    "--rpt-bad": t.bad,
    "--rpt-neutral": t.neutral,
    "--rpt-tint": t.tint,
    "--rpt-surface": t.surface,
    "--rpt-line": t.line,
    "--rpt-accent-soft": t.accentSoft,
    "--rpt-heading-font": headingFont,
    "--rpt-body-font": bodyFont,
  } as CSSProperties;
}
