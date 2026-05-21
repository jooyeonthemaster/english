"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
};

export function ApplicationConfirmModal({ open, onClose, onConfirm, submitting }: Props) {
  const [agree, setAgree] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) setAgree(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => checkboxRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="apply-confirm"
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:px-4 sm:py-6"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="모달 닫기"
            tabIndex={-1}
            onClick={() => !submitting && onClose()}
            className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-confirm-title"
            initial={reducedMotion ? false : { y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 28, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-[121] flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-blue-100 bg-white shadow-[0_30px_70px_-20px_rgba(15,23,42,0.4)] sm:max-w-[500px] sm:rounded-[24px]"
          >
            <div className="flex justify-center bg-white pt-3 pb-1 sm:hidden">
              <div className="h-1.5 w-10 rounded-full bg-slate-200" />
            </div>

            <div className="overflow-y-auto px-6 pt-2 pb-7 sm:px-8 sm:pt-9 sm:pb-8">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#1D4ED8]">
                  Final Step · 신청 전 안내
                </span>
              </div>

              <h3
                id="apply-confirm-title"
                className="mt-4 text-[22px] font-black leading-[1.28] tracking-[-0.025em] text-gray-900 sm:text-[26px]"
              >
                신청을 마치기 전,
                <br />두 가지만 꼭 확인해 주세요.
              </h3>

              <p className="mt-2.5 text-[13px] font-medium leading-[1.65] text-gray-500 sm:text-[14px]">
                선착순 100명 캠페인이라 한 분께 드릴 수 있는 회신 대기 시간이 짧습니다.
              </p>

              <div className="mt-5 space-y-3">
                <InfoBlock
                  step="01"
                  icon={<PhoneIcon />}
                  title={
                    <>
                      접수 후 <span className="text-[#3B82F6]">24시간 이내</span>,
                      <br className="sm:hidden" />{" "}
                      담당자가 전화와 문자로 연락드립니다.
                    </>
                  }
                  description="평일·주말과 관계없이, 접수 순서에 따라 순차적으로 안내가 진행됩니다."
                />
                <InfoBlock
                  step="02"
                  icon={<SkipIcon />}
                  title={
                    <>
                      회신이 없을 경우, 기회는
                      <br className="sm:hidden" />{" "}
                      <span className="text-[#3B82F6]">즉시 다음 신청자</span>에게 넘어갑니다.
                    </>
                  }
                  description="놓치지 않으시려면, 전화·문자 수신이 가능한 번호를 정확히 기재해 주세요."
                />
              </div>

              <label
                className={`mt-5 flex cursor-pointer select-none items-start gap-3 rounded-xl border p-3.5 transition-all sm:p-4 ${
                  agree
                    ? "border-[#3B82F6] bg-blue-50/70"
                    : "border-blue-100 bg-white hover:bg-blue-50/40"
                }`}
              >
                <input
                  ref={checkboxRef}
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 rounded border-gray-300 text-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/30"
                />
                <span className="text-[13.5px] font-medium leading-[1.6] text-gray-800 sm:text-[14px]">
                  위 안내를 모두 확인했으며,{" "}
                  <strong className="font-black text-gray-900">신청을 진행</strong>합니다.
                </span>
              </label>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="col-span-1 h-12 rounded-full bg-slate-100 text-[13.5px] font-bold text-gray-700 transition-colors hover:bg-slate-200 disabled:opacity-60 sm:h-[52px] sm:text-[14px]"
                >
                  돌아가기
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!agree || submitting}
                  className="col-span-2 h-12 rounded-full bg-[#3B82F6] text-[14px] font-black tracking-tight text-white shadow-[0_10px_30px_-6px_rgba(59,130,246,0.5)] transition-all hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none sm:h-[52px] sm:text-[15px]"
                >
                  {submitting ? "접수 중..." : "확인하고 신청 진행"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function InfoBlock({
  step,
  icon,
  title,
  description,
}: {
  step: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  description: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-blue-50/20 p-4 sm:p-5">
      <div className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full bg-[#3B82F6]" />
      <div className="flex items-start gap-3 sm:gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white shadow-[0_2px_8px_-2px_rgba(59,130,246,0.18)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#1D4ED8]/70">
            Step {step}
          </div>
          <div className="mt-1 text-[14.5px] font-bold leading-[1.55] tracking-[-0.005em] text-gray-900 sm:text-[15.5px]">
            {title}
          </div>
          <p className="mt-1.5 text-[12.5px] font-medium leading-[1.6] text-gray-500 sm:text-[13px]">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z"
        stroke="#1D4ED8"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6l8 6-8 6V6z" fill="#1D4ED8" />
      <rect x="14.5" y="6" width="2.5" height="12" rx="0.5" fill="#1D4ED8" />
    </svg>
  );
}
