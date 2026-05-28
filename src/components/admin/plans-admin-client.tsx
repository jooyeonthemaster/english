"use client";

import { useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Coins,
  CreditCard,
  Percent,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { createPlan, deletePlan, updatePlan } from "@/actions/admin";
import type { PlanCreateData, PlanUpdateData } from "@/actions/admin/plans";
import {
  calculateDiscountedPrice,
  parseSubscriptionPlanFeatures,
  serializeSubscriptionPlanFeatures,
} from "@/lib/subscription-plan-pricing";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AdminPlan = {
  id: string;
  name: string;
  tier: string;
  monthlyPrice: number;
  monthlyCredits: number;
  maxStudents: number;
  maxStaff: number;
  features: string;
  rolloverPolicy: string;
  rolloverMaxRate: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count: {
    subscriptions: number;
  };
};

type PlanFormState = {
  name: string;
  monthlyPrice: string;
  monthlyCredits: string;
  maxStudents: string;
  maxStaff: string;
  rolloverPolicy: string;
  rolloverMaxRate: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
  promotionEnabled: boolean;
  promotionName: string;
  promotionDiscountRate: string;
  promotionStartsAt: string;
  promotionEndsAt: string;
};

type CreatePlanFormState = {
  name: string;
  monthlyPrice: string;
  monthlyCredits: string;
  maxStudents: string;
  maxStaff: string;
  description: string;
};

type ActionMessage = {
  type: "success" | "error" | "info";
  text: string;
};

interface AdminPlansClientProps {
  initialPlans: AdminPlan[];
}

const ROLLOVER_POLICY_LABELS: Record<string, string> = {
  RESET: "매월 초기화",
  ROLLOVER: "전액 이월",
  PARTIAL_ROLLOVER: "일부 이월",
};

const EMPTY_CREATE_FORM: CreatePlanFormState = {
  name: "",
  monthlyPrice: "",
  monthlyCredits: "",
  maxStudents: "",
  maxStaff: "",
  description: "",
};

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatCredits(value: number) {
  return `${value.toLocaleString("ko-KR")} 크레딧`;
}

function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function planToForm(plan: AdminPlan): PlanFormState {
  const features = parseSubscriptionPlanFeatures(plan.features);
  const promotion = features.promotion ?? null;

  return {
    name: plan.name,
    monthlyPrice: String(plan.monthlyPrice),
    monthlyCredits: String(plan.monthlyCredits),
    maxStudents: String(plan.maxStudents),
    maxStaff: String(plan.maxStaff),
    rolloverPolicy: plan.rolloverPolicy,
    rolloverMaxRate: String(plan.rolloverMaxRate),
    description: plan.description ?? "",
    isActive: plan.isActive,
    sortOrder: String(plan.sortOrder),
    promotionEnabled: Boolean(promotion),
    promotionName: promotion?.name ?? "",
    promotionDiscountRate: promotion ? String(promotion.discountRate) : "0",
    promotionStartsAt: toDatetimeLocal(promotion?.startsAt),
    promotionEndsAt: toDatetimeLocal(promotion?.endsAt),
  };
}

function formToPlan(plan: AdminPlan, form: PlanFormState): AdminPlan {
  const features = parseSubscriptionPlanFeatures(plan.features);

  if (form.promotionEnabled) {
    features.promotion = {
      name: form.promotionName.trim() || `${form.promotionDiscountRate}% 할인`,
      discountRate: Number(form.promotionDiscountRate || 0),
      startsAt: toIsoOrNull(form.promotionStartsAt) ?? "",
      endsAt: toIsoOrNull(form.promotionEndsAt) ?? "",
    };
  } else {
    delete features.promotion;
  }

  return {
    ...plan,
    name: form.name.trim(),
    monthlyPrice: Number(form.monthlyPrice || 0),
    monthlyCredits: Number(form.monthlyCredits || 0),
    maxStudents: Number(form.maxStudents || 0),
    maxStaff: Number(form.maxStaff || 0),
    rolloverPolicy: form.rolloverPolicy,
    rolloverMaxRate: Number(form.rolloverMaxRate || 0),
    description: form.description.trim() || null,
    isActive: form.isActive,
    sortOrder: Number(form.sortOrder || 0),
    features: serializeSubscriptionPlanFeatures(features),
    updatedAt: new Date().toISOString(),
  };
}

function getFormPricing(form: PlanFormState) {
  const price = Number(form.monthlyPrice || 0);
  const discountRate = Number(form.promotionDiscountRate || 0);
  const startsAt = form.promotionStartsAt ? new Date(form.promotionStartsAt) : null;
  const endsAt = form.promotionEndsAt ? new Date(form.promotionEndsAt) : null;
  const now = new Date();
  const hasValidPeriod = Boolean(
    startsAt &&
      endsAt &&
      !Number.isNaN(startsAt.getTime()) &&
      !Number.isNaN(endsAt.getTime()) &&
      startsAt < endsAt,
  );
  const isPromotionActive = Boolean(
    form.promotionEnabled &&
      discountRate > 0 &&
      hasValidPeriod &&
      startsAt &&
      endsAt &&
      startsAt <= now &&
      now < endsAt,
  );
  const finalPrice = isPromotionActive
    ? calculateDiscountedPrice(price, discountRate)
    : price;

  return {
    price,
    discountRate,
    finalPrice,
    discountAmount: Math.max(price - finalPrice, 0),
    hasValidPeriod,
    isPromotionActive,
  };
}

export function AdminPlansClient({ initialPlans }: AdminPlansClientProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [forms, setForms] = useState<Record<string, PlanFormState>>(() =>
    Object.fromEntries(initialPlans.map((plan) => [plan.id, planToForm(plan)])),
  );
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreatePlanFormState>(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  const stats = useMemo(() => {
    const activePlans = plans.filter((plan) => plan.isActive).length;
    const promotedPlans = plans.filter((plan) => {
      const features = parseSubscriptionPlanFeatures(plan.features);
      return Boolean(features.promotion);
    }).length;

    return {
      activePlans,
      promotedPlans,
      totalSubscriptions: plans.reduce(
        (sum, plan) => sum + plan._count.subscriptions,
        0,
      ),
    };
  }, [plans]);

  function updateField<K extends keyof PlanFormState>(
    planId: string,
    field: K,
    value: PlanFormState[K],
  ) {
    setForms((current) => ({
      ...current,
      [planId]: {
        ...current[planId],
        [field]: value,
      },
    }));
  }

  function updateCreateField<K extends keyof CreatePlanFormState>(
    field: K,
    value: CreatePlanFormState[K],
  ) {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function togglePlan(planId: string) {
    setExpandedPlanIds((current) => {
      const next = new Set(current);
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  }

  function toggleAllPlans() {
    const everyPlanExpanded = plans.every((plan) => expandedPlanIds.has(plan.id));
    setExpandedPlanIds(
      everyPlanExpanded ? new Set() : new Set(plans.map((plan) => plan.id)),
    );
  }

  function submitNewPlan() {
    const payload: PlanCreateData = {
      name: createForm.name,
      monthlyPrice: Number(createForm.monthlyPrice || 0),
      monthlyCredits: Number(createForm.monthlyCredits || 0),
      maxStudents: Number(createForm.maxStudents || 0),
      maxStaff: Number(createForm.maxStaff || 0),
      description: createForm.description,
    };

    setCreating(true);
    setMessage(null);
    startTransition(async () => {
      const result = await createPlan(payload);

      if (!result.success || !result.plan) {
        setMessage({
          type: "error",
          text: result.error ?? "상품을 추가하지 못했습니다.",
        });
        setCreating(false);
        return;
      }

      const createdPlan = result.plan;
      setPlans((current) =>
        [...current, createdPlan].sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setForms((current) => ({
        ...current,
        [createdPlan.id]: planToForm(createdPlan),
      }));
      setExpandedPlanIds((current) => {
        const next = new Set(current);
        next.add(createdPlan.id);
        return next;
      });
      setCreateForm(EMPTY_CREATE_FORM);
      setShowCreateForm(false);
      setMessage({
        type: "success",
        text: result.message ?? "새 상품을 비활성 상태로 추가했습니다.",
      });
      setCreating(false);
    });
  }

  function resetPlan(plan: AdminPlan) {
    setForms((current) => ({
      ...current,
      [plan.id]: planToForm(plan),
    }));
    setMessage({ type: "info", text: `${plan.name} 입력값을 되돌렸습니다.` });
  }

  function submitPlan(plan: AdminPlan) {
    const form = forms[plan.id];
    if (!form) return;

    const payload: PlanUpdateData = {
      name: form.name,
      monthlyPrice: Number(form.monthlyPrice || 0),
      monthlyCredits: Number(form.monthlyCredits || 0),
      maxStudents: Number(form.maxStudents || 0),
      maxStaff: Number(form.maxStaff || 0),
      rolloverPolicy: form.rolloverPolicy as PlanUpdateData["rolloverPolicy"],
      rolloverMaxRate: Number(form.rolloverMaxRate || 0),
      description: form.description,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder || 0),
      promotionEnabled: form.promotionEnabled,
      promotionName: form.promotionName,
      promotionDiscountRate: Number(form.promotionDiscountRate || 0),
      promotionStartsAt: toIsoOrNull(form.promotionStartsAt),
      promotionEndsAt: toIsoOrNull(form.promotionEndsAt),
    };

    setSavingPlanId(plan.id);
    setMessage(null);
    startTransition(async () => {
      const result = await updatePlan(plan.id, payload);

      if (!result.success) {
        setMessage({
          type: "error",
          text: result.error ?? "요금제를 저장하지 못했습니다.",
        });
        setSavingPlanId(null);
        return;
      }

      const updatedPlan = formToPlan(plan, form);
      setPlans((current) =>
        current
          .map((item) => (item.id === plan.id ? updatedPlan : item))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setForms((current) => ({
        ...current,
        [plan.id]: planToForm(updatedPlan),
      }));
      setMessage({ type: "success", text: `${form.name} 요금제를 저장했습니다.` });
      setSavingPlanId(null);
    });
  }

  function handleDeletePlan(plan: AdminPlan) {
    const message =
      plan._count.subscriptions > 0
        ? "연결된 구독이 있어 실제 삭제 대신 비활성화됩니다. 계속할까요?"
        : "연결된 구독이 없는 상품입니다. 삭제할까요?";

    if (!window.confirm(message)) return;

    setDeletingPlanId(plan.id);
    setMessage(null);
    startTransition(async () => {
      const result = await deletePlan(plan.id);

      if (!result.success) {
        setMessage({
          type: "error",
          text: result.error ?? "상품을 삭제하지 못했습니다.",
        });
        setDeletingPlanId(null);
        return;
      }

      if (result.plan) {
        setPlans((current) =>
          current.map((item) => (item.id === plan.id ? result.plan! : item)),
        );
        setForms((current) => ({
          ...current,
          [plan.id]: planToForm(result.plan!),
        }));
      } else {
        setPlans((current) => current.filter((item) => item.id !== plan.id));
        setForms((current) => {
          const next = { ...current };
          delete next[plan.id];
          return next;
        });
        setExpandedPlanIds((current) => {
          const next = new Set(current);
          next.delete(plan.id);
          return next;
        });
      }

      setMessage({
        type: "success",
        text: result.message ?? "상품을 삭제했습니다.",
      });
      setDeletingPlanId(null);
    });
  }

  return (
    <div className="space-y-5">
      <Card className="gap-0 rounded-xl border-blue-100 bg-white py-0 shadow-sm">
        <CardContent className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[14px] font-semibold text-gray-900">
                상품 카탈로그
              </p>
              <p className="mt-1 text-[12px] text-gray-500">
                크레딧 충전 상품과 같은 크레딧 수, 금액, 정렬 기준으로 운영됩니다.
                새 상품은 비활성 상태로 추가되어 결제/승인 화면에 바로 노출되지 않습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleAllPlans}
              >
                {plans.every((plan) => expandedPlanIds.has(plan.id))
                  ? "모두 접기"
                  : "모두 펼치기"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowCreateForm((current) => !current)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="size-3.5" />
                상품 추가
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryItem
              icon={<CreditCard className="size-4" />}
              label="활성 요금제"
              value={`${stats.activePlans}개`}
            />
            <SummaryItem
              icon={<Percent className="size-4" />}
              label="프로모션 설정"
              value={`${stats.promotedPlans}개`}
            />
            <SummaryItem
              icon={<Users className="size-4" />}
              label="연결 구독"
              value={`${stats.totalSubscriptions.toLocaleString("ko-KR")}건`}
            />
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div className="space-y-1">
                <p className="text-[13px] font-semibold text-amber-900">
                  심사 보호 안내
                </p>
                <p className="text-[12px] leading-5 text-amber-800">
                  프로모션을 켜면 할인율과 시작/종료일이 필수입니다. 실제 결제
                  화면에는 정가, 최종 결제금액, 적용 기간이 함께 보여야 하며,
                  결제 요청 금액과 화면 금액이 달라지면 PG 심사와 승인 흐름에서
                  문제가 생길 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showCreateForm && (
        <Card className="rounded-xl border-blue-100 bg-white">
          <CardHeader className="border-b px-5 pb-5">
            <CardTitle className="text-[16px] text-gray-900">
              새 상품 추가
            </CardTitle>
            <p className="text-[12px] text-gray-500">
              저장 후 비활성 상태로 추가됩니다. 검토 후 상품 안에서 노출을 켜주세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Field label="상품 이름">
                <Input
                  value={createForm.name}
                  onChange={(event) =>
                    updateCreateField("name", event.target.value)
                  }
                  placeholder="예: 베이직"
                  className="h-9 text-[13px]"
                />
              </Field>
              <Field label="월 크레딧 수">
                <Input
                  type="number"
                  min={0}
                  value={createForm.monthlyCredits}
                  onChange={(event) =>
                    updateCreateField("monthlyCredits", event.target.value)
                  }
                  className="h-9 text-[13px]"
                />
              </Field>
              <Field label="월 금액">
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={createForm.monthlyPrice}
                  onChange={(event) =>
                    updateCreateField("monthlyPrice", event.target.value)
                  }
                  className="h-9 text-[13px]"
                />
              </Field>
              <Field label="최대 학생 수">
                <Input
                  type="number"
                  min={0}
                  value={createForm.maxStudents}
                  onChange={(event) =>
                    updateCreateField("maxStudents", event.target.value)
                  }
                  className="h-9 text-[13px]"
                />
              </Field>
              <Field label="최대 직원 수">
                <Input
                  type="number"
                  min={0}
                  value={createForm.maxStaff}
                  onChange={(event) =>
                    updateCreateField("maxStaff", event.target.value)
                  }
                  className="h-9 text-[13px]"
                />
              </Field>
            </div>

            <Field label="상품 설명">
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  updateCreateField("description", event.target.value)
                }
                className="min-h-16 text-[13px]"
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreateForm(EMPTY_CREATE_FORM);
                  setShowCreateForm(false);
                }}
                disabled={creating}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={submitNewPlan}
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {creating ? (
                  <span className="flex items-center gap-1.5">
                    <span className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    추가 중
                  </span>
                ) : (
                  <>
                    <Plus className="size-3.5" />
                    추가
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-3 text-[13px]",
            message.type === "success" &&
              "border-emerald-200 bg-emerald-50 text-emerald-700",
            message.type === "error" &&
              "border-rose-200 bg-rose-50 text-rose-700",
            message.type === "info" &&
              "border-blue-200 bg-blue-50 text-blue-700",
          )}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        {plans.map((plan) => {
          const form = forms[plan.id] ?? planToForm(plan);
          const pricing = getFormPricing(form);
          const expanded = expandedPlanIds.has(plan.id);
          const deleting = deletingPlanId === plan.id;
          const saving = savingPlanId === plan.id || isPending;

          return (
            <Card key={plan.id} className="rounded-xl border-gray-200 bg-white">
              <CardHeader className="gap-3 border-b px-5 pb-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <button
                    type="button"
                    onClick={() => togglePlan(plan.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500">
                      {expanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 space-y-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-[17px] text-gray-900">
                          {form.name || plan.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className="border-gray-200 bg-gray-50 text-gray-600"
                        >
                          {plan.tier}
                        </Badge>
                        <Badge
                          className={cn(
                            form.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-500",
                          )}
                        >
                          {form.isActive ? "노출 중" : "비활성"}
                        </Badge>
                        {form.promotionEnabled && (
                          <Badge className="bg-blue-50 text-blue-700">
                            프로모션
                          </Badge>
                        )}
                      </span>
                      <span className="block text-[13px] text-gray-500">
                        {formatCredits(Number(form.monthlyCredits || 0))} ·{" "}
                        {formatCurrency(pricing.finalPrice)} · 연결 구독{" "}
                        {plan._count.subscriptions.toLocaleString("ko-KR")}건
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {expanded && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeletePlan(plan)}
                        disabled={saving || deleting}
                        className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        {deleting ? (
                          <span className="flex items-center gap-1.5">
                            <span className="size-3.5 rounded-full border-2 border-rose-200 border-t-rose-600 animate-spin" />
                            처리 중
                          </span>
                        ) : (
                          <>
                            <Trash2 className="size-3.5" />
                            삭제
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => resetPlan(plan)}
                      disabled={!expanded || saving || deleting}
                    >
                      <RefreshCw className="size-3.5" />
                      되돌리기
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => submitPlan(plan)}
                      disabled={!expanded || saving || deleting}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {savingPlanId === plan.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          저장 중
                        </span>
                      ) : (
                        <>
                          <Save className="size-3.5" />
                          저장
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expanded && (
              <CardContent className="space-y-6 p-5">
                <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="요금제 이름">
                      <Input
                        value={form.name}
                        onChange={(event) =>
                          updateField(plan.id, "name", event.target.value)
                        }
                        className="h-9 text-[13px]"
                      />
                    </Field>

                    <Field label="월 크레딧 수">
                      <Input
                        type="number"
                        min={0}
                        value={form.monthlyCredits}
                        onChange={(event) =>
                          updateField(
                            plan.id,
                            "monthlyCredits",
                            event.target.value,
                          )
                        }
                        className="h-9 text-[13px]"
                      />
                    </Field>

                    <Field label="월 금액">
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        value={form.monthlyPrice}
                        onChange={(event) =>
                          updateField(plan.id, "monthlyPrice", event.target.value)
                        }
                        className="h-9 text-[13px]"
                      />
                    </Field>

                    <Field label="정렬 순서">
                      <Input
                        type="number"
                        min={0}
                        value={form.sortOrder}
                        onChange={(event) =>
                          updateField(plan.id, "sortOrder", event.target.value)
                        }
                        className="h-9 text-[13px]"
                      />
                    </Field>

                    <Field label="최대 학생 수">
                      <Input
                        type="number"
                        min={0}
                        value={form.maxStudents}
                        onChange={(event) =>
                          updateField(plan.id, "maxStudents", event.target.value)
                        }
                        className="h-9 text-[13px]"
                      />
                    </Field>

                    <Field label="최대 직원 수">
                      <Input
                        type="number"
                        min={0}
                        value={form.maxStaff}
                        onChange={(event) =>
                          updateField(plan.id, "maxStaff", event.target.value)
                        }
                        className="h-9 text-[13px]"
                      />
                    </Field>

                    <Field label="크레딧 이월 정책">
                      <Select
                        value={form.rolloverPolicy}
                        onValueChange={(value) =>
                          updateField(plan.id, "rolloverPolicy", value)
                        }
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLLOVER_POLICY_LABELS).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="최대 이월 비율">
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.rolloverMaxRate}
                        onChange={(event) =>
                          updateField(
                            plan.id,
                            "rolloverMaxRate",
                            event.target.value,
                          )
                        }
                        className="h-9 text-[13px]"
                      />
                    </Field>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-[12px] font-medium text-gray-500">
                      결제 표시 미리보기
                    </p>
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-[12px] text-gray-400">월 제공</p>
                        <p className="text-[18px] font-bold text-gray-900">
                          {formatCredits(Number(form.monthlyCredits || 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-[12px] text-gray-400">최종 결제금액</p>
                        <p className="text-[22px] font-bold text-blue-600">
                          {formatCurrency(pricing.finalPrice)}
                        </p>
                        {form.promotionEnabled && (
                          <p className="mt-1 text-[12px] text-gray-500">
                            정가 {formatCurrency(pricing.price)} · 할인{" "}
                            {formatCurrency(pricing.discountAmount)}
                          </p>
                        )}
                      </div>
                      <div
                        className={cn(
                          "rounded-md border px-3 py-2 text-[12px]",
                          form.promotionEnabled && pricing.hasValidPeriod
                            ? "border-blue-100 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-white text-gray-500",
                        )}
                      >
                        {form.promotionEnabled
                          ? pricing.hasValidPeriod
                            ? pricing.isPromotionActive
                              ? "현재 적용 중인 프로모션입니다."
                              : "프로모션 기간이 예약되어 있습니다."
                            : "프로모션 기간을 확인해주세요."
                          : "프로모션 없음"}
                      </div>
                    </div>
                  </div>
                </div>

                <Field label="요금제 설명">
                  <Textarea
                    value={form.description}
                    onChange={(event) =>
                      updateField(plan.id, "description", event.target.value)
                    }
                    className="min-h-20 text-[13px]"
                  />
                </Field>

                <div className="grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[180px_1fr]">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${plan.id}-active`}
                        checked={form.isActive}
                        onCheckedChange={(checked) =>
                          updateField(plan.id, "isActive", checked === true)
                        }
                      />
                      <Label
                        htmlFor={`${plan.id}-active`}
                        className="text-[13px] font-medium text-gray-700"
                      >
                        요금제 노출
                      </Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${plan.id}-promotion`}
                        checked={form.promotionEnabled}
                        onCheckedChange={(checked) =>
                          updateField(
                            plan.id,
                            "promotionEnabled",
                            checked === true,
                          )
                        }
                      />
                      <Label
                        htmlFor={`${plan.id}-promotion`}
                        className="text-[13px] font-medium text-gray-700"
                      >
                        프로모션 적용
                      </Label>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
                      !form.promotionEnabled && "opacity-55",
                    )}
                  >
                    <Field label="프로모션 이름">
                      <Input
                        value={form.promotionName}
                        onChange={(event) =>
                          updateField(
                            plan.id,
                            "promotionName",
                            event.target.value,
                          )
                        }
                        disabled={!form.promotionEnabled}
                        placeholder="신학기 할인"
                        className="h-9 text-[13px]"
                      />
                    </Field>

                    <Field label="할인율">
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          max={99}
                          value={form.promotionDiscountRate}
                          onChange={(event) =>
                            updateField(
                              plan.id,
                              "promotionDiscountRate",
                              event.target.value,
                            )
                          }
                          disabled={!form.promotionEnabled}
                          className="h-9 pr-8 text-[13px]"
                        />
                        <Percent className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-gray-400" />
                      </div>
                    </Field>

                    <Field label="시작일">
                      <Input
                        type="datetime-local"
                        value={form.promotionStartsAt}
                        onChange={(event) =>
                          updateField(
                            plan.id,
                            "promotionStartsAt",
                            event.target.value,
                          )
                        }
                        disabled={!form.promotionEnabled}
                        className="h-9 text-[13px]"
                      />
                    </Field>

                    <Field label="종료일">
                      <Input
                        type="datetime-local"
                        value={form.promotionEndsAt}
                        onChange={(event) =>
                          updateField(
                            plan.id,
                            "promotionEndsAt",
                            event.target.value,
                          )
                        }
                        disabled={!form.promotionEnabled}
                        className="h-9 text-[13px]"
                      />
                    </Field>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <PlanMeta
                    icon={<Coins className="size-4" />}
                    label="크레딧 단가"
                    value={
                      Number(form.monthlyCredits || 0) > 0
                        ? `${Math.round(
                            pricing.finalPrice /
                              Number(form.monthlyCredits || 1),
                          ).toLocaleString("ko-KR")}원/C`
                        : "-"
                    }
                  />
                  <PlanMeta
                    icon={<CalendarClock className="size-4" />}
                    label="프로모션 기간"
                    value={
                      form.promotionEnabled && form.promotionStartsAt
                        ? `${form.promotionStartsAt.replace("T", " ")} ~ ${
                            form.promotionEndsAt
                              ? form.promotionEndsAt.replace("T", " ")
                              : "미정"
                          }`
                        : "설정 없음"
                    }
                  />
                  <PlanMeta
                    icon={<ShieldCheck className="size-4" />}
                    label="심사 체크"
                    value={
                      form.promotionEnabled
                        ? "정가/할인가/기간 표시 필요"
                        : "정가 기준 표시"
                    }
                  />
                </div>
              </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-md bg-white text-blue-600 shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-[12px] text-gray-500">{label}</p>
        <p className="text-[18px] font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-gray-600">{label}</Label>
      {children}
    </div>
  );
}

function PlanMeta({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[72px] items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-gray-500">{label}</p>
        <p className="truncate text-[13px] font-semibold text-gray-900">
          {value}
        </p>
      </div>
    </div>
  );
}
