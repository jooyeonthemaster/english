"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Eye, EyeOff, ArrowRight, Sparkles, BookOpen, BrainCircuit, BarChart3, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth-browser";

const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "인증 코드를 받지 못했습니다. 다시 시도해주세요.",
  exchange_failed: "소셜 로그인 검증에 실패했습니다. 잠시 후 다시 시도해주세요.",
  no_email: "Google 계정에서 이메일 정보를 받을 수 없습니다.",
  inactive: "비활성화된 계정입니다. 관리자에게 문의해주세요.",
  not_director: "원장 계정만 소셜 로그인을 사용할 수 있습니다.",
  account_mismatch: "다른 소셜 계정으로 이미 연결되어 있습니다.",
  bridge_failed: "세션 생성에 실패했습니다. 다시 시도해주세요.",
  missing_token: "잘못된 접근입니다.",
  access_denied: "소셜 로그인이 취소되었습니다.",
  kakao_not_configured: "카카오 로그인이 설정되어 있지 않습니다.",
  kakao_token_failed: "카카오 인증 토큰 발급에 실패했습니다. 잠시 후 다시 시도해주세요.",
  kakao_user_failed: "카카오 사용자 정보 조회에 실패했습니다.",
};

const loginSchema = z.object({
  email: z.string().min(1, "이메일을 입력해주세요").email("올바른 이메일 형식이 아닙니다"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function StaffLoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    }>
      <StaffLoginForm />
    </Suspense>
  );
}

function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const socialErrorCode = searchParams.get("error");

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    socialErrorCode ? (SOCIAL_ERROR_MESSAGES[socialErrorCode] ?? "로그인에 실패했습니다.") : null,
  );
  const [socialLoading, setSocialLoading] = useState<"google" | "kakao" | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSocialLogin(provider: "google" | "kakao") {
    setError(null);
    setSocialLoading(provider);
    if (provider === "kakao") {
      window.location.href = "/api/auth/kakao";
      return;
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (oauthError) {
        setError("소셜 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해주세요.");
        setSocialLoading(null);
      }
    } catch {
      setError("소셜 로그인을 시작할 수 없습니다.");
      setSocialLoading(null);
    }
  }

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "director@darun.academy",
      password: "admin1234",
    },
  });

  async function onSubmit(data: LoginForm) {
    setError(null);
    const result = await signIn("credentials", { email: data.email, password: data.password, redirect: false });
    if (result?.error) { 
      setError("입력하신 이메일 또는 비밀번호가 올바르지 않습니다."); 
      return; 
    }
    const res = await fetch("/api/auth/session");
    const session = await res.json();
    const role = session?.user?.role;
    
    if (callbackUrl) router.push(callbackUrl);
    else if (role === "DIRECTOR") router.push("/director");
    else router.push("/teacher");
    router.refresh();
  }

  // Animation variants
  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: (custom: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: custom * 0.1, duration: 0.6, ease: "easeOut" }
    })
  };

  const floatAnimation: Variants = {
    animate: {
      y: [0, -15, 0],
      transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen bg-white font-sans selection:bg-blue-100 selection:text-blue-900">
      
      {/* ─── Left Panel: Crisp, High-Contrast Form ─── */}
      <div className="relative z-10 flex flex-col justify-center w-full lg:w-[45%] px-6 sm:px-12 lg:px-16 xl:px-24 py-16 bg-white shadow-[20px_0_40px_rgba(0,0,0,0.03)] selection:bg-blue-200">
        <div className="w-full max-w-[420px] mx-auto">
          
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp} className="mb-14">
            <div className="flex items-center gap-4 mb-8 cursor-pointer group" onClick={() => router.push('/')}>
              {/* Jarvis 3D Hologram Effect */}
              <div className="relative w-14 h-14 flex items-center justify-center">
                {/* Ring 1 - Outer Orbit */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-[1.5px] border-blue-500/20 rounded-full"
                  style={{ borderTopColor: "rgba(59, 130, 246, 0.9)", borderRightColor: "rgba(59, 130, 246, 0.4)" }}
                />
                {/* Ring 2 - Inner Orbit Reverse */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-[5px] border-[1.5px] border-indigo-500/20 rounded-full"
                  style={{ borderBottomColor: "rgba(99, 102, 241, 0.9)", borderLeftColor: "rgba(99, 102, 241, 0.4)" }}
                />
                {/* The Core Orb */}
                <motion.div
                  animate={{ 
                    scale: [1, 1.2, 1],
                    boxShadow: [
                      "0 0 10px rgba(59, 130, 246, 0.4)",
                      "0 0 25px rgba(59, 130, 246, 0.9)",
                      "0 0 10px rgba(59, 130, 246, 0.4)"
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="w-5 h-5 bg-gradient-to-tr from-blue-600 to-sky-300 rounded-full z-10"
                />
                {/* Particles/Glow */}
                <motion.div
                  animate={{ opacity: [0.3, 0.8, 0.3], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 bg-blue-400/20 blur-md rounded-full"
                />
              </div>

              {/* Text */}
              <div className="flex flex-col">
                <span className="text-3xl font-extrabold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors duration-300">
                  영신ai
                </span>
                <span className="text-[10px] font-bold text-blue-500 tracking-[0.3em] uppercase opacity-90 mt-0.5">
                  A.I. SYSTEM
                </span>
              </div>
            </div>
            <h1 className="text-[34px] sm:text-[40px] font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-4">
              스마트한 학원 관리,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                시작해볼까요?
              </span>
            </h1>
            <p className="text-[16px] text-slate-600 font-medium leading-relaxed">
              AI 기반 원생 관리로 더 나은 교육 환경을 만듭니다.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
              <label htmlFor="email" className="block text-[14px] font-bold text-slate-800 mb-2">
                이메일
              </label>
              <div className="relative group">
                <input
                  id="email"
                  type="email"
                  placeholder="name@academy.com"
                  autoComplete="email"
                  className="w-full h-[56px] px-5 rounded-2xl text-[16px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border-2 border-slate-100 transition-all duration-300 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-200"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <motion.p initial={{ opacity:0, y:-5 }} animate={{ opacity:1, y:0 }} className="text-[13px] font-semibold text-rose-500 mt-2 ml-1">
                  {errors.email.message}
                </motion.p>
              )}
            </motion.div>

            <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="text-[14px] font-bold text-slate-800">
                  비밀번호
                </label>
                <button type="button" className="text-[13px] font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                  비밀번호 찾기
                </button>
              </div>
              <div className="relative group">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  className="w-full h-[56px] px-5 pr-14 rounded-2xl text-[16px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border-2 border-slate-100 transition-all duration-300 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-200"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <motion.p initial={{ opacity:0, y:-5 }} animate={{ opacity:1, y:0 }} className="text-[13px] font-semibold text-rose-500 mt-2 ml-1">
                  {errors.password.message}
                </motion.p>
              )}
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginTop: 0 }} 
                  animate={{ opacity: 1, height: "auto", marginTop: 16 }} 
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-4 py-3.5 rounded-xl text-[14px] font-semibold text-rose-600 bg-rose-50/80 border border-rose-100">
                    <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp} className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="relative w-full h-[56px] rounded-2xl text-[16px] font-bold text-white overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(37,99,235,0.25)] hover:shadow-[0_12px_28px_rgba(37,99,235,0.35)] transition-all duration-300 active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 background-animate group-hover:scale-105 transition-transform duration-500" style={{ backgroundSize: '200% auto' }} />
                <div className="relative flex items-center justify-center gap-2 w-full h-full">
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>로그인하기</span>
                      <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </>
                  )}
                </div>
              </button>
            </motion.div>

            <motion.div custom={4} initial="hidden" animate="visible" variants={fadeUp} className="mt-6">
              <div className="relative flex items-center my-2">
                <div className="flex-grow border-t border-slate-200" />
                <span className="flex-shrink mx-4 text-[12px] font-bold text-slate-400 uppercase tracking-wider">
                  또는 원장 소셜 로그인
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>
            </motion.div>

            <motion.div custom={4} initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSocialLogin("google")}
                disabled={socialLoading !== null || isSubmitting}
                className="flex items-center justify-center gap-2 h-[52px] rounded-2xl text-[14px] font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {socialLoading === "google" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span>Google</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleSocialLogin("kakao")}
                disabled={socialLoading !== null || isSubmitting}
                className="flex items-center justify-center gap-2 h-[52px] rounded-2xl text-[14px] font-bold text-[#3C1E1E] bg-[#FEE500] border-2 border-[#FEE500] hover:bg-[#FDD835] hover:border-[#FDD835] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {socialLoading === "kakao" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#3C1E1E]" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.84 5.18 4.6 6.58l-1.04 3.82c-.1.36.32.66.64.46l4.6-3.04c.4.04.8.06 1.2.06 5.52 0 10-3.48 10-7.88S17.52 3 12 3z" />
                    </svg>
                    <span>카카오</span>
                  </>
                )}
              </button>
            </motion.div>

            <motion.div custom={5} initial="hidden" animate="visible" variants={fadeUp} className="mt-4">
              <a
                href="/register"
                className="flex items-center justify-center w-full h-[52px] rounded-2xl text-[15px] font-bold text-blue-600 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200"
              >
                학원 가입 신청하기
              </a>
            </motion.div>
          </form>

          <motion.div custom={5} initial="hidden" animate="visible" variants={fadeUp} className="mt-16 pt-8 border-t border-slate-100 flex flex-col items-center">
            <div className="flex gap-6 mb-4">
              <span className="text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer">이용약관</span>
              <span className="text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer">개인정보처리방침</span>
              <span className="text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer">고객센터</span>
            </div>
            <p className="text-[12px] font-medium text-slate-400">
              &copy; {new Date().getFullYear()} 영신ai Edutech. All rights reserved.
            </p>
          </motion.div>
        
        </div>
      </div>

      {/* ─── Right Panel: Premium Immersive Experience ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-slate-900 border-l border-white/10 items-center justify-center">
        {/* Deep, dynamic background meshes (simulate complex gradients) */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950" />
        <motion.div animate={{ scale: [1, 1.05, 1], rotate: [0, 2, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-[100px]" />
        <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, -2, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute -bottom-[10%] -left-[10%] w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
        
        {/* Core Visual Elements */}
        <div className="relative z-10 w-full max-w-3xl px-12">
          
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-6">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-white/90">AI 기반 에듀테크 솔루션</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-extrabold text-white tracking-tight leading-[1.2]">
              데이터로 증명하는 <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
                압도적인 교육 성과
              </span>
            </h2>
          </motion.div>

          {/* Floating UI Cards representing functionality */}
          <div className="flex flex-col gap-0 mt-10 w-full max-w-[460px] mx-auto">
            {/* Card 1: AI Analysis */}
            <motion.div 
              variants={floatAnimation} animate="animate"
              className="w-full max-w-[320px] self-start p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
                  <BrainCircuit className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">AI 맞춤 문제</h3>
                  <p className="text-blue-200 text-sm font-medium">실시간 오답 분석</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: '85%' }} transition={{ duration: 1.5, delay: 0.5 }} className="h-full bg-blue-400 rounded-full" />
                </div>
                <div className="h-2 w-[70%] bg-white/10 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.5, delay: 0.7 }} className="h-full bg-indigo-400 rounded-full" />
                </div>
              </div>
            </motion.div>

            {/* Card 2: Growth Metrics */}
            <motion.div 
              custom={1}
              variants={floatAnimation} animate="animate"
              style={{ animationDelay: '1s' }}
              className="w-full max-w-[280px] self-end -mt-12 p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl relative z-10"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-white font-bold text-lg mb-1">원생 이탈 방지</h3>
                  <p className="text-emerald-300 text-[13px] font-semibold flex items-center gap-1">
                    <BarChart3 className="w-4 h-4" /> 유지율 98.4%
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div className="h-[60px] w-full flex items-end justify-between gap-2">
                {[40, 60, 50, 80, 70, 90, 100].map((h, i) => (
                  <motion.div 
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.8, delay: 0.8 + (i * 0.1) }}
                    className="w-full bg-gradient-to-t from-emerald-500/20 to-emerald-400/80 rounded-t-sm" 
                  />
                ))}
              </div>
            </motion.div>

            {/* Card 3: Realtime Status */}
            <motion.div 
               variants={floatAnimation} animate="animate"
               style={{ animationDelay: '2s' }}
              className="w-full max-w-[340px] self-start -mt-8 p-5 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-20 relative"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-white/90 font-bold shrink-0">11월 수납 현황</span>
                <span className="px-3 py-1 ml-2 rounded-full bg-indigo-500/20 text-indigo-200 text-[11px] font-bold border border-indigo-500/30 whitespace-nowrap">
                  마감 임박
                </span>
              </div>
              <div className="flex items-end gap-3 mb-2">
                <span className="text-3xl font-extrabold text-white">92%</span>
                <span className="text-sm font-medium text-white/50 mb-1">완료 (전월대비 +5%)</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

