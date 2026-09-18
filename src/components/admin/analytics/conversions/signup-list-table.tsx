"use client";

// 가입 학원 목록 — 학원별 최초 유입·가입 직전 유입·방문 수·가입까지 일수·첫 결제·누적 매출.
// 추적 안 된 학원은 회색 「추적 시작 전 가입」. 학원명 → /admin/academies/[id], 원장 → /admin/members/[staffId].
// 유입 칸을 누르면 상세(매체·참조·첫 페이지·시각)가 아래 줄에 펼쳐진다 — 터치 기기에는 title 툴팁이 없기 때문(검수 U5-7).

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AttributionModel } from "@/lib/analytics/attribution";
import type { ConversionsReport, ConversionsSignupRow } from "@/lib/analytics/reports/conversions";
import { CHANNEL_COLORS, channelLabel, isChannel, sourceLabel } from "@/lib/analytics/channels";
import { fmtDateTime, fmtInt, fmtKrw } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { ReportEmpty } from "../shared/report-states";

type Show = "all" | "tracked" | "untracked";
const PAGE = 50;
const COLS = 9;

function ChannelDot({ channel }: { channel: string | null }) {
  return (
    <span
      className="mt-[5px] size-2 shrink-0 rounded-full"
      style={{ background: channel && isChannel(channel) ? CHANNEL_COLORS[channel] : "#cbd5e1" }}
      aria-hidden
    />
  );
}

function TouchCell({
  channel,
  source,
  campaign,
  title,
}: {
  channel: string | null;
  source: string | null;
  campaign: string | null;
  title?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5" title={title}>
      <ChannelDot channel={channel} />
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium text-gray-800">{sourceLabel(source)}</div>
        <div className="truncate text-[11px] text-gray-400">
          {channelLabel(channel)}
          {campaign ? ` · ${campaign}` : ""}
        </div>
      </div>
    </div>
  );
}

function firstTitle(row: ConversionsSignupRow): string | undefined {
  const f = row.first;
  if (!f) return undefined;
  return [
    f.firstSeenAt ? `첫 방문 ${fmtDateTime(f.firstSeenAt)}` : null,
    f.medium ? `매체 ${f.medium}` : null,
    f.referrerHost ? `참조 ${f.referrerHost}` : null,
    f.landingPath ? `첫 페이지 ${f.landingPath}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function DetailItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 gap-1.5">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 break-all font-medium text-gray-700">{value}</span>
    </div>
  );
}

/** 행 아래로 펼쳐지는 유입 상세 — 가로 스크롤 안에서도 보이도록 sticky left */
function DetailPanel({ row }: { row: ConversionsSignupRow }) {
  const f = row.first;
  const l = row.last;
  return (
    <div className="sticky left-0 w-[min(100vw-5rem,44rem)] space-y-3 px-2 py-3 text-[11.5px] leading-relaxed">
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-gray-500">최초 유입</div>
        {f ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <DetailItem label="채널" value={channelLabel(f.channel)} />
            <DetailItem label="소스" value={sourceLabel(f.source)} />
            <DetailItem label="매체" value={f.medium} />
            <DetailItem label="캠페인" value={f.campaign} />
            <DetailItem label="참조" value={f.referrerHost} />
            <DetailItem label="첫 페이지" value={f.landingPath} />
            <DetailItem label="첫 방문" value={f.firstSeenAt ? fmtDateTime(f.firstSeenAt) : null} />
          </div>
        ) : (
          <div className="text-gray-400">기록 없음</div>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-gray-500">가입 직전 유입</div>
        {l ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <DetailItem label="채널" value={channelLabel(l.channel)} />
            <DetailItem label="소스" value={sourceLabel(l.source)} />
            <DetailItem label="캠페인" value={l.campaign} />
            <DetailItem label="방문 시작" value={l.startedAt ? fmtDateTime(l.startedAt) : null} />
          </div>
        ) : (
          <div className="text-gray-400">기록 없음</div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-2">
        <DetailItem label="가입 전 방문" value={`${fmtInt(row.touchCount)}회`} />
        <DetailItem
          label="가입까지"
          value={row.daysToSignup === null ? null : row.daysToSignup === 0 ? "1일 이내" : `${fmtInt(row.daysToSignup)}일`}
        />
        <DetailItem label="가입일시" value={fmtDateTime(row.createdAt)} />
      </div>
    </div>
  );
}

export function SignupListTable({
  rows,
  model,
  filtered,
  coverage,
  total,
  limit,
}: {
  rows: ConversionsSignupRow[];
  model: AttributionModel;
  filtered: boolean;
  /** 필터 무관 커버리지 — 목록이 잘려도 칩이 전체와 어긋나지 않게 하는 기준 */
  coverage: ConversionsReport["coverage"];
  /** 절단 전 목록 후보 수 */
  total: number;
  /** 목록 상한 */
  limit: number;
}) {
  const [show, setShow] = useState<Show>("all");
  const [page, setPage] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  // 필터가 없으면 칩은 기간 전체(커버리지) 기준 — 목록이 300곳에서 잘려도 합이 맞는다.
  const counts = useMemo(() => {
    const trackedInRows = rows.filter((r) => r.tracked).length;
    if (filtered) return { all: rows.length, tracked: trackedInRows, untracked: rows.length - trackedInRows };
    return { all: coverage.signups, tracked: coverage.tracked, untracked: Math.max(0, coverage.signups - coverage.tracked) };
  }, [rows, filtered, coverage]);
  const visibleRows = useMemo(
    () => rows.filter((r) => (show === "all" ? true : show === "tracked" ? r.tracked : !r.tracked)),
    [rows, show],
  );
  const truncated = total > rows.length;
  const truncNote = `최신 ${fmtInt(limit)}곳만 표시 (전체 ${fmtInt(total)}곳)`;

  if (rows.length === 0) {
    return <ReportEmpty message={filtered ? "필터에 맞는 추적된 가입 학원이 없습니다" : "이 기간에 가입한 학원이 없습니다"} />;
  }

  const SHOW_LABELS: Record<Show, string> = { all: "전체", tracked: "추적됨", untracked: "추적 안 됨" };
  const headCls = "px-2 py-2 text-left font-semibold whitespace-nowrap";
  const selectedMark = <span className="ml-1 rounded bg-blue-50 px-1 py-px text-[10px] font-semibold text-blue-600">집계 기준</span>;

  return (
    <div className="space-y-3">
      {(!filtered || truncated) && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {!filtered && (
          <div className="inline-flex flex-wrap rounded-lg border border-gray-100 p-0.5">
            {(Object.keys(SHOW_LABELS) as Show[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setShow(k);
                  setPage(PAGE);
                }}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[12px] font-semibold tabular-nums",
                  show === k ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900",
                )}
              >
                {SHOW_LABELS[k]} {fmtInt(counts[k])}
              </button>
            ))}
          </div>
        )}
        {truncated && (
          <span
            className="text-[11.5px] font-medium text-amber-600"
            title="목록은 최신 가입순으로 잘립니다. 칩 수치는 기간 전체 기준이라 표에 보이는 행보다 많을 수 있습니다."
          >
            {truncNote}
          </span>
        )}
      </div>
      )}

      {visibleRows.length === 0 ? (
        <ReportEmpty message="해당하는 학원이 없습니다" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left">
            <thead>
              <tr className="border-b border-gray-50 text-[11px] text-gray-400">
                <th className={headCls}>가입일시</th>
                <th className={headCls}>학원</th>
                <th className={headCls}>원장</th>
                <th className={headCls}>최초 유입{model === "first" && selectedMark}</th>
                <th className={headCls}>가입 직전 유입{model === "last" && selectedMark}</th>
                <th className={cn(headCls, "text-right")}>가입 전 방문</th>
                <th className={cn(headCls, "text-right")}>가입까지</th>
                <th
                  className={cn(headCls, "text-right")}
                  title="전액 환불된 결제도 이 칸에는 표시됩니다(퍼널 ④ 「결제」 곳 수는 결제 완료 기준 — §14 D15)"
                >
                  첫 결제
                </th>
                <th className={cn(headCls, "text-right")} title="전 기간 순매출(결제 − 환불). 환불이 더 크면 음수로 표시됩니다.">
                  누적 매출
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.slice(0, page).map((r) => {
                const open = openId === r.academyId;
                return (
                  <Fragment key={r.academyId}>
                    <tr className={cn("border-b border-gray-50 align-top", !r.tracked && "bg-gray-50/50", open && "border-b-0 bg-blue-50/40")}>
                      <td className="px-2 py-2.5 text-[12px] text-gray-500 tabular-nums whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                      <td className="max-w-[200px] px-2 py-2.5">
                        <Link
                          href={`/admin/academies/${r.academyId}`}
                          prefetch={false}
                          className="block truncate text-[13px] font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                          title={r.academyName}
                        >
                          {r.academyName || "(이름 없음)"}
                        </Link>
                      </td>
                      <td className="max-w-[120px] px-2 py-2.5 text-[12.5px]">
                        {r.directorStaffId ? (
                          <Link
                            href={`/admin/members/${r.directorStaffId}`}
                            prefetch={false}
                            className="block truncate text-blue-600 hover:underline"
                            title="회원 상세"
                          >
                            {r.directorName || "원장"}
                          </Link>
                        ) : (
                          <span className="text-gray-400">{r.directorName ?? "-"}</span>
                        )}
                      </td>
                      {r.tracked ? (
                        <>
                          <td className="max-w-[190px] px-2 py-2.5">
                            <button
                              type="button"
                              onClick={() => setOpenId(open ? null : r.academyId)}
                              aria-expanded={open}
                              className="flex w-full items-start gap-1 text-left"
                              title="누르면 유입 상세"
                            >
                              <span className="min-w-0 flex-1">
                                {r.first ? (
                                  <TouchCell
                                    channel={r.first.channel}
                                    source={r.first.source}
                                    campaign={r.first.campaign}
                                    title={firstTitle(r)}
                                  />
                                ) : (
                                  <span className="text-[12px] text-gray-300">-</span>
                                )}
                              </span>
                              <ChevronDown
                                className={cn("mt-1 size-3.5 shrink-0 text-gray-300", open && "rotate-180 text-blue-500")}
                                aria-hidden
                              />
                            </button>
                          </td>
                          <td className="max-w-[190px] px-2 py-2.5">
                            <button
                              type="button"
                              onClick={() => setOpenId(open ? null : r.academyId)}
                              aria-expanded={open}
                              className="block w-full text-left"
                              title="누르면 유입 상세"
                            >
                              {r.last ? (
                                <TouchCell
                                  channel={r.last.channel}
                                  source={r.last.source}
                                  campaign={r.last.campaign}
                                  title={r.last.startedAt ? `방문 시작 ${fmtDateTime(r.last.startedAt)}` : undefined}
                                />
                              ) : (
                                <span className="text-[12px] text-gray-300">-</span>
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-2.5 text-right text-[12.5px] text-gray-700 tabular-nums">{fmtInt(r.touchCount)}회</td>
                          <td className="px-2 py-2.5 text-right text-[12.5px] text-gray-700 tabular-nums whitespace-nowrap">
                            {r.daysToSignup === null ? "-" : r.daysToSignup === 0 ? "1일 이내" : `${fmtInt(r.daysToSignup)}일`}
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} className="px-2 py-2.5">
                          <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2.5 text-[11.5px] font-medium text-gray-400">
                            추적 시작 전 가입
                          </span>
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-right text-[12.5px] tabular-nums whitespace-nowrap">
                        {r.firstPaidAt ? (
                          <>
                            <div className="font-semibold text-gray-800">{fmtKrw(r.firstPaidAmount)}</div>
                            <div className="text-[11px] text-gray-400">{fmtDateTime(r.firstPaidAt)}</div>
                          </>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2.5 text-right text-[12.5px] tabular-nums whitespace-nowrap",
                          r.lifetimeRevenue > 0 ? "font-semibold text-gray-900" : r.lifetimeRevenue < 0 ? "font-semibold text-rose-600" : "text-gray-300",
                        )}
                        title={r.lifetimeRevenue < 0 ? "환불이 결제보다 큰 학원" : undefined}
                      >
                        {r.lifetimeRevenue === 0 ? "-" : fmtKrw(r.lifetimeRevenue)}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-gray-50 bg-blue-50/40">
                        <td colSpan={COLS} className="p-0">
                          <DetailPanel row={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visibleRows.length > page && (
        <button type="button" onClick={() => setPage((n) => n + PAGE)} className="text-[12px] font-semibold text-blue-600 hover:underline">
          더 보기 ({fmtInt(page)}/{fmtInt(visibleRows.length)})
        </button>
      )}
    </div>
  );
}
