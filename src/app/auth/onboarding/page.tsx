"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { decodeJwt } from "jose";
import { ArrowRight, CheckCircle2, Gift, Loader2, MapPin, ShieldAlert, Sparkles } from "lucide-react";
import { BrandIcon } from "@/components/brand/brand-mark";

const phoneRegex = /^(0\d{1,2}-?\d{3,4}-?\d{4})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const onboardingSchema = z.object({
  academyName: z.string().min(1, "학원명을 입력해주세요.").max(100, "학원명은 100자 이하여야 합니다."),
  directorName: z.string().min(1, "성함을 입력해주세요.").max(50, "성함은 50자 이하여야 합니다."),
  directorEmail: z.string().regex(emailRegex, "올바른 이메일 형식이 아닙니다."),
  directorPhone: z.string().regex(phoneRegex, "올바른 전화번호 형식이 아닙니다."),
  address: z.string().min(1, "학원 주소를 입력해주세요.").max(160, "주소는 160자 이하여야 합니다."),
  estimatedStudents: z.string().optional(),
  agree: z.boolean().refine(Boolean, "무료 이용 및 개인정보 수집 안내에 동의해주세요."),
  // 선택 — 마케팅 정보 수신 동의. 동의 시 SMS·카카오톡·이메일로 신규 기능/혜택 안내를 받는다.
  // (defaultValues로 false 초기화 — react-hook-form resolver 타입 일치를 위해 .default()는 쓰지 않는다)
  agreeMarketing: z.boolean(),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

const STUDENT_OPTIONS = [
  { value: "", label: "선택하지 않음" },
  { value: "20명 이하", label: "20명 이하" },
  { value: "21-50명", label: "21-50명" },
  { value: "51-100명", label: "51-100명" },
  { value: "100명 이상", label: "100명 이상" },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_or_expired_token: "온보딩 세션이 만료되었습니다. 회원가입 화면에서 다시 시작해주세요.",
  email_mismatch: "Google 계정 이메일과 입력한 이메일이 다릅니다.",
  email_already_used: "이미 등록된 이메일입니다. 로그인 화면에서 시도해주세요.",
  kakao_already_used: "이 카카오 계정은 이미 다른 사용자에게 연결되어 있습니다.",
  supabase_already_used: "이 Google 계정은 이미 다른 사용자에게 연결되어 있습니다.",
  no_plan_available: "무료 체험 요금제를 찾을 수 없습니다. 관리자에게 문의해주세요.",
  bridge_failed: "세션 생성에 실패했습니다. 다시 시도해주세요.",
};

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
    control,
    formState: { errors },
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      academyName: "",
      directorName: "",
      directorEmail: "",
      directorPhone: "",
      address: "",
      estimatedStudents: "",
      agree: false,
      agreeMarketing: false,
    },
  });

  const phoneValue = useWatch({ control, name: "directorPhone" }) ?? "";
  const agreeRequired = useWatch({ control, name: "agree" }) ?? false;
  const agreeMarketing = useWatch({ control, name: "agreeMarketing" }) ?? false;
  const allAgreed = agreeRequired && agreeMarketing;
  const isKakao = decoded?.provider === "kakao";

  function toggleAgreeAll(next: boolean) {
    setValue("agree", next, { shouldValidate: true });
    setValue("agreeMarketing", next, { shouldValidate: true });
  }

  useEffect(() => {
    if (!decoded) return;
    if (decoded.email) setValue("directorEmail", decoded.email, { shouldValidate: true });
    if (decoded.name) setValue("directorName", decoded.name, { shouldValidate: true });
  }, [decoded, setValue]);

  if (!token || !decoded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 size-6 text-rose-500" />
          <p className="text-sm font-bold text-slate-700">잘못된 접근입니다.</p>
          <Link
            href="/register"
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700"
          >
            회원가입 다시 시작
          </Link>
        </div>
      </div>
    );
  }

  async function onSubmit(data: OnboardingForm) {
    if (!token) return;
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

      router.replace("/director/workbench/questions/generate");
      router.refresh();
    } catch {
      setError("가입 처리 중 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-[1180px] items-center gap-8 px-5 py-10 lg:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.05fr)] lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-34px_rgba(15,23,42,0.35)] sm:p-8">
          <Link href="/" className="mb-7 inline-flex items-center gap-3">
            <BrandIcon className="size-10" markClassName="size-6" />
            <span>
              <span className="block text-[20px] font-black tracking-tight">SMOAT</span>
              <span className="block text-[9px] font-black uppercase tracking-[0.22em] text-blue-500">
                Onboarding
              </span>
            </span>
          </Link>

          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-500">
                Final Step
              </div>
              <h1 className="mt-2 text-[28px] font-black tracking-tight text-slate-950">
                학원 정보 입력
              </h1>
              <p className="mt-2 break-keep text-[14px] font-semibold leading-6 text-slate-500">
                {isKakao ? "카카오" : "Google"} 인증이 완료되었습니다. 아래 정보로 학원 워크스페이스를 생성합니다.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white">
              7월 1일까지 무료
            </span>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="학원명" error={errors.academyName?.message}>
              <input
                type="text"
                placeholder="예: SMOAT 영어학원"
                className={inputClass}
                autoComplete="organization"
                {...register("academyName")}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="성함" error={errors.directorName?.message}>
                <input
                  type="text"
                  placeholder="홍길동"
                  className={inputClass}
                  autoComplete="name"
                  {...register("directorName")}
                />
              </Field>
              <Field label="연락처" error={errors.directorPhone?.message}>
                <input
                  type="tel"
                  value={phoneValue}
                  onChange={(event) => setValue("directorPhone", formatPhone(event.target.value), { shouldValidate: true })}
                  placeholder="010-1234-5678"
                  className={inputClass}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </Field>
            </div>

            <Field label="이메일" error={errors.directorEmail?.message}>
              <input
                type="email"
                placeholder="name@academy.com"
                readOnly={!isKakao}
                className={`${inputClass} ${!isKakao ? "cursor-not-allowed bg-slate-100 text-slate-600" : ""}`}
                autoComplete="email"
                {...register("directorEmail")}
              />
              {!isKakao && (
                <p className="mt-1.5 break-keep text-[11px] font-semibold text-slate-400">
                  Google 계정 이메일은 보안을 위해 변경할 수 없습니다.
                </p>
              )}
            </Field>

            <Field label="학원 주소" error={errors.address?.message}>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="예: 서울특별시 강남구 테헤란로 123"
                  className={`${inputClass} pl-10`}
                  autoComplete="street-address"
                  {...register("address")}
                />
              </div>
            </Field>

            <Field label="대략적인 재원생 수" optional error={errors.estimatedStudents?.message}>
              <select className={inputClass} {...register("estimatedStudents")}>
                {STUDENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
              {/* 모두 동의 (마스터) — 한 번에 필수+선택 동의. 각 항목은 아래에서 개별 해제 가능. */}
              <label className="flex cursor-pointer select-none items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                <input
                  type="checkbox"
                  checked={allAgreed}
                  onChange={(e) => toggleAgreeAll(e.target.checked)}
                  className="size-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                />
                <span className="text-[14px] font-black text-slate-900">약관에 모두 동의</span>
              </label>

              <div className="mt-1 space-y-0.5 px-1.5">
                {/* 필수 — 이용약관 + 개인정보 수집·이용 */}
                <label className="flex cursor-pointer select-none items-start gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-[18px] rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    {...register("agree")}
                  />
                  <span className="break-keep text-[13px] font-semibold leading-5 text-slate-600">
                    <span className="mr-1 font-black text-blue-600">[필수]</span>
                    <strong className="font-black text-slate-900">7월 1일까지 무료 이용</strong> 및 학원 계정 생성에 필요한
                    개인정보 수집·이용에 동의합니다.
                  </span>
                </label>

                {/* 선택 — 마케팅 수신 동의. 혜택을 매력적으로(사실대로) 강조. */}
                <label className="flex cursor-pointer select-none items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-[18px] rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    {...register("agreeMarketing")}
                  />
                  <span className="break-keep text-[13px] font-semibold leading-5 text-slate-600">
                    <span className="mr-1 font-black text-blue-500">[선택]</span>
                    <strong className="font-black text-slate-900">새 기능 출시·학원 맞춤 기능 제안·무료 혜택</strong> 소식을
                    SMS·카카오톡·이메일로 가장 먼저 받아볼게요. (광고)
                    <span className="mt-1 block break-keep text-[11px] font-semibold text-slate-400">
                      미동의해도 서비스 이용에는 제한이 없으며, 언제든 수신을 해지할 수 있습니다.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            {errors.agree && <p className="text-[12px] font-bold text-rose-500">{errors.agree.message}</p>}

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-bold leading-5 text-rose-700">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[15px] font-black text-white shadow-[0_18px_42px_-24px_rgba(37,99,235,0.95)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  온보딩 완료하고 시작하기
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>
        </section>

        <section className="lg:pl-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[12px] font-black uppercase tracking-[0.22em] text-red-600">
              무료 기간 고정
            </span>
          </div>
          <h2 className="mt-5 max-w-[620px] text-[42px] font-black leading-[1.04] tracking-[-0.04em] text-slate-950 sm:text-[58px] break-keep">
            7월 1일까지
            <br />
            비용 0원.
          </h2>
          <p className="mt-5 max-w-[620px] text-[16px] font-semibold leading-7 text-slate-600 break-keep">
            지문 하나만 넣으면 AI가 수능 동형 모의고사부터 내신형 문항·어휘·문법·해설까지 만들어 드립니다. 완성된 문제는
            클릭 한 번에 실물 시험지로. 결제 없이 7월 1일까지 모든 기능을 무료로 써보세요.
          </p>

          <div className="mt-7 grid gap-3">
            {[
              "지문만 넣으면 수능·내신형 문항이 자동 생성",
              "수능 동형 모의고사를 통째로 자동 출제",
              "PDF·사진 속 기출문제를 그대로 추출·복원",
              "클릭 한 번에 실물 시험지로 완성",
              "어휘·문법·해설·웹툰 학습자료까지 한 번에",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <CheckCircle2 className="size-4 shrink-0 text-blue-600" />
                <span className="break-keep text-[13px] font-black text-slate-700">{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-3xl bg-slate-950 p-5 text-white shadow-[0_30px_80px_-42px_rgba(15,23,42,0.8)]">
            <div className="flex items-center gap-2 text-[13px] font-black text-yellow-300">
              <Sparkles className="size-4" />
              지금은 요금제 고르지 마세요
            </div>
            <p className="mt-2 break-keep text-[13px] font-semibold leading-6 text-white/70">
              실제 지문을 넣고, 동형 모의고사를 만들고, 실물 시험지까지 뽑아본 뒤에 결제 여부를 판단하면 됩니다.
            </p>
          </div>

          {/* 7/1 이후 리워드 티저 — 구체 약속이 아니라 "기대" 느낌으로 */}
          <div className="mt-3 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <Gift className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div>
              <div className="text-[13px] font-black text-amber-700">7월 1일, 끝이 아니라 새 시작 🎁</div>
              <p className="mt-1.5 break-keep text-[13px] font-semibold leading-6 text-amber-900/70">
                먼저 함께해주신 가입자·무료 사용자분들께는 7월 1일부터 다양한 무료 리워드가 준비될 예정이에요.
                지금 들어온 분들만 누리는 혜택, 기대해 주세요.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-black text-slate-600">
        {label}
        {optional ? (
          <span className="ml-1 font-semibold text-slate-400">(선택)</span>
        ) : (
          <span className="ml-1 text-rose-500">*</span>
        )}
      </label>
      {children}
      {error && <p className="mt-1.5 text-[12px] font-bold text-rose-500">{error}</p>}
    </div>
  );
}

const inputClass =
  "h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="size-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  );
}
