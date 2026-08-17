"use client";

import { useState } from "react";
import { AlertTriangle, Check, Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { datetimeLocalToIso, isoToDatetimeLocal } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export type ManualGrantCandidate = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  adminId: string | null;
  createdAt: Date | string;
};

export type DuplicateNotificationCandidate = {
  id: string;
  amount: number;
  depositorName: string | null;
  status: string;
  receivedAt: Date | string;
};

export type ManualCompletePayload = {
  paidAt?: string;
  note?: string;
  creditTransactionId?: string;
  linkNotificationId?: string;
  confirmDuplicate?: boolean;
};

const KRW = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const dt = (v: Date | string) =>
  new Date(v).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * 수동 충전 완료 처리 모달.
 *
 * 크레딧은 추가 지급하지 않는다 — 관리자가 이미 시스템 밖에서 지급한 건을
 * 주문 레코드에 반영해 매출·고객 화면에 정상 노출시키는 것이 목적이다.
 */
export function ManualCompleteModal({
  open,
  submitting,
  topUp,
  candidates,
  duplicates,
  onSubmit,
  onClose,
}: {
  open: boolean;
  submitting: boolean;
  topUp: {
    id: string;
    price: number;
    creditAmount: number;
    academyName: string;
    depositorName: string | null;
    createdAt: Date | string;
  } | null;
  candidates: ManualGrantCandidate[];
  duplicates: DuplicateNotificationCandidate[];
  onSubmit: (payload: ManualCompletePayload) => void;
  onClose: () => void;
}) {
  const [paidAtLocal, setPaidAtLocal] = useState(() =>
    isoToDatetimeLocal(new Date()),
  );
  const [note, setNote] = useState("");
  const [txId, setTxId] = useState<string>("");
  const [dupChoice, setDupChoice] = useState<"link" | "ignore" | null>(null);
  const [dupId, setDupId] = useState<string>(duplicates[0]?.id ?? "");

  if (!open || !topUp) return null;

  const dupBlocking = duplicates.length > 0 && dupChoice === null;

  function submit() {
    const iso = datetimeLocalToIso(paidAtLocal);
    onSubmit({
      ...(iso ? { paidAt: iso } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(txId ? { creditTransactionId: txId } : {}),
      ...(dupChoice === "link" && dupId ? { linkNotificationId: dupId } : {}),
      ...(dupChoice === "ignore" ? { confirmDuplicate: true } : {}),
    });
  }

  // 결제 상세(Radix Dialog) 위에 겹쳐 뜨는 중첩 모달이다. 직접 만든 fixed 오버레이는
  // 상세 Dialog 가 body 로 portal 되면서 뒤에 깔리고 pointer-events 도 막히므로,
  // 반드시 같은 Dialog 프리미티브를 써야 위에 정상적으로 뜬다.
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold text-gray-900">
            수동 충전 완료 처리
          </DialogTitle>
          <DialogDescription className="sr-only">
            이미 지급한 크레딧 건의 주문 상태를 완료로 정리합니다.
          </DialogDescription>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-[12px] text-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-500">학원</span>
              <span className="font-semibold">{topUp.academyName}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-gray-500">금액 / 크레딧</span>
              <span className="font-semibold">
                {KRW(topUp.price)} · {topUp.creditAmount.toLocaleString("ko-KR")}C
              </span>
            </div>
            {topUp.depositorName && (
              <div className="mt-1 flex justify-between">
                <span className="text-gray-500">입금자명</span>
                <span className="font-semibold">{topUp.depositorName}</span>
              </div>
            )}
          </div>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
            이 처리는 <strong>크레딧을 추가로 지급하지 않습니다.</strong> 이미
            지급한 건의 주문 상태만 완료로 정리해, 고객 화면과 매출 집계에
            반영합니다.
          </p>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-rose-600"
                  strokeWidth={2}
                />
                <div className="text-[12px] leading-relaxed text-rose-800">
                  <p className="font-semibold">매출 이중집계 위험</p>
                  <p className="mt-0.5">
                    같은 금액의 &lsquo;수동지급&rsquo; 입금 알림이 있습니다. 이미
                    그 알림이 매출에 잡혀 있어서, 그대로 진행하면 같은 돈이 두 번
                    계산됩니다.
                  </p>
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {duplicates.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md bg-white/70 px-2 py-1.5 text-[12px]"
                  >
                    <input
                      type="radio"
                      name="dup"
                      checked={dupChoice === "link" && dupId === d.id}
                      onChange={() => {
                        setDupChoice("link");
                        setDupId(d.id);
                      }}
                    />
                    <Link2 className="size-3.5 text-rose-500" strokeWidth={2} />
                    <span>
                      {dt(d.receivedAt)} · {KRW(d.amount)}
                      {d.depositorName ? ` · ${d.depositorName}` : ""} — 이 주문에
                      연결(권장)
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2 rounded-md bg-white/70 px-2 py-1.5 text-[12px]">
                  <input
                    type="radio"
                    name="dup"
                    checked={dupChoice === "ignore"}
                    onChange={() => setDupChoice("ignore")}
                  />
                  <span>관련 없는 입금입니다 — 무시하고 진행</span>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-gray-700">
              입금 시각
            </label>
            <input
              type="datetime-local"
              value={paidAtLocal}
              onChange={(e) => setPaidAtLocal(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-blue-400"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              이 날짜 기준으로 매출이 집계됩니다.
            </p>
          </div>

          {candidates.length > 0 && (
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                이미 지급한 크레딧 거래 연결{" "}
                <span className="font-normal text-gray-400">(선택)</span>
              </label>
              <select
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 px-2 text-[13px] outline-none focus:border-blue-400"
              >
                <option value="">연결하지 않음</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {dt(c.createdAt)} · +{c.amount.toLocaleString("ko-KR")}C ·{" "}
                    {c.description?.slice(0, 24) ?? c.type}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                연결하면 이 주문이 어떤 지급으로 처리됐는지 추적되고, 이후 자동
                매칭으로 이중지급되는 일도 막힙니다.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-gray-700">
              메모 <span className="font-normal text-gray-400">(선택)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 카드결제 실패로 계좌이체 안내 후 수동 지급"
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 rounded-lg border border-gray-200 px-3.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || dupBlocking}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold text-white transition",
              "bg-teal-600 hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Check className="size-4" strokeWidth={2.2} />
            {submitting ? "처리 중…" : "수동 충전 완료로 처리"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
