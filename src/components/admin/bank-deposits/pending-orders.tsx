"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Banknote, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BANK_DEPOSIT_MATCH_WINDOW_MINUTES,
  TOPUP_PROGRESS_ACTIVE_LABEL,
  TOPUP_PROGRESS_STALE_LABEL,
  classifyTopUpProgress,
  topUpStaleTitle,
} from "@/lib/admin-topup-progress";

// ---------------------------------------------------------------------------
// 무통장 「입금 대기 주문」 표시 전용 조각 — 목록/연결 두 패널이 함께 쓴다.
// 여기서는 DB 상태를 바꾸지 않는다(spec §9.2 D3). 표시·경고만.
// ---------------------------------------------------------------------------

export type PendingOrder = {
  id: string;
  price: number;
  creditAmount: number;
  depositorName: string | null;
  academyName: string;
  createdAt: string;
  /**
   * 서버(자동 매칭기와 같은 env)가 본 시간창 초과 여부. 표시 판정은 공용 헬퍼 classifyTopUpProgress
   * 가 하므로(A5-3) 화면은 이 값을 쓰지 않는다 — 응답 계약과 meta.expired 집계의 근거로만 남긴다.
   */
  expired: boolean;
  /** 같은 금액·입금자명인데 어느 주문에도 연결되지 않은 「이미 처리된 입금」(A5-2) */
  settledDeposit: { status: string; receivedAt: string } | null;
};

/** 입금 대기 주문 전체 규모 — 목록은 최근 limit 건까지만 내려온다(F18) */
export type PendingOrdersMeta = {
  total: number;
  active: number;
  expired: number;
  limit: number;
  matchWindowMinutes: number;
};

export const KST_SHORT: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Seoul",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

// RC-PENDING: 미완료 결제 자구를 화면마다 다르게 쓰던 것(표 「시간 초과」 / 카드 「미완료(이탈·만료)」 /
// 이 화면 「만료」 / 회원 상세 「입금대기」)을 공용 헬퍼 하나로 모은다.
// 판정·시간창·자구는 전부 @/lib/admin-topup-progress 가 정한다 — 이 파일에서 직접 계산하지 않는다(A5-3).
const PENDING_TOPUP_STATUS = "WAITING_FOR_DEPOSIT";

/** 이 주문이 자동 매칭 시간창을 넘겼는가(=「미완료(이탈·만료)」). 판정은 공용 헬퍼가 한다. */
export function isStaleOrder(order: PendingOrder): boolean {
  return classifyTopUpProgress(PENDING_TOPUP_STATUS, order.createdAt).state === "stale";
}

function staleTitle(): string {
  return `${topUpStaleTitle("입금 대기", PENDING_TOPUP_STATUS, BANK_DEPOSIT_MATCH_WINDOW_MINUTES)} · 입금 알림이 와도 자동 매칭되지 않습니다(수동 연결은 가능, 주문 상태는 그대로).`;
}

const SETTLED_LABEL: Record<string, string> = {
  MANUAL_GRANT: "수동지급",
  MATCHED: "지급 완료",
};

/** 이미 처리된 입금과 금액·입금자명이 겹치는 주문의 경고 문구(없으면 null) */
export function settledWarning(order: PendingOrder): string | null {
  if (!order.settledDeposit) return null;
  const when = new Date(order.settledDeposit.receivedAt).toLocaleString("ko-KR", KST_SHORT);
  const label = SETTLED_LABEL[order.settledDeposit.status] ?? order.settledDeposit.status;
  return `같은 금액·입금자명의 입금이 이미 「${label}」으로 처리돼 있습니다(${when} 수신, 연결된 주문 없음). 이 주문에 연결하면 크레딧이 다시 지급되고 매출도 이중으로 잡힙니다.`;
}

/** 입금 대기 주문 한 줄의 내용(두 패널 공용). */
export function PendingOrderInfo({
  order,
  trailing,
}: {
  order: PendingOrder;
  trailing?: ReactNode;
}) {
  const warning = settledWarning(order);
  const stale = isStaleOrder(order);
  return (
    <>
      <span className="min-w-0 font-medium text-gray-700">
        {order.academyName}
        <span className="ml-1.5 text-gray-400">
          · {order.depositorName ?? "입금자명 미입력"}
        </span>
        {stale && (
          <span
            title={staleTitle()}
            className="ml-1.5 inline-flex h-[18px] items-center rounded bg-gray-100 px-1.5 align-middle text-[10px] font-semibold text-gray-500"
          >
            {TOPUP_PROGRESS_STALE_LABEL}
          </span>
        )}
        {warning && (
          <span
            title={warning}
            className="ml-1.5 inline-flex h-[18px] items-center gap-0.5 rounded bg-red-50 px-1.5 align-middle text-[10px] font-semibold text-red-600"
          >
            <AlertTriangle className="size-2.5" strokeWidth={2.2} />
            지급 완료 입금과 일치(추정) — 연결 시 재지급
          </span>
        )}
      </span>
      <span className="shrink-0 tabular-nums text-gray-500">
        {order.price.toLocaleString("ko-KR")}원 · {order.creditAmount.toLocaleString("ko-KR")}C ·{" "}
        {new Date(order.createdAt).toLocaleString("ko-KR", KST_SHORT)}
        {trailing}
      </span>
    </>
  );
}

/** 목록 절단 안내 — 최근 limit 건만 내려왔을 때만 표시 */
export function TruncatedNotice({
  shown,
  meta,
}: {
  shown: number;
  meta: PendingOrdersMeta | null;
}) {
  if (!meta || meta.total <= shown) return null;
  return (
    <p className="mb-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
      최근 {shown.toLocaleString("ko-KR")}건만 표시(전체 {meta.total.toLocaleString("ko-KR")}건)
    </p>
  );
}

/**
 * 입금 대기 주문 패널.
 * A5-1: 사이드바(`/admin/credits/bank-deposits`, view 파라미터 없음)로 들어와도 보이도록
 * 대기 주문이 1건이라도 있으면 항상 렌더한다. `highlight` 는 강조(테두리·기본 펼침)만 담당한다.
 */
export function PendingOrdersPanel({
  orders,
  meta,
  highlight = false,
}: {
  orders: PendingOrder[];
  meta: PendingOrdersMeta | null;
  highlight?: boolean;
}) {
  const total = meta?.total ?? orders.length;
  // 건수가 많으면 접어서 연다 — 배지로 규모는 항상 보이게.
  const [open, setOpen] = useState(highlight || total <= 25);
  // 대기 주문이 없으면 평소엔 자리를 차지하지 않는다. 다만 대시보드 「입금 대기」를 눌러
  // 들어온 경우(highlight)에는 왜 비었는지 말해 준다 — 기존 동작 유지.
  if (total === 0) {
    return highlight ? (
      <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 text-center text-[13px] text-gray-400">
        입금 대기 중인 무통장입금 주문이 없습니다.
      </div>
    ) : null;
  }
  const settledCount = orders.filter((o) => o.settledDeposit).length;
  // 서버(매칭기)는 BANK_DEPOSIT_MATCH_WINDOW_MINUTES, 화면 헬퍼는 NEXT_PUBLIC_ 을 읽는다.
  // 운영에서 한쪽만 설정되면 「진행 중/미완료」 판정이 갈라지므로 그때만 알린다.
  const windowMismatch =
    meta && meta.matchWindowMinutes !== BANK_DEPOSIT_MATCH_WINDOW_MINUTES
      ? meta.matchWindowMinutes
      : null;

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        highlight ? "border-sky-200 bg-sky-50/70 ring-1 ring-sky-100" : "border-sky-100 bg-sky-50/40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left"
      >
        <Banknote className="size-4 text-sky-600" strokeWidth={2} />
        <h2 className="text-[14px] font-semibold text-gray-800">입금 대기 주문</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sky-600">
          {total.toLocaleString("ko-KR")}건
        </span>
        <span className="text-[11px] tabular-nums text-gray-500">
          {TOPUP_PROGRESS_ACTIVE_LABEL} {(meta?.active ?? 0).toLocaleString("ko-KR")} ·{" "}
          {TOPUP_PROGRESS_STALE_LABEL} {(meta?.expired ?? 0).toLocaleString("ko-KR")}
        </span>
        {settledCount > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
            <AlertTriangle className="size-3" strokeWidth={2.2} />
            재지급 주의 {settledCount}
          </span>
        )}
        <ChevronDown
          className={cn("ml-auto size-4 text-gray-400 transition", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="mt-3">
          <TruncatedNotice shown={orders.length} meta={meta} />
          <div className="flex flex-col gap-1.5">
            {orders.map((o) => (
              <div
                key={o.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-white px-3.5 py-2.5 text-[12px]",
                  o.settledDeposit ? "border-red-200" : "border-sky-100",
                  isStaleOrder(o) && !o.settledDeposit && "opacity-60",
                )}
              >
                <PendingOrderInfo order={o} />
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-gray-400">
            입금 알림이 도착하면 아래 목록에서 해당 입금을 주문에 연결하세요. 「{TOPUP_PROGRESS_STALE_LABEL}」은
            생성 후 {BANK_DEPOSIT_MATCH_WINDOW_MINUTES}분이 지나 자동 매칭 대상에서 빠진 주문입니다(수동 연결은
            가능, 주문 상태는 그대로).
          </p>
          {windowMismatch != null && (
            <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
              매칭창 설정 불일치 — 서버(자동 매칭 실행) {windowMismatch}분 / 화면{" "}
              {BANK_DEPOSIT_MATCH_WINDOW_MINUTES}분. BANK_DEPOSIT_MATCH_WINDOW_MINUTES 와
              NEXT_PUBLIC_BANK_DEPOSIT_MATCH_WINDOW_MINUTES 를 같은 값으로 맞추세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 「주문 연결」 후보 선택 목록. 금액 일치 → 진행 중 순으로 정렬하고,
 * 이미 처리된 입금과 겹치는 주문은 붉은 테두리로 구분한다(A5-2).
 */
export function PendingOrderPicker({
  orders,
  meta,
  amount,
  disabled,
  onPick,
}: {
  orders: PendingOrder[];
  meta: PendingOrdersMeta | null;
  /** 연결하려는 입금 금액 — 금액 일치 표시·정렬 기준 */
  amount: number;
  disabled: boolean;
  onPick: (order: PendingOrder) => void;
}) {
  return (
    <>
      <p className="mb-2 text-[12px] font-semibold text-gray-600">
        연결할 입금 대기 주문 선택 (금액 일치 항목이 위에 표시됨)
      </p>
      <TruncatedNotice shown={orders.length} meta={meta} />
      {orders.length === 0 ? (
        <p className="text-[12px] text-gray-400">입금 대기 중인 무통장입금 주문이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {[...orders]
            // 금액 일치 먼저, 그다음 시간창 이내(진행 중) 주문 먼저
            .sort(
              (a, b) =>
                Number(b.price === amount) - Number(a.price === amount) ||
                Number(isStaleOrder(a)) - Number(isStaleOrder(b)),
            )
            .map((o) => (
              <button
                key={o.id}
                disabled={disabled}
                onClick={() => onPick(o)}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-white px-3 py-2 text-left text-[12px] transition hover:border-blue-300 disabled:opacity-50",
                  o.settledDeposit
                    ? "border-red-300 bg-red-50/40"
                    : o.price === amount
                      ? "border-blue-300"
                      : "border-gray-200",
                  isStaleOrder(o) && !o.settledDeposit && "opacity-60 hover:opacity-100",
                )}
              >
                <PendingOrderInfo
                  order={o}
                  trailing={
                    o.price === amount && (
                      <span className="ml-2 font-semibold text-blue-600">금액일치</span>
                    )
                  }
                />
              </button>
            ))}
        </div>
      )}
    </>
  );
}
