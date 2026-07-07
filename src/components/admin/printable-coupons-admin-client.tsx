"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import {
  Coins,
  Percent,
  Banknote,
  Ticket,
  Printer,
  Loader2,
  Pause,
  Play,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterPill } from "@/components/admin/members-list-client/subcomponents";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import {
  effectTypeLabel,
  couponEffectHeadline,
  type PrintableCouponEffectType,
} from "@/lib/printable-coupon-format";
import {
  issuePrintableCouponBatch,
  listPrintableCouponBatches,
  setBatchActive,
  voidPrintableCoupons,
  type BatchListRow,
  type ListBatchesResult,
  type IssuedCouponCard,
} from "@/actions/admin/printable-coupons";

// 인쇄 핸드오프: 발급 응답의 카드(serial+qrImageUrl)를 localStorage에 실어
// bare 인쇄 탭으로 넘긴다(QR 토큰 미저장이라 재조회 불가 → 발급 즉시 인쇄).
const PRINT_STORAGE_PREFIX = "printable-coupon-print:";

export interface PrintHandoff {
  batchName: string;
  title: string;
  effectType: string;
  headline: string;
  description?: string; // 인쇄 카드 하단 안내 문구
  registerBy?: string; // 등록 마감일(표시용, 예 "2026. 7. 8.")
  creditExpiry?: string; // 지급 크레딧 만료일(표시용, CREDIT_GRANT)
  cards: IssuedCouponCard[];
}

const EFFECT_OPTIONS: {
  value: PrintableCouponEffectType;
  label: string;
  hint: string;
}[] = [
  { value: "CREDIT_GRANT", label: "크레딧 지급", hint: "등록 즉시 무료 크레딧" },
  { value: "DISCOUNT_AMOUNT", label: "금액 할인", hint: "충전 결제 N원 할인" },
  { value: "DISCOUNT_PERCENT", label: "정률 할인", hint: "충전 결제 N% 할인" },
];

function openPrintTab(batchId: string, handoff: PrintHandoff) {
  try {
    localStorage.setItem(
      PRINT_STORAGE_PREFIX + batchId,
      JSON.stringify(handoff),
    );
  } catch {
    /* storage full/blocked — 인쇄 탭에서 안내 */
  }
  window.open(`/admin/coupons/print?batchId=${batchId}`, "_blank");
}

export function PrintableCouponsAdminClient({
  initial,
}: {
  initial: ListBatchesResult;
}) {
  const [data, setData] = useState<ListBatchesResult>(initial);
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [effectFilter, setEffectFilter] = useState<string>("all");

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const reload = useCallback(
    (next: { page?: number; search?: string; effectType?: string }) => {
      startTransition(async () => {
        const res = await listPrintableCouponBatches({
          page: next.page ?? 1,
          pageSize: data.pageSize,
          search: next.search ?? search,
          effectType:
            (next.effectType ?? effectFilter) === "all"
              ? undefined
              : next.effectType ?? effectFilter,
        });
        setData(res);
      });
    },
    [data.pageSize, search, effectFilter],
  );

  const { schedule, flush } = useSearchDebounce((value) =>
    reload({ page: 1, search: value }),
  );

  return (
    <div className="space-y-6">
      <IssueForm
        onIssued={(batchId, handoff) => {
          openPrintTab(batchId, handoff);
          reload({ page: 1 });
        }}
      />

      <div className="rounded-2xl border border-gray-100 bg-white">
        {/* 툴바 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill
              label="전체"
              active={effectFilter === "all"}
              onClick={() => {
                setEffectFilter("all");
                reload({ page: 1, effectType: "all" });
              }}
            />
            {EFFECT_OPTIONS.map((o) => (
              <FilterPill
                key={o.value}
                label={o.label}
                active={effectFilter === o.value}
                onClick={() => {
                  setEffectFilter(o.value);
                  reload({ page: 1, effectType: o.value });
                }}
              />
            ))}
          </div>
          <div className="ml-auto">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                schedule(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") flush(search);
              }}
              placeholder="라벨·쿠폰명 검색"
              className="h-8 w-56 rounded-lg border border-gray-200 px-3 text-[12px] outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <BatchTable
          rows={data.rows}
          loading={isPending}
          onToggleActive={(row) => {
            startTransition(async () => {
              const res = await setBatchActive({
                batchId: row.id,
                isActive: !row.isActive,
              });
              if (!res.success) alert(res.error);
              reload({ page: data.page });
            });
          }}
          onVoid={(row) => {
            const active = row.counts.ACTIVE;
            if (active === 0) {
              alert("영구중지할 미등록(ACTIVE) 코드가 없습니다.");
              return;
            }
            if (
              !confirm(
                `이 배치의 미등록 코드 ${active}장을 영구중지합니다(되돌릴 수 없음).\n이미 등록/사용된 코드는 유지됩니다. 계속할까요?`,
              )
            )
              return;
            startTransition(async () => {
              const res = await voidPrintableCoupons({ batchId: row.id });
              if (!res.success) alert(res.error);
              else alert(`${res.voided}장을 영구중지했습니다.`);
              reload({ page: data.page });
            });
          }}
        />

        <AdminPagination
          page={data.page}
          totalPages={totalPages}
          disabled={isPending}
          onChange={(p) => reload({ page: p })}
        />
      </div>
    </div>
  );
}

// ── 발급 폼 ─────────────────────────────────────────────────────────────────

function IssueForm({
  onIssued,
}: {
  onIssued: (batchId: string, handoff: PrintHandoff) => void;
}) {
  const [effectType, setEffectType] =
    useState<PrintableCouponEffectType>("CREDIT_GRANT");
  const [batchName, setBatchName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grantCredits, setGrantCredits] = useState("");
  const [grantExpiryAt, setGrantExpiryAt] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [perAcademyLimit, setPerAcademyLimit] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const num = (s: string): number | undefined => {
    const n = Number(s);
    return s.trim() === "" || Number.isNaN(n) ? undefined : n;
  };

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await issuePrintableCouponBatch({
        batchName,
        title,
        description: description.trim() || undefined,
        effectType,
        grantCredits: effectType === "CREDIT_GRANT" ? num(grantCredits) : undefined,
        grantExpiryAt:
          effectType === "CREDIT_GRANT" && grantExpiryAt
            ? grantExpiryAt
            : undefined,
        discountAmount:
          effectType === "DISCOUNT_AMOUNT" ? num(discountAmount) : undefined,
        discountPercent:
          effectType === "DISCOUNT_PERCENT" ? num(discountPercent) : undefined,
        validUntil: validUntil || undefined,
        quantity: num(quantity) ?? 0,
        perAcademyLimit: num(perAcademyLimit),
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      const b = res.batch;
      const fmtDate = (s: string) => {
        if (!s) return undefined;
        const d = new Date(s);
        return Number.isNaN(d.getTime())
          ? undefined
          : d.toLocaleDateString("ko-KR");
      };
      onIssued(b.batchId, {
        batchName: b.batchName,
        title: b.title,
        effectType: b.effectType,
        description: description.trim() || undefined,
        registerBy: fmtDate(validUntil),
        creditExpiry:
          effectType === "CREDIT_GRANT" ? fmtDate(grantExpiryAt) : undefined,
        headline: couponEffectHeadline({
          effectType: b.effectType,
          grantCredits: num(grantCredits) ?? null,
          discountAmount: num(discountAmount) ?? null,
          discountPercent: num(discountPercent) ?? null,
        }),
        cards: b.cards,
      });
      // 성공 후 값 유지(연속 발급 편의) — 라벨/쿠폰명만 비운다.
      setBatchName("");
      setTitle("");
    } catch {
      setError("발급 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "h-9 w-full rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-blue-400";
  const labelCls = "block text-[12px] font-medium text-gray-500 mb-1";

  return (
    <div
      ref={formRef}
      className="rounded-2xl border border-gray-100 bg-white p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Ticket className="size-4" />
        </div>
        <h2 className="text-[15px] font-bold text-gray-900">쿠폰 발급</h2>
      </div>

      {/* effectType 라디오 */}
      <div className="mb-4">
        <label className={labelCls}>쿠폰 효과</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {EFFECT_OPTIONS.map((o) => {
            const Icon =
              o.value === "CREDIT_GRANT"
                ? Coins
                : o.value === "DISCOUNT_AMOUNT"
                  ? Banknote
                  : Percent;
            const active = effectType === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setEffectType(o.value)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-3 text-left transition",
                  active
                    ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/30"
                    : "border-gray-200 hover:border-gray-300",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-blue-600" : "text-gray-400",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800">
                    {o.label}
                  </p>
                  <p className="truncate text-[11px] text-gray-400">{o.hint}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 효과별 값 */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {effectType === "CREDIT_GRANT" && (
          <>
            <div>
              <label className={labelCls}>지급 크레딧 *</label>
              <input
                type="number"
                min={1}
                value={grantCredits}
                onChange={(e) => setGrantCredits(e.target.value)}
                placeholder="예: 100"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                크레딧 유효 보장일 (선택)
              </label>
              <input
                type="date"
                value={grantExpiryAt}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setGrantExpiryAt(e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                등록한 학원의 <b className="font-semibold text-gray-500">전체 크레딧</b>을 이
                날짜까지 쓸 수 있게 보장합니다(단일 소멸일 모델). 이미 더 늦은
                소멸일이 있으면 그대로 두고 앞당기지 않으며, <b className="font-semibold text-gray-500">비우면 소멸일을 바꾸지 않습니다</b>.
              </p>
            </div>
          </>
        )}
        {effectType === "DISCOUNT_AMOUNT" && (
          <div>
            <label className={labelCls}>할인 금액(원, 100원 단위) *</label>
            <input
              type="number"
              min={100}
              step={100}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              placeholder="예: 5000"
              className={inputCls}
            />
          </div>
        )}
        {effectType === "DISCOUNT_PERCENT" && (
          <div>
            <label className={labelCls}>할인율(%, 1~100) *</label>
            <input
              type="number"
              min={1}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="예: 10"
              className={inputCls}
            />
          </div>
        )}
      </div>

      {/* 공통 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>발급 라벨(관리자용) *</label>
          <input
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="예: 신규가입 쿠폰 2026.07.07"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>쿠폰명(인쇄 카드) *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 스모트 웰컴 쿠폰"
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>설명(선택)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="인쇄 카드 하단 안내 문구"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>발급 장수 (1~500) *</label>
          <input
            type="number"
            min={1}
            max={500}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>학원당 등록 한도</label>
          <input
            type="number"
            min={1}
            value={perAcademyLimit}
            onChange={(e) => setPerAcademyLimit(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>등록 마감일(선택) — 비우면 무기한</label>
          <input
            type="datetime-local"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[12px] font-medium text-rose-600">{error}</p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Printer className="size-4" />
          )}
          발급 후 인쇄
        </button>
      </div>
    </div>
  );
}

// ── 배치 목록 테이블 ────────────────────────────────────────────────────────

function EffectBadge({ effectType }: { effectType: string }) {
  const tone =
    effectType === "CREDIT_GRANT"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-blue-50 text-blue-700";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
        tone,
      )}
    >
      {effectTypeLabel(effectType)}
    </span>
  );
}

function BatchTable({
  rows,
  loading,
  onToggleActive,
  onVoid,
}: {
  rows: BatchListRow[];
  loading: boolean;
  onToggleActive: (row: BatchListRow) => void;
  onVoid: (row: BatchListRow) => void;
}) {
  if (!rows.length) {
    return (
      <div className="px-5 py-16 text-center text-[13px] text-gray-400">
        {loading ? "불러오는 중…" : "발급된 배치가 없습니다."}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left">
        <thead>
          <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <th className="px-5 py-2.5">배치</th>
            <th className="px-3 py-2.5">효과</th>
            <th className="px-3 py-2.5">조건</th>
            <th className="px-3 py-2.5 text-right">발급</th>
            <th className="px-3 py-2.5 text-right">등록</th>
            <th className="px-3 py-2.5 text-right">사용</th>
            <th className="px-3 py-2.5">상태</th>
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody className={cn(loading && "opacity-50")}>
          {rows.map((r) => {
            const claimed = r.counts.CLAIMED + r.counts.USED;
            return (
              <tr
                key={r.id}
                className="border-b border-gray-50 text-[13px] hover:bg-gray-50/60"
              >
                <td className="px-5 py-3">
                  <p className="font-semibold text-gray-800">{r.batchName}</p>
                  <p className="text-[11px] text-gray-400">{r.title}</p>
                </td>
                <td className="px-3 py-3">
                  <EffectBadge effectType={r.effectType} />
                </td>
                <td className="px-3 py-3 text-[12px] text-gray-600">
                  {couponEffectHeadline(r)}
                  {r.effectType === "CREDIT_GRANT" && (
                    <span className="mt-0.5 block text-[11px] text-gray-400">
                      {r.grantExpiryAt
                        ? `${new Date(r.grantExpiryAt).toLocaleDateString("ko-KR")}까지 유효보장`
                        : "소멸일 미변경"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                  {r.quantity}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                  {claimed}
                  <span className="ml-1 text-[11px] text-gray-400">
                    ({r.quantity ? Math.round((claimed / r.quantity) * 100) : 0}%)
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                  {r.counts.USED}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      r.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {r.isActive ? "활성" : "일시중지"}
                  </span>
                  {r.counts.VOID > 0 && (
                    <span className="ml-1.5 text-[11px] text-gray-400">
                      영구중지 {r.counts.VOID}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleActive(r)}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium",
                        r.isActive
                          ? "border-gray-200 text-gray-500 hover:bg-gray-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50",
                      )}
                      title={
                        r.isActive
                          ? "일시중지 — 되돌릴 수 있음(재개 시 등록·사용 부활)"
                          : "활성화(재개)"
                      }
                    >
                      {r.isActive ? (
                        <Pause className="size-3.5" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      {r.isActive ? "일시중지" : "활성"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onVoid(r)}
                      disabled={r.counts.ACTIVE === 0}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-200 px-2 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      title="미등록 코드 영구중지 — 되돌릴 수 없음(이미 등록/사용분은 유지)"
                    >
                      <Ban className="size-3.5" />
                      영구중지
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
