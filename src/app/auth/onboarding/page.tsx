"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { decodeJwt } from "jose";

const phoneRegex = /^(0\d{1,2}-?\d{3,4}-?\d{4})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const onboardingSchema = z.object({
  academyName: z.string().min(1, "학원명을 입력해주세요").max(100),
  directorName: z.string().min(1, "원장 이름을 입력해주세요").max(50),
  directorEmail: z.string().regex(emailRegex, "올바른 이메일 형식이 아닙니다"),
  directorPhone: z
    .string()
    .regex(phoneRegex, "올바른 전화번호 형식이 아닙니다")
    .optional()
    .or(z.literal("")),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_or_expired_token: "온보딩 세션이 만료되었습니다. 처음부터 다시 시도해주세요.",
  email_mismatch: "Google 로그인 이메일과 입력하신 이메일이 다릅니다.",
  email_already_used: "이미 등록된 이메일입니다. 로그인 화면에서 시도해주세요.",
  kakao_already_used: "이 카카오 계정은 이미 다른 사용자에게 연결되어 있습니다.",
  supabase_already_used: "이 Google 계정은 이미 다른 사용자에게 연결되어 있습니다.",
  bridge_failed: "세션 생성에 실패했습니다. 다시 시도해주세요.",
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9)
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const decoded = useMemo(() => {
    if (!token) return null;
    try {
      const claims = decodeJwt(token) as {
        provider?: string;
        email?: string | null;
        name?: string | null;
      };
      return {
        provider: (claims.provider ?? "google") as "google" | "kakao",
        email: claims.email ?? null,
        name: claims.name ?? null,
      };
    } catch {
      return null;
    }
  }, [token]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      academyName: "",
      directorName: "",
      directorEmail: "",
      directorPhone: "",
    },
  });

  const phoneValue = watch("directorPhone") ?? "";

  useEffect(() => {
    if (decoded) {
      if (decoded.email) setValue("directorEmail", decoded.email);
      if (decoded.name) setValue("directorName", decoded.name);
    }
  }, [decoded, setValue]);

  if (!token || !decoded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-sm w-full rounded-2xl border border-rose-100 bg-white p-8 shadow-sm text-center">
          <ShieldAlert className="w-6 h-6 text-rose-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">잘못된 접근입니다.</p>
          <button
            onClick={() => router.replace("/login")}
            className="mt-5 w-full h-11 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
          >
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  async function onSubmit(data: OnboardingForm) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, token }),
      });
      const json = await res.json();
      if (!res.ok || !json?.bridgeToken) {
        const code = json?.error ?? "unknown";
        setError(ERROR_MESSAGES[code] ?? "가입 처리 중 오류가 발생했습니다.");
        setSubmitting(false);
        return;
      }
      const result = await signIn("social-bridge", {
        bridgeToken: json.bridgeToken,
        redirect: false,
      });
      if (!result?.ok || result.error) {
        setError(ERROR_MESSAGES.bridge_failed);
        setSubmitting(false);
        return;
      }
      router.replace("/director");
      router.refresh();
    } catch {
      setError("가입 처리 중 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  const isKakao = decoded.provider === "kakao";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-[480px] rounded-3xl bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.4)] border border-slate-100 px-8 py-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex w-9 h-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Sparkles className="w-4 h-4" />
          </span>
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">
            학원 정보 입력
          </h1>
        </div>
        <p className="text-[13.5px] text-slate-500 leading-relaxed mb-6">
          {isKakao ? "카카오" : "Google"} 인증이 완료되었어요. 학원 정보를 한 번만 입력하시면
          바로 시작하실 수 있어요.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
              학원명 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="예: 다른영어학원"
              className="w-full h-12 px-4 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 transition-all outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              {...register("academyName")}
            />
            {errors.academyName && (
              <p className="text-[12px] font-semibold text-rose-500 mt-1.5 ml-1">
                {errors.academyName.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
              원장 이름 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="홍길동"
              className="w-full h-12 px-4 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 transition-all outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              {...register("directorName")}
            />
            {errors.directorName && (
              <p className="text-[12px] font-semibold text-rose-500 mt-1.5 ml-1">
                {errors.directorName.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
              이메일 <span className="text-rose-500">*</span>
              {!isKakao && (
                <span className="ml-2 text-[11px] font-medium text-slate-400">
                  (Google 계정 — 변경 불가)
                </span>
              )}
            </label>
            <input
              type="email"
              placeholder="name@academy.com"
              readOnly={!isKakao}
              className={`w-full h-12 px-4 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 border border-slate-200 transition-all outline-none focus:ring-4 focus:ring-blue-500/10 ${
                !isKakao
                  ? "bg-slate-100 cursor-not-allowed text-slate-600"
                  : "bg-slate-50 focus:bg-white focus:border-blue-500"
              }`}
              {...register("directorEmail")}
            />
            {errors.directorEmail && (
              <p className="text-[12px] font-semibold text-rose-500 mt-1.5 ml-1">
                {errors.directorEmail.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
              연락처 <span className="text-slate-400 font-medium">(선택)</span>
            </label>
            <input
              type="tel"
              value={phoneValue}
              onChange={(e) => setValue("directorPhone", formatPhone(e.target.value))}
              placeholder="010-1234-5678"
              className="w-full h-12 px-4 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 transition-all outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
            {errors.directorPhone && (
              <p className="text-[12px] font-semibold text-rose-500 mt-1.5 ml-1">
                {errors.directorPhone.message}
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl text-[13px] font-semibold text-rose-600 bg-rose-50 border border-rose-100">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-xl text-[15px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(37,99,235,0.3)]"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              "가입 완료하고 시작하기"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  );
}
