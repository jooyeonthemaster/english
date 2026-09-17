import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStaffSession } from "@/lib/auth";
import {
  getWordbookOverviewData,
  listWordbookSensesData,
} from "@/lib/vocab-drill/wordbook-explore";
import { WordbookClient } from "./wordbook-client";
import { DEFAULT_LENS } from "./wordbook-types";

// ============================================================================
// 단어장 생성 스튜디오 — /director/workbench/wordbook
//
// 기출 단어 코퍼스(표제어 27k·뜻 35k·예문 97k) 탐색 → 단어장(덱) 구성 →
// 학생 전송까지 한 화면에서 끝내는 디렉터 워크스테이션.
// 게이트는 students/vocab/page.tsx 관용구(플래그 + 스태프 세션)와 동일.
// ============================================================================

export const dynamic = "force-dynamic";
/**
 * 이 페이지의 서버 액션은 대량 쓰기를 한다 — 교재 생성(단계 덱 최대 60개)과
 * 예약 배포(단계 × 학생 3층 쓰기). 기본 실행시간 상한으로는 중간에 끊긴다.
 * (배포는 DEPLOY_CHUNK 로 쪼개 이어받지만, 한 청크도 학생 수에 비례해 무겁다.)
 */
export const maxDuration = 300;

export default async function WordbookStudioPage() {
  if (!FEATURE_FLAGS.ENABLE_VOCAB_DRILL) redirect("/director");
  const staff = await getStaffSession();
  if (!staff) redirect("/auth/login");

  const [overview, initial] = await Promise.all([
    getWordbookOverviewData(),
    listWordbookSensesData({
      filter: DEFAULT_LENS.filter,
      sort: DEFAULT_LENS.sort,
      offset: 0,
    }),
  ]);

  return (
    <WordbookClient
      overview={overview}
      initialRows={initial.rows}
      initialTotal={initial.total}
    />
  );
}
