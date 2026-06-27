"use client";

import { ShieldCheck, X } from "lucide-react";

export const CREDIT_BETA_NOTICE_HIDE_UNTIL_KEY =
  "smoat:credits-beta-notice-hide-until";

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function CreditBetaNoticeDialog({
  open,
  onClose,
  onHideForDay,
}: {
  open: boolean;
  onClose: () => void;
  onHideForDay: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/24 px-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-beta-notice-title"
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>

        <div className="border-b border-blue-50 bg-gradient-to-br from-blue-50 to-white px-6 pb-5 pt-6">
          <div className="mb-4 inline-flex size-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <ShieldCheck className="size-5" strokeWidth={2.2} />
          </div>
          <h2
            id="credit-beta-notice-title"
            className="pr-8 text-[19px] font-black tracking-tight text-slate-950"
          >
            베타테스트 기간 안내
          </h2>
          <p className="mt-2 text-[13px] font-medium leading-6 text-slate-600">
            현재 크레딧 충전 기능은 베타테스트 중입니다. 화면에 표시된 결제
            버튼과 상품 금액은 테스트용이며, 실제 크레딧 결제나 카드 청구는
            이루어지지 않습니다.
          </p>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[12.5px] font-semibold leading-5 text-slate-600">
              정식 결제 오픈 전까지는 기능 사용 흐름과 UI 확인 목적으로만
              이용해주세요.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onHideForDay}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              하루동안 보지 않기
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
