import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import type { MissionCatalogRow } from "@/actions/admin/referrals";

// 미션 카탈로그 행 → 호버 상세. 표에 안 보이는 설정값(설명·CTA·이동 경로·정렬·월 한도)을 보여준다.
// 보상 입력칸·저장·활성 스위치 위에서는 공용 프리미티브가 팝오버/팝업을 띄우지 않는다.

const CATEGORY_LABELS: Record<string, string> = {
  ONBOARDING: "온보딩",
  DAILY: "일일",
  REFERRAL: "추천",
  EXPLORE: "기능 탐색",
};

const CADENCE_LABELS: Record<string, string> = {
  ONCE: "1회",
  DAILY: "매일",
  EVENT: "이벤트마다",
};

export function missionRowDetail(mission: MissionCatalogRow): AdminDetail {
  return {
    title: mission.title,
    subtitle: `${mission.key} · ${mission.isActive ? "활성" : "비활성"}`,
    fields: detailFields([
      ["설명", mission.description, true],
      ["보상 크레딧(저장값)", `${mission.rewardCredits.toLocaleString("ko-KR")}C`],
      [
        "월 지급 한도",
        mission.maxRewardPerMonth === null
          ? "제한 없음"
          : `${mission.maxRewardPerMonth.toLocaleString("ko-KR")}C`,
      ],
      ["버튼 문구(CTA)", mission.ctaLabel],
      ["이동 경로", mission.actionUrl, true],
      ["카테고리", `${CATEGORY_LABELS[mission.category] ?? mission.category} (${mission.category})`],
      ["주기", `${CADENCE_LABELS[mission.cadence] ?? mission.cadence} (${mission.cadence})`],
      ["정렬 순서", mission.sortOrder],
      ["아이콘 키", mission.iconKey],
      ["미션 키", mission.key],
    ]),
  };
}
