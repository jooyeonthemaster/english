import { notFound } from "next/navigation";
import { PassageReportHarness } from "./harness";

/**
 * Dev-only isolated render harness for the 01 원문 필기 캔버스 (ReportPages).
 * Lives outside the auth gate so Playwright can render samples without login.
 * 404 in production. ?sample=rich|gen07|fixture  &layout=legacy &mode=edit
 * &vocab=table(단어장 1열 표 강제) &answers=1(학습활동 정답 페이지 켬) — 조판 QA 게이트 증거용.
 */
export default async function DevPassageReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return (
    <PassageReportHarness
      sample={pick(sp.sample)}
      layout={pick(sp.layout)}
      mode={pick(sp.mode)}
      vocab={pick(sp.vocab)}
      answers={pick(sp.answers)}
    />
  );
}
