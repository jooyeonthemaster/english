import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStaffSession } from "@/lib/auth";
import { listStudioClasses } from "@/actions/studio/classes";
import { StudioHomeClient } from "./studio-home-client";
import { parseStudioLocation } from "./workbench/studio-location";

// ============================================================================
// 클래스 스튜디오 — /director/studio (docs/class-studio-spec.md §3.1 워크벤치)
//
// 좌 클래스 트리 · 중앙 「내 지문함」 임베드 · 우 클래스 패널 · 하단 생성 도크의
// 전고정 높이 3분할 워크벤치 엔트리. 게이트는 wordbook 관용구(플래그+스태프 세션).
// academyId 는 중앙 라이브러리 훅·큐 cacheKey 가 요구한다(§3.1.2·§3.7.2).
//
// ── 【R1 새로고침 위치 복원】 위치는 **서버가 확정한다** ──────────────────────
// 26-08-27 지시: "새로고침을 해버리면 무조건 클래스 선택 페이지로 가버린다 …
// 새로고침 한다고 페이지가 달라지지 않도록."
//
// 복원 판정이 **여기**(서버)에 있는 이유 3가지:
//  ① **플래시 0.** 클라이언트에서 복원하면 첫 페인트가 반드시 「클래스를 먼저
//     선택하세요」(StepGuidePane)이고 다음 커밋에서 지문함으로 튄다. 서버가 이미
//     고른 클래스로 렌더하면 그 중간 프레임 자체가 존재하지 않는다.
//  ② **좀비 상태 차단.** 보관·삭제·타 학원·손으로 고친 URL 의 classId 를 그대로
//     믿으면 `selectedClassId` 는 非null 인데 `selectedClass` 는 null 인 조합이
//     생긴다(중앙은 가이드를 그리는데 스텝 스트립은 ①완료라 말하고, 「미선택이면
//     레일 자동 펼침」 구조대가 무장 해제되어 접힌 레일을 빠져나올 수 없다).
//     여기서는 **이미 조회해 둔 목록으로** 대조하므로 추가 질의가 0 이다.
//  ③ **전이 오발화 0.** 오케스트레이터의 전이 감지 ref 는 전부 첫 렌더값으로
//     자기 시딩한다(prevAssetViewRef 등). 초기값으로 복원하면 "전이가 없었다"가
//     되어 오발화가 없지만, 마운트 후 복원하면 그것들이 전부 진짜 전이가 된다.
//
// ⚠ 여기서 자식 지문 목록(listStudioClassPassages)까지 미리 당겨 오지 마라.
//   Next 는 서버 액션을 **직렬** 처리한다(studio-home-client.tsx 의 실측 주석:
//   "1719ms 종료 직후에야 다음 액션 시작 — Promise.all 이 병렬이 아니다").
//   TTFB 가 그만큼 밀려 **흰 화면**이 길어진다 — 그려진 화면 위의 스켈레톤 한 번이
//   낫다.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function StudioPage({
  searchParams,
}: {
  /** Next 15+ 규약 — searchParams 는 Promise 다(리포 관례: exams/page.tsx:7-11). */
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // ⚠️ "/director" 로 보내면 안 된다 — 26-08-22 부터 /director 는 이 페이지로
  // 리다이렉트한다(next.config.ts). 플래그 OFF 폴백은 문제 생성으로 직행.
  if (!FEATURE_FLAGS.ENABLE_CLASS_STUDIO) redirect("/director/workbench/questions/generate");
  const staff = await getStaffSession();
  if (!staff) redirect("/auth/login");

  const res = await listStudioClasses();
  const classes = res.success ? (res.data ?? []) : [];

  // 파싱·검증 정본은 studio-location.ts 하나다 — 클라이언트의 주소창 기록도
  // 같은 모듈을 읽는다(두 쪽이 갈리면 「주소창엔 있는데 복원은 안 되는」 유령).
  const sp = await searchParams;
  const location = parseStudioLocation(
    { class: sp.class, view: sp.view },
    classes.map((c) => c.id),
  );

  return (
    <StudioHomeClient
      academyId={staff.academyId}
      initialClasses={classes}
      initialClassId={location.classId}
      initialAssetView={location.view}
    />
  );
}
