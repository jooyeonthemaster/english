"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Lock, Eye, EyeOff, CheckCircle2, User, Building2, KeyRound, Loader2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { STAFF_PROFILE_UPDATED_EVENT } from "@/lib/staff-profile-events";
import { SaveButton } from "@/components/ui/save-button";

const inputClass =
  "w-full h-11 px-4 rounded-xl text-[14px] text-foreground placeholder:text-muted-foreground bg-muted border border-border transition-all outline-none focus:bg-card focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10";

const STUDENT_OPTIONS = [
  { value: "", label: "선택하지 않음" },
  { value: "20명 이하", label: "20명 이하" },
  { value: "21-50명", label: "21-50명" },
  { value: "51-100명", label: "51-100명" },
  { value: "100명 이상", label: "100명 이상" },
] as const;

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

interface AccountData {
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
  displayTitle: string;
  authProvider: string;
  academyName: string;
  academyPhone: string;
  address: string;
  color: string;
  logoUrl: string;
  code: string;
  estimatedStudents: string;
}

const EMPTY: AccountData = {
  name: "",
  email: "",
  phone: "",
  avatarUrl: "",
  displayTitle: "원장",
  authProvider: "credentials",
  academyName: "",
  academyPhone: "",
  address: "",
  color: "#3B82F6",
  logoUrl: "",
  code: "",
  estimatedStudents: "",
};

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof User;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" strokeWidth={1.8} />
          <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] font-bold text-muted-foreground mb-1.5">{children}</label>;
}

export default function AccountTab() {
  const { update } = useSession();
  const [form, setForm] = useState<AccountData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAcademy, setSavingAcademy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/director/account");
        const data = await res.json();
        if (res.ok) setForm({ ...EMPTY, ...data });
        else toast.error(data.error || "정보를 불러오지 못했습니다");
      } catch {
        toast.error("네트워크 오류가 발생했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isGoogle = form.authProvider === "google";

  function set<K extends keyof AccountData>(key: K, value: AccountData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function patchAccount(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const res = await fetch("/api/director/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "저장에 실패했습니다");
      return null;
    }
    return data as Record<string, unknown>;
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const nextName = form.name.trim();
      const nextEmail = form.email.trim();
      const nextDisplayTitle = form.displayTitle.trim();
      const payload: Record<string, unknown> = {
        name: nextName,
        phone: form.phone,
        avatarUrl: form.avatarUrl,
        displayTitle: nextDisplayTitle,
      };
      if (!isGoogle) payload.email = nextEmail;
      const saved = await patchAccount(payload);
      if (!saved) return;
      const nextTitle =
        typeof saved.displayTitle === "string" && saved.displayTitle.trim()
          ? saved.displayTitle
          : nextDisplayTitle || "원장";
      // 세션(사이드바 이름/이메일) 즉시 갱신
      await update({ name: nextName, email: nextEmail, displayTitle: nextTitle });
      setForm((prev) => ({ ...prev, name: nextName, email: nextEmail, displayTitle: nextTitle }));
      window.dispatchEvent(
        new CustomEvent(STAFF_PROFILE_UPDATED_EVENT, {
          detail: { name: nextName, email: nextEmail, displayTitle: nextTitle },
        }),
      );
      toast.success("프로필이 저장되었습니다");
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveAcademy(e: React.FormEvent) {
    e.preventDefault();
    setSavingAcademy(true);
    try {
      const nextAcademyName = form.academyName.trim();
      const payload: Record<string, unknown> = {
        academyName: nextAcademyName,
        academyPhone: form.academyPhone,
        address: form.address,
        color: form.color,
        logoUrl: form.logoUrl,
        estimatedStudents: form.estimatedStudents,
      };
      if (!(await patchAccount(payload))) return;
      // 세션(사이드바 학원명) 즉시 갱신
      await update({ academyName: nextAcademyName });
      setForm((prev) => ({ ...prev, academyName: nextAcademyName }));
      window.dispatchEvent(
        new CustomEvent(STAFF_PROFILE_UPDATED_EVENT, {
          detail: { academyName: nextAcademyName },
        }),
      );
      toast.success("학원 정보가 저장되었습니다");
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setSavingAcademy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 프로필 */}
      <form onSubmit={handleSaveProfile}>
        <SectionCard title="프로필" icon={User} action={<SaveButton type="submit" saving={savingProfile} title="변경사항 저장" />}>
          <div className="space-y-4 max-w-2xl">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>이름</FieldLabel>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="홍길동"
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>직함</FieldLabel>
                <div className="relative">
                  <BadgeCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-blue-500" strokeWidth={1.8} />
                  <input
                    type="text"
                    value={form.displayTitle}
                    onChange={(e) => set("displayTitle", e.target.value)}
                    placeholder="원장"
                    maxLength={20}
                    className={inputClass + " pl-9!"}
                  />
                </div>
              </div>
              <div>
                <FieldLabel>연락처</FieldLabel>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", formatPhone(e.target.value))}
                  placeholder="010-1234-5678"
                  inputMode="tel"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <FieldLabel>이메일</FieldLabel>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                readOnly={isGoogle}
                placeholder="name@academy.com"
                className={`${inputClass} ${isGoogle ? "cursor-not-allowed opacity-70" : ""}`}
              />
              {isGoogle && (
                <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
                  Google 계정 이메일은 보안을 위해 변경할 수 없습니다.
                </p>
              )}
            </div>
            <div>
              <FieldLabel>프로필 사진 URL (선택)</FieldLabel>
              <input
                type="url"
                value={form.avatarUrl}
                onChange={(e) => set("avatarUrl", e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
          </div>
        </SectionCard>
      </form>

      {/* 학원 정보 */}
      <form onSubmit={handleSaveAcademy}>
        <SectionCard title="학원 정보" icon={Building2} action={<SaveButton type="submit" saving={savingAcademy} title="변경사항 저장" />}>
          <div className="space-y-4 max-w-2xl">
            <div>
              <FieldLabel>학원명</FieldLabel>
              <input
                type="text"
                value={form.academyName}
                onChange={(e) => set("academyName", e.target.value)}
                placeholder="예: SMOAT 영어학원"
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>학원 대표 연락처</FieldLabel>
                <input
                  type="tel"
                  value={form.academyPhone}
                  onChange={(e) => set("academyPhone", formatPhone(e.target.value))}
                  placeholder="02-1234-5678"
                  inputMode="tel"
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>예상 재원생 수</FieldLabel>
                <select
                  value={form.estimatedStudents}
                  onChange={(e) => set("estimatedStudents", e.target.value)}
                  className={inputClass}
                >
                  {STUDENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <FieldLabel>학원 주소</FieldLabel>
              <input
                type="text"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="예: 서울특별시 강남구 테헤란로 123"
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>브랜드 색상</FieldLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => set("color", e.target.value)}
                    className="h-11 w-14 rounded-xl border border-border bg-card cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) => set("color", e.target.value)}
                    placeholder="#3B82F6"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <FieldLabel>로고 URL (선택)</FieldLabel>
                <input
                  type="url"
                  value={form.logoUrl}
                  onChange={(e) => set("logoUrl", e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <FieldLabel>과외쌤 접속 코드</FieldLabel>
              <div className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-muted border border-border text-[15px] font-bold tracking-[0.3em] text-foreground">
                {form.code || "----"}
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
                과외쌤 로그인에 사용되는 코드입니다. (변경 불가)
              </p>
            </div>
          </div>
        </SectionCard>
      </form>

      {/* 비밀번호 변경 */}
      <PasswordSection />
    </div>
  );
}

function PasswordSection() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordError = confirmPw && newPw !== confirmPw ? "비밀번호가 일치하지 않습니다" : null;
  const canSubmit = currentPw.length > 0 && newPw.length >= 6 && newPw === confirmPw && !saving;

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
    <form onSubmit={handleChangePassword}>
      <SectionCard
        title="비밀번호 변경"
        icon={KeyRound}
        action={
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-8 px-4 rounded-lg text-[12px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
            {saving ? "변경 중..." : "비밀번호 변경"}
          </button>
        }
      >
        <div className="space-y-4 max-w-md">
        <div>
          <FieldLabel>현재 비밀번호</FieldLabel>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div>
          <FieldLabel>새 비밀번호</FieldLabel>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {newPw.length > 0 && newPw.length < 6 && (
            <p className="text-[11px] text-rose-500 font-semibold mt-1">6자 이상 입력해주세요</p>
          )}
        </div>

        <div>
          <FieldLabel>새 비밀번호 확인</FieldLabel>
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="새 비밀번호를 다시 입력"
            className={inputClass}
            autoComplete="new-password"
          />
          {passwordError && (
            <p className="text-[11px] text-rose-500 font-semibold mt-1">{passwordError}</p>
          )}
        </div>

        {success && (
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            비밀번호가 성공적으로 변경되었습니다
          </div>
        )}
        </div>
      </SectionCard>
    </form>
  );
}
