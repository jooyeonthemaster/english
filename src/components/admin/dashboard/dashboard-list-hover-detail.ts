import type { AdminDetail } from "@/lib/admin-detail-types";
import { formatDateTime } from "@/lib/utils";

// 대시보드 사이드 목록(크레딧 소진 임박·체험 종료 임박) 행 → 호버 상세.
// 서버 컴포넌트에서 DashboardOverview 값만으로 조립한다(추가 조회 없음).

const DAY_MS = 86_400_000;
const c = (n: number) => `${n.toLocaleString("ko-KR")}C`;

export function lowCreditRowDetail(a: {
  name: string;
  balance: number;
  threshold: number;
}): AdminDetail {
  const ratio = a.threshold > 0 ? Math.round((a.balance / a.threshold) * 100) : null;
  return {
    title: a.name,
    subtitle: "크레딧 소진 임박",
    summary: [
      { label: "현재 잔액", value: c(a.balance) },
      { label: "알림 기준", value: c(a.threshold) },
      { label: "기준 대비", value: ratio === null ? "—" : `${ratio}%` },
    ],
  };
}

export function trialEndingRowDetail(a: { name: string; trialEndsAt: string }): AdminDetail {
  const days = Math.ceil((new Date(a.trialEndsAt).getTime() - Date.now()) / DAY_MS);
  return {
    title: a.name,
    subtitle: "체험 종료 임박",
    summary: [
      { label: "체험 종료", value: formatDateTime(a.trialEndsAt) },
      { label: "남은 기간", value: days <= 0 ? "오늘 종료" : `D-${days}` },
    ],
  };
}
