"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TutorLoginForm({
  academySlug,
  academyReady,
}: {
  academySlug: string;
  academyReady: boolean;
}) {
  const router = useRouter();
  const [academyCode, setAcademyCode] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/auth/tutor-student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academySlug, academyCode, studentCode }),
      });
      if (!res.ok) {
        setError("로그인 정보를 확인해주세요.");
        return;
      }
      router.push(`/tutor/${academySlug}/study`);
      router.refresh();
    });
  }

  if (!academyReady) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold leading-6 text-slate-600">
        아직 튜터 로그인이 열리지 않았어요. 선생님께 문의해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <Input
        data-testid="tutor-login-academy-code"
        value={academyCode}
        onChange={(event) => setAcademyCode(event.target.value)}
        placeholder="학원코드"
        inputMode="numeric"
        maxLength={8}
        className="h-12 rounded-2xl border-slate-200 text-base font-bold"
      />
      <Input
        data-testid="tutor-login-student-code"
        value={studentCode}
        onChange={(event) => setStudentCode(event.target.value)}
        placeholder="학생코드"
        inputMode="text"
        maxLength={20}
        className="h-12 rounded-2xl border-slate-200 text-base font-bold"
      />
      {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      <Button
        data-testid="tutor-login-submit"
        onClick={submit}
        disabled={isPending || !academyCode.trim() || !studentCode.trim()}
        className="h-12 w-full rounded-2xl bg-blue-600 text-base font-black hover:bg-blue-700"
      >
        {isPending ? "확인 중" : "시작하기"}
      </Button>
    </div>
  );
}
