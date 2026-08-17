"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, LogIn, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

const ONBOARDING_STEPS = [
  {
    step: "01",
    title: "소셜 계정으로 10초 가입",
    detail: "Google 또는 Kakao 인증만 먼저 끝냅니다. 비밀번호를 새로 만들 필요가 없습니다.",
  },
  {
    step: "02",
    title: "학원 정보는 다음 화면에서 딱 한 번",
    detail: "학원명, 원장/대표 강사 이름, 연락처, 주소, 예상 재원생 규모만 입력합니다.",
  },
  {
    step: "03",
    title: "바로 워크벤치 입장",
    detail: "계정 생성과 동시에 학원 DB, 원장 권한, 무료 체험 크레딧을 같이 준비합니다.",
  },
] as const;

const FIELD_ITEMS = ["학원명", "원장/대표 강사 이름", "연락처", "이메일", "학원 주소", "예상 재원생 수"];

export function ApplicationScene() {
  const reducedMotion = useReducedMotion();

  return (
    <section
      id="apply"
      className="relative w-full overflow-hidden border-t border-slate-200 bg-slate-50 py-14 lg:py-16"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-blue-500/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-[460px] w-[460px] rounded-full bg-rose-500/10 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-[1240px] items-center gap-8 px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:px-10">
        <div className="text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[12px] font-black uppercase tracking-[0.22em] text-red-600">
              2026년 7월 1일까지 무료
            </span>
          </div>

          <h2
            className="mt-5 font-black leading-[1.05] tracking-[-0.035em] text-slate-950 break-keep"
            style={{ fontSize: "clamp(32px, 4.2vw, 62px)" }}
          >
            7월 1일까지 무료!!!
            <br />
            써보고 판단하세요!!!
          </h2>

          <p className="mx-auto mt-5 max-w-[640px] text-[15px] font-semibold leading-7 text-slate-600 sm:text-[17px] lg:mx-0 break-keep">
            신청 폼으로 기다리지 마세요. 소셜 회원가입 후 온보딩에서 학원 정보를 입력하면 원장 계정과
            학원 워크스페이스가 바로 생성됩니다.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-7 text-[14px] font-black text-white shadow-[0_18px_44px_-22px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-[54px] sm:px-8"
            >
              무료로 활용하기
              <ArrowRight className="size-4" strokeWidth={2.5} />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/85 px-6 text-[14px] font-black text-slate-800 shadow-[0_16px_42px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-[54px]"
            >
              <LogIn className="size-4" strokeWidth={2.5} />
              기존 계정 로그인
            </Link>
          </div>
        </div>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-[0_40px_90px_-34px_rgba(37,99,235,0.35)] sm:p-7 lg:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-500">
                Onboarding Flow
              </div>
              <h3 className="mt-1 text-[22px] font-black tracking-tight text-slate-950">
                무료 체험 시작 온보딩
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white">
              <Zap className="size-3.5 text-yellow-300" />
              카드 등록 없음
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {ONBOARDING_STEPS.map((item) => (
              <div
                key={item.step}
                className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-[12px] font-black text-white">
                  {item.step}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-black text-slate-950">{item.title}</span>
                  <span className="mt-1 block text-[12.5px] font-semibold leading-5 text-slate-500">
                    {item.detail}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-[13px] font-black text-red-700">
              <Sparkles className="size-4" />
              7월 1일까지만 무료 기간입니다
            </div>
            <p className="mt-2 text-[12.5px] font-semibold leading-5 text-red-700/80">
              요금제 선택은 나중입니다. 지금은 실제 수업 자료로 돌려보고, 우리 학원에 맞는지 먼저 확인하세요.
            </p>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {FIELD_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                <CheckCircle2 className="size-4 shrink-0 text-blue-600" />
                <span className="text-[12.5px] font-bold text-slate-700">{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-slate-950 p-4 text-white">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-300" />
            <p className="text-[12.5px] font-semibold leading-5 text-white/75">
              신규 소셜 계정은 온보딩을 완료해야 학원 DB가 생성됩니다. 이미 생성된 기존 계정은 지금처럼 바로
              로그인되므로 기존 사용자 접근에는 영향을 주지 않습니다.
            </p>
          </div>

          <Link
            href="/register"
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-[15px] font-black text-white shadow-[0_18px_42px_-24px_rgba(37,99,235,0.95)] transition hover:bg-blue-700"
          >
            <ClipboardCheck className="size-4" />
            온보딩 시작하기
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
