"use client";

import { Banknote, ExternalLink, Loader2, RotateCcw, ShieldCheck, Undo2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/admin-labels";
import { formatDate } from "@/components/admin/credit-promotion-editor";
import {
  AcademyCreditActivitySection,
  CreditLogSection,
  DetailItem,
  DetailRow,
  WebhookEventsSection,
} from "./topup-detail-sections";
import { formatOrderNo, maskLongValue } from "./topup-status";
import type { AdminTopUpDetail } from "./types";

// 결제 상세 팝업 본문(3단: 결제 정보·운영 처리 / 웹훅·감사 로그 / 학원 사용 로그)과
// 팝업 하단 버튼 줄(재조회 · 환불 · 가상계좌 말소 · 수동 충전 완료).

const BANK_OPTIONS = [
  { value: "SHINHAN", label: "신한은행" },
  { value: "KOOKMIN", label: "국민은행" },
  { value: "HANA", label: "하나은행" },
  { value: "WOORI", label: "우리은행" },
  { value: "IBK", label: "기업은행" },
  { value: "NONGHYUP", label: "NH농협은행" },
  { value: "KAKAO", label: "카카오뱅크" },
  { value: "K_BANK", label: "케이뱅크" },
  { value: "TOSS", label: "토스뱅크" },
];

export type TopUpDetailBusy = {
  syncing: boolean;
  cancelling: boolean;
  closingVirtualAccount: boolean;
  manualCompleting: boolean;
};

export type CancelFormState = {
  open: boolean;
  reason: string;
  refundBank: string;
  refundAccountNumber: string;
  refundHolderName: string;
  refundHolderPhoneNumber: string;
};

export type CancelFormHandlers = {
  onClose: () => void;
  onSubmit: () => void;
  onReasonChange: (value: string) => void;
  onRefundBankChange: (value: string) => void;
  onRefundAccountNumberChange: (value: string) => void;
  onRefundHolderNameChange: (value: string) => void;
  onRefundHolderPhoneNumberChange: (value: string) => void;
};

/** 팝업 하단 버튼 줄 — 상세가 로드된 뒤에만 보인다. */
export function TopUpDetailActions({
  topUp,
  busy,
  onOpenManualComplete,
  onSync,
  onOpenCancelForm,
  onCloseVirtualAccount,
}: {
  topUp: AdminTopUpDetail;
  busy: TopUpDetailBusy;
  onOpenManualComplete: () => void;
  onSync: () => void;
  onOpenCancelForm: () => void;
  onCloseVirtualAccount: () => void;
}) {
  const { syncing, cancelling, closingVirtualAccount, manualCompleting } = busy;
  const anyBusy = syncing || cancelling || closingVirtualAccount;
  const canSync = Boolean(topUp.paymentId);
  const canCancel = topUp.status === "COMPLETED";
  // 서버가 판정한다(미지급 + 입금대기/결제대기). 필드가 없는 옛 응답은 보수적으로 숨김.
  const canManualComplete = Boolean(topUp.canManualComplete);
  const canCloseVirtualAccount =
    topUp.status === "WAITING_FOR_DEPOSIT" && topUp.paymentMethod === "VIRTUAL_ACCOUNT";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCloseVirtualAccount}
        disabled={!canCloseVirtualAccount || anyBusy}
        className="text-amber-700 hover:bg-amber-50 hover:text-amber-800"
      >
        {closingVirtualAccount ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <XCircle className="size-4" strokeWidth={2} />
        )}
        가상계좌 말소
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpenCancelForm}
        disabled={!canCancel || anyBusy}
        className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
      >
        <Undo2 className="size-4" strokeWidth={2} />
        환불 처리
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onSync}
        disabled={!canSync || anyBusy}
      >
        <RotateCcw className={cn("size-4", syncing && "animate-spin")} strokeWidth={2} />
        포트원 재조회
      </Button>
      {canManualComplete && (
        <Button
          type="button"
          size="sm"
          onClick={onOpenManualComplete}
          disabled={manualCompleting || syncing || cancelling}
        >
          <ShieldCheck className="size-4" strokeWidth={2} />
          수동 충전 완료
        </Button>
      )}
    </>
  );
}

function CancelForm({
  needsRefundAccount,
  form,
  cancelling,
  handlers,
}: {
  needsRefundAccount: boolean;
  form: CancelFormState;
  cancelling: boolean;
  handlers: CancelFormHandlers;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-rose-800">결제 취소</div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handlers.onClose}
          aria-label="취소 폼 닫기"
          className="size-7 text-rose-600 hover:bg-white hover:text-rose-700"
        >
          <X className="size-4" strokeWidth={2} />
        </Button>
      </div>
      <Input
        value={form.reason}
        onChange={(event) => handlers.onReasonChange(event.target.value)}
        className="h-9 bg-white text-[12px]"
        placeholder="환불 사유"
      />
      {needsRefundAccount && (
        <div className="grid grid-cols-1 gap-2">
          <Select value={form.refundBank} onValueChange={handlers.onRefundBankChange}>
            <SelectTrigger className="h-9 w-full bg-white text-[12px]" aria-label="환불 은행">
              <SelectValue placeholder="은행 선택" />
            </SelectTrigger>
            <SelectContent>
              {BANK_OPTIONS.map((bank) => (
                <SelectItem key={bank.value} value={bank.value}>
                  {bank.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={form.refundAccountNumber}
            onChange={(event) => handlers.onRefundAccountNumberChange(event.target.value)}
            className="h-9 bg-white text-[12px]"
            placeholder="환불 계좌번호"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={form.refundHolderName}
              onChange={(event) => handlers.onRefundHolderNameChange(event.target.value)}
              className="h-9 bg-white text-[12px]"
              placeholder="예금주"
            />
            <Input
              value={form.refundHolderPhoneNumber}
              onChange={(event) => handlers.onRefundHolderPhoneNumberChange(event.target.value)}
              className="h-9 bg-white text-[12px]"
              placeholder="연락처"
            />
          </div>
        </div>
      )}
      <Button
        type="button"
        onClick={handlers.onSubmit}
        disabled={cancelling}
        className="w-full bg-rose-600 text-white hover:bg-rose-700"
      >
        {cancelling ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Banknote className="size-4" strokeWidth={2} />
        )}
        {cancelling ? "취소 요청 중" : "포트원 취소 실행"}
      </Button>
    </div>
  );
}

/** 팝업 본문. 상세가 아직 없으면 로딩/안내 문구만. */
export function TopUpDetailPanel({
  topUp,
  loading,
  cancelling,
  cancelForm,
  cancelHandlers,
}: {
  topUp: AdminTopUpDetail | null;
  loading: boolean;
  cancelling: boolean;
  cancelForm: CancelFormState;
  cancelHandlers: CancelFormHandlers;
}) {
  if (!topUp) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-gray-400">
        {loading && <Loader2 className="size-4 animate-spin" />}
        {loading ? "상세 내역을 불러오는 중입니다" : "충전 내역을 선택해주세요"}
      </div>
    );
  }

  const needsRefundAccount = topUp.paymentMethod === "VIRTUAL_ACCOUNT";

  return (
    <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
      {/* 왼쪽: 결제 정보 · 운영 처리 */}
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <DetailItem label="학원" value={topUp.academy.name} />
          <DetailItem
            label="현재 잔고"
            value={`${(topUp.academy.creditBalance?.balance ?? 0).toLocaleString("ko-KR")}C`}
          />
          <DetailItem label="결제금액" value={`${topUp.price.toLocaleString("ko-KR")}원`} />
          <DetailItem label="크레딧" value={`${topUp.creditAmount.toLocaleString("ko-KR")}C`} />
        </div>

        <div className="space-y-2 rounded-xl border border-gray-100 p-3">
          <DetailRow label="주문번호" value={formatOrderNo(topUp.id)} mono />
          <DetailRow label="주문명" value={topUp.orderName ?? "-"} />
          <DetailRow label="결제수단" value={paymentMethodLabel(topUp.paymentMethod)} />
          <DetailRow label="포트원 상태" value={topUp.portoneStatus ?? "-"} />
          <DetailRow label="결제 ID" value={topUp.paymentId ?? "-"} mono />
          <DetailRow
            label="거래 ID"
            value={topUp.portoneTransactionId ?? topUp.paymentReference ?? "-"}
            mono
          />
          <DetailRow label="Store ID" value={maskLongValue(topUp.storeId)} mono />
          <DetailRow label="검증 시각" value={formatDate(topUp.verifiedAt ?? null)} />
          {topUp.receiptUrl && (
            <Button asChild variant="outline" size="sm" className="text-blue-700 hover:text-blue-800">
              <a href={topUp.receiptUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" strokeWidth={2} />
                영수증 보기
              </a>
            </Button>
          )}
        </div>

        {topUp.failureMessage && (
          <div
            className={cn(
              "rounded-xl border px-3 py-2 text-[12px] font-medium",
              topUp.status === "CANCELLED"
                ? "border-gray-200 bg-gray-50 text-gray-600"
                : "border-rose-100 bg-rose-50 text-rose-700",
            )}
          >
            {topUp.failureMessage}
          </div>
        )}

        {cancelForm.open && (
          <CancelForm
            needsRefundAccount={needsRefundAccount}
            form={cancelForm}
            cancelling={cancelling}
            handlers={cancelHandlers}
          />
        )}
      </div>

      {/* 가운데: 웹훅 · 크레딧 감사 로그 */}
      <div className="space-y-5">
        <WebhookEventsSection events={topUp.webhookEvents} />
        <CreditLogSection transactions={topUp.relatedCreditTransactions} />
      </div>

      {/* 오른쪽: 학원 크레딧 사용 로그 (전체·페이지네이션) */}
      <div className="space-y-5">
        <AcademyCreditActivitySection
          key={topUp.id}
          academyId={topUp.academyId}
          initialItems={topUp.academyCreditActivity}
          initialTotal={topUp.academyActivityTotal}
          pageSize={topUp.academyActivityPageSize}
          usageSummary={topUp.academyUsageSummary}
        />
      </div>
    </div>
  );
}
