"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SCHOOLS } from "@/lib/constants";
import { loginStudentAction } from "@/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [schoolSlug, setSchoolSlug] = useState(
    searchParams.get("school") ?? ""
  );
  const [studentCode, setStudentCode] = useState("");
  const [error, setError] = useState("");
  const [schoolFocused, setSchoolFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData();
    formData.set("schoolSlug", schoolSlug);
    formData.set("studentCode", studentCode);

    startTransition(async () => {
      const result = await loginStudentAction(formData);
      if (result.success && result.schoolSlug) {
        const callbackUrl = searchParams.get("callbackUrl");
        router.push(callbackUrl ?? `/${result.schoolSlug}`);
      } else {
        setError(result.error ?? "로그인에 실패했습니다.");
      }
    });
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#FAFBF8]">
      {/* Hero decorative section */}
      <div className="relative h-[200px] overflow-hidden gradient-hero">
        <div className="pointer-events-none absolute inset-0 gradient-mesh" />
        {/* Geometric shapes */}
        <div className="pointer-events-none absolute top-8 right-8 size-20 rounded-3xl border border-[#7CB342]/8 rotate-12" />
        <div className="pointer-events-none absolute top-24 right-24 size-10 rounded-xl bg-[#7CB342]/5 -rotate-6" />
        <div className="pointer-events-none absolute top-12 left-10 size-14 rounded-full border border-[#AED581]/8" />
        <div className="pointer-events-none absolute bottom-6 left-1/3 size-6 rounded-lg bg-[#AED581]/6 rotate-45" />

        {/* 영신ai branding */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative z-10 px-5 pt-10"
        >
          <span className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-[#7CB342]">
            영신ai
          </span>
        </motion.div>

        {/* Back link */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.05 }}
          className="relative z-10 px-5 mt-6"
        >
          <Link
            href="/"
            className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6B7265] transition-colors hover:text-[#1A1F16]"
          >
            <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <span>돌아가기</span>
          </Link>
        </motion.div>
      </div>

      {/* Form card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 }}
        className="relative z-10 mx-5 -mt-12 rounded-3xl bg-white shadow-float border border-white/80 p-6 max-w-[440px] self-center w-full"
      >
        {/* Header */}
        <div className="mb-7">
          <h1 className="text-[22px] font-bold tracking-tight text-[#1A1F16]">
            로그인
          </h1>
          <p className="mt-1.5 text-[14px] font-medium text-[#6B7265]">
            학교를 선택하고 학생 코드를 입력하세요
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* School selector */}
          <div className="flex flex-col gap-2">
            <label
              className={`text-[12px] font-bold uppercase tracking-wide transition-colors duration-200 ${
                schoolFocused ? "text-[#7CB342]" : "text-[#9CA396]"
              }`}
            >
              학교
            </label>
            <Select
              value={schoolSlug}
              onValueChange={setSchoolSlug}
              onOpenChange={(open) => setSchoolFocused(open)}
            >
              <SelectTrigger
                className={`h-14 w-full rounded-2xl border-[#E5E7E0] bg-[#FAFBF8] text-[15px] font-medium transition-all duration-300 ${
                  schoolFocused
                    ? "border-[#7CB342]/40 shadow-[0_0_0_3px_rgba(124,179,66,0.08)] bg-white"
                    : ""
                }`}
              >
                <SelectValue placeholder="학교를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {SCHOOLS.map((school) => (
                  <SelectItem
                    key={school.slug}
                    value={school.slug}
                    className="text-[14px]"
                  >
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Student code input */}
          <div className="flex flex-col gap-2">
            <label
              className={`text-[12px] font-bold uppercase tracking-wide transition-colors duration-200 ${
                codeFocused ? "text-[#7CB342]" : "text-[#9CA396]"
              }`}
            >
              학생 코드
            </label>
            <Input
              type="text"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
              onFocus={() => setCodeFocused(true)}
              onBlur={() => setCodeFocused(false)}
              placeholder="학생 코드를 입력하세요"
              className={`h-14 rounded-2xl border-[#E5E7E0] bg-[#FAFBF8] text-[15px] font-medium placeholder:text-[#9CA396] transition-all duration-300 focus-visible:border-[#7CB342]/40 focus-visible:ring-0 focus-visible:shadow-[0_0_0_3px_rgba(124,179,66,0.08)] focus-visible:bg-white`}
              autoComplete="off"
            />
          </div>

          {/* Error message */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2.5 rounded-2xl border border-red-200/60 bg-red-50/80 px-4 py-3.5">
                  <AlertCircle className="size-4 shrink-0 text-red-500" strokeWidth={2.2} />
                  <span className="text-[13px] font-semibold text-red-600">
                    {error}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <motion.div whileTap={{ scale: 0.97 }} className="mt-1">
            <Button
              type="submit"
              disabled={isPending || !schoolSlug || !studentCode.trim()}
              className="relative h-14 w-full overflow-hidden rounded-2xl gradient-primary text-[15px] font-bold text-white shadow-glow-green transition-all duration-300 hover:shadow-[0_6px_28px_rgba(124,179,66,0.3)] disabled:opacity-40 disabled:shadow-none disabled:bg-[#C8CCC2] disabled:bg-none"
            >
              {/* Shimmer overlay on hover */}
              <span className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] hover:translate-x-[100%] transition-all duration-700" />
              {isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  로그인 중...
                </span>
              ) : (
                "로그인"
              )}
            </Button>
          </motion.div>
        </form>
      </motion.div>

      {/* Bottom spacing */}
      <div className="flex-1 min-h-[40px]" />
    </div>
  );
}
