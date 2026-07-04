import { redirect } from "next/navigation";

/**
 * 국어 워크스페이스 진입점 — "국어 워크스페이스" 허브 카드는 제거됐다(유저 확정).
 * 영어와 동일하게 첫 탭(문제 생성)이 사실상의 홈이므로 그곳으로 바로 보낸다.
 */
export default function KoreanIndexPage() {
  redirect("/director/korean/generate");
}
