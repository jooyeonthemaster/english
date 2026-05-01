"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowRight, Sparkles, AlertCircle, LineChart, Bell, HeartHandshake, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence, Variants } from "framer-motion";

const parentLoginSchema = z.object({
  phone: z
    .string()
    .min(1, "전화번호를 입력해주세요")
    .regex(
      /^01[016789]\d{7,8}$/,
      "올바른 전화번호 형식이 아닙니다 (하이픈 없이 입력)"
    ),
});

type ParentLoginForm = z.infer<typeof parentLoginSchema>;

export default function ParentLoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    }>
      <ParentLoginForm />
    </Suspense>
  );
}

function ParentLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ParentLoginForm>({
    resolver: zodResolver(parentLoginSchema),
    defaultValues: {
      phone: "01012345678",
    },
  });

  // Token-based auto-login
  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setTokenLoading(true);
      fetch("/api/auth/parent-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then((res) => {
          if (res.ok) {
            router.push("/parent");
            router.refresh();
          } else {
            setError("유효하지 않은 로그인 링크입니다. 학원에 문의하세요.");
            setTokenLoading(false);
          }
        })
        .catch(() => {
          setError("로그인 중 오류가 발생했습니다");
          setTokenLoading(false);
        });
    }
  }, [searchParams, router]);

  async function onSubmit(data: ParentLoginForm) {
    setError(null);

    try {
      const res = await fetch("/api/auth/parent-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: data.phone }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "등록되지 않은 전화번호입니다");
        return;
      }

      router.push("/parent");
      router.refresh();
    } catch {
      setError("로그인 중 오류가 발생했습니다");
    }
  }

  if (tokenLoading || !mounted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="relative w-20 h-20 flex items-center justify-center mb-6">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-2 border-amber-500/30 border-t-amber-500 rounded-full" />
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }} className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-400 shadow-[0_0_20px_rgba(245,158,11,0.6)]" />
        </div>
        <h2 className="text-slate-800 font-bold text-xl tracking-tight mb-2">자동 로그인 중</h2>
        <p className="text-slate-500 text-sm">초대 링크를 확인하고 있습니다...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white font-sans selection:bg-amber-100 selection:text-amber-900">
      
      {/* ─── Left Panel: Crisp, High-Contrast Form ─── */}
      <div className="relative z-10 flex flex-col justify-center w-full lg:w-[45%] px-6 sm:px-12 lg:px-16 xl:px-24 py-16 bg-white shadow-[20px_0_40px_rgba(0,0,0,0.03)] selection:bg-amber-200">
        <div className="w-full max-w-[420px] mx-auto">
          
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp} className="mb-14">
            <div className="flex items-center gap-4 mb-8 cursor-pointer group" onClick={() => router.push('/')}>
              {/* Jarvis 3D Hologram Effect for Parents */}
              <div className="relative w-14 h-14 flex items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-[1.5px] border-amber-500/20 rounded-full" style={{ borderTopColor: "rgba(245, 158, 11, 0.9)", borderRightColor: "rgba(245, 158, 11, 0.4)" }} />
                <motion.div animate={{ rotate: -360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute inset-[5px] border-[1.5px] border-orange-500/20 rounded-full" style={{ borderBottomColor: "rgba(249, 115, 22, 0.9)", borderLeftColor: "rgba(249, 115, 22, 0.4)" }} />
                <motion.div animate={{ scale: [1, 1.2, 1], boxShadow: ["0 0 10px rgba(245, 158, 11, 0.4)", "0 0 25px rgba(245, 158, 11, 0.9)", "0 0 10px rgba(245, 158, 11, 0.4)"] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="w-5 h-5 bg-gradient-to-tr from-amber-500 to-yellow-300 rounded-full z-10" />
                <motion.div animate={{ opacity: [0.3, 0.8, 0.3], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="absolute inset-0 bg-amber-400/20 blur-md rounded-full" />
              </div>
              <div className="flex flex-col">
                <span className="text-3xl font-extrabold tracking-tight text-slate-900 group-hover:text-amber-600 transition-colors duration-300">
                  영신ai
                </span>
                <span className="text-[10px] font-bold text-amber-500 tracking-[0.3em] uppercase opacity-90 mt-0.5">
                  PARENT CONNECT
                </span>
              </div>
            </div>
            <h1 className="text-[34px] sm:text-[40px] font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-4">
              신뢰할 수 있는 데이터,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
                우리 아이의 성장.
              </span>
            </h1>
            <p className="text-[16px] text-slate-600 font-medium leading-relaxed">
              가장 투명하고 빠른 자녀 학습 관리를 시작하세요.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
              <label htmlFor="phone" className="block text-[14px] font-bold text-slate-800 mb-2">
                전화번호
              </label>
              <div className="relative group">
                <input
                  id="phone"
                  type="tel"
                  placeholder="01012345678"
                  autoComplete="tel"
                  inputMode="numeric"
                  maxLength={11}
                  className="w-full h-[56px] px-5 rounded-2xl text-[18px] text-center tracking-[0.2em] text-slate-900 placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 bg-slate-50 border-2 border-slate-100 transition-all duration-300 outline-none focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 hover:border-slate-200"
                  {...register("phone")}
                  aria-invalid={!!errors.phone}
                />
              </div>
              {errors.phone ? (
                <motion.p initial={{ opacity:0, y:-5 }} animate={{ opacity:1, y:0 }} className="text-[13px] font-semibold text-rose-500 mt-2 text-center">
                  {errors.phone.message}
                </motion.p>
              ) : (
                <p className="text-[13px] font-medium text-slate-400 mt-2 text-center pointer-events-none">
                  하이픈(-) 없이 숫자만 입력해주세요
                </p>
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
                  <div className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-[14px] font-semibold text-rose-600 bg-rose-50/80 border border-rose-100">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp} className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="relative w-full h-[56px] rounded-2xl text-[16px] font-bold text-white overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(245,158,11,0.25)] hover:shadow-[0_12px_28px_rgba(245,158,11,0.35)] transition-all duration-300 active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 background-animate group-hover:scale-105 transition-transform duration-500" style={{ backgroundSize: '200% auto' }} />
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
          </form>

          <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp} className="mt-10 flex justify-center">
            <p className="text-[13px] font-medium text-slate-400">
              학원에 등록된 휴대폰 번호로 인증 없이 간편하게 접속합니다.
            </p>
          </motion.div>
        </div>
      </div>

      {/* ─── Right Panel: Premium Immersive Experience ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-slate-900 border-l border-white/10 items-center justify-center">
        {/* Deep, dynamic background meshes */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-stone-900 to-amber-950" />
        <motion.div animate={{ scale: [1, 1.05, 1], rotate: [0, 2, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-amber-600/10 blur-[100px]" />
        <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, -2, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute -bottom-[10%] -left-[10%] w-[500px] h-[500px] rounded-full bg-orange-600/10 blur-[100px]" />
        
        {/* Core Visual Elements */}
        <div className="relative z-10 w-full max-w-3xl px-12">
          
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-6">
              <HeartHandshake className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-white/90">학부모 전용 대시보드</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-extrabold text-white tracking-tight leading-[1.2]">
              우리 아이의 놀라운 변화, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300">
                투명하게 확인하세요
              </span>
            </h2>
          </motion.div>

          {/* Floating UI Cards */}
          <div className="flex flex-col gap-0 mt-10 w-full max-w-[460px] mx-auto">
            {/* Card 1: Report */}
            <motion.div 
              variants={floatAnimation} animate="animate"
              className="w-full max-w-[320px] self-start p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-amber-500/20 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg">
                  <LineChart className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">AI 성적 리포트</h3>
                  <p className="text-amber-200 text-sm font-medium">11월 종합 분석 완료</p>
                </div>
              </div>
              <div className="h-[60px] w-full mt-4 flex items-end gap-1.5 opacity-80">
                {[30, 45, 60, 50, 75, 85, 100].map((h, i) => (
                  <motion.div 
                    key={i}
                    initial={{ height: 0 }} animate={{ height: `${h}%` }}
                    transition={{ duration: 0.8, delay: 0.5 + (i * 0.1) }}
                    className="flex-1 rounded-t-sm"
                    style={{ background: `linear-gradient(to top, rgba(245,158,11,0.2), rgba(245,158,11,0.8))` }}
                  />
                ))}
              </div>
            </motion.div>

            {/* Card 2: Attendance */}
            <motion.div 
               variants={floatAnimation} animate="animate"
               style={{ animationDelay: '1.5s' }}
              className="w-full max-w-[300px] self-end -mt-8 p-5 rounded-3xl bg-white/10 backdrop-blur-2xl border border-orange-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-20 relative"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-white/90 font-bold">오후 4:30 알림</span>
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">
                  <Bell className="w-4 h-4" />
                </span>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <p className="text-white flex flex-wrap text-sm gap-1">학생이 학원에 <span className="text-emerald-400 font-bold whitespace-nowrap">도착</span>했습니다.</p>
                <p className="text-white/40 text-[11px] mt-1">방금 전 • 체온 정상</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
