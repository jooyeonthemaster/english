"use client";

// 어법 드릴 로그인 — 학원코드(4자) + 학생코드(6자). 원스크린, 키보드 안전.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, KeyRound, School } from "lucide-react";

export function LoginClient() {
  const router = useRouter();
  const [academyCode, setAcademyCode] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = academyCode.trim().length >= 3 && studentCode.trim().length >= 4;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/grammar-drill/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyCode, studentCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(
          data.error === "RATE_LIMITED"
            ? "시도가 너무 많습니다. 1분 후 다시 시도해 주십시오."
            : "학원코드 또는 학생코드가 올바르지 않습니다.",
        );
        setPending(false);
        return;
      }
      router.replace("/g/home");
    } catch {
      setError("네트워크 오류입니다. 잠시 후 다시 시도해 주십시오.");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-[22rem]">
        <div className="mb-10 text-center">
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--gd-ink)" }}
          >
            <BookOpenCheck className="h-7 w-7 text-white" strokeWidth={1.75} />
          </div>
          <h1 className="gd-t-2xl font-bold tracking-tight">어법 드릴</h1>
          <p className="gd-t-sm mt-2" style={{ color: "var(--gd-ink-2)" }}>
            수능 어법 12유닛 · 개념별 단계별 무한 훈련
          </p>
        </div>

        <form onSubmit={submit} className="gd-card p-5">
          <label className="gd-label block">학원코드</label>
          <div className="mt-1.5 flex items-center gap-2.5 rounded-xl border px-3.5"
            style={{ borderColor: "var(--gd-line-strong)" }}>
            <School className="h-4 w-4 shrink-0" style={{ color: "var(--gd-ink-3)" }} strokeWidth={1.75} />
            <input
              value={academyCode}
              onChange={(e) => setAcademyCode(e.target.value.toUpperCase())}
              placeholder="예: A1B2"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={8}
              className="gd-mono gd-t-lg h-12 w-full bg-transparent font-semibold tracking-[0.2em] outline-none"
            />
          </div>

          <label className="gd-label mt-4 block">학생코드</label>
          <div className="mt-1.5 flex items-center gap-2.5 rounded-xl border px-3.5"
            style={{ borderColor: "var(--gd-line-strong)" }}>
            <KeyRound className="h-4 w-4 shrink-0" style={{ color: "var(--gd-ink-3)" }} strokeWidth={1.75} />
            <input
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
              placeholder="예: X7K2M9"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={12}
              className="gd-mono gd-t-lg h-12 w-full bg-transparent font-semibold tracking-[0.2em] outline-none"
            />
          </div>

          {error && (
            <p className="gd-t-xs mt-3" style={{ color: "var(--gd-bad)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || pending}
            className="gd-btn gd-btn-primary mt-5 w-full"
          >
            {pending ? "확인 중…" : "학습 시작"}
          </button>
        </form>

        <p className="gd-t-2xs mt-5 text-center" style={{ color: "var(--gd-ink-3)" }}>
          코드는 담당 선생님께 받을 수 있습니다.
        </p>
      </div>
    </div>
  );
}
