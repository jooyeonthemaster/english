"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { approveRegistration, rejectRegistration } from "@/actions/admin";
import {
  CAMPAIGN_PLAN,
  STATUS_TABS,
  getDistrict,
} from "./registrations-client/constants";
import { DistrictGrid } from "./registrations-client/district-grid";
import { RegistrationsTable } from "./registrations-client/registrations-table";
import { ApproveDialog } from "./registrations-client/approve-dialog";
import { RejectDialog } from "./registrations-client/reject-dialog";
import { CredentialDialog } from "./registrations-client/credential-dialog";
import type {
  CredentialInfo,
  Plan,
  Registration,
} from "./registrations-client/types";

interface RegistrationsClientProps {
  initialRegistrations: Registration[];
  plans: Plan[];
}

export function RegistrationsClient({
  initialRegistrations,
  plans,
}: RegistrationsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
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
  const [credentialInfo, setCredentialInfo] = useState<CredentialInfo | null>(
    null,
  );

  const campaignScoped = initialRegistrations.filter((r) => {
    if (campaignTab === "CAMPAIGN") return r.desiredPlan === CAMPAIGN_PLAN;
    if (campaignTab === "GENERAL") return r.desiredPlan !== CAMPAIGN_PLAN;
    return true;
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
          <DistrictGrid
            registrations={initialRegistrations}
            districtFilter={districtFilter}
            onDistrictFilterChange={setDistrictFilter}
          />
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
        <RegistrationsTable
          rows={filtered}
          onApproveClick={(reg) => {
            setApproveTarget(reg);
            setSelectedPlan(reg.desiredPlan || "");
          }}
          onRejectClick={(reg) => setRejectTarget(reg)}
        />
      </div>

      {/* Approve Dialog */}
      <ApproveDialog
        target={approveTarget}
        plans={plans}
        selectedPlan={selectedPlan}
        onSelectedPlanChange={setSelectedPlan}
        initialCredits={initialCredits}
        onInitialCreditsChange={setInitialCredits}
        approving={approving}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
      />

      {/* Reject Dialog */}
      <RejectDialog
        target={rejectTarget}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        rejecting={rejecting}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason("");
        }}
        onConfirm={handleReject}
      />

      {/* Credential Info Dialog — shown after approval */}
      <CredentialDialog
        info={credentialInfo}
        onClose={() => setCredentialInfo(null)}
      />
    </>
  );
}
