import { notFound } from "next/navigation";
import { WorksheetStudyHarness } from "./harness";

/**
 * Dev-only 학습지 스터디 모드 렌더 하네스 — 인증 없이 픽스처로 플레이어·허브·
 * 리포트를 렌더한다(Playwright 검수용). 404 in production.
 * ?view=player|hub|report &stage=vocab-quiz &mode=light|standard|intense
 */
export default async function DevWorksheetStudyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return (
    <WorksheetStudyHarness view={pick(sp.view)} stage={pick(sp.stage)} mode={pick(sp.mode)} />
  );
}
