"use client";

// 개별 학원 심층 드릴다운 모달 — 학원별 테이블 행 클릭 시 열린다.
// 지연 로드: academyId 가 세팅되면 getAcademyDetail 호출. 기능별 분해·최근 60일
// 추이·핵심 지표·최근 활동 타임라인(ActivityList 재사용).

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Loader2, Flame, Users, Activity, CalendarCheck } from "lucide-react";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAcademyDetail } from "@/actions/admin-activity/get-academy-detail";
import {
  FEATURE_COLORS,
  PLAN_TIER_LABELS,
  type AcademyDetailPayload,
} from "@/lib/admin-analytics-types";
import { ActivityList } from "@/components/admin/activity/activity-list";

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-gray-300" strokeWidth={1.8} aria-hidden />
        <span className="text-[11px] text-gray-400">{label}</span>
      </div>
      <div className="mt-0.5 text-[18px] font-bold text-gray-900 tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function AcademyDetailModal({
  academyId,
  onClose,
}: {
  academyId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<AcademyDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // academyId(외부 상태) 변화 또는 재시도 시 지연 fetch — 동기 리셋 후 비동기 갱신.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!academyId) {
      setData(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    getAcademyDetail(academyId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(!d);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, retryKey]);

  const maxFeature = data
    ? Math.max(1, ...data.featureBreakdown.map((f) => f.total))
    : 1;

  return (
    <Dialog
      open={!!academyId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="w-[96vw] sm:max-w-[1400px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            {data?.academyName || (loading ? "불러오는 중…" : "학원 상세")}
            {data && (
              <>
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500">
                  {PLAN_TIER_LABELS[data.planTier]}
                </span>
                {data.planStatus && (
                  <span className="text-[11px] font-normal text-gray-400">
                    {data.planStatus}
                  </span>
                )}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
          </div>
        )}

        {!loading && data && (
          <div className="space-y-5 pt-1">
            {/* 핵심 지표 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Stat
                icon={Activity}
                label="총 활동"
                value={formatNumber(data.totalEvents)}
              />
              <Stat
                icon={Flame}
                label="현재 연속"
                value={`${data.currentStreak}일`}
              />
              <Stat
                icon={CalendarCheck}
                label="60일 활동일"
                value={`${data.activeDays60}일`}
              />
              <Stat
                icon={Users}
                label="직원"
                value={`${formatNumber(data.staffCount)}명`}
              />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-400">
              <span>
                가입{" "}
                <span className="text-gray-600">
                  {formatRelativeTime(data.signupAt)}
                </span>
              </span>
              <span>
                첫 활동{" "}
                <span className="text-gray-600">
                  {data.firstActivityAt
                    ? formatRelativeTime(data.firstActivityAt)
                    : "—"}
                </span>
              </span>
              <span>
                최근 활동{" "}
                <span className="text-gray-600">
                  {data.lastActivityAt
                    ? formatRelativeTime(data.lastActivityAt)
                    : "활동 없음"}
                </span>
              </span>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
            {/* 최근 60일 추이 */}
            <div>
              <p className="mb-2 text-[12px] font-medium text-gray-400">
                최근 60일 활동 추이
              </p>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.daily}
                    margin={{ top: 5, right: 8, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="acd-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F3F4F6"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#9CA3AF" }}
                      tickFormatter={shortDate}
                      interval={Math.max(0, Math.floor(data.daily.length / 8) - 1)}
                      dy={6}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#9CA3AF" }}
                      width={36}
                      allowDecimals={false}
                    />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((v: number) => [`${formatNumber(v)}건`, "활동"]) as any}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      labelFormatter={((l: string) => shortDate(l)) as any}
                      contentStyle={{
                        border: "1px solid #E5E7EB",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="url(#acd-grad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 기능별 분해 */}
            <div>
              <p className="mb-2 text-[12px] font-medium text-gray-400">
                기능별 사용 (전체 기간)
              </p>
              {data.featureBreakdown.length === 0 ? (
                <p className="text-[12px] text-gray-300 py-4 text-center">
                  아직 활동이 없습니다
                </p>
              ) : (
                <div className="space-y-1.5">
                  {data.featureBreakdown.map((f) => (
                    <div key={f.feature} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-[12px] text-gray-600 truncate">
                        {f.label}
                      </span>
                      <div className="flex-1 h-4 rounded bg-gray-50 overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(f.total / maxFeature) * 100}%`,
                            backgroundColor: FEATURE_COLORS[f.feature],
                          }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-[12px] font-semibold text-gray-700 tabular-nums">
                        {formatNumber(f.total)}
                      </span>
                      <span className="w-28 shrink-0 text-right text-[11px] tabular-nums">
                        {f.success + f.failed > 0 ? (
                          <>
                            <span className="text-emerald-600">
                              성공{" "}
                              {Math.round(
                                (f.success / (f.success + f.failed)) * 100,
                              )}
                              %
                            </span>
                            {f.failed > 0 && (
                              <span className="text-rose-500">
                                {" "}
                                · 실패 {f.failed}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>

            {/* 최근 활동 타임라인 */}
            <div>
              <p className="mb-2 text-[12px] font-medium text-gray-400">
                최근 활동
              </p>
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <ActivityList
                  items={data.recentActivity}
                  emptyMessage="최근 활동이 없습니다"
                  disableResourceViewer
                />
              </div>
            </div>

            <ul className="space-y-0.5">
              {data.dataNotes.map((note, i) => (
                <li key={i} className="text-[11px] text-gray-400">
                  · {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && error && academyId && (
          <div className="py-16 text-center">
            <p className="text-[13px] text-gray-400">
              학원 정보를 불러오지 못했습니다.
            </p>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="mt-3 inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
            >
              다시 시도
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
