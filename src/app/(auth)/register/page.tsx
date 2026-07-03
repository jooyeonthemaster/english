"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Gift, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { BrandIcon } from "@/components/brand/brand-mark";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth-browser";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE } from "@/lib/growth/constants";

const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "인증 코드가 전달되지 않았습니다. 다시 시도해주세요.",
  exchange_failed: "Google 인증 확인에 실패했습니다. 잠시 후 다시 시도해주세요.",
  no_email: "Google 계정에서 이메일 정보를 받을 수 없습니다.",
  inactive: "비활성화된 계정입니다. 관리자에게 문의해주세요.",
  not_director: "원장 계정만 소셜 로그인을 사용할 수 있습니다.",
  account_mismatch: "이미 다른 소셜 계정과 연결된 계정입니다.",
  access_denied: "소셜 회원가입이 취소되었습니다.",
  kakao_not_configured: "카카오 로그인이 아직 설정되지 않았습니다.",
  kakao_token_failed: "카카오 인증 토큰 발급에 실패했습니다. 다시 시도해주세요.",
  kakao_user_failed: "카카오 사용자 정보 조회에 실패했습니다.",
};

const BENEFITS = [
  "요금제 선택 없음",
  "카드 등록 없음",
  "학원 정보는 온보딩에서 한 번만",
  "기존 계정은 그대로 로그인",
] as const;

function RegisterInner() {
  const searchParams = useSearchParams();
  const [socialLoading, setSocialLoading] = useState<"google" | "kakao" | null>(null);
  const errorCode = searchParams.get("error");
  const error = errorCode ? SOCIAL_ERROR_MESSAGES[errorCode] ?? "회원가입 처리 중 오류가 발생했습니다." : null;

  // Derived directly from the URL — no effect/setState needed for the badge.
  const referralCode = searchParams.get("ref")?.trim() || null;

  // Side effects for an incoming referral code (?ref=CODE): persist it in a
  // cookie so it survives the social-OAuth round trip, and record the click
  // best-effort. Never blocks signup if anything here fails.
  useEffect(() => {
    if (!referralCode) return;
    try {
      document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(referralCode)};path=/;max-age=${REFERRAL_COOKIE_MAX_AGE};samesite=lax`;
    } catch {
      // cookie write best-effort
    }
    void fetch("/api/referral/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: referralCode }),
    }).catch(() => {
      // best-effort click tracking
    });
  }, [referralCode]);

  async function startGoogleSignup() {
    setSocialLoading("google");
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?intent=register`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        setSocialLoading(null);
      }
    } catch {
      setSocialLoading(null);
    }
  }

  function startKakaoSignup() {
    setSocialLoading("kakao");
    window.location.href = "/api/auth/kakao?intent=register";
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 flex items-center justify-center py-10 lg:py-16">
      <div className="mx-auto w-full max-w-[1100px] px-5">
        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_40px_100px_-30px_rgba(15,23,42,0.12)] grid lg:grid-cols-[1.05fr_0.95fr]">
          
          {/* Left Pane (Benefits & Info) */}
          <section className="order-2 bg-slate-50/60 p-8 sm:p-10 lg:p-12 lg:order-1 flex flex-col justify-between gap-8 border-t border-slate-100 lg:border-t-0 lg:border-r">
            <div>
              <Link href="/" className="inline-flex items-center gap-3">
                <BrandIcon className="size-11" markClassName="size-7" />
                <span>
                  <span className="block text-[22px] font-black tracking-tight">SMOAT</span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-blue-500">
                    English AI Workbench
                  </span>
                </span>
              </Link>

              <h1 className="mt-8 max-w-[660px] text-[36px] sm:text-[44px] font-black leading-[1.1] tracking-[-0.04em] text-slate-950 break-keep">
                회원가입은
                <br />
                소셜 인증만.
              </h1>

              <div className="mt-6 inline-flex items-center gap-3 rounded-full border-2 border-blue-100 bg-blue-50 px-5 py-2.5 shadow-sm">
                <span className="relative flex h-3 w-3">
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                </span>
                <span className="text-[14px] sm:text-[15px] font-black uppercase tracking-[0.22em] text-blue-600">
                  Social Signup
                </span>
              </div>

              <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
                {BENEFITS.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-blue-600" />
                    <span className="text-[13px] font-black text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Right Pane (Signup Form) */}
          <motion.section
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="order-1 p-8 sm:p-10 lg:p-12 lg:order-2 flex flex-col justify-between gap-8 bg-white"
          >
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-500">
                Social Signup
              </div>
              <h2 className="mt-2 text-[26px] sm:text-[28px] font-black tracking-tight text-slate-950">
                계정 만들기
              </h2>
              <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-500">
                소셜 인증 후 온보딩을 완료하면 원장 계정으로 바로 입장합니다.
              </p>

              {referralCode && (
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[12.5px] font-black text-blue-700">
                  <Gift className="size-4 shrink-0" />
                  추천 코드 적용됨 · 가입 시 +30 크레딧
                </div>
              )}

              {error && (
                <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-bold leading-5 text-rose-700">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-8 grid gap-3">
                <button
                  type="button"
                  onClick={startGoogleSignup}
                  disabled={socialLoading !== null}
                  className="flex h-[52px] items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 text-[15px] font-black text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {socialLoading === "google" ? (
                    <Loader2 className="size-5 animate-spin text-slate-500" />
                  ) : (
                    <>
                      <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Google로 시작
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={startKakaoSignup}
                  disabled={socialLoading !== null}
                  className="flex h-[52px] items-center justify-center gap-3 rounded-2xl border-2 border-[#FEE500] bg-[#FEE500] px-4 text-[15px] font-black text-[#3C1E1E] transition hover:border-[#FDD835] hover:bg-[#FDD835] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {socialLoading === "kakao" ? (
                    <Loader2 className="size-5 animate-spin text-[#3C1E1E]" />
                  ) : (
                    <>
                      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.84 5.18 4.6 6.58l-1.04 3.82c-.1.36.32.66.64.46l4.6-3.04c.4.04.8.06 1.2.06 5.52 0 10-3.48 10-7.88S17.52 3 12 3z" />
                      </svg>
                      카카오로 시작
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-50 text-yellow-600">
                  <ShieldCheck className="size-4.5" />
                </span>
                <div>
                  <div className="text-[13px] font-black text-slate-900">소셜 인증 후 바로 온보딩</div>
                  <p className="mt-1 text-[12.5px] font-semibold leading-5 text-slate-500">
                    실제 자료를 넣어보고, 시험지까지 뽑아본 뒤 결정하면 됩니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 text-center">
              <span className="text-[13px] font-semibold text-slate-500">이미 계정이 있나요? </span>
              <Link href="/login" className="inline-flex items-center gap-1 text-[13px] font-black text-blue-600 hover:text-blue-700">
                로그인
                <LogIn className="size-3.5" />
              </Link>
            </div>
          </motion.section>

        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="size-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <RegisterInner />
    </Suspense>
  );
}
