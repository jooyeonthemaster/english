// ============================================================================
// /g/train — 구 "훈련" 탭. 학습 OS 재편으로 트랙 허브(/g/track/grammar)에 흡수됐다.
// (docs/study-os-spec.md §4.3 라우팅 지도)
//
// 기존 링크·북마크(홈 카드·과제 카드의 "훈련 이어서 하기" 등)를 살리기 위해
// 라우트는 남기고 서버 리다이렉트만 한다. 세션 검사는 목적지(/g/track/grammar)가
// 다시 수행하므로 여기서 중복하지 않는다 — 리다이렉트 한 홉으로 끝낸다.
//
// 308(permanentRedirect)이 아니라 307(redirect)을 쓴다: 영구 리다이렉트는
// 브라우저가 캐시해 되돌릴 수 없으므로, 트랙 IA가 다시 바뀔 여지를 남긴다.
// ============================================================================

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TrainPage(): Promise<never> {
  redirect("/g/track/grammar");
}
