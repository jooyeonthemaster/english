import { notFound } from "next/navigation";
import { PassageReportHarness } from "./harness";

/**
 * Dev-only isolated render harness for the 01 원문 필기 캔버스 (ReportPages).
 * Lives outside the auth gate so Playwright can render samples without login.
 * 404 in production. ?sample=rich|gen07|fixture  &layout=legacy &mode=edit
 */
export default async function DevPassageReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return <PassageReportHarness sample={pick(sp.sample)} layout={pick(sp.layout)} mode={pick(sp.mode)} />;
}
