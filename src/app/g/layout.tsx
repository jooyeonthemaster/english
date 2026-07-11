// ============================================================================
// 어법 드릴 (/g) — 독립 전체화면 학습 표면 레이아웃
// 전역 nav 없음(/t·/a 패턴). 마케팅 크롬은 GlobalBusinessFooter 가 경로로 은닉.
// ============================================================================

import type { Metadata, Viewport } from "next";
import "./gd.css";

export const metadata: Metadata = {
  title: "어법 드릴 | SMOAT",
  description: "SMOAT 모바일 어법 학습 — 개념별·난이도별 무한 드릴",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f6f5f1",
};

export default function GrammarDrillLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="gd-app min-h-dvh">{children}</div>;
}
