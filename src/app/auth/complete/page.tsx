"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, ShieldCheck } from "lucide-react";

function CompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!token) {
      setError("missing_token");
      return;
    }

    (async () => {
      const result = await signIn("social-bridge", {
        bridgeToken: token,
        redirect: false,
      });
      if (result?.error || !result?.ok) {
        setError("bridge_failed");
        return;
      }
      router.replace("/director");
      router.refresh();
    })();
  }, [token, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-sm w-full rounded-2xl border border-rose-100 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-5 h-5 text-rose-500" />
            <h1 className="text-lg font-bold text-slate-900">로그인 실패</h1>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            소셜 로그인 처리 중 오류가 발생했어요. 다시 시도해주세요.
          </p>
          <button
            onClick={() => router.replace(`/login?error=${error}`)}
            className="w-full h-11 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors"
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
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      }
    >
      <CompleteInner />
    </Suspense>
  );
}
