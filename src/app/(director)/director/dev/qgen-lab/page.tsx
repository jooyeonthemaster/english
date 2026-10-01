import { notFound, redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import { QgenLabClient, type LabTab } from "./client";

// 어법 생성 모델 벤치 랩(개발 전용, 스태프 세션 필요, DB 무접촉).
//   /director/dev/qgen-lab[?tab=single|batch|agg][&batch=<manifest id>]
// 데이터는 전부 /api/dev/qgen-lab/* 에서 받는다(지문 세트·팔·원장). 실행은 화면의 버튼으로만 시작한다.
// 프로덕션에서는 QGEN_LAB_DEV=1 이 없으면 404(API 는 프로덕션에서 무조건 404).

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export default async function QgenLabPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (process.env.NODE_ENV === "production" && process.env.QGEN_LAB_DEV !== "1") notFound();
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const tabRaw = one(sp.tab);
  const tab: LabTab | null = tabRaw === "single" || tabRaw === "batch" || tabRaw === "agg" ? tabRaw : null;
  const batch = one(sp.batch).trim();

  return <QgenLabClient initialTab={tab} initialBatchId={/^[\w.-]{1,120}$/.test(batch) ? batch : null} />;
}
