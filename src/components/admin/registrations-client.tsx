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
  desiredPlan: string | null;
  status: string;
  message: string | null;
  reviewNote: string | null;
  createdAt: Date;
  reviewedBy?: { name: string } | null;
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

  const filtered = initialRegistrations.filter((r) => {
    if (activeTab !== "ALL" && r.status !== activeTab) return false;
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

  return (
    <>
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
                  colSpan={8}
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
