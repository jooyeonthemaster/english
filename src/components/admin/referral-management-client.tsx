"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, XCircle, Undo2, Megaphone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ReferralOverview,
  ReferralOverviewRow,
  ReferralStatus,
  HeldReferralRow,
  HeldReferralsResult,
  MissionCatalogRow,
} from "@/actions/admin/referrals";
import {
  approveReferral,
  rejectReferral,
  clawbackReferral,
  toggleMission,
  upsertMission,
  sendAnnouncement,
  getReferralOverview,
  getHeldReferrals,
} from "@/actions/admin/referrals";
import { AdminPagination } from "@/components/admin/admin-pagination";

interface Props {
  overview: ReferralOverview;
  held: HeldReferralsResult;
  missions: MissionCatalogRow[];
}

type TabKey = "overview" | "held" | "missions" | "announce";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "추천 현황" },
  { key: "held", label: "보류 심사" },
  { key: "missions", label: "미션 관리" },
  { key: "announce", label: "공지 발송" },
];

const STATUS_LABEL: Record<ReferralStatus, string> = {
  GRANTED: "지급 완료",
  HELD: "보류",
  APPROVED: "승인 지급",
  REJECTED: "반려",
  CLAWED_BACK: "회수됨",
};

// Status -> badge styling. Blue/gray/emerald palette; red ONLY for danger states.
const STATUS_STYLE: Record<ReferralStatus, string> = {
  GRANTED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  HELD: "bg-slate-100 text-slate-600 border-slate-200",
  APPROVED: "bg-blue-50 text-blue-700 border-blue-100",
  REJECTED: "bg-gray-100 text-gray-500 border-gray-200",
  CLAWED_BACK: "bg-red-50 text-red-700 border-red-100",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: ReferralStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-[20px] px-2 text-[11px] font-medium rounded-md border",
        STATUS_STYLE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: "slate" | "blue" | "emerald" | "red" }) {
  const valueColor = {
    slate: "text-slate-900",
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    red: "text-red-600",
  }[accent];
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
      <div className="text-[11px] text-gray-400 font-medium">{label}</div>
      <div className={cn("text-[20px] font-bold tabular-nums mt-0.5", valueColor)}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export function ReferralManagementClient({
  overview: initialOverview,
  held: initialHeld,
  missions,
}: Props) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [overview, setOverview] = useState(initialOverview);
  const [held, setHeld] = useState(initialHeld);
  const [pending, startTransition] = useTransition();

  function loadOverviewPage(page: number) {
    startTransition(async () => setOverview(await getReferralOverview({ page })));
  }
  function loadHeldPage(page: number) {
    startTransition(async () => setHeld(await getHeldReferrals({ page })));
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = t.key === "held" ? held.total : undefined;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3.5 text-[13px] font-medium rounded-lg transition-all",
                active
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              )}
            >
              {t.label}
              {count !== undefined && count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white tabular-nums">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab overview={overview} pending={pending} onPage={loadOverviewPage} />
      )}
      {tab === "held" && (
        <HeldTab held={held} pending={pending} onPage={loadHeldPage} />
      )}
      {tab === "missions" && <MissionsTab missions={missions} />}
      {tab === "announce" && <AnnounceTab />}
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────

function OverviewTab({
  overview,
  pending,
  onPage,
}: {
  overview: ReferralOverview;
  pending: boolean;
  onPage: (page: number) => void;
}) {
  const { stats, rows, total, page, pageSize } = overview;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatCard label="총 전환" value={stats.totalSignups} accent="slate" />
        <StatCard label="지급 완료" value={stats.granted} accent="emerald" />
        <StatCard label="보류" value={stats.held} accent="blue" />
        <StatCard label="반려" value={stats.rejected} accent="slate" />
        <StatCard label="회수" value={stats.clawedBack} accent="red" />
        <StatCard label="지급 크레딧" value={stats.creditsIssued} accent="blue" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 text-[12px] text-gray-500">
          총{" "}
          <span className="font-semibold text-gray-800 tabular-nums">
            {total.toLocaleString("ko-KR")}
          </span>
          건 · {Math.min(page, totalPages)}/{totalPages} 페이지
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-gray-400">
            아직 추천 기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-gray-50">
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 pl-5 min-w-[180px]">추천한 학원</TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 min-w-[180px]">가입한 학원</TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[100px]">상태</TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[110px] text-right">보상</TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[70px] text-right">위험도</TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[140px]">생성일</TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[100px] pr-5 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: ReferralOverviewRow) => (
                  <OverviewRow key={r.id} row={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <AdminPagination
          page={page}
          totalPages={totalPages}
          disabled={pending}
          onChange={onPage}
        />
      </div>
    </div>
  );
}

function OverviewRow({ row }: { row: ReferralOverviewRow }) {
  const [pending, startTransition] = useTransition();
  // Clawback only applies to rewards that were actually paid out.
  const clawbackable = row.status === "GRANTED" || row.status === "APPROVED";

  function onClawback() {
    const reason = window.prompt("회수 사유를 입력하세요 (선택).") ?? undefined;
    startTransition(async () => {
      const res = await clawbackReferral(row.id, reason?.trim() || undefined);
      if (res.success) toast.success("추천 보상을 회수했습니다.");
      else toast.error(res.error ?? "회수에 실패했습니다.");
    });
  }

  return (
    <TableRow className="border-b border-gray-50">
      <TableCell className="pl-5 text-[13px] text-gray-800 font-medium">{row.referrerAcademyName}</TableCell>
      <TableCell className="text-[13px] text-gray-700">{row.referredAcademyName}</TableCell>
      <TableCell><StatusBadge status={row.status} /></TableCell>
      <TableCell className="text-right text-[13px] text-gray-600 tabular-nums">
        +{(row.referrerReward + row.referredReward).toLocaleString()}
      </TableCell>
      <TableCell className="text-right text-[13px] tabular-nums">
        <span className={row.fraudScore >= 50 ? "text-red-600 font-semibold" : "text-gray-400"}>
          {row.fraudScore}
        </span>
      </TableCell>
      <TableCell className="text-[12px] text-gray-400 tabular-nums">{fmtDate(row.createdAt)}</TableCell>
      <TableCell className="pr-5 text-right">
        {clawbackable && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={pending}
            onClick={onClawback}
          >
            <Undo2 className="size-3.5" /> 회수
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Held review tab ────────────────────────────────────────────────────────

function HeldTab({
  held,
  pending,
  onPage,
}: {
  held: HeldReferralsResult;
  pending: boolean;
  onPage: (page: number) => void;
}) {
  const { rows, total, page, pageSize } = held;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 px-5 py-16 text-center">
        <ShieldAlert className="size-7 text-gray-300 mx-auto mb-2" strokeWidth={1.6} />
        <p className="text-[13px] text-gray-400">심사 대기 중인 추천이 없습니다.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {rows.map((row) => (
          <HeldRow key={row.id} row={row} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="rounded-xl border border-gray-100 bg-white">
          <AdminPagination
            page={page}
            totalPages={totalPages}
            disabled={pending}
            onChange={onPage}
          />
        </div>
      )}
    </div>
  );
}

function HeldRow({ row }: { row: HeldReferralRow }) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function run(
    fn: (id: string, reason?: string) => Promise<{ success: boolean; error?: string }>,
    successMsg: string,
    requireReason?: boolean,
  ) {
    if (requireReason && reason.trim().length === 0) {
      toast.error("사유를 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await fn(row.id, reason.trim() || undefined);
      if (res.success) toast.success(successMsg);
      else toast.error(res.error ?? "처리에 실패했습니다.");
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-semibold text-gray-900 truncate">{row.referrerAcademyName}</span>
            <span className="text-gray-300">→</span>
            <span className="text-gray-700 truncate">{row.referredAcademyName}</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1 tabular-nums">
            보상 +{(row.referrerReward + row.referredReward).toLocaleString()} · {fmtDate(row.createdAt)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-gray-400">위험도</div>
          <div className={cn("text-[18px] font-bold tabular-nums", row.fraudScore >= 50 ? "text-red-600" : "text-gray-600")}>
            {row.fraudScore}
          </div>
        </div>
      </div>

      {row.fraudSignals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.fraudSignals.map((s, i) => (
            <span
              key={`${s.code}-${i}`}
              className="inline-flex items-center gap-1 h-[22px] px-2 text-[11px] font-medium rounded-md bg-red-50 text-red-700 border border-red-100"
              title={s.code}
            >
              <ShieldAlert className="size-3" strokeWidth={2} />
              {s.detail || s.code}
              {s.weight ? <span className="text-red-400 tabular-nums">+{s.weight}</span> : null}
            </span>
          ))}
        </div>
      )}

      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="심사 사유 (반려 시 필수, 승인 시 선택)"
        className="min-h-[60px] text-[13px] bg-gray-50 border-gray-100 focus-visible:bg-white"
        disabled={pending}
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 text-[12px] bg-emerald-600 hover:bg-emerald-700"
          disabled={pending}
          onClick={() => run(approveReferral, "추천 보상을 승인했습니다.")}
        >
          <CheckCircle2 className="size-3.5" /> 승인
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[12px] border-gray-200 text-gray-600"
          disabled={pending}
          onClick={() => run(rejectReferral, "추천을 반려했습니다.", true)}
        >
          <XCircle className="size-3.5" /> 반려
        </Button>
      </div>
    </div>
  );
}

// ─── Missions tab ─────────────────────────────────────────────────────────

function MissionsTab({ missions }: { missions: MissionCatalogRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 text-[12px] text-gray-500">
        미션 카탈로그{" "}
        <span className="font-semibold text-gray-800 tabular-nums">{missions.length}</span>개
      </div>
      {missions.length === 0 ? (
        <div className="px-5 py-12 text-center text-[13px] text-gray-400">
          등록된 미션이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-gray-50">
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 pl-5 min-w-[220px]">미션</TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[120px]">카테고리</TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[90px]">주기</TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[150px]">보상 크레딧</TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[110px] pr-5 text-right">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {missions.map((m) => (
                <MissionRow key={m.id} mission={m} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function MissionRow({ mission }: { mission: MissionCatalogRow }) {
  const [pending, startTransition] = useTransition();
  const [reward, setReward] = useState(String(mission.rewardCredits));
  const dirty = reward.trim() !== String(mission.rewardCredits);

  function save() {
    const value = Number(reward);
    if (!Number.isInteger(value) || value < 0) {
      toast.error("보상은 0 이상의 정수여야 합니다.");
      return;
    }
    startTransition(async () => {
      const res = await upsertMission({
        id: mission.id,
        key: mission.key,
        title: mission.title,
        description: mission.description,
        category: mission.category,
        cadence: mission.cadence,
        rewardCredits: value,
        iconKey: mission.iconKey,
        actionUrl: mission.actionUrl,
        ctaLabel: mission.ctaLabel,
        sortOrder: mission.sortOrder,
        maxRewardPerMonth: mission.maxRewardPerMonth,
      });
      if (res.success) toast.success("미션을 저장했습니다.");
      else toast.error(res.error ?? "저장에 실패했습니다.");
    });
  }

  function onToggle() {
    startTransition(async () => {
      const res = await toggleMission(mission.id, !mission.isActive);
      if (res.success) toast.success(mission.isActive ? "미션을 비활성화했습니다." : "미션을 활성화했습니다.");
      else toast.error(res.error ?? "변경에 실패했습니다.");
    });
  }

  return (
    <TableRow className="border-b border-gray-50">
      <TableCell className="pl-5">
        <div className="text-[13px] font-medium text-gray-900">{mission.title}</div>
        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{mission.key}</div>
      </TableCell>
      <TableCell className="text-[12px] text-gray-600">{mission.category}</TableCell>
      <TableCell className="text-[12px] text-gray-600">{mission.cadence}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            disabled={pending}
            className="h-8 w-[80px] text-[13px] tabular-nums bg-gray-50 border-gray-100 focus-visible:bg-white"
            aria-label={`${mission.title} 보상 크레딧`}
          />
          <Button
            size="sm"
            className="h-8 text-[12px]"
            disabled={pending || !dirty}
            onClick={save}
          >
            저장
          </Button>
        </div>
      </TableCell>
      <TableCell className="pr-5 text-right">
        <button
          type="button"
          role="switch"
          aria-checked={mission.isActive}
          onClick={onToggle}
          disabled={pending}
          className={cn(
            "relative inline-flex h-[22px] w-[40px] items-center rounded-full transition-colors disabled:opacity-50",
            mission.isActive ? "bg-blue-600" : "bg-gray-200",
          )}
          aria-label={mission.isActive ? "미션 비활성화" : "미션 활성화"}
        >
          <span
            className={cn(
              "inline-block size-[16px] rounded-full bg-white shadow transition-transform",
              mission.isActive ? "translate-x-[21px]" : "translate-x-[3px]",
            )}
          />
        </button>
      </TableCell>
    </TableRow>
  );
}

// ─── Announcement tab ────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: "SYSTEM", label: "시스템" },
  { value: "MISSION", label: "미션" },
  { value: "REFERRAL", label: "추천" },
  { value: "BILLING", label: "결제" },
] as const;

const TARGET_OPTIONS = [
  { value: "ALL_DIRECTORS", label: "모든 원장" },
  { value: "ALL_STAFF", label: "모든 직원" },
] as const;

function AnnounceTab() {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<"SYSTEM" | "MISSION" | "REFERRAL" | "BILLING">("SYSTEM");
  const [target, setTarget] = useState<"ALL_DIRECTORS" | "ALL_STAFF">("ALL_DIRECTORS");
  const [actionUrl, setActionUrl] = useState("");

  const canSubmit = useMemo(() => title.trim().length > 0 && !pending, [title, pending]);

  function submit() {
    if (title.trim().length === 0) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    // Irreversible fan-out to every academy — require explicit confirmation.
    const targetLabel = TARGET_OPTIONS.find((o) => o.value === target)?.label ?? target;
    if (
      !window.confirm(
        `'${targetLabel}' 전체에게 공지를 발송합니다.\n발송 후에는 회수할 수 없습니다. 계속할까요?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await sendAnnouncement({
        title: title.trim(),
        body: body.trim() || null,
        category,
        target,
        actionUrl: actionUrl.trim() || null,
      });
      if (res.success) {
        toast.success(`${res.count.toLocaleString()}명에게 공지를 발송했습니다.`);
        setTitle("");
        setBody("");
        setActionUrl("");
      } else {
        toast.error(res.error ?? "발송에 실패했습니다.");
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 max-w-2xl space-y-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
        <Megaphone className="size-4 text-blue-600" strokeWidth={1.8} />
        전체 공지 발송
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-gray-600">제목</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지 제목"
          maxLength={120}
          disabled={pending}
          className="h-9 text-[13px] bg-gray-50 border-gray-100 focus-visible:bg-white"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-gray-600">본문 (선택)</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="공지 내용을 입력하세요"
          maxLength={2000}
          disabled={pending}
          className="min-h-[120px] text-[13px] bg-gray-50 border-gray-100 focus-visible:bg-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-gray-600">분류</label>
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)} disabled={pending}>
            <SelectTrigger className="h-9 text-[13px] bg-gray-50 border-gray-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-gray-600">대상</label>
          <Select value={target} onValueChange={(v) => setTarget(v as typeof target)} disabled={pending}>
            <SelectTrigger className="h-9 text-[13px] bg-gray-50 border-gray-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-gray-600">이동 링크 (선택)</label>
        <Input
          value={actionUrl}
          onChange={(e) => setActionUrl(e.target.value)}
          placeholder="예: /director/rewards (알림 클릭 시 이동할 경로)"
          maxLength={500}
          disabled={pending}
          className="h-9 text-[13px] bg-gray-50 border-gray-100 focus-visible:bg-white"
        />
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={submit} disabled={!canSubmit} className="h-9 text-[13px]">
          <Megaphone className="size-4" />
          공지 발송
        </Button>
      </div>
    </div>
  );
}
