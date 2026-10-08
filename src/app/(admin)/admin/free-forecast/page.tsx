import Link from "next/link";
import { PageHeader } from "@/components/admin/kit";
import { FF_SLOTS, ffBytes, ffQLabel } from "@/lib/free-forecast/constants";
import { readFfSweepRecord } from "@/lib/free-forecast/retention";
import { ffPurgeDueAt, listFfRequests, signFfDownloads, type FfRequestRecord } from "@/lib/free-forecast/storage";
import { ffAdminSlice } from "./paging";
import { PurgeButton } from "./purge-button";

export const dynamic = "force-dynamic";

// 무료 적중 예측 팩 신청함(/free-forecast 접수분). 신청서는 비공개 버킷의 request.json — 파일 링크는 1시간짜리 서명 URL.
// 마감: 접수 후 24시간 안에 신청자 이메일로 자료를 보낸다(발송은 운영자가 직접).
// 보관: 동의문대로 접수 6개월 뒤 크론(api/cron/free-forecast-purge, 매일 04:15)이 지운다. 기한이 지난 신청은 쪽과 상관없이
//   맨 위에 모아 보인다 — 하루 넘게 남아 있으면 크론이 멈춘 것이니 「파기」로 손으로 지우고 CRON_SECRET 을 확인한다.

const kst = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

const kstDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" });

const HOUR = 3600 * 1000;

/** 마감(접수 + 24시간)까지 남은 시간 — 음수면 지남 */
function hoursLeft(createdAt: string, now: number): number {
  return Math.round((new Date(createdAt).getTime() + 24 * HOUR - now) / HOUR);
}

function RequestCard({ r, urls, now, overdue }: { r: FfRequestRecord; urls: Record<string, string>; now: number; overdue: boolean }) {
  const left = hoursLeft(r.createdAt, now);
  return (
    <article id={r.requestId} className={`rounded-xl border bg-card p-5 shadow-sm ${overdue ? "border-red-300" : ""}`}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-bold">
          <a href={`mailto:${r.email}`} className="text-blue-600 underline">
            {r.email}
          </a>
        </h2>
        {r.school ? (
          <span className="text-sm font-medium">
            {r.school} {r.grade ?? ""}
            {r.exam ? ` · ${r.exam}` : ""}
          </span>
        ) : null}
        <span className="text-sm text-muted-foreground">접수 {kst.format(new Date(r.createdAt))}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${left < 0 ? "bg-red-100 text-red-700" : left < 6 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {left < 0 ? `마감 ${-left >= 48 ? `${Math.round(-left / 24)}일` : `${-left}시간`} 지남` : `마감까지 ${left}시간`}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
          {overdue ? "파기 기한 지남" : "파기 예정"} {kstDate.format(ffPurgeDueAt(r.createdAt))}
        </span>
        <PurgeButton requestId={r.requestId} overdue={overdue} />
      </header>
      {r.memo ? <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{r.memo}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {FF_SLOTS.map((s) => (
          <div key={s.key} className="rounded-lg border p-3">
            <div className="text-sm font-bold">
              {s.no}. {s.title}
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {(r.files[s.key] ?? []).map((f) => (
                <li key={f.path} className="flex gap-2">
                  {urls[f.path] ? (
                    <a href={urls[f.path]} className="min-w-0 flex-1 truncate text-blue-600 underline">
                      {f.name}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  )}
                  <span className="shrink-0 text-muted-foreground">{ffBytes(f.size)}</span>
                </li>
              ))}
              {(r.gichul[s.key] ?? []).map((p) => (
                <li key={p.examId} className="rounded bg-amber-50 px-2 py-1 text-xs">
                  <b>기출 DB</b> {p.title} · {p.q.map(ffQLabel).join(", ")}번
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">requestId {r.requestId}</p>
    </article>
  );
}

function Pager({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;
  const btn = "rounded-md border px-3 py-1.5 text-sm font-semibold";
  return (
    <nav aria-label="신청함 쪽" className="flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={`/admin/free-forecast?page=${page - 1}`} className={`${btn} hover:bg-muted`}>
          ← 이전 쪽
        </Link>
      ) : (
        <span className={`${btn} text-muted-foreground opacity-50`}>← 이전 쪽</span>
      )}
      <span className="text-sm text-muted-foreground">
        {page} / {pages}쪽
      </span>
      {page < pages ? (
        <Link href={`/admin/free-forecast?page=${page + 1}`} className={`${btn} hover:bg-muted`}>
          다음 쪽 →
        </Link>
      ) : (
        <span className={`${btn} text-muted-foreground opacity-50`}>다음 쪽 →</span>
      )}
    </nav>
  );
}

export default async function AdminFreeForecastPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [{ page: rawPage }, all, lastRun] = await Promise.all([searchParams, listFfRequests(), readFfSweepRecord()]);
  const now = new Date().getTime();
  const isOverdue = (r: FfRequestRecord) => ffPurgeDueAt(r.createdAt).getTime() < now;
  const { overdue, rows, page, pages, rest } = ffAdminSlice(all, isOverdue, rawPage);
  const urls = await signFfDownloads([...overdue, ...rows].flatMap((r) => FF_SLOTS.flatMap((s) => r.files[s.key] ?? [])));
  // 크론은 매일 돈다 — 마지막 실행이 36시간보다 오래면 멈춘 것
  const stale = !lastRun || now - new Date(lastRun.startedAt).getTime() > 36 * HOUR;

  return (
    <div className="space-y-6">
      <PageHeader title="무료 적중 예측 신청" description={`/free-forecast 접수분 ${all.length}건 — 접수 후 24시간 안에 신청자 이메일로 발송`} />
      <p className={`rounded-xl border px-4 py-3 text-sm ${stale ? "border-red-200 bg-red-50 text-red-700" : "text-muted-foreground"}`}>
        <b>자동 정리</b>(매일 04:15 — 접수 6개월 지난 신청 파기 · 접수 안 한 업로드 7일 뒤 삭제){" "}
        {lastRun
          ? `마지막 ${kst.format(new Date(lastRun.startedAt))} · 파기 ${lastRun.purged}건 · 미접수 정리 ${lastRun.orphans}폴더${lastRun.failed ? ` · 실패 ${lastRun.failed}폴더(다음 실행이 다시 봄)` : ""}${lastRun.truncated ? " · 시간 초과로 일부만 봄" : ""}`
          : "실행 기록 없음 — 배포 뒤 첫 실행 전이거나 CRON_SECRET 이 없습니다"}
        {lastRun && stale ? " — 하루 넘게 돌지 않았습니다. Vercel 크론·CRON_SECRET 을 확인하세요." : ""}
      </p>
      {all.length === 0 ? <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">아직 신청이 없습니다.</p> : null}
      {overdue.length ? (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-red-700">
            파기 기한 지남 {overdue.length}건 — 다음 자동 정리 때 지워집니다. 하루 넘게 남아 있으면 「파기」로 지우세요.
          </h2>
          {overdue.map((r) => (
            <RequestCard key={r.requestId} r={r} urls={urls} now={now} overdue />
          ))}
        </section>
      ) : null}
      {rows.length ? (
        <section className="space-y-4">
          {overdue.length ? (
            <h2 className="text-sm font-bold text-muted-foreground">
              보관 중 {rest}건{pages > 1 ? ` — ${page}/${pages}쪽` : ""}
            </h2>
          ) : null}
          {rows.map((r) => (
            <RequestCard key={r.requestId} r={r} urls={urls} now={now} overdue={false} />
          ))}
        </section>
      ) : null}
      <Pager page={page} pages={pages} />
    </div>
  );
}
