"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Filter,
  Search,
  Building2,
  Mail,
  Phone,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { approveRegistration, rejectRegistration } from "@/actions/admin";

interface Registration {
  id: string;
  academyName: string;
  directorName: string;
  directorEmail: string;
  directorPhone: string;
  phone: string;
  address?: string | null;
  district?: string | null;
  desiredPlan: string | null;
  status: string;
  message: string | null;
  reviewNote: string | null;
  createdAt: Date;
  reviewedBy?: { name: string } | null;
}

const SEOUL_DISTRICTS = [
  "강남구", "강동구", "강북구", "강서구", "관악구",
  "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구",
  "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
];

const DISTRICT_CAPACITY = 100;
const CAMPAIGN_PLAN = "FREE_MAY_2026";

/** Pull district from explicit field or from address/message prefix fallback. */
function getDistrict(r: Registration): string | null {
  if (r.district) return r.district;
  if (r.address) {
    for (const d of SEOUL_DISTRICTS) if (r.address.includes(d)) return d;
  }
  if (r.message) {
    const m = r.message.match(/__DISTRICT__:([^\s|]+)/);
    if (m) return m[1];
  }
  return null;
}

interface Plan {
  id: string;
  name: string;
  tier: string;
  monthlyCredits: number;
  monthlyPrice: number;
}

interface RegistrationsClientProps {
  initialRegistrations: Registration[];
  plans: Plan[];
}

const STATUS_TABS = [
  { value: "ALL", label: "전체" },
  { value: "PENDING", label: "대기 중" },
  { value: "APPROVED", label: "승인됨" },
  { value: "REJECTED", label: "거절됨" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "대기 중", className: "bg-blue-50 text-blue-600 border-0" },
  APPROVED: { label: "승인됨", className: "bg-emerald-50 text-emerald-600 border-0" },
  REJECTED: { label: "거절됨", className: "bg-red-50 text-red-600 border-0" },
  CANCELLED: { label: "취소됨", className: "bg-gray-100 text-gray-500 border-0" },
};

export function RegistrationsClient({
  initialRegistrations,
  plans,
}: RegistrationsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [campaignTab, setCampaignTab] = useState<"ALL" | "CAMPAIGN" | "GENERAL">("ALL");
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<Registration | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [initialCredits, setInitialCredits] = useState("500");
  const [approving, setApproving] = useState(false);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<Registration | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Credential display after approval
  const [credentialInfo, setCredentialInfo] = useState<{
    academyName: string;
    email: string;
    tempPassword: string;
  } | null>(null);

  const campaignScoped = initialRegistrations.filter((r) => {
    if (campaignTab === "CAMPAIGN") return r.desiredPlan === CAMPAIGN_PLAN;
    if (campaignTab === "GENERAL") return r.desiredPlan !== CAMPAIGN_PLAN;
    return true;
  });

  // 구별 counts — only for campaign registrations
  const districtCounts = SEOUL_DISTRICTS.map((d) => {
    const count = initialRegistrations.filter(
      (r) => r.desiredPlan === CAMPAIGN_PLAN && getDistrict(r) === d,
    ).length;
    return { district: d, count };
  });

  const filtered = campaignScoped.filter((r) => {
    if (activeTab !== "ALL" && r.status !== activeTab) return false;
    if (districtFilter) {
      if (getDistrict(r) !== districtFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.academyName.toLowerCase().includes(q) ||
        r.directorName.toLowerCase().includes(q) ||
        r.directorEmail.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleApprove() {
    if (!approveTarget || !selectedPlan) return;
    setApproving(true);
    try {
      const result = await approveRegistration(approveTarget.id, {
        planTier: selectedPlan,
        initialCredits: parseInt(initialCredits) || 500,
      });
      if (!result.success) {
        toast.error(result.error || "승인에 실패했습니다");
        return;
      }
      // 승인 완료 — 임시 비밀번호를 복사 가능한 상태로 표시
      setCredentialInfo({
        academyName: approveTarget.academyName,
        email: approveTarget.directorEmail,
        tempPassword: result.tempPassword || "",
      });
      setApproveTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "승인에 실패했습니다");
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      const result = await rejectRegistration(rejectTarget.id, rejectReason);
      if (!result.success) {
        toast.error(result.error || "거절에 실패했습니다");
        return;
      }
      toast.success(`${rejectTarget.academyName} 거절 완료`);
      setRejectTarget(null);
      setRejectReason("");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "거절에 실패했습니다");
    } finally {
      setRejecting(false);
    }
  }

  const campaignCount = initialRegistrations.filter((r) => r.desiredPlan === CAMPAIGN_PLAN).length;
  const generalCount = initialRegistrations.length - campaignCount;

  return (
    <>
    <div className="space-y-4">
      {/* Campaign segment tabs */}
      <div className="flex items-center gap-1.5">
        {[
          { v: "ALL", label: "전체", n: initialRegistrations.length },
          { v: "CAMPAIGN", label: "캠페인 (2026-05)", n: campaignCount },
          { v: "GENERAL", label: "일반", n: generalCount },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => {
              setCampaignTab(t.v as typeof campaignTab);
              if (t.v !== "CAMPAIGN") setDistrictFilter(null);
            }}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors border",
              campaignTab === t.v
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
            )}
          >
            {t.label}
            <span className={cn("ml-1.5 text-[11px]", campaignTab === t.v ? "text-white/60" : "text-gray-400")}>
              {t.n}
            </span>
          </button>
        ))}
      </div>

      {/* 구별 분포 — only visible in CAMPAIGN tab */}
      {campaignTab === "CAMPAIGN" && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-gray-900">서울 25개 구 분포</h3>
              <p className="text-[11.5px] text-gray-400 mt-0.5">
                각 구별 정원 {DISTRICT_CAPACITY}명 · 클릭하면 해당 구만 필터링됩니다.
              </p>
            </div>
            {districtFilter && (
              <button
                onClick={() => setDistrictFilter(null)}
                className="text-[11.5px] text-gray-500 hover:text-gray-900 px-2.5 py-1 rounded-md border border-gray-200"
              >
                필터 해제 · {districtFilter}
              </button>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {districtCounts.map((d) => {
              const pct = Math.min(100, Math.round((d.count / DISTRICT_CAPACITY) * 100));
              const active = districtFilter === d.district;
              return (
                <button
                  key={d.district}
                  onClick={() =>
                    setDistrictFilter(active ? null : d.district)
                  }
                  className={cn(
                    "text-left rounded-lg border p-2.5 transition-colors",
                    active
                      ? "bg-[#EFF6FF] border-[#3B82F6]"
                      : "bg-white border-gray-100 hover:border-gray-300",
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] font-bold text-gray-900">{d.district}</span>
                    <span className="text-[10.5px] text-gray-400 font-mono">
                      {d.count}/{DISTRICT_CAPACITY}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background:
                          pct >= 100 ? "#0f172a" : "#3B82F6",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value === "ALL"
                ? initialRegistrations.length
                : initialRegistrations.filter((r) => r.status === tab.value).length;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                  activeTab === tab.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] text-gray-400">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <Input
            placeholder="가입 신청 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-[13px] bg-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[12px] text-gray-400 font-medium h-10 pl-5">
                학원명
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                원장
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                구
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                이메일
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                전화번호
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                희망 요금제
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                상태
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                날짜
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10 pr-5 text-right">
                작업
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-[13px] text-gray-400 py-16"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Filter className="size-8 text-gray-200" strokeWidth={1.5} />
                    <span>가입 신청이 없습니다</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((reg) => {
                const sc = STATUS_CONFIG[reg.status] || STATUS_CONFIG.PENDING;
                return (
                  <TableRow key={reg.id} className="hover:bg-gray-50/50">
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100">
                          <Building2
                            className="size-4 text-slate-500"
                            strokeWidth={1.7}
                          />
                        </div>
                        <span className="text-[13px] font-medium text-gray-800">
                          {reg.academyName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] text-gray-600">
                      {reg.directorName}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {(() => {
                        const d = getDistrict(reg);
                        return d ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1d4ed8] text-[11px] font-semibold">
                            <span className="w-1 h-1 rounded-full bg-[#3B82F6]" />
                            {d}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-[12px] text-gray-500">
                      {reg.directorEmail}
                    </TableCell>
                    <TableCell className="text-[12px] text-gray-500">
                      {reg.phone}
                    </TableCell>
                    <TableCell className="text-[12px] text-gray-500">
                      {reg.desiredPlan || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-[11px] px-2 ${sc.className}`}
                      >
                        {sc.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[12px] text-gray-400">
                      {formatDateTime(reg.createdAt)}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {reg.status === "PENDING" && (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => {
                              setApproveTarget(reg);
                              setSelectedPlan(reg.desiredPlan || "");
                            }}
                          >
                            <Check className="size-3.5" />
                            승인
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setRejectTarget(reg)}
                          >
                            <X className="size-3.5" />
                            거절
                          </Button>
                        </div>
                      )}
                      {reg.status === "APPROVED" && reg.reviewedBy && (
                        <span className="text-[11px] text-gray-400">
                          처리: {reg.reviewedBy.name}
                        </span>
                      )}
                      {reg.status === "REJECTED" && reg.reviewNote && (
                        <span
                          className="text-[11px] text-gray-400 truncate max-w-[120px] inline-block"
                          title={reg.reviewNote}
                        >
                          {reg.reviewNote}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>

      {/* Approve Dialog */}
      <Dialog
        open={!!approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[16px]">가입 승인</DialogTitle>
            <DialogDescription className="text-[13px]">
              <strong>{approveTarget?.academyName}</strong>을(를) 승인하고 구독을
              설정합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-gray-600">
                구독 요금제
              </Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="요금제를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem
                      key={plan.tier}
                      value={plan.tier}
                      className="text-[13px]"
                    >
                      {plan.name} (월 {plan.monthlyCredits} 크레딧)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-gray-600">
                초기 크레딧
              </Label>
              <Input
                type="number"
                value={initialCredits}
                onChange={(e) => setInitialCredits(e.target.value)}
                className="h-9 text-[13px]"
                min={0}
              />
              <p className="text-[11px] text-gray-400">
                시작 시 지급되는 일회성 보너스 크레딧
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <Mail className="size-3.5" />
                {approveTarget?.directorEmail}
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <Phone className="size-3.5" />
                {approveTarget?.phone}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApproveTarget(null)}
              disabled={approving}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={!selectedPlan || approving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {approving ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  승인 중...
                </div>
              ) : (
                <>
                  <Check className="size-3.5" />
                  승인
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[16px]">가입 거절</DialogTitle>
            <DialogDescription className="text-[13px]">
              <strong>{rejectTarget?.academyName}</strong>의 가입 신청을 거절합니다.
              사유를 입력해 주세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-gray-600">
                거절 사유
              </Label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="거절 사유를 입력하세요..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
              disabled={rejecting}
            >
              취소
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejecting}
            >
              {rejecting ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  거절 중...
                </div>
              ) : (
                <>
                  <X className="size-3.5" />
                  거절
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credential Info Dialog — shown after approval */}
      <Dialog open={!!credentialInfo} onOpenChange={() => setCredentialInfo(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[16px] flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-500" />
              승인 완료
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              <strong>{credentialInfo?.academyName}</strong> 학원이 승인되었습니다.
              아래 로그인 정보를 원장님께 전달해주세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">이메일 (아이디)</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[14px] font-semibold text-slate-800 bg-white px-3 py-2 rounded-lg border border-slate-200">
                    {credentialInfo?.email}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-9 text-[12px]"
                    onClick={() => {
                      navigator.clipboard.writeText(credentialInfo?.email || "");
                      toast.success("이메일 복사됨");
                    }}
                  >
                    복사
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">임시 비밀번호</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[14px] font-semibold text-slate-800 bg-white px-3 py-2 rounded-lg border border-slate-200 tracking-wider">
                    {credentialInfo?.tempPassword}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-9 text-[12px]"
                    onClick={() => {
                      navigator.clipboard.writeText(credentialInfo?.tempPassword || "");
                      toast.success("비밀번호 복사됨");
                    }}
                  >
                    복사
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              이 비밀번호는 다시 확인할 수 없습니다. 반드시 원장님께 전달한 후 이 창을 닫아주세요.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => setCredentialInfo(null)} className="w-full">
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
