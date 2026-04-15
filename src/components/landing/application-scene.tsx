"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const STUDENT_OPTIONS = [
  { value: "", label: "선택하지 않음" },
  { value: "20명 이하", label: "20명 이하" },
  { value: "21-50명", label: "21-50명" },
  { value: "51-100명", label: "51-100명" },
  { value: "100명 이상", label: "100명 이상" },
];

interface FormState {
  academyName: string;
  directorName: string;
  directorPhone: string;
  directorEmail: string;
  address: string;
  estimatedStudents: string;
  message: string;
  agree: boolean;
}

const INITIAL: FormState = {
  academyName: "",
  directorName: "",
  directorPhone: "",
  directorEmail: "",
  address: "",
  estimatedStudents: "",
  message: "",
  agree: false,
};

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

const inputCls =
  "h-12 w-full rounded-lg border border-blue-100 bg-white px-4 text-[14px] text-gray-900 placeholder:text-gray-400 transition-colors outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20 disabled:opacity-60";

const labelCls = "block text-[13px] font-bold text-blue-900 mb-1.5";

export function ApplicationScene() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.agree) {
      setError("개인정보 수집·이용에 동의해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/landing/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, desiredPlan: "FREE_MAY_2026" }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error || "접수 중 오류가 발생했습니다.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setForm(INITIAL);
    setSubmitted(false);
    setError(null);
  }

  return (
    <section
      id="apply"
      className="relative w-full overflow-hidden py-24 lg:py-28"
      style={{ backgroundColor: "#F8FAFC", borderTop: "1px solid #E2E8F0" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0) 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(96,165,250,0.1) 0%, rgba(96,165,250,0) 70%)" }}
      />

      <div className="relative max-w-[1280px] mx-auto px-6 lg:px-10">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
            <span className="text-[#1D4ED8] text-[13px] font-bold uppercase tracking-[0.25em]">
              모집 중 · 2026년 5월 한정 캠페인
            </span>
          </div>
        </div>

        <h2
          className="font-black text-gray-900 text-center leading-[1.1] mb-5"
          style={{ fontSize: "clamp(36px, 5vw, 76px)", letterSpacing: "-0.035em" }}
        >
          선착순 <span className="text-[#3B82F6] border-b-4 border-[#3B82F6] pb-1">100명</span>,
          <br />
          사전예약 접수 중.
        </h2>

        <p
          className="text-gray-600 text-center mx-auto mb-12 font-medium leading-[1.8] max-w-2xl"
          style={{
            fontSize: "clamp(15px, 1.5vw, 19px)",
            letterSpacing: "-0.01em",
            wordBreak: "keep-all",
          }}
        >
          지문 분석부터 시험지 출력까지, NARA의 모든 기능을 5월 한 달간 제한 없이 사용할 수 있는 기회입니다.
        </p>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white rounded-3xl p-8 lg:p-12 max-w-[1100px] mx-auto border border-blue-100"
          style={{ boxShadow: "0 40px 80px -20px rgba(59,130,246,0.1), 0 2px 10px rgba(59,130,246,0.05)" }}
        >
          {!submitted ? (
            <form onSubmit={handleSubmit} noValidate>
              <div className="flex items-baseline justify-between mb-8 flex-wrap gap-3 border-b border-blue-50 pb-6">
                <div>
                  <div className="text-[12px] font-bold tracking-[0.2em] text-[#60A5FA] mb-1 uppercase">
                    Free Credit Application
                  </div>
                  <h3 className="text-[24px] font-black text-gray-900 tracking-tight">무료 크레딧 사전예약</h3>
                </div>
                <p className="text-[14px] text-gray-500 font-medium">
                  접수 후 24시간 내 담당자가 연락드립니다.
                </p>
              </div>

              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-800 text-[14px] font-medium p-4 rounded-xl">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-6">
                <div>
                  <label htmlFor="academyName" className={labelCls}>
                    학원명 <span className="text-[#3B82F6]">*</span>
                  </label>
                  <input
                    id="academyName"
                    type="text"
                    required
                    value={form.academyName}
                    onChange={(e) => update("academyName", e.target.value)}
                    placeholder="예: 나라영어학원"
                    className={inputCls}
                    autoComplete="organization"
                  />
                </div>
                <div>
                  <label htmlFor="directorName" className={labelCls}>
                    원장 성함 <span className="text-[#3B82F6]">*</span>
                  </label>
                  <input
                    id="directorName"
                    type="text"
                    required
                    value={form.directorName}
                    onChange={(e) => update("directorName", e.target.value)}
                    placeholder="홍길동"
                    className={inputCls}
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="directorPhone" className={labelCls}>
                    연락처 <span className="text-[#3B82F6]">*</span>
                  </label>
                  <input
                    id="directorPhone"
                    type="tel"
                    required
                    value={form.directorPhone}
                    onChange={(e) => update("directorPhone", formatPhone(e.target.value))}
                    placeholder="010-0000-0000"
                    className={inputCls}
                    autoComplete="tel"
                    inputMode="numeric"
                  />
                </div>

                <div>
                  <label htmlFor="directorEmail" className={labelCls}>
                    이메일 <span className="text-[#3B82F6]">*</span>
                  </label>
                  <input
                    id="directorEmail"
                    type="email"
                    required
                    value={form.directorEmail}
                    onChange={(e) => update("directorEmail", e.target.value)}
                    placeholder="director@example.com"
                    className={inputCls}
                    autoComplete="email"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="address" className={labelCls}>
                    학원 주소 <span className="text-[#3B82F6]">*</span>
                  </label>
                  <input
                    id="address"
                    type="text"
                    required
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="예: 서울특별시 강남구 테헤란로 123"
                    className={inputCls}
                    autoComplete="street-address"
                  />
                </div>

                <div>
                  <label htmlFor="estimatedStudents" className={labelCls}>
                    예상 재원생 수
                  </label>
                  <select
                    id="estimatedStudents"
                    value={form.estimatedStudents}
                    onChange={(e) => update("estimatedStudents", e.target.value)}
                    className={inputCls}
                  >
                    {STUDENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="message" className={labelCls}>
                    문의사항
                  </label>
                  <input
                    id="message"
                    type="text"
                    value={form.message}
                    onChange={(e) => update("message", e.target.value)}
                    placeholder="담당자에게 전달할 내용이 있다면 남겨주세요."
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between flex-wrap gap-6 pt-6 border-t border-blue-50">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.agree}
                    onChange={(e) => update("agree", e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-gray-300 text-[#3B82F6] focus:ring-[#3B82F6]/30"
                  />
                  <span className="text-[14px] text-gray-700 leading-[1.6]">
                    <strong className="font-bold text-gray-900">개인정보 수집·이용에 동의합니다.</strong>
                    <span className="text-gray-500 block sm:inline mt-1 sm:mt-0">
                      {" "}
                      (학원명·연락처·이메일·주소는 캠페인 심사 및 연락 목적으로만 사용됩니다.)
                    </span>
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="h-14 px-12 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white font-black text-[16px] tracking-tight transition-all shadow-[0_5px_20px_rgba(59,130,246,0.3)] hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {submitting ? "접수 중..." : "무료 크레딧 사전예약 →"}
                </button>
              </div>
            </form>
          ) : (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="py-12 text-center"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-[#3B82F6] text-white flex items-center justify-center shadow-[0_10px_20px_rgba(59,130,246,0.2)]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M5 12.5L10 17.5L19 7.5"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-[32px] font-black text-gray-900 mt-6 tracking-tight">
                사전예약이 완료되었습니다
              </h3>
              <p className="text-[16px] font-medium text-gray-600 mt-4 leading-[1.7]">
                24시간 내 담당자가 기재하신 연락처로 안내드립니다.
              </p>
              <div className="mt-8">
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[14px] font-bold text-[#3B82F6] hover:text-[#1E3A8A] underline-offset-4 hover:underline transition-colors"
                >
                  다른 학원 신청하기
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
