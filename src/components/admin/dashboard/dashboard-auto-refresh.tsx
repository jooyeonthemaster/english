"use client";

import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

/**
 * 24시간 벽면 모니터용: 10분마다 서버 컴포넌트를 소프트 새로고침한다.
 * router.refresh()는 현재 화면을 유지한 채 데이터만 다시 가져오므로 깜빡임이 없다.
 */
export function DashboardAutoRefresh() {
  const router = useRouter();
  useAutoRefresh(() => router.refresh(), { intervalMs: 10 * 60 * 1000 });
  return null;
}
