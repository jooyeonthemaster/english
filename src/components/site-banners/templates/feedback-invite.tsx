"use client";

import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronLeft,
  Copy,
  Phone,
  ShieldCheck,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { toast } from "sonner";
import type { BannerRendererProps } from "@/lib/site-banners/types";
import { BANNER_FOCUS_RING } from "../banner-modal-shell";

/**
 * "협업 피드백 초대" template — the original two-step feedback-event modal, now
 * content-driven. Content keys: eyebrow, heading, kakaoUrl, phone, bonusLabel,
 * freeUntilLabel. Opens at `initialStep` (2 = phone reveal for the sidebar CTA).
 */

const KakaoTalkIcon = forwardRef<SVGSVGElement, LucideProps>(({ className }, ref) => (
  <svg ref={ref} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.84 5.18 4.6 6.58l-1.04 3.82c-.1.36.32.66.64.46l4.6-3.04c.4.04.8.06 1.2.06 5.52 0 10-3.48 10-7.88S17.52 3 12 3z" />
  </svg>
));
KakaoTalkIcon.displayName = "KakaoTalkIcon";

const DISMISS_TODAY_CLASS =
  "rounded px-1.5 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600 " +
  BANNER_FOCUS_RING;

function EyebrowChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.02em] text-blue-700">
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function InfoRow({
  icon: Icon,
  tone,
  title,
  highlight = false,
  href,
  children,
}: {
  icon: LucideIcon;
  tone: "blue" | "kakao";
  title: string;
  highlight?: boolean;
  href?: string;
  children: ReactNode;
}) {
  const tileClass = tone === "kakao" ? "bg-[#FEE500] text-[#3C1E1E]" : "bg-blue-50 text-blue-600";
  const row = (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${tileClass}`}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-slate-500 break-keep">{children}</p>
      </div>
    </div>
  );
  const content = highlight ? (
    <div className="feedback-laser -mx-3 rounded-xl px-3 py-2.5">{row}</div>
  ) : (
    row
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`block cursor-pointer rounded-xl transition-transform hover:-translate-y-0.5 active:scale-[0.99] ${BANNER_FOCUS_RING}`}
      >
        {content}
      </a>
    );
  }
  return content;
}

export function FeedbackInviteBanner({
  content,
  labelledById,
  dismissLabel,
  onDismiss,
  initialStep = 1,
}: BannerRendererProps) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<1 | 2>(initialStep === 2 ? 2 : 1);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eyebrow = content.eyebrow?.trim() || "협업 피드백 이벤트";
  const kakaoUrl = content.kakaoUrl?.trim() || "#";
  const phone = content.phone?.trim() || "";
  const phoneTel = phone.replace(/[^0-9]/g, "");
  const bonusLabel = content.bonusLabel?.trim() || "추가 무료 크레딧";
  const freeUntil = content.freeUntilLabel?.trim();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyNumber = useCallback(() => {
    const markCopied = () => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1600);
      toast.success("번호가 복사되었어요");
    };
    try {
      void navigator.clipboard.writeText(phone).then(markCopied, () => {
        toast.error("복사에 실패했어요. 번호를 길게 눌러 복사해주세요.");
      });
    } catch {
      toast.error("복사에 실패했어요. 번호를 길게 눌러 복사해주세요.");
    }
  }, [phone]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={{ opacity: 0, x: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {step === 1 ? (
          <div>
            <EyebrowChip label={eyebrow} />
            <h2
              id={labelledById}
              className="mt-3 text-[21px] font-bold leading-snug tracking-tight text-slate-900 break-keep"
            >
              {content.heading?.trim() || "함께 만드는 베타에 초대합니다"}
            </h2>

            <div className="my-5 h-px bg-slate-100" />

            <div className="space-y-3.5">
              <InfoRow icon={KakaoTalkIcon} tone="kakao" title="오픈채팅방 피드백" highlight href={kakaoUrl}>
                오픈채팅방에 오셔서 피드백을 남겨주시면{" "}
                <span className="font-bold text-emerald-700">{bonusLabel}</span>을 드려요.
              </InfoRow>
              {phone && (
                <InfoRow icon={Phone} tone="blue" title="전화·문자 문의">
                  <span className="whitespace-nowrap font-bold tabular-nums text-slate-900">{phone}</span>
                  {" · "}24시간 전화·문자 모두 가능해요.
                </InfoRow>
              )}
            </div>

            <a
              href={kakaoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] transition-all hover:bg-blue-700 active:scale-[0.99] ${BANNER_FOCUS_RING}`}
            >
              오픈채팅방 바로가기
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </a>

            {phone && (
              <div className="mt-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={`rounded px-1.5 py-1 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700 ${BANNER_FOCUS_RING}`}
                >
                  전화·문자로 문의하기
                </button>
              </div>
            )}

            {dismissLabel && (
              <div className="mt-1 flex items-center justify-center">
                <button type="button" onClick={onDismiss} className={DISMISS_TODAY_CLASS}>
                  {dismissLabel}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`-ml-1 mb-3 inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600 ${BANNER_FOCUS_RING}`}
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              이전
            </button>

            <EyebrowChip label={eyebrow} />
            <h2
              id={labelledById}
              className="mt-3 text-[21px] font-bold leading-snug tracking-tight text-slate-900 break-keep"
            >
              이 번호로 연락드릴게요
            </h2>
            <p className="mt-2 text-[13.5px] leading-[1.5] text-slate-500 break-keep">
              전화를 받고 의견을 들려주시면 협업 유저로 {bonusLabel}을 드려요. 궁금한 점은 같은 번호로 먼저
              연락 주셔도 좋아요.
            </p>

            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-5 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <BadgeCheck className="size-3.5 text-blue-600" aria-hidden="true" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  SMOAT 피드백 팀
                </span>
              </div>
              <p className="mt-1.5 select-all whitespace-nowrap text-[29px] font-bold tracking-tight tabular-nums text-slate-900">
                {phone}
              </p>

              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <a
                  href={`tel:${phoneTel}`}
                  className={`flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 text-[14px] font-bold text-white transition-colors hover:bg-blue-700 active:scale-[0.99] ${BANNER_FOCUS_RING}`}
                >
                  <Phone className="size-4" aria-hidden="true" />
                  전화 걸기
                </a>
                <button
                  type="button"
                  onClick={copyNumber}
                  aria-label={copied ? "번호 복사됨" : "번호 복사"}
                  className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 ${BANNER_FOCUS_RING}`}
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
                연락을 받고 협업 유저가 되시면 {bonusLabel}을 드려요.
                {freeUntil ? ` 무료 기간(~${freeUntil}) 동안 운영되는 피드백 연락이니 부담 없이 받아주세요.` : ""}
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={onDismiss}
                className={`flex h-10 items-center rounded-lg px-3.5 text-[14px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 ${BANNER_FOCUS_RING}`}
              >
                확인했어요
              </button>
              {dismissLabel && (
                <button type="button" onClick={onDismiss} className={DISMISS_TODAY_CLASS}>
                  {dismissLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
