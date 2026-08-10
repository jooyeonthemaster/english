// ============================================================================
// 어법 드릴 (/g) — 독립 전체화면 학습 표면 레이아웃
// 전역 nav 없음(/t·/a 패턴). 마케팅 크롬은 GlobalBusinessFooter 가 경로로 은닉.
// ============================================================================

import type { Metadata, Viewport } from "next";
import "./gd.css";
import "./gd-study.css";
import "./gd-game.css";

export const metadata: Metadata = {
  title: "SMOAT 학습 | 스모트 모바일 학습",
  description: "스모트 모바일 학습 — 과제·시험·어법 훈련을 한곳에서",
  robots: { index: false, follow: false },
  // 경량 PWA — /g 스코프 매니페스트(홈화면 추가 시 standalone 실행).
  // 루트 app/manifest.ts 를 쓰면 사이트 전역에 standalone 이 새므로 정적 파일로 스코프.
  // 오프라인(서비스워커)은 의도적으로 없음.
  manifest: "/g.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SMOAT 학습",
    statusBarStyle: "default",
  },
};

// 확대를 막지 않는다 — 본문에 10~13px 소형 텍스트가 있는 학습 화면에서
// userScalable:false 는 저시력 학생에게 치명적이다(접근성).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#F4F6F9",
  // Android Chrome: 가상 키보드가 레이아웃 뷰포트를 직접 줄인다(h-dvh 자동 대응,
  // useKeyboardInset 은 ~0). iOS 는 이 옵션을 무시하므로 훅이 실측을 담당한다.
  interactiveWidget: "resizes-content",
};

export default function GrammarDrillLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="gd-app min-h-dvh">{children}</div>;
}
