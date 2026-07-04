"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, ShieldCheck } from "lucide-react";
import { normalizeStaffCallbackUrl } from "@/lib/auth-redirect";

function CompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl = normalizeStaffCallbackUrl(rawCallbackUrl);
  const [error, setError] = useState<string | null>(() =>
    token ? null : "missing_token",
  );
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!token) return;

    (async () => {
      const result = await signIn("social-bridge", {
        bridgeToken: token,
        redirect: false,
      });
      if (result?.error || !result?.ok) {
        setError("bridge_failed");
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    })();
  }, [token, router, callbackUrl]);

  const loginErrorHref = rawCallbackUrl
    ? `/login?error=${encodeURIComponent(error ?? "bridge_failed")}&callbackUrl=${encodeURIComponent(callbackUrl)}`
    : `/login?error=${encodeURIComponent(error ?? "bridge_failed")}`;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-rose-100 bg-white p-8 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-rose-500" />
            <h1 className="text-lg font-bold text-slate-900">로그인 실패</h1>
          </div>
          <p className="mb-6 text-sm text-slate-600">
            소셜 로그인 처리 중 오류가 발생했어요. 다시 시도해주세요.
          </p>
          <button
            onClick={() => router.replace(loginErrorHref)}
            className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-600">
          로그인 정보를 확인하고 있습니다...
        </p>
      </div>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <CompleteInner />
    </Suspense>
  );
}
