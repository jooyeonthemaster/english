"use client";

// ============================================================================
// 프로모션 편집 공용 컴포넌트 — credit-topups-admin-client.tsx 에 있던 편집 모달
// 내용물을 그대로 옮긴 것(로직 무변경). /admin/promotions(프로모션 관리)와
// 상품 관리가 함께 쓰는 폼 유틸(AdminField/ToggleSwitch)도 여기서 export 한다.
// ============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  upsertCreditPromotion,
  deleteCreditPromotion,
  generateCreditPromotionLink,
  clearCreditPromotionLink,
} from "@/actions/admin/credit-products";
import type {
  AdminCreditProductView,
  AdminPromotionView,
} from "@/lib/credit-top-up-products";
import { BannerTargetPicker } from "@/components/admin/banners/banner-target-picker";
import { cn } from "@/lib/utils";

export type PromoAcademy = { academyId: string; name: string; slug: string };

export function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

// datetime-local 입력값(타임존 없는 벽시계 문자열)을 절대 시각(UTC ISO)으로 변환.
// 브라우저에서 실행되므로 관리자의 실제 타임존으로 해석된다 → 서버 타임존(UTC 등)에
// 상관없이 항상 같은 순간이 저장된다. (예전엔 서버에서 new Date(문자열)로 파싱해
// 프로덕션 UTC 서버에서 KST 관리자의 입력이 9시간 어긋나 "저장이 안 되는" 것처럼 보였음.)
export function fromDatetimeLocal(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// datetime-local 기본값(신규 프로모션): 지금 ~ +7일.
function nowDatetimeLocal(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatDate(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 개별 프로모션 편집 폼(신규/기존 공용). bare=팝오버(모달) 안에서 테두리 없이 사용. */
export function PromotionEditor({
  productId,
  creditAmount,
  basePrice,
  promotion,
  academies,
  onProductChange,
  onCancelDraft,
  bare = false,
}: {
  productId: string;
  creditAmount: number;
  basePrice: number;
  promotion: AdminPromotionView | null;
  academies: PromoAcademy[];
  onProductChange: (updated: AdminCreditProductView) => void;
  onCancelDraft?: () => void;
  bare?: boolean;
}) {
  const [name, setName] = useState(promotion?.name ?? "");
  const [discountType, setDiscountType] = useState<"PERCENT" | "AMOUNT">(
    promotion?.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
  );
  const [discountValue, setDiscountValue] = useState(
    String(promotion?.discountValue ?? 0),
  );
  const [bonusType, setBonusType] = useState<"PERCENT" | "AMOUNT">(
    promotion?.bonusType === "AMOUNT" ? "AMOUNT" : "PERCENT",
  );
  const [bonusValue, setBonusValue] = useState(
    String(promotion?.bonusValue ?? 0),
  );
  const [startsAt, setStartsAt] = useState(
    promotion ? toDatetimeLocal(promotion.startsAt) : nowDatetimeLocal(0),
  );
  const [endsAt, setEndsAt] = useState(
    promotion ? toDatetimeLocal(promotion.endsAt) : nowDatetimeLocal(7),
  );
  const [audience, setAudience] = useState<"ALL" | "TARGETED">(
    promotion?.audience === "TARGETED" ? "TARGETED" : "ALL",
  );
  const [priority, setPriority] = useState(String(promotion?.priority ?? 0));
  const [isActive, setIsActive] = useState(promotion?.isActive ?? true);
  const [targetAcademyIds, setTargetAcademyIds] = useState<string[]>(
    promotion?.targetAcademyIds ?? [],
  );
  const [linkToken, setLinkToken] = useState<string | null>(
    promotion?.linkToken ?? null,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [linkPending, startLinkTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const promotionId = promotion?.id ?? null;
  const nameById = useMemo(
    () => new Map(academies.map((a) => [a.academyId, a.name])),
    [academies],
  );
  const dV = Number(discountValue || 0);
  const bV = Number(bonusValue || 0);
  const pricePreview =
    dV <= 0
      ? null
      : discountType === "AMOUNT"
        ? Math.max(0, basePrice - dV)
        : dV >= 100
          ? 0
          : Math.round((basePrice * (100 - dV)) / 100);
  const grantedPreview =
    bV <= 0
      ? creditAmount
      : bonusType === "AMOUNT"
        ? creditAmount + bV
        : Math.round((creditAmount * (100 + bV)) / 100);
  const linkUrl = linkToken ? `${origin}/credits/promo/${linkToken}` : "";
  const selectedCount = targetAcademyIds.length;
  const inputCls =
    "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300";

  function save() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertCreditPromotion({
        productId,
        id: promotionId ?? undefined,
        name,
        discountType,
        discountValue: Number(discountValue || 0),
        bonusType,
        bonusValue: Number(bonusValue || 0),
        // 벽시계 → 절대 시각(UTC ISO). 서버 타임존에 의존하지 않도록 클라이언트에서 변환.
        startsAt: fromDatetimeLocal(startsAt),
        endsAt: fromDatetimeLocal(endsAt),
        audience,
        priority: Number(priority || 0),
        isActive,
        targetAcademyIds,
      });
      if (!res.success || !res.product) {
        setError(res.error ?? "저장에 실패했습니다.");
        return;
      }
      onProductChange(res.product);
    });
  }
  function remove() {
    if (!promotionId || pending) return;
    startTransition(async () => {
      const res = await deleteCreditPromotion(promotionId);
      if (res.success && res.product) onProductChange(res.product);
      else setError(res.error ?? "삭제에 실패했습니다.");
    });
  }
  function genLink() {
    if (!promotionId || linkPending) return;
    startLinkTransition(async () => {
      const res = await generateCreditPromotionLink(promotionId);
      if (res.success && res.token) setLinkToken(res.token);
    });
  }
  function clearLink() {
    if (!promotionId || linkPending) return;
    startLinkTransition(async () => {
      const res = await clearCreditPromotionLink(promotionId);
      if (res.success) setLinkToken(null);
    });
  }
  async function copyLink() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 미지원 무시 */
    }
  }

  return (
    <div
      className={cn(
        bare
          ? "space-y-3"
          : cn(
              "space-y-3 rounded-xl border p-3",
              promotion?.isInWindow
                ? "border-emerald-200 bg-emerald-50/30"
                : "border-gray-200 bg-gray-50/40",
            ),
      )}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
          <Tag className="size-3.5 text-gray-400" strokeWidth={2} />
          {name.trim() || (promotion ? "이름 없는 프로모션" : "새 프로모션")}
          {promotion?.isInWindow && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              진행 중
            </span>
          )}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-gray-500">
          활성
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-blue-600"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_120px]">
        <AdminField label="프로모션 이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 신학기 할인"
            className={inputCls}
          />
        </AdminField>
        <AdminField label="우선순위">
          <input
            type="number"
            min={0}
            max={999}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={inputCls}
          />
        </AdminField>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AdminField
          label={discountType === "AMOUNT" ? "할인 금액 (결제금액 ↓)" : "할인율 (결제금액 ↓)"}
        >
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
                className={cn(inputCls, "pr-8")}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400">
                {discountType === "AMOUNT" ? "원" : "%"}
              </span>
            </div>
            <UnitToggle value={discountType} onChange={setDiscountType} />
          </div>
          {pricePreview !== null && (
            <p className="mt-1 text-[11px] font-medium text-rose-600">
              {basePrice.toLocaleString("ko-KR")}원 →{" "}
              <span className="font-bold">
                {pricePreview.toLocaleString("ko-KR")}원
              </span>{" "}
              (−{(basePrice - pricePreview).toLocaleString("ko-KR")}원)
            </p>
          )}
        </AdminField>
        <AdminField
          label={bonusType === "AMOUNT" ? "추가 지급 크레딧 (크레딧 ↑)" : "크레딧 추가 지급률 (크레딧 ↑)"}
        >
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                value={bonusValue}
                onChange={(e) => setBonusValue(e.target.value)}
                placeholder="0"
                className={cn(inputCls, "pr-8")}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400">
                {bonusType === "AMOUNT" ? "C" : "%"}
              </span>
            </div>
            <UnitToggle value={bonusType} onChange={setBonusType} />
          </div>
          {bV > 0 && (
            <p className="mt-1 text-[11px] font-medium text-emerald-600">
              {creditAmount.toLocaleString("ko-KR")}C →{" "}
              <span className="font-bold">
                {grantedPreview.toLocaleString("ko-KR")}C
              </span>{" "}
              (+{(grantedPreview - creditAmount).toLocaleString("ko-KR")}C)
            </p>
          )}
        </AdminField>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AdminField label="시작일">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={inputCls}
          />
        </AdminField>
        <AdminField label="종료일">
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={inputCls}
          />
        </AdminField>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-gray-500">노출 대상</span>
        {(
          [
            { key: "ALL", label: "전체 공개" },
            { key: "TARGETED", label: "지정 학원/링크" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={audience === opt.key}
            onClick={() => setAudience(opt.key)}
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium transition-colors",
              audience === opt.key
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {audience === "TARGETED" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
              <Users className="size-3.5" strokeWidth={2} />
              지정 학원 {selectedCount > 0 && `· ${selectedCount}곳`}
            </span>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => setTargetAcademyIds([])}
                className="text-[11px] text-gray-400 hover:text-rose-500"
              >
                전체 해제
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Users className="size-3.5 text-gray-400" strokeWidth={2} />
            {selectedCount > 0 ? `학원 ${selectedCount}곳 · 변경` : "학원 선택"}
          </button>
          {selectedCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {targetAcademyIds.slice(0, 12).map((id) => {
                const nm = nameById.get(id) ?? id;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                  >
                    {nm}
                    <button
                      type="button"
                      onClick={() =>
                        setTargetAcademyIds((prev) => prev.filter((x) => x !== id))
                      }
                      aria-label={`${nm} 제거`}
                      className="text-blue-400 hover:text-blue-700"
                    >
                      <X className="size-3" strokeWidth={2.4} />
                    </button>
                  </span>
                );
              })}
              {selectedCount > 12 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                  +{selectedCount - 12}곳
                </span>
              )}
            </div>
          )}
          <BannerTargetPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            audiences={["DIRECTOR"]}
            targetMode="SPECIFIC"
            selectedIds={targetAcademyIds}
            onConfirm={(sel) => setTargetAcademyIds(sel.academyIds)}
            hideRole
            hideScope
            title="지정 학원 선택"
          />
        </div>
      )}

      {promotionId ? (
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
            <Link2 className="size-3.5" strokeWidth={2} />
            프로모션 링크
          </span>
          {linkToken ? (
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={linkUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-[12px] text-gray-600 outline-none"
              />
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] text-gray-600 hover:bg-gray-50"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-600" strokeWidth={2.4} />
                ) : (
                  <Copy className="size-3.5" strokeWidth={2} />
                )}
                {copied ? "복사됨" : "복사"}
              </button>
              <button
                type="button"
                onClick={clearLink}
                disabled={linkPending}
                className="inline-flex h-9 shrink-0 items-center rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] text-gray-500 hover:text-rose-600 disabled:opacity-50"
              >
                {linkPending ? (
                  <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                ) : (
                  "제거"
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={genLink}
              disabled={linkPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {linkPending ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <Link2 className="size-3.5" strokeWidth={2} />
              )}
              링크 생성
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">
          공유 링크는 프로모션을 저장한 뒤 생성할 수 있어요.
        </p>
      )}

      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}

      <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
        <div>
          {promotionId ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-gray-400 hover:text-rose-600 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              삭제
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancelDraft}
              disabled={pending}
              className="inline-flex h-8 items-center rounded-lg px-2 text-[12px] font-medium text-gray-400 hover:text-gray-700 disabled:opacity-50"
            >
              취소
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Check className="size-3.5" strokeWidth={2.4} />
          )}
          {promotionId ? "저장" : "프로모션 저장"}
        </button>
      </div>
    </div>
  );
}

/** 퍼센트/정액 단위 선택 토글(할인·크레딧 지급 공용). */
function UnitToggle({
  value,
  onChange,
}: {
  value: "PERCENT" | "AMOUNT";
  onChange: (v: "PERCENT" | "AMOUNT") => void;
}) {
  return (
    <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-lg border border-gray-200">
      {(
        [
          { key: "PERCENT", label: "%" },
          { key: "AMOUNT", label: "정액" },
        ] as const
      ).map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "px-2.5 text-[12px] font-semibold transition-colors",
            value === o.key
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** on/off 스위치(키컬러 블루). text=옆에 붙는 라벨(기본 "노출"). */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  text = "노출",
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  text?: string;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text && (
        <span className="text-[12px] font-medium text-gray-500">{text}</span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50",
          checked ? "bg-blue-600" : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </span>
  );
}

export function AdminField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[12px] font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  );
}
