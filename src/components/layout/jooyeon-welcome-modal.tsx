"use client";

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Gift, Infinity as InfinityIcon, X } from "lucide-react";
import { getSpecialAccount } from "@/lib/special-accounts";

interface JooyeonWelcomeModalProps {
  staffEmail: string;
}

export function JooyeonWelcomeModal({ staffEmail }: JooyeonWelcomeModalProps) {
  const [dismissed, setDismissed] = useState(false);
  const account = getSpecialAccount(staffEmail);
  const shouldOpen = useSyncExternalStore(
    () => () => {},
    () =>
      Boolean(account) &&
      sessionStorage.getItem(account!.welcomeStorageKey) === "true",
    () => false,
  );
  const open = Boolean(account) && shouldOpen && !dismissed;

  function close() {
    if (account) {
      sessionStorage.removeItem(account.welcomeStorageKey);
    }
    setDismissed(true);
  }

  const welcome = account?.welcome;

  return (
    <AnimatePresence>
      {open && welcome && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="jooyeon-welcome-title"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={close}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.45)]"
          >
            <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400" />
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-5" />
            </button>

            <div className="px-7 pb-7 pt-10 sm:px-9 sm:pb-9">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex size-[52px] items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.22)]">
                  <Crown className="size-6 text-blue-300" />
                </div>
                <div>
                  <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-blue-600">
                    {welcome.badge}
                  </p>
                  <h2
                    id="jooyeon-welcome-title"
                    className="mt-1 text-[26px] font-black leading-tight tracking-tight text-slate-950"
                  >
                    {welcome.title}
                  </h2>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                    <Gift className="size-5" />
                  </div>
                  <div>
                    <p className="text-[17px] font-extrabold leading-7 text-slate-950">
                      {welcome.highlight}
                    </p>
                    <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-600">
                      {welcome.sub}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Credits
                  </p>
                  <p className="mt-1 text-[24px] font-black tabular-nums text-slate-950">
                    {welcome.creditsLabel}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-600">
                    Pass
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-[24px] font-black text-slate-950">
                    {welcome.passLabel}
                    <InfinityIcon className="size-5 text-emerald-500" />
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={close}
                className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 text-[15px] font-extrabold text-white shadow-[0_12px_26px_rgba(15,23,42,0.22)] transition-all hover:bg-blue-700 active:scale-[0.99]"
              >
                바로 시작하기
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
