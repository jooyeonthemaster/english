"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const inputClass =
  "w-full h-11 px-4 rounded-xl text-[14px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 transition-all outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10";

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as Record<string, unknown> | undefined;

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordError =
    confirmPw && newPw !== confirmPw ? "비밀번호가 일치하지 않습니다" : null;
  const canSubmit =
    currentPw.length > 0 &&
    newPw.length >= 6 &&
    newPw === confirmPw &&
    !saving;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setSuccess(false);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "비밀번호 변경에 실패했습니다");
        return;
      }

      setSuccess(true);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      toast.success("비밀번호가 변경되었습니다");
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-gray-900">설정</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">
          계정 및 학원 설정을 관리합니다
        </p>
      </div>

      {/* Account info */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[14px] font-semibold text-gray-800">내 계정</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                이름
              </div>
              <div className="text-[14px] font-medium text-slate-800">
                {(user?.name as string) || "-"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                이메일
              </div>
              <div className="text-[14px] font-medium text-slate-800">
                {(user?.email as string) || "-"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Lock className="size-4 text-gray-400" strokeWidth={1.8} />
          <h2 className="text-[14px] font-semibold text-gray-800">
            비밀번호 변경
          </h2>
        </div>
        <form onSubmit={handleChangePassword} className="px-6 py-5 space-y-4 max-w-md">
          {/* Current password */}
          <div>
            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">
              현재 비밀번호
            </label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="현재 비밀번호를 입력하세요"
                className={inputClass + " pr-10"}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">
              새 비밀번호
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="6자 이상 입력"
                className={inputClass + " pr-10"}
                autoComplete="new-password"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {newPw.length > 0 && newPw.length < 6 && (
              <p className="text-[11px] text-rose-500 font-semibold mt-1">
                6자 이상 입력해주세요
              </p>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-[12px] font-bold text-slate-500 mb-1.5">
              새 비밀번호 확인
            </label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="새 비밀번호를 다시 입력"
              className={inputClass}
              autoComplete="new-password"
            />
            {passwordError && (
              <p className="text-[11px] text-rose-500 font-semibold mt-1">
                {passwordError}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-10 px-6 rounded-xl text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "변경 중..." : "비밀번호 변경"}
          </button>

          {success && (
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600">
              <CheckCircle2 className="size-3.5" />
              비밀번호가 성공적으로 변경되었습니다
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
