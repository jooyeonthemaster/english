import type { ReactNode } from "react";

import { TaskQueueHost } from "@/components/workbench/task-queue";

/**
 * 국어 자료 추출 레이아웃 — 영어 workbench/passages/import/layout.tsx 의 국어 대칭.
 * BulkExtractClient / ExtractionManageClient 가 쓰는 작업 목록 드로어(useTaskQueue)
 * 컨텍스트를 제공한다. 추출 도메인 잡 목록은 extraction 어댑터가 현재 경로
 * (/director/korean/**)를 보고 subject=KOREAN 으로 자동 스코프한다.
 */
export default function KoreanExtractionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <TaskQueueHost defaultDomain="extraction">{children}</TaskQueueHost>;
}
