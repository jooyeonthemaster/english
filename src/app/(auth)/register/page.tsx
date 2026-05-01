"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Zap,
} from "lucide-react";
import { motion, Variants } from "framer-motion";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 전화번호 자동 포맷: 01012345678 → 010-1234-5678 */
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const phoneRegex = /^(0\d{1,2}-\d{3,4}-\d{4})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const registerSchema = z.object({
  academyName: z.string().min(1, "학원명을 입력해주세요"),
  directorName: z.string().min(1, "이름을 입력해주세요"),
  directorEmail: z.string().min(1, "이메일을 입력해주세요").regex(emailRegex, "올바른 이메일 형식이 아닙니다"),
  directorPhone: z.string().min(1, "연락처를 입력해주세요").regex(phoneRegex, "올바른 전화번호를 입력해주세요"),
  desiredPlan: z.string(),
});

type RegisterForm = z.infer<typeof registerSchema>;

// ─── Plan Data ────────────────────────────────────────────────────────────────

const PLANS = [
  { id: "STARTER", name: "Starter", originalPrice: "30만원", price: "19만원", discount: "37%", credits: "500", students: "50명", desc: "소규모 학원" },
  { id: "STANDARD", name: "Standard", originalPrice: "50만원", price: "29만원", discount: "42%", credits: "1,200", students: "150명", desc: "중규모 학원", badge: "최대 할인" },
  { id: "PREMIUM", name: "Premium", originalPrice: "100만원", price: "59만원", discount: "41%", credits: "3,000", students: "500명", desc: "대규모 학원" },
] as const;

// ─── Countdown Timer Hook ─────────────────────────────────────────────────────

function useCountdown() {
  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    // 매일 자정 기준으로 남은 시간 계산 (항상 긴급감 유지)
    function calc() {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = end.getTime() - now.getTime();
      setTime({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    }
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, []);

  return time;
}

// ─── Input Component ──────────────────────────────────────────────────────────

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] font-semibold text-rose-500 mt-1">{error}</p>}
    </div>
  );
}

const inputClass = "w-full h-10 px-3 rounded-lg text-[13px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 transition-all outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10";

// ─── Page Component ───────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { desiredPlan: "STANDARD" },
  });

  const selectedPlan = watch("desiredPlan");

  // ─── Phone auto-format handler ──────────────────────────────────────────
  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setValue("directorPhone", formatted, { shouldValidate: false });
  }, [setValue]);

  async function onSubmit(data: RegisterForm) {
    setServerError(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          phone: data.directorPhone,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(json.error || "신청 처리 중 오류가 발생했습니다."); return; }
      setSubmitted(true);
    } catch {
      setServerError("네트워크 오류가 발생했습니다.");
    }
  }

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: (custom: number) => ({
      opacity: 1, y: 0,
      transition: { delay: custom * 0.06, duration: 0.4, ease: "easeOut" },
    }),
  };

  if (!mounted) return null;

  // ─── Success State ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex h-screen bg-slate-950 overflow-hidden">
        {/* Full-screen dark success view */}
        <div className="flex-1 flex items-center justify-center relative">
          {/* Background effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950" />
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[20%] left-[30%] w-[400px] h-[400px] rounded-full bg-blue-600/15 blur-[120px]"
          />
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-[10%] right-[20%] w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[100px]"
          />

          {/* Content */}
          <div className="relative z-10 text-center max-w-lg px-6">
            {/* Animated check icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
              className="flex justify-center mb-8"
            >
              <div className="relative">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl"
                />
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.3)]">
                  <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={1.8} />
                </div>
              </div>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-[28px] font-extrabold text-white tracking-tight mb-3"
            >
              신청이 완료되었습니다
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-[15px] text-white/50 leading-relaxed mb-10"
            >
              검토 후 입력하신 이메일로 승인 결과를 안내드립니다.
              <br />
              평균 24시간 이내에 처리됩니다.
            </motion.p>

            {/* Steps indicator */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex items-center justify-center gap-3 mb-10"
            >
              {[
                { num: "1", label: "신청 완료", done: true },
                { num: "2", label: "관리자 검토", done: false },
                { num: "3", label: "승인 및 안내", done: false },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold ${
                      step.done
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 text-white/40 border border-white/10"
                    }`}>
                      {step.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.num}
                    </div>
                    <span className={`text-[12px] font-semibold ${step.done ? "text-white" : "text-white/40"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < 2 && <div className="w-8 h-px bg-white/10" />}
                </div>
              ))}
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              onClick={() => router.push("/login")}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-[14px] font-bold text-white bg-white/10 border border-white/10 hover:bg-white/15 backdrop-blur-sm transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
              로그인 페이지로 돌아가기
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Layout: 16:9 single screen ──────────────────────────────────────

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* ─── Left: Form (compact, no scroll) ─── */}
      <div className="flex flex-col w-[58%] px-10 xl:px-14 py-6 overflow-y-auto">
        <div className="w-full max-w-[560px] mx-auto flex flex-col flex-1">
          {/* Header */}
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp} className="mb-5">
            <div className="flex items-center gap-2.5 mb-4 cursor-pointer group" onClick={() => router.push("/")}>
              <div className="relative w-9 h-9 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-[1.5px] border-blue-500/20 rounded-full"
                  style={{ borderTopColor: "rgba(59, 130, 246, 0.9)", borderRightColor: "rgba(59, 130, 246, 0.4)" }}
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="w-3 h-3 bg-gradient-to-tr from-blue-600 to-sky-300 rounded-full z-10"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-extrabold tracking-tight text-slate-900">영신ai</span>
                <span className="text-[8px] font-bold text-blue-500 tracking-[0.3em] uppercase -mt-0.5">A.I. SYSTEM</span>
              </div>
            </div>
            <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight leading-tight">학원 가입 신청</h1>
            <p className="text-[13px] text-slate-400 mt-1">정보 입력 후 검토를 거쳐 안내드립니다</p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col gap-5">
            {/* Basic Info — 4 fields in a compact grid */}
            <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp} className="space-y-3">
              <Field label="학원명" required error={errors.academyName?.message}>
                <input placeholder="예: 다른영어학원" className={inputClass} {...register("academyName")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="이름" required error={errors.directorName?.message}>
                  <input placeholder="홍길동" className={inputClass} {...register("directorName")} />
                </Field>
                <Field label="연락처" required error={errors.directorPhone?.message}>
                  <input
                    placeholder="010-1234-5678"
                    className={inputClass}
                    maxLength={13}
                    inputMode="tel"
                    {...register("directorPhone")}
                    onChange={handlePhoneChange}
                  />
                </Field>
              </div>
              <Field label="이메일" required error={errors.directorEmail?.message}>
                <input type="email" placeholder="example@academy.com" className={inputClass} {...register("directorEmail")} />
              </Field>
            </motion.div>

            {/* Row 2: Plan Selection with urgency timer */}
            <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
              {/* Urgency Banner */}
              <PromoTimer />

              <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-700 mb-2 mt-3">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                요금제 선택
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {PLANS.map((plan) => {
                  const isSelected = selectedPlan === plan.id;
                  return (
                    <label
                      key={plan.id}
                      className={`relative flex flex-col cursor-pointer rounded-xl border-2 p-3.5 transition-all duration-200 ${
                        isSelected
                          ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/10"
                          : "border-slate-100 bg-slate-50/50 hover:border-slate-200"
                      }`}
                    >
                      <input
                        type="radio"
                        value={plan.id}
                        className="sr-only"
                        {...register("desiredPlan")}
                        onChange={() => setValue("desiredPlan", plan.id)}
                        checked={isSelected}
                      />
                      {"badge" in plan && plan.badge && (
                        <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold animate-pulse">
                          {plan.badge}
                        </span>
                      )}
                      {/* Discount badge */}
                      <span className="absolute -top-2.5 right-3 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[9px] font-extrabold">
                        -{plan.discount}
                      </span>
                      {/* Price */}
                      <div className="mb-1.5 mt-1">
                        <div className="text-[10px] text-slate-400 line-through">{plan.originalPrice}/월</div>
                        <div className="flex items-baseline gap-0.5">
                          <span className={`text-[17px] font-extrabold ${isSelected ? "text-blue-700" : "text-slate-900"}`}>
                            {plan.price}
                          </span>
                          <span className="text-[10px] text-slate-400">/월</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 mb-1.5">{plan.name}</span>
                      <div className="space-y-0.5 text-[10px] text-slate-500">
                        <div>크레딧 {plan.credits}/월</div>
                        <div>학생 최대 {plan.students}</div>
                      </div>
                      {/* Radio dot */}
                      <div className={`absolute top-3.5 right-3.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
                      } mt-5`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </label>
                  );
                })}
              </div>
            </motion.div>

            {/* Server Error */}
            {serverError && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold text-rose-600 bg-rose-50 border border-rose-100">
                {serverError}
              </div>
            )}

            {/* Submit + Login link */}
            <motion.div custom={4} initial="hidden" animate="visible" variants={fadeUp} className="mt-auto pt-2 pb-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl text-[14px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    가입 신청하기
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>
              <p className="text-center mt-3 text-[12px] text-slate-400">
                이미 계정이 있으신가요?{" "}
                <button type="button" onClick={() => router.push("/login")} className="font-bold text-blue-600 hover:text-blue-700 transition-colors">
                  로그인하기
                </button>
              </p>
            </motion.div>
          </form>
        </div>
      </div>

      {/* ─── Right: Visual Panel (42%) ─── */}
      <div className="hidden lg:flex w-[42%] relative overflow-hidden bg-slate-900 items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950" />
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[20%] -right-[10%] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[100px]"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[10%] -left-[10%] w-[400px] h-[400px] rounded-full bg-indigo-600/20 blur-[100px]"
        />

        <div className="relative z-10 w-full max-w-md px-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl xl:text-3xl font-extrabold text-white tracking-tight leading-tight mb-3">
              AI와 함께하는
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
                스마트 학원 운영
              </span>
            </h2>
            <p className="text-[13px] text-white/40 font-medium leading-relaxed">
              문제 출제부터 학생 분석까지, 학원 운영의 모든 것을 혁신합니다.
            </p>
          </motion.div>

          <div className="space-y-3">
            {[
              { num: "01", title: "AI 문제 출제", desc: "교과서 기반 자동 문제 생성 및 분석" },
              { num: "02", title: "학생 성과 관리", desc: "출결, 성적, 취약점 통합 분석" },
              { num: "03", title: "시험 자동화", desc: "원클릭 시험지 제작 및 채점" },
              { num: "04", title: "학부모 연동", desc: "실시간 학습 현황 리포트 공유" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <span className="text-[11px] font-extrabold text-blue-400 tracking-wider">{item.num}</span>
                <div>
                  <h3 className="text-[13px] font-bold text-white">{item.title}</h3>
                  <p className="text-[11px] text-white/40">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-8 grid grid-cols-3 gap-3"
          >
            {[
              { value: "500+", label: "도입 학원" },
              { value: "50만+", label: "누적 문제" },
              { value: "98%", label: "만족도" },
            ].map((stat, i) => (
              <div key={i} className="text-center p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[16px] font-extrabold text-white">{stat.value}</div>
                <div className="text-[10px] text-white/40 font-medium mt-0.5">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ─── Promo Timer Component ────────────────────────────────────────────────────

function PromoTimer() {
  const { hours, minutes, seconds } = useCountdown();
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-900 text-white">
      <div className="flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-red-400" />
        <span className="text-[11px] font-bold text-red-400">오픈 특가</span>
      </div>
      <span className="text-[11px] text-white/60">마감까지</span>
      <div className="flex items-center gap-1 ml-auto">
        <TimeBlock value={pad(hours)} label="시" />
        <span className="text-[11px] font-bold text-white/40">:</span>
        <TimeBlock value={pad(minutes)} label="분" />
        <span className="text-[11px] font-bold text-white/40">:</span>
        <TimeBlock value={pad(seconds)} label="초" />
      </div>
      <span className="text-[10px] font-bold text-red-400 animate-pulse">최대 42% OFF</span>
    </div>
  );
}

function TimeBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/10 text-[13px] font-extrabold text-white tabular-nums">
        {value}
      </span>
      <span className="text-[8px] text-white/40">{label}</span>
    </div>
  );
}
