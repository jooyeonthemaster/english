"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Eye, EyeOff, X, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth-browser";

const loginSchema = z.object({
  email: z.string().min(1, "이메일을 입력해주세요").email("올바른 이메일 형식이 아닙니다"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});
type LoginForm = z.infer<typeof loginSchema>;

export type LoginModalProps = {
  open: boolean;
  onClose: () => void;
};

export function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState<"google" | "kakao" | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (!open) {
      reset();
      setError(null);
      setShowPassword(false);
      setSocialLoading(null);
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  async function onSubmit(data: LoginForm) {
    setError(null);
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });
    if (result?.error || !result?.ok) {
      setError("입력하신 이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    const res = await fetch("/api/auth/session");
    const session = await res.json();
    const role = session?.user?.role;
    onClose();
    router.push(role === "DIRECTOR" ? "/director" : "/teacher");
    router.refresh();
  }

  async function handleSocial(provider: "google" | "kakao") {
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
        setError("소셜 로그인을 시작할 수 없습니다.");
        setSocialLoading(null);
      }
    } catch {
      setError("소셜 로그인을 시작할 수 없습니다.");
      setSocialLoading(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          aria-modal="true"
          role="dialog"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[440px] rounded-3xl bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.4)] border border-slate-100"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="px-8 pt-10 pb-8">
              <div className="mb-8">
                <h2 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight">
                  NARA 로그인
                </h2>
                <p className="mt-2 text-[14px] text-slate-500">
                  학원 운영을 더 스마트하게.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label htmlFor="login-modal-email" className="block text-[13px] font-bold text-slate-700 mb-1.5">
                    이메일
                  </label>
                  <input
                    id="login-modal-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@academy.com"
                    className="w-full h-12 px-4 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 transition-all outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-[12px] font-semibold text-rose-500 mt-1.5 ml-1">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="login-modal-password" className="block text-[13px] font-bold text-slate-700 mb-1.5">
                    비밀번호
                  </label>
                  <div className="relative">
                    <input
                      id="login-modal-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="비밀번호 입력"
                      className="w-full h-12 px-4 pr-12 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 transition-all outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      {...register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-[12px] font-semibold text-rose-500 mt-1.5 ml-1">
                      {errors.password.message}
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
                  disabled={isSubmitting || socialLoading !== null}
                  className="w-full h-12 rounded-xl text-[15px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(37,99,235,0.3)]"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    "로그인"
                  )}
                </button>
              </form>

              <div className="relative flex items-center my-5">
                <div className="flex-grow border-t border-slate-200" />
                <span className="mx-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  또는
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSocial("google")}
                  disabled={socialLoading !== null || isSubmitting}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl text-[13px] font-bold text-slate-800 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {socialLoading === "google" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
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
                  onClick={() => handleSocial("kakao")}
                  disabled={socialLoading !== null || isSubmitting}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl text-[13px] font-bold text-[#3C1E1E] bg-[#FEE500] hover:bg-[#FDD835] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {socialLoading === "kakao" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#3C1E1E]" />
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.84 5.18 4.6 6.58l-1.04 3.82c-.1.36.32.66.64.46l4.6-3.04c.4.04.8.06 1.2.06 5.52 0 10-3.48 10-7.88S17.52 3 12 3z" />
                      </svg>
                      <span>카카오</span>
                    </>
                  )}
                </button>
              </div>

              <div className="mt-7 pt-5 border-t border-slate-100 text-center">
                <span className="text-[13px] text-slate-500">처음이신가요? </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push("/register");
                  }}
                  className="text-[13px] font-bold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  학원 가입 신청하기 →
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
