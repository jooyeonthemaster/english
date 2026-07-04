"use client";

// ============================================================================
// 프로모션 관리(/admin/promotions) — 전 상품의 프로모션을 한 리스트로 관리하고,
// 여러 프로모션을 한 링크·한 랜딩으로 묶는 "번들"을 관리한다.
//   · 프로모션 편집 모달은 상품 관리에 있던 것을 그대로 재사용(credit-promotion-editor).
//   · 프로모션 CRUD 액션도 기존 것 재사용 — 로직 변경 없음.
// ============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Link2,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { setCreditPromotionActive } from "@/actions/admin/credit-products";
import {
  getBundles,
  createBundle,
  updateBundle,
  deleteBundle,
  toggleBundleActive,
  type AdminBundleView,
} from "@/actions/admin/credit-promotion-bundles";
import type {
  AdminCreditProductView,
  AdminPromotionView,
} from "@/lib/credit-top-up-products";
import {
  AdminField,
  PromotionEditor,
  ToggleSwitch,
  formatDate,
  type PromoAcademy,
} from "@/components/admin/credit-promotion-editor";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PromoMonitoringPanel } from "@/components/admin/promo-monitoring-panel";
import type { PromoMonitoringPayload } from "@/actions/admin/credit-promotion-monitoring";

type PromotionRow = {
  product: AdminCreditProductView;
  promo: AdminPromotionView;
};

const INPUT_CLS =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300";

function discountLabel(p: {
  discountType: string;
  discountValue: number;
}): string | null {
  if (p.discountValue <= 0) return null;
  return p.discountType === "AMOUNT"
    ? `${p.discountValue.toLocaleString("ko-KR")}원 할인`
    : `${p.discountValue}% 할인`;
}

function bonusLabel(p: {
  bonusType: string;
  bonusValue: number;
}): string | null {
  if (p.bonusValue <= 0) return null;
  return p.bonusType === "AMOUNT"
    ? `크레딧 +${p.bonusValue.toLocaleString("ko-KR")}C`
    : `크레딧 +${p.bonusValue}%`;
}

function audienceLabel(p: AdminPromotionView): string {
  if (p.audience !== "TARGETED") return "전체 공개";
  return p.targetAcademyIds.length > 0
    ? `지정 ${p.targetAcademyIds.length}곳`
    : "지정/링크";
}

/** 진행 중(기간 내) / 기간 외(활성이나 기간 밖·혜택 없음) / 비활성. */
function StatusBadge({ promo }: { promo: AdminPromotionView }) {
  if (promo.isInWindow) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
        진행 중
      </span>
    );
  }
  if (promo.isActive) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
        기간 외
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-400">
      비활성
    </span>
  );
}

/** 클립보드 복사 버튼(복사됨 피드백 포함). */
function CopyLinkButton({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard 미지원 무시 */
        }
      }}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50"
    >
      {copied ? (
        <Check className="size-3 text-emerald-600" strokeWidth={2.4} />
      ) : (
        <Copy className="size-3" strokeWidth={2} />
      )}
      {copied ? "복사됨" : label ?? "복사"}
    </button>
  );
}

interface Props {
  initialProducts: AdminCreditProductView[];
  academies: PromoAcademy[];
  initialBundles: AdminBundleView[];
  initialMonitoring: PromoMonitoringPayload;
}

export function PromotionsAdminClient({
  initialProducts,
  academies,
  initialBundles,
  initialMonitoring,
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [bundles, setBundles] = useState(initialBundles);
  const [tab, setTab] = useState<"promotions" | "bundles" | "monitoring">(
    "promotions",
  );
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // 프로모션 편집(기존) / 추가(신규, 상품 선택 포함) 모달.
  const [editing, setEditing] = useState<PromotionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [createProductId, setCreateProductId] = useState(
    initialProducts[0]?.id ?? "",
  );

  // 번들 편집 모달: undefined=닫힘, null=신규, AdminBundleView=기존 편집.
  const [editingBundle, setEditingBundle] = useState<
    AdminBundleView | null | undefined
  >(undefined);

  const [, startBundlesRefresh] = useTransition();

  const rows = useMemo<PromotionRow[]>(
    () =>
      products.flatMap((product) =>
        product.promotions.map((promo) => ({ product, promo })),
      ),
    [products],
  );

  // 프로모션 변경 후 서버가 돌려준 최신 상품으로 교체 + 번들 요약도 갱신
  // (번들 카드가 프로모션 이름/혜택을 비정규화해 보여주므로).
  function replaceProduct(updated: AdminCreditProductView) {
    setProducts((current) =>
      current
        .map((item) => (item.id === updated.id ? updated : item))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
    startBundlesRefresh(async () => {
      try {
        setBundles(await getBundles());
      } catch {
        /* 요약 갱신 실패는 치명적이지 않음 — 새로고침 시 복구 */
      }
    });
  }

  const createProduct =
    products.find((p) => p.id === createProductId) ?? products[0] ?? null;

  return (
    <div className="space-y-5">
      {/* 서브탭: [프로모션] [번들] [모니터링] */}
      <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {(
          [
            { key: "promotions", label: "프로모션", icon: Tag },
            { key: "bundles", label: "번들", icon: Boxes },
            { key: "monitoring", label: "모니터링", icon: BarChart3 },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition-colors",
              tab === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800",
            )}
          >
            <t.icon className="size-3.5" strokeWidth={2} />
            {t.label}
            {t.key !== "monitoring" && (
              <span className="text-[11px] font-bold tabular-nums text-gray-400">
                {t.key === "promotions" ? rows.length : bundles.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "promotions" && (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-[15px] font-semibold text-gray-900">
                전체 프로모션
              </h2>
              <p className="text-[12px] leading-5 text-gray-500">
                모든 충전 상품의 프로모션을 한 곳에서 관리합니다. 한 상품에 여러
                개가 겹치면{" "}
                <b className="text-gray-600">
                  링크 우선 → 우선순위 높은 순 → 혜택 큰 순
                </b>
                으로 하나가 적용됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <Plus className="size-3.5" strokeWidth={2.4} />
              프로모션 추가
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="px-5 py-16 text-center text-[13px] text-gray-400">
              등록된 프로모션이 없습니다. 우측 상단 버튼으로 추가하세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/60 text-[11px] font-semibold text-gray-400">
                    <th className="px-5 py-3">상품</th>
                    <th className="px-4 py-3">프로모션명</th>
                    <th className="px-4 py-3">할인</th>
                    <th className="px-4 py-3">보너스</th>
                    <th className="px-4 py-3">기간</th>
                    <th className="px-4 py-3">대상</th>
                    <th className="px-4 py-3">링크</th>
                    <th className="px-4 py-3 text-right">우선순위</th>
                    <th className="px-5 py-3">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(({ product, promo }) => (
                    <tr
                      key={promo.id}
                      onClick={() => setEditing({ product, promo })}
                      className="cursor-pointer transition hover:bg-blue-50/30"
                    >
                      <td className="px-5 py-3">
                        <div className="text-[13px] font-semibold text-gray-900">
                          {product.name}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {product.creditAmount.toLocaleString("ko-KR")}C ·{" "}
                          {product.basePrice.toLocaleString("ko-KR")}원
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">
                          {promo.name?.trim() || "이름 없는 프로모션"}
                          <Pencil
                            className="size-3 text-gray-300"
                            strokeWidth={2}
                          />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] font-semibold text-rose-600">
                        {discountLabel(promo) ?? (
                          <span className="font-normal text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-semibold text-emerald-600">
                        {bonusLabel(promo) ?? (
                          <span className="font-normal text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] tabular-nums text-gray-500">
                        {formatDate(promo.startsAt)}
                        <br />~ {formatDate(promo.endsAt)}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-500">
                        {audienceLabel(promo)}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {promo.linkToken ? (
                          <CopyLinkButton
                            url={`${origin}/credits/promo/${promo.linkToken}`}
                          />
                        ) : (
                          <span className="text-[12px] text-gray-300">없음</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] font-medium tabular-nums text-gray-600">
                        {promo.priority}
                      </td>
                      <td
                        className="px-5 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2.5">
                          <PromotionActiveToggle
                            promo={promo}
                            onProductChange={replaceProduct}
                          />
                          <StatusBadge promo={promo} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "bundles" && (
        <BundlesSection
          bundles={bundles}
          origin={origin}
          onOpenEditor={(bundle) => setEditingBundle(bundle)}
          onBundlesChange={setBundles}
        />
      )}

      {tab === "monitoring" && (
        <PromoMonitoringPanel initial={initialMonitoring} />
      )}

      {/* 프로모션 편집 모달(기존 편집기 재사용) */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing && (
          <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto sm:max-w-[560px]">
            <DialogTitle className="text-[15px] font-semibold text-gray-900">
              프로모션 편집
              <span className="ml-2 text-[12px] font-medium text-gray-400">
                {editing.product.name}
              </span>
            </DialogTitle>
            <PromotionEditor
              key={editing.promo.id}
              bare
              productId={editing.product.id}
              creditAmount={editing.product.creditAmount}
              basePrice={editing.product.basePrice}
              promotion={editing.promo}
              academies={academies}
              onProductChange={(u) => {
                replaceProduct(u);
                setEditing(null);
              }}
              onCancelDraft={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>

      {/* 프로모션 추가 모달 — 어느 상품에 붙일지 선택 후 기존 편집기 사용 */}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
      >
        {creating && createProduct && (
          <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto sm:max-w-[560px]">
            <DialogTitle className="text-[15px] font-semibold text-gray-900">
              프로모션 추가
            </DialogTitle>
            <AdminField label="적용 상품">
              <select
                value={createProduct.id}
                onChange={(e) => setCreateProductId(e.target.value)}
                className={INPUT_CLS}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.creditAmount.toLocaleString("ko-KR")}C ·{" "}
                    {p.basePrice.toLocaleString("ko-KR")}원
                  </option>
                ))}
              </select>
            </AdminField>
            <PromotionEditor
              bare
              productId={createProduct.id}
              creditAmount={createProduct.creditAmount}
              basePrice={createProduct.basePrice}
              promotion={null}
              academies={academies}
              onProductChange={(u) => {
                replaceProduct(u);
                setCreating(false);
              }}
              onCancelDraft={() => setCreating(false)}
            />
          </DialogContent>
        )}
      </Dialog>

      {/* 번들 생성/편집 모달 */}
      <Dialog
        open={editingBundle !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingBundle(undefined);
        }}
      >
        {editingBundle !== undefined && (
          <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto sm:max-w-[640px]">
            <DialogTitle className="text-[15px] font-semibold text-gray-900">
              {editingBundle ? "번들 편집" : "번들 만들기"}
            </DialogTitle>
            <BundleEditor
              key={editingBundle?.id ?? "new"}
              bundle={editingBundle}
              products={products}
              origin={origin}
              onSaved={(next) => {
                setBundles(next);
                setEditingBundle(undefined);
              }}
              onClose={() => setEditingBundle(undefined)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** 리스트 행의 활성 토글 — 모달 없이 즉시 서버 반영(기존 액션 재사용). */
function PromotionActiveToggle({
  promo,
  onProductChange,
}: {
  promo: AdminPromotionView;
  onProductChange: (updated: AdminCreditProductView) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <ToggleSwitch
      checked={promo.isActive}
      disabled={pending}
      text=""
      label={`${promo.name ?? "프로모션"} 활성`}
      onChange={(next) => {
        if (pending) return;
        startTransition(async () => {
          const res = await setCreditPromotionActive(promo.id, next);
          if (res.success && res.product) onProductChange(res.product);
        });
      }}
    />
  );
}

// ============================================================================
// 번들 섹션 — 목록 + 활성 토글 + 링크 복사.
// ============================================================================

function BundlesSection({
  bundles,
  origin,
  onOpenEditor,
  onBundlesChange,
}: {
  bundles: AdminBundleView[];
  origin: string;
  onOpenEditor: (bundle: AdminBundleView | null) => void;
  onBundlesChange: (bundles: AdminBundleView[]) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleActive(bundle: AdminBundleView, next: boolean) {
    if (pendingId) return;
    setPendingId(bundle.id);
    setMessage(null);
    startTransition(async () => {
      const res = await toggleBundleActive(bundle.id, next);
      if (res.success && res.bundles) onBundlesChange(res.bundles);
      else setMessage(res.error ?? "상태 변경에 실패했습니다.");
      setPendingId(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-gray-900">
            프로모션 번들
          </h2>
          <p className="text-[12px] leading-5 text-gray-500">
            여러 프로모션을 <b className="text-gray-600">한 링크·한 페이지</b>로
            묶어 노출합니다. 방문자가 &ldquo;혜택 받기&rdquo;를 누르면 번들에 담긴 모든
            프로모션이 함께 적용됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenEditor(null)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          <Plus className="size-3.5" strokeWidth={2.4} />
          번들 만들기
        </button>
      </div>

      {message && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
          <AlertTriangle className="size-4" strokeWidth={2} />
          {message}
        </div>
      )}

      {bundles.length === 0 ? (
        <div className="px-5 py-16 text-center text-[13px] text-gray-400">
          만들어진 번들이 없습니다. 프로모션을 묶어 첫 번들을 만들어보세요.
        </div>
      ) : (
        <div className="grid gap-3 p-5">
          {bundles.map((bundle) => {
            const runningCount = bundle.items.filter(
              (i) => i.isInWindow,
            ).length;
            const bundleUrl = `${origin}/credits/promo/b/${bundle.slug}`;
            return (
              <div
                key={bundle.id}
                className={cn(
                  "rounded-xl border p-4 transition",
                  bundle.isActive && runningCount > 0
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-gray-200 bg-gray-50/40",
                  !bundle.isActive && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenEditor(bundle)}
                    className="min-w-0 flex-1 text-left outline-none"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[14px] font-bold text-gray-900">
                        {bundle.name}
                      </span>
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-500">
                        /b/{bundle.slug}
                      </span>
                      {bundle.isActive ? (
                        runningCount > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            진행 중 {runningCount}개
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            유효 프로모션 없음
                          </span>
                        )
                      ) : (
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
                          비활성
                        </span>
                      )}
                    </div>
                    {bundle.description && (
                      <p className="mt-1 line-clamp-1 text-[12px] text-gray-500">
                        {bundle.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {bundle.items.map((item) => (
                        <span
                          key={item.promotionId}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            item.isInWindow
                              ? "bg-blue-50 text-blue-700"
                              : "bg-gray-100 text-gray-400",
                          )}
                        >
                          {item.productName}
                          <span className="text-[10px] opacity-70">
                            {item.promotionName?.trim() || "이름 없음"}
                          </span>
                        </span>
                      ))}
                    </div>
                  </button>

                  <div
                    className="flex shrink-0 items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CopyLinkButton url={bundleUrl} label="링크 복사" />
                    <ToggleSwitch
                      checked={bundle.isActive}
                      disabled={pendingId === bundle.id}
                      text="활성"
                      label={`${bundle.name} 활성`}
                      onChange={(next) => toggleActive(bundle, next)}
                    />
                    <button
                      type="button"
                      onClick={() => onOpenEditor(bundle)}
                      aria-label="번들 편집"
                      className="rounded-md p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Pencil className="size-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 번들 편집기 — 이름/slug/설명/활성 + 포함 프로모션 다중 선택(순서 지정).
// ============================================================================

function BundleEditor({
  bundle,
  products,
  origin,
  onSaved,
  onClose,
}: {
  bundle: AdminBundleView | null;
  products: AdminCreditProductView[];
  origin: string;
  onSaved: (bundles: AdminBundleView[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(bundle?.name ?? "");
  const [slug, setSlug] = useState(bundle?.slug ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [isActive, setIsActive] = useState(bundle?.isActive ?? true);
  const [promotionIds, setPromotionIds] = useState<string[]>(
    bundle ? bundle.items.map((i) => i.promotionId) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // promotionId → 표시 정보(현재 products 상태 우선, 없으면 번들 스냅샷 폴백).
  const promoInfo = useMemo(() => {
    const map = new Map<
      string,
      {
        productName: string;
        promotionName: string | null;
        discountType: string;
        discountValue: number;
        bonusType: string;
        bonusValue: number;
        isInWindow: boolean;
      }
    >();
    for (const item of bundle?.items ?? []) {
      map.set(item.promotionId, item);
    }
    for (const product of products) {
      for (const promo of product.promotions) {
        map.set(promo.id, {
          productName: product.name,
          promotionName: promo.name,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          bonusType: promo.bonusType,
          bonusValue: promo.bonusValue,
          isInWindow: promo.isInWindow,
        });
      }
    }
    return map;
  }, [products, bundle]);

  const available = useMemo(() => {
    const selected = new Set(promotionIds);
    return products.flatMap((product) =>
      product.promotions
        .filter((promo) => !selected.has(promo.id))
        .map((promo) => ({ product, promo })),
    );
  }, [products, promotionIds]);

  function move(index: number, delta: -1 | 1) {
    setPromotionIds((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const payload = {
        name,
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        isActive,
        promotionIds,
      };
      const res = bundle
        ? await updateBundle(bundle.id, payload)
        : await createBundle(payload);
      if (!res.success || !res.bundles) {
        setError(res.error ?? "번들을 저장하지 못했습니다.");
        return;
      }
      onSaved(res.bundles);
    });
  }

  function remove() {
    if (!bundle || pending) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteBundle(bundle.id);
      if (res.success && res.bundles) onSaved(res.bundles);
      else setError(res.error ?? "번들을 삭제하지 못했습니다.");
    });
  }

  const bundleUrl = `${origin}/credits/promo/b/${slug.trim() || bundle?.slug || "..."}`;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <AdminField label="번들 이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 신학기 패키지"
            className={INPUT_CLS}
          />
        </AdminField>
        <AdminField label="링크 주소 (slug)">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="비우면 이름으로 자동 생성"
            className={cn(INPUT_CLS, "font-mono")}
          />
          <p className="mt-1 text-[11px] leading-4 text-gray-400">
            영문 소문자·숫자·하이픈. 링크: /credits/promo/b/{"{slug}"}
          </p>
        </AdminField>
      </div>

      <AdminField label="설명 (선택)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="랜딩 페이지 상단에 함께 노출됩니다."
          className="min-h-14 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none transition focus:border-blue-300"
        />
      </AdminField>

      {/* 포함 프로모션 — 순서 = 랜딩 노출 순서 */}
      <div className="space-y-1.5">
        <span className="text-[12px] font-semibold text-gray-500">
          포함 프로모션 ({promotionIds.length}개) — 순서대로 랜딩에 노출
        </span>
        {promotionIds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-[12px] text-gray-400">
            아래 목록에서 프로모션을 추가하세요.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {promotionIds.map((id, index) => {
              const info = promoInfo.get(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <span className="w-5 shrink-0 text-center text-[11px] font-bold tabular-nums text-gray-400">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-gray-800">
                      {info?.productName ?? "삭제된 프로모션"}
                      <span className="ml-1.5 font-medium text-gray-400">
                        {info?.promotionName?.trim() || "이름 없음"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-2 text-[11px]">
                      {info && discountLabel(info) && (
                        <span className="font-semibold text-rose-600">
                          {discountLabel(info)}
                        </span>
                      )}
                      {info && bonusLabel(info) && (
                        <span className="font-semibold text-emerald-600">
                          {bonusLabel(info)}
                        </span>
                      )}
                      {info && !info.isInWindow && (
                        <span className="text-gray-400">
                          지금은 기간 외 — 랜딩에 노출되지 않음
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="위로"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ChevronUp className="size-3.5" strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === promotionIds.length - 1}
                      aria-label="아래로"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ChevronDown className="size-3.5" strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPromotionIds((prev) => prev.filter((x) => x !== id))
                      }
                      aria-label="빼기"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-rose-600"
                    >
                      <X className="size-3.5" strokeWidth={2.2} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {available.length > 0 && (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/60 p-2">
            {available.map(({ product, promo }) => (
              <button
                key={promo.id}
                type="button"
                onClick={() =>
                  setPromotionIds((prev) => [...prev, promo.id])
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white"
              >
                <Plus className="size-3.5 shrink-0 text-blue-500" strokeWidth={2.4} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-gray-700">
                  <b>{product.name}</b>
                  <span className="ml-1.5 text-gray-500">
                    {promo.name?.trim() || "이름 없음"}
                  </span>
                  <span className="ml-1.5 text-[11px] text-gray-400">
                    {[discountLabel(promo), bonusLabel(promo)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {promo.isInWindow && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    진행 중
                  </span>
                )}
                {!promo.linkToken && (
                  <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                    저장 시 링크 자동 발급
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 truncate font-mono text-[11px] text-gray-500">
          <Link2 className="size-3.5 shrink-0" strokeWidth={2} />
          {bundleUrl}
        </span>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-medium text-gray-500">
          활성
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-blue-600"
          />
        </label>
      </div>

      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}

      <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
        <div>
          {bundle ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-medium disabled:opacity-50",
                confirmDelete
                  ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                  : "text-gray-400 hover:text-rose-600",
              )}
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              {confirmDelete ? "정말 삭제할까요?" : "삭제"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
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
            <ShieldCheck className="size-3.5" strokeWidth={2.2} />
          )}
          {bundle ? "저장" : "번들 만들기"}
        </button>
      </div>
    </div>
  );
}
