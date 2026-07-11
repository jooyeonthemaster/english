import { redirect } from "next/navigation";

// 기존 원장 대시보드는 제거됨. 로그인 후 진입점은 "학습지 생성" 파이프라인이
// 아니라 문제 생성 페이지가 사실상의 홈이 된다.
//
// ⚠️ 실제 리다이렉트는 next.config.ts 의 async redirects() 가 라우팅 레이어에서
// HTTP 307 로 처리한다(정확히 "/director" 만 매칭). 이 page.tsx 는 그 리다이렉트에
// 가려져 평상시 렌더되지 않는다 — 여기서 서버 컴포넌트 redirect()를 직접 호출하면
// /director 를 '풀 로드'(주소창 직접입력·새로고침·북마크)할 때 Next 16 클라이언트
// Router 가 useMemo 훅 불일치(React #310)로 크래시하기 때문이다. config redirect 가
// 만약 제거되더라도 최소한 동작(문제 생성으로 이동)은 유지하도록 폴백으로 남겨둔다.
export default function DirectorHomePage() {
  redirect("/director/workbench/questions/generate");
}
