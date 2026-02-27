"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("로그인 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA]">
      <div className="w-full max-w-[400px] px-4">
        {/* Logo & Title */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[#3182F6]">
            <BookOpen className="size-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-[#191F28]">
              다른 영어 학원
            </h1>
            <p className="mt-1 text-[14px] text-[#8B95A1]">관리자 로그인</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-[#F2F4F6] bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Error Message */}
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-600">
                {error}
              </div>
            )}

            {/* Email Field */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="email"
                className="text-[13px] font-medium text-[#4E5968]"
              >
                이메일
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#ADB5BD]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@darun.academy"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 pl-10 text-[14px]"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="password"
                className="text-[13px] font-medium text-[#4E5968]"
              >
                비밀번호
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#ADB5BD]" />
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 pl-10 text-[14px]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="h-11 w-full bg-[#3182F6] text-[14px] font-medium text-white hover:bg-[#1B64DA]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>로그인 중...</span>
                </>
              ) : (
                "로그인"
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[12px] text-[#ADB5BD]">
          관리자 계정 문의: admin@darun.academy
        </p>
      </div>
    </div>
  );
}
