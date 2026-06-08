import { redirect } from "next/navigation";

// 기존 원장 대시보드는 제거됨. 로그인 후 진입점은 "학습지 생성" 파이프라인이
// 아니라 문제 생성 페이지가 사실상의 홈이 된다. /director 로 들어오는 모든
// 경로(미들웨어·로고 링크·구 링크)는 문제 생성 페이지로 흘려보낸다.
export default function DirectorHomePage() {
  redirect("/director/workbench/questions/generate");
}
