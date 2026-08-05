"use client";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from "./query-provider";

// ============================================================================
// 전역 프로바이더 — 루트 레이아웃 1회 마운트.
//
// NextAuth `SessionProvider` 는 여기 두지 않는다. 마운트 시 무조건
// `GET /api/auth/session` 을 쏘는데, 학생 표면(/g/*)·시험 응시(/t/*)는 자체
// grammar-drill 쿠키로 인증하므로 그 왕복이 전부 낭비였다(학생 폰의 페이지
// 이동마다 서버리스 호출 1건). 클라이언트 세션이 실제로 필요한 곳은
// `useSession` 을 쓰는 원장 설정 탭 하나뿐이라 프로바이더도 거기서만 감싼다.
// (signIn/signOut 은 컨텍스트 없이 동작한다 — 프로바이더 불필요)
// ============================================================================
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>{children}</QueryProvider>
    </ThemeProvider>
  );
}
