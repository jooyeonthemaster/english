"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronLeft,
  Copy,
  Phone,
  PhoneCall,
  ShieldCheck,
  Ticket,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { getSpecialAccount } from "@/lib/special-accounts";
import { feedbackStore } from "@/lib/feedback-store";
import {
  FEEDBACK_PHONE_DISPLAY,
  FEEDBACK_PHONE_TEL,
  FREE_UNTIL_LABEL,
  LOW_CREDIT_THRESHOLD,
} from "@/lib/feedback-program";

/**
 * "협업 피드백 이벤트" — the dashboard-entry modal that frames SMOAT's free beta
 * period as a feedback-collaboration invitation (NOT an ad).
 *
 * Mounted once in the director layout. It auto-opens once per day (gated by
 * localStorage) and can also be opened on demand from the sidebar
 * "무료 크레딧 신청하기" button via {@link feedbackStore}. Step 1 announces the
 * program; step 2 reveals the contact number ({@link FEEDBACK_PHONE_DISPLAY}).
 *
 * Design: deliberately restrained to match the dashboard — light surfaces,
 * blue-600 primary, generous whitespace. The feedback-call row carries a subtle
 * "laser" border to guide the eye.
 */

const DISMISS_STORAGE_KEY = "smoat:feedback-event:dismissed";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared focus-visible ring — matches StageActionLink on the dashboard. */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function todayStamp(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

interface FeedbackProgramProps {
  staffEmail: string;
}

export function FeedbackProgram({ staffEmail }: FeedbackProgramProps) {
  // Special demo/beta accounts have their own welcome modal and bespoke credit
  // arrangements — never show the event program to them.
  const isSpecial = Boolean(getSpecialAccount(staffEmail));

  const reduceMotion = useReducedMotion();

  // SSR-safe hydration gate (no setState-in-effect): false on the server and the
  // first hydration pass, true once mounted on the client.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const state = useSyncExternalStore(
    feedbackStore.subscribe,
    feedbackStore.getSnapshot,
    feedbackStore.getServerSnapshot,
  );
  const open = !isSpecial && state.open;
  const step = state.step;

  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-open triggers (run once on entry) ──
  // 1) Daily announcement: open once per day unless "오늘 하루 보지 않기" was set.
  // 2) Low credit: open whenever the balance is at/below the threshold — even if
  //    the daily announcement was dismissed — since the academy is effectively
  //    blocked until they top up.
  useEffect(() => {
    if (isSpecial) return;

    let suppressedToday = false;
    try {
      suppressedToday = localStorage.getItem(DISMISS_STORAGE_KEY) === todayStamp();
    } catch {
      suppressedToday = false;
    }
    if (!suppressedToday) {
      feedbackStore.open(1);
    }

    const controller = new AbortController();
    fetch("/api/credits/balance", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.balance === "number" && data.balance <= LOW_CREDIT_THRESHOLD) {
          feedbackStore.open(1);
        }
      })
      .catch(() => {
        // ignore — balance check is best-effort.
      });
    return () => controller.abort();
  }, [isSpecial]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const close = useCallback(() => {
    feedbackStore.close();
  }, []);

  const dismissToday = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, todayStamp());
    } catch {
      // ignore — closing for this session is still respected.
    }
    feedbackStore.close();
  }, []);

  const copyNumber = useCallback(() => {
    const markCopied = () => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1600);
      toast.success("번호가 복사되었어요");
    };
    try {
      void navigator.clipboard.writeText(FEEDBACK_PHONE_DISPLAY).then(markCopied, () => {
        toast.error("복사에 실패했어요. 번호를 길게 눌러 복사해주세요.");
      });
    } catch {
      toast.error("복사에 실패했어요. 번호를 길게 눌러 복사해주세요.");
    }
  }, []);

  // ── Body scroll lock + focus capture/restore while open ──
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // ── Initial focus on the panel itself (so no button shows a ring on open) ──
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => panelRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  // ── ESC to close + Tab focus trap ──
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      const items = panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (el) => el.offsetParent !== null,
          )
        : [];
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === panel) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!hydrated || isSpecial) return null;

  const cardMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 16, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 10, scale: 0.98 },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="feedback-event-overlay"
          className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-event-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={close}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px]"
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-18px_rgba(15,23,42,0.4)] outline-none"
            {...cardMotion}
          >
            <div
              aria-hidden="true"
              className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400"
            />

            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              className={`absolute right-3.5 top-3.5 z-10 flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 ${FOCUS_RING}`}
            >
              <X className="size-[18px]" aria-hidden="true" />
            </button>

            <div className="px-6 pb-6 pt-5 sm:px-7 sm:pb-7">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: reduceMotion ? 0 : 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {step === 1 ? (
                    <StepIntro
                      onApply={() => feedbackStore.setStep(2)}
                      onDismissToday={dismissToday}
                    />
                  ) : (
                    <StepReveal
                      copied={copied}
                      onCopy={copyNumber}
                      onBack={() => feedbackStore.setStep(1)}
                      onConfirm={close}
                      onDismissToday={dismissToday}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Shared bits
 * ──────────────────────────────────────────────────────────────────────── */

function EyebrowChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.02em] text-blue-700">
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      협업 피드백 이벤트
    </span>
  );
}

function InfoRow({
  icon: Icon,
  tone,
  title,
  highlight = false,
  children,
}: {
  icon: LucideIcon;
  tone: "blue" | "emerald";
  title: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  const tileClass =
    tone === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600";
  const row = (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${tileClass}`}
      >
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-slate-500 break-keep">
          {children}
        </p>
      </div>
    </div>
  );

  // The feedback-call row gets a subtle laser border to draw the eye. The
  // negative inset lets the highlight bleed slightly wider than the text column
  // while keeping its icon aligned with the plain row below it.
  if (highlight) {
    return <div className="feedback-laser -mx-3 rounded-xl px-3 py-2.5">{row}</div>;
  }
  return row;
}

const DISMISS_TODAY_CLASS =
  "rounded px-1.5 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600 " +
  FOCUS_RING;

/* ──────────────────────────────────────────────────────────────────────────
 * Step 1 — announcement
 * ──────────────────────────────────────────────────────────────────────── */

function StepIntro({
  onApply,
  onDismissToday,
}: {
  onApply: () => void;
  onDismissToday: () => void;
}) {
  return (
    <div>
      <EyebrowChip />
      <h2
        id="feedback-event-title"
        className="mt-3 text-[21px] font-bold leading-snug tracking-tight text-slate-900 break-keep"
      >
        함께 만드는 베타에 초대합니다
      </h2>
      <p className="mt-2 text-[13.5px] leading-[1.5] text-slate-500 break-keep">
        정식 출시 전, <span className="font-semibold text-slate-700">{FREE_UNTIL_LABEL}까지 모든 기능을 무료로</span> 드려요.
        <br />
        직접 써보시고 들려주신 의견이 SMOAT를 더 좋게 만듭니다.
      </p>

      <div className="my-5 h-px bg-slate-100" />

      <div className="space-y-3.5">
        <InfoRow icon={PhoneCall} tone="blue" title="피드백 전화 안내" highlight>
          가입 후 서비스를 이용하시면 피드백 수집을 위해{" "}
          <span className="whitespace-nowrap font-bold tabular-nums text-slate-900">
            {FEEDBACK_PHONE_DISPLAY}
          </span>{" "}
          번호로 한 번 연락드릴 수 있어요.
        </InfoRow>
        <InfoRow icon={Ticket} tone="emerald" title="협업 유저 추가 혜택">
          전화를 받고 의견을 들려주시면{" "}
          <span className="font-bold text-emerald-700">추가 무료 크레딧</span>을 드려요.
        </InfoRow>
      </div>

      <button
        type="button"
        onClick={onApply}
        className={`group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] transition-all hover:bg-blue-700 active:scale-[0.99] ${FOCUS_RING}`}
      >
        무료 크레딧 신청하기
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </button>

      <div className="mt-2.5 flex items-center justify-center">
        <button type="button" onClick={onDismissToday} className={DISMISS_TODAY_CLASS}>
          오늘 하루 보지 않기
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step 2 — phone reveal
 * ──────────────────────────────────────────────────────────────────────── */

function StepReveal({
  copied,
  onCopy,
  onBack,
  onConfirm,
  onDismissToday,
}: {
  copied: boolean;
  onCopy: () => void;
  onBack: () => void;
  onConfirm: () => void;
  onDismissToday: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className={`-ml-1 mb-3 inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600 ${FOCUS_RING}`}
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        이전
      </button>

      <EyebrowChip />
      <h2
        id="feedback-event-title"
        className="mt-3 text-[21px] font-bold leading-snug tracking-tight text-slate-900 break-keep"
      >
        이 번호로 연락드릴게요
      </h2>
      <p className="mt-2 text-[13.5px] leading-[1.5] text-slate-500 break-keep">
        전화를 받고 의견을 들려주시면 협업 유저로 추가 무료 크레딧을 드려요. 궁금한 점은
        같은 번호로 먼저 연락 주셔도 좋아요.
      </p>

      {/* Contact card */}
      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <BadgeCheck className="size-3.5 text-blue-600" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            SMOAT 피드백 팀
          </span>
        </div>
        <p className="mt-1.5 select-all whitespace-nowrap text-[29px] font-bold tracking-tight tabular-nums text-slate-900">
          {FEEDBACK_PHONE_DISPLAY}
        </p>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <a
            href={`tel:${FEEDBACK_PHONE_TEL}`}
            className={`flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 text-[14px] font-bold text-white transition-colors hover:bg-blue-700 active:scale-[0.99] ${FOCUS_RING}`}
          >
            <Phone className="size-4" aria-hidden="true" />
            전화 걸기
          </a>
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? "번호 복사됨" : "번호 복사"}
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 ${FOCUS_RING}`}
          >
            {copied ? (
              <Check className="size-[18px] text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="size-[18px]" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
        <p className="text-[12.5px] leading-[1.45] text-slate-500 break-keep">
          연락을 받고 협업 유저가 되시면 추가 무료 크레딧을 드려요. 무료 기간(~{FREE_UNTIL_LABEL})
          동안 운영되는 피드백 연락이니 부담 없이 받아주세요.
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onConfirm}
          className={`flex h-10 items-center rounded-lg px-3.5 text-[14px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 ${FOCUS_RING}`}
        >
          확인했어요
        </button>
        <button type="button" onClick={onDismissToday} className={DISMISS_TODAY_CLASS}>
          오늘 하루 보지 않기
        </button>
      </div>
    </div>
  );
}
