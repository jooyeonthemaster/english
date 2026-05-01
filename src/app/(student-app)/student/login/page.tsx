"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowRight, Sparkles, BookOpen, Target, Trophy, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence, Variants } from "framer-motion";

const studentLoginSchema = z.object({
  code: z
    .string()
    .min(1, "학생 코드를 입력해주세요")
    .length(6, "학생 코드는 6자리입니다")
    .regex(/^[A-Z0-9]+$/, "영문 대문자와 숫자만 입력 가능합니다"),
});

type StudentLoginForm = z.infer<typeof studentLoginSchema>;

export default function StudentLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentLoginForm>({
    resolver: zodResolver(studentLoginSchema),
    defaultValues: {
      code: "NAR001",
    },
  });

  async function onSubmit(data: StudentLoginForm) {
    setError(null);

    try {
      const res = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: data.code }),
      });

      if (!res.ok) {
        setError("등록되지 않은 학생 코드입니다");
        return;
      }

      router.push("/student");
      router.refresh();
    } catch {
      setError("로그인 중 오류가 발생했습니다");
    }
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
      <div className="relative z-10 flex flex-col justify-center w-full lg:w-[45%] px-6 sm:px-12 lg:px-16 xl:px-24 py-16 bg-white shadow-[20px_0_40px_rgba(0,0,0,0.03)] selection:bg-emerald-200">
        <div className="w-full max-w-[420px] mx-auto">
          
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp} className="mb-14">
            <div className="flex items-center gap-4 mb-8 cursor-pointer group" onClick={() => router.push('/')}>
              {/* Jarvis 3D Hologram Effect */}
              <div className="relative w-14 h-14 flex items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-[1.5px] border-emerald-500/20 rounded-full" style={{ borderTopColor: "rgba(16, 185, 129, 0.9)", borderRightColor: "rgba(16, 185, 129, 0.4)" }} />
                <motion.div animate={{ rotate: -360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute inset-[5px] border-[1.5px] border-teal-500/20 rounded-full" style={{ borderBottomColor: "rgba(20, 184, 166, 0.9)", borderLeftColor: "rgba(20, 184, 166, 0.4)" }} />
                <motion.div animate={{ scale: [1, 1.2, 1], boxShadow: ["0 0 10px rgba(16, 185, 129, 0.4)", "0 0 25px rgba(16, 185, 129, 0.9)", "0 0 10px rgba(16, 185, 129, 0.4)"] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="w-5 h-5 bg-gradient-to-tr from-emerald-500 to-teal-300 rounded-full z-10" />
                <motion.div animate={{ opacity: [0.3, 0.8, 0.3], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="absolute inset-0 bg-emerald-400/20 blur-md rounded-full" />
              </div>
              <div className="flex flex-col">
                <span className="text-3xl font-extrabold tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors duration-300">
                  영신ai
                </span>
                <span className="text-[10px] font-bold text-emerald-500 tracking-[0.3em] uppercase opacity-90 mt-0.5">
                  STUDENT AI
                </span>
              </div>
            </div>
            <h1 className="text-[34px] sm:text-[40px] font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-4">
              오늘의 학습 미션,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                인공지능과 함께!
              </span>
            </h1>
            <p className="text-[16px] text-slate-600 font-medium leading-relaxed">
              나만의 맞춤형 학습 공간에 접속하세요.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
              <label htmlFor="code" className="block text-[14px] font-bold text-slate-800 mb-2">
                학생 코드
              </label>
              <div className="relative group">
                <input
                  id="code"
                  type="text"
                  placeholder="6자리 코드 입력 (예: AB3C4D)"
                  autoComplete="off"
                  maxLength={6}
                  className="w-full h-[56px] px-5 rounded-2xl text-[18px] text-center font-mono tracking-[0.4em] uppercase text-slate-900 placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 bg-slate-50 border-2 border-slate-100 transition-all duration-300 outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 hover:border-slate-200"
                  {...register("code", { setValueAs: (v) => v.toUpperCase() })}
                />
              </div>
              {errors.code && (
                <motion.p initial={{ opacity:0, y:-5 }} animate={{ opacity:1, y:0 }} className="text-[13px] font-semibold text-rose-500 mt-2 text-center">
                  {errors.code.message}
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
                  <div className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-[14px] font-semibold text-rose-600 bg-rose-50/80 border border-rose-100">
                    <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp} className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="relative w-full h-[56px] rounded-2xl text-[16px] font-bold text-white overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(16,185,129,0.25)] hover:shadow-[0_12px_28px_rgba(16,185,129,0.35)] transition-all duration-300 active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 background-animate group-hover:scale-105 transition-transform duration-500" style={{ backgroundSize: '200% auto' }} />
                <div className="relative flex items-center justify-center gap-2 w-full h-full">
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>접속하기</span>
                      <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </>
                  )}
                </div>
              </button>
            </motion.div>
          </form>

          <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp} className="mt-10 flex justify-center">
            <p className="text-[13px] font-medium text-slate-400">
              코드를 잊으셨나요? <span className="text-emerald-500 cursor-pointer hover:underline">선생님께 문의하기</span>
            </p>
          </motion.div>
        </div>
      </div>

      {/* ─── Right Panel: Premium Immersive Experience ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-slate-900 border-l border-white/10 items-center justify-center">
        {/* Deep, dynamic background meshes */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950" />
        <motion.div animate={{ scale: [1, 1.05, 1], rotate: [0, 2, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-emerald-600/20 blur-[100px]" />
        <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, -2, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute -bottom-[10%] -left-[10%] w-[500px] h-[500px] rounded-full bg-teal-600/20 blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
        
        {/* Core Visual Elements */}
        <div className="relative z-10 w-full max-w-3xl px-12">
          
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-6">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white/90">AI 1:1 개인화 학습</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-extrabold text-white tracking-tight leading-[1.2]">
              나의 취약점을 분석하는 <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                스마트 AI 튜터
              </span>
            </h2>
          </motion.div>

          <div className="flex flex-col gap-0 mt-10 w-full max-w-[460px] mx-auto">
            {/* Card 1: My Progress */}
            <motion.div 
              variants={floatAnimation} animate="animate"
              className="w-full max-w-[320px] self-start p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-emerald-500/20 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
                  <Target className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">오늘의 미션</h3>
                  <p className="text-emerald-200 text-sm font-medium">단어 암기 완료율</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: '85%' }} transition={{ duration: 1.5, delay: 0.5 }} className="h-full bg-emerald-400 rounded-full" />
                </div>
                <div className="flex justify-between text-xs text-white/70 font-bold">
                  <span>진행중</span>
                  <span>85% 달성</span>
                </div>
              </div>
            </motion.div>

            {/* Card 2: Achievement */}
            <motion.div 
              custom={1}
              variants={floatAnimation} animate="animate"
              style={{ animationDelay: '1s' }}
              className="w-full max-w-[280px] self-end -mt-12 p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl relative z-10"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-white font-bold text-lg mb-1">나의 랭킹</h3>
                  <p className="text-amber-300 text-[13px] font-semibold flex items-center gap-1">
                    <Trophy className="w-4 h-4" /> 상위 3%
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex-1 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/40 border border-amber-500/30 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Card 3: New AI Test */}
            <motion.div 
               variants={floatAnimation} animate="animate"
               style={{ animationDelay: '2s' }}
              className="w-full max-w-[340px] self-start -mt-8 p-5 rounded-3xl bg-white/10 backdrop-blur-2xl border border-teal-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-20 relative"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-white/90 font-bold shrink-0">새로운 AI 모의고사</span>
                <span className="px-3 py-1 ml-2 rounded-full bg-teal-500/20 text-teal-200 text-[11px] font-bold border border-teal-500/30 animate-pulse whitespace-nowrap">
                  도전 가능!
                </span>
              </div>
              <div className="flex items-end gap-3 mb-2">
                <span className="text-3xl font-extrabold text-white">15</span>
                <span className="text-sm font-medium text-white/50 mb-1">문항 (오답 노트 연계)</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
