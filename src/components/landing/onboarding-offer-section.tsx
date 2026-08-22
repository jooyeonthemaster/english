import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  Coins,
  Gift,
  MonitorPlay,
  UserRound,
  Video,
} from "lucide-react";
import { Item, Stagger } from "./shared/reveal";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { SEMINAR_ONBOARDING_FREE_CREDITS } from "@/lib/help-center";

/**
 * 랜딩 1:1 세미나 온보딩 혜택 섹션 (종료된 단체 세미나 프로모 배너 대체).
 * 신청 → 온라인 1:1 사용법 안내 → 무료 크레딧 지급 흐름을 안내한다.
 * 지급 문구·수치는 SEMINAR_ONBOARDING_FREE_CREDITS 하나만 고치면 신청 폼과 함께 바뀐다.
 */
const ONBOARDING_FREE_CREDITS = SEMINAR_ONBOARDING_FREE_CREDITS;

/** 신청 후 실제로 상담이 이뤄지는 경로(비로그인 진입 시 로그인으로 우회 후 복귀). */
const APPLY_HREF = "/director/help/seminar";

// 300 크레딧이 실제로 무엇을 할 수 있는지 — 단가 상수에서 파생(문구가 단가와 어긋나지 않게).
const AUTO_QUESTION_COUNT = Math.floor(
  ONBOARDING_FREE_CREDITS / CREDIT_COSTS.AUTO_GEN_BATCH,
);
const WORKSHEET_COUNT = Math.floor(
  ONBOARDING_FREE_CREDITS / CREDIT_COSTS.PASSAGE_ANALYSIS,
);

const STEPS = [
  {
    icon: CalendarCheck2,
    step: "01",
    title: "1:1 세미나 신청",
    detail: "원하는 날짜·시간을 고르면 담당자가 확인 후 연락드립니다.",
  },
  {
    icon: MonitorPlay,
    step: "02",
    title: "온라인으로 사용 방법 안내",
    detail:
      "Zoom으로 약 60분. 문제 생성부터 시험지·학습지·리포트까지 실제 화면 그대로 알려드립니다.",
  },
  {
    icon: Coins,
    step: "03",
    title: `${ONBOARDING_FREE_CREDITS} 크레딧 무료 지급`,
    detail: "세미나 진행 후 학원 계정으로 바로 지급됩니다. 비용은 0원입니다.",
  },
] as const;

export function OnboardingOfferSection() {
  return (
    <section
      id="section-onboarding"
      className="relative w-full overflow-hidden bg-white px-5 py-14 sm:px-8 sm:py-16 lg:flex lg:min-h-[100svh] lg:items-center lg:py-0 lg:pt-24"
    >
      <div className="mx-auto w-full max-w-[1160px] lg:max-w-[1320px]">
        <Stagger className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-50px_rgba(15,23,42,0.55)]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
            {/* 좌: 오퍼 + 단계 */}
            <div className="relative flex flex-col justify-center gap-6 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 text-white sm:p-10 lg:p-14">
              <div
                aria-hidden
                className="pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-blue-500/20 blur-3xl"
              />

              <Item className="relative flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500 px-3 py-1 text-[12px] font-black">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-white" />
                  </span>
                  상시 접수중
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold text-blue-100">
                  <UserRound className="size-3.5" /> 원장님 1:1 맞춤
                </span>
              </Item>

              <Item>
                <h2 className="relative break-keep text-2xl font-black leading-tight tracking-tight sm:text-3xl lg:text-[38px] lg:leading-[1.25]">
                  1:1 세미나 신청하면
                  <br />
                  <span className="bg-gradient-to-r from-[#7DB0FF] to-[#3B82F6] bg-clip-text text-transparent">
                    {ONBOARDING_FREE_CREDITS} 크레딧
                  </span>
                  을 무료로 드립니다
                </h2>
                <p className="relative mt-3 break-keep text-[13.5px] leading-[1.6] text-slate-300 sm:text-[15px] lg:text-[16px]">
                  온라인으로 우리 학원 상황에 맞춰 사용 방법을 1:1로 안내해
                  드리고, 신청하신 원장님께는 {ONBOARDING_FREE_CREDITS} 크레딧을
                  무료로 드립니다.
                </p>
              </Item>

              <Item className="relative">
                <ol className="space-y-3">
                  {STEPS.map(({ icon: Icon, step, title, detail }) => (
                    <li
                      key={step}
                      className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-200">
                        <Icon className="size-4.5" strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] font-black tabular-nums text-blue-300">
                            {step}
                          </span>
                          <span className="text-[14px] font-black text-white">
                            {title}
                          </span>
                        </span>
                        <span className="mt-0.5 block break-keep text-[12.5px] leading-snug text-slate-300">
                          {detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Item>

              <Item className="relative flex flex-col gap-3 sm:flex-row sm:items-center" pop>
                <Link
                  href={APPLY_HREF}
                  className="group inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-black text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-blue-50"
                >
                  1:1 세미나 신청하기
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full border border-white/[0.28] bg-white/[0.12] px-7 text-[14px] font-black text-white transition-all hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/20"
                >
                  회원가입하고 받기
                </Link>
              </Item>

              <Item className="relative">
                <p className="text-[12px] font-medium text-slate-400">
                  · 신청은 무료이며, 회원가입 후 1분이면 접수됩니다.
                </p>
              </Item>
            </div>

            {/* 우: 혜택 요약 */}
            <div className="relative flex flex-col justify-center gap-5 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 p-8 sm:p-10 lg:p-12">
              <Item className="flex flex-col items-center text-center" pop>
                <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_18px_40px_-18px_rgba(37,99,235,0.9)]">
                  <Gift className="size-7" strokeWidth={2} />
                </span>
                <span className="mt-4 text-[13px] font-black uppercase tracking-[0.14em] text-blue-600">
                  FREE CREDITS
                </span>
                <span className="mt-1 text-[52px] font-black leading-none tracking-tight text-slate-950 tabular-nums">
                  {ONBOARDING_FREE_CREDITS}
                  <span className="ml-1 text-[20px] font-black text-slate-500">
                    크레딧
                  </span>
                </span>
                <span className="mt-2 break-keep text-[13px] font-bold text-slate-500">
                  1:1 세미나 신청 원장님께 무료 지급
                </span>
              </Item>

              <Item className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 text-center shadow-[0_18px_45px_-34px_rgba(15,23,42,0.6)]">
                  <div className="text-[20px] font-black tabular-nums text-slate-950">
                    약 {AUTO_QUESTION_COUNT}
                    <span className="text-[13px] text-slate-500">문항</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] font-bold text-slate-500">
                    자동 출제 분량
                  </div>
                </div>
                <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 text-center shadow-[0_18px_45px_-34px_rgba(15,23,42,0.6)]">
                  <div className="text-[20px] font-black tabular-nums text-slate-950">
                    약 {WORKSHEET_COUNT}
                    <span className="text-[13px] text-slate-500">편</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] font-bold text-slate-500">
                    학습지 생성 분량
                  </div>
                </div>
              </Item>

              <Item className="flex flex-wrap justify-center gap-2">
                {[
                  { icon: Video, label: "온라인 Zoom" },
                  { icon: CalendarCheck2, label: "약 60분" },
                  { icon: UserRound, label: "1:1 맞춤 안내" },
                ].map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white bg-white/80 px-3 py-1.5 text-[12px] font-bold text-slate-600"
                  >
                    <Icon className="size-3.5 text-blue-500" strokeWidth={2.1} />
                    {label}
                  </span>
                ))}
              </Item>
            </div>
          </div>
        </Stagger>
      </div>
    </section>
  );
}
