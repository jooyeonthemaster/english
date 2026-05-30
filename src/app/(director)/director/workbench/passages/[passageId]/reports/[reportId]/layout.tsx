/**
 * 풀스크린 워크스페이스 레이아웃 — 사이드바/패딩 모두 제거.
 * Director 글로벌 레이아웃의 chrome 을 끄고, 보고서 워크스페이스 자체가 viewport 를 다 차지하게 함.
 */
export default function ReportWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgb(241, 245, 249)" }}>
      {children}
    </div>
  );
}
