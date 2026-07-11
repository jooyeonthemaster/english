import Link from "next/link";
import { ArrowRight, CalendarClock, MapPin, Users } from "lucide-react";
import type { GroupSeminarView } from "@/actions/help-center";
import { SeminarCountdown } from "./seminar-countdown";
import { formatDateTime } from "@/lib/utils";

/**
 * 랜딩 단체 세미나 프로모 배너 — 공개(publicEnabled)·모집중 세미나를 자동으로 띄운다.
 * 내용(제목·혜택·커버·일정·장소)은 관리자 "단체 세미나 관리"에서 수정한 값이 그대로 반영된다.
 */
export function SeminarPromoSection({ seminar }: { seminar: GroupSeminarView }) {
  const dateText =
    seminar.sessionDates.length > 0
      ? seminar.sessionDates.map((d) => formatDateTime(new Date(d))).join(" / ") +
        (seminar.sessionDates.length > 1 ? " 중 택1" : "")
      : seminar.scheduledAt
        ? formatDateTime(new Date(seminar.scheduledAt))
        : "일정 조율 중";
  const locationText = seminar.location?.split("·")[0]?.trim();

  // 신청 마감 시각: 아직 열려 있는 세션 중 가장 이른 closesAt.
  // 세션이 없으면 scheduledAt − registerCloseDays일. 지났으면 타이머 미표시.
  const openCloses = seminar.sessions
    .filter((x) => !x.registrationClosed)
    .map((x) => new Date(x.closesAt).getTime());
  let deadlineMs = openCloses.length > 0 ? Math.min(...openCloses) : null;
  if (deadlineMs == null && seminar.scheduledAt) {
    deadlineMs =
      new Date(seminar.scheduledAt).getTime() -
      (seminar.registerCloseDays ?? 0) * 86_400_000;
  }
  const registrationDeadline =
    seminar.registrationOpen && deadlineMs != null
      ? new Date(deadlineMs).toISOString()
      : null;

  return (
    <section className="mx-auto w-full max-w-[1160px] px-5 pt-10 sm:px-8 sm:pt-14 lg:max-w-[1320px] lg:pt-0">
      <Link
        href="/seminar"
        className="group block overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-50px_rgba(15,23,42,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_40px_90px_-46px_rgba(37,99,235,0.5)] lg:h-[calc(100svh-240px)] lg:min-h-[480px]"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:h-full">
          {/* 좌: 텍스트 */}
          <div className="relative flex flex-col justify-center gap-4 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 text-white sm:p-10 lg:gap-6 lg:p-14">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-blue-500/20 blur-3xl"
            />
            <div className="relative flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500 px-3 py-1 text-[12px] font-black">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-white" />
                </span>
                모집중
              </span>
              {seminar.capacity != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold text-blue-100">
                  <Users className="size-3.5" /> 선착순 {seminar.capacity}명
                </span>
              )}
            </div>

            <h2 className="relative whitespace-pre-line text-2xl font-black leading-tight tracking-tight sm:text-3xl lg:text-[38px] lg:leading-[1.25]">
              {seminar.title}
            </h2>

            {(seminar.benefit?.trim() || seminar.summary) && (
              <p className="relative whitespace-pre-line break-keep text-[13.5px] leading-[1.55] text-slate-300 sm:text-[14px] sm:leading-relaxed lg:text-[16px]">
                {seminar.benefit?.trim() || seminar.summary}
              </p>
            )}

            <div className="relative flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-slate-300 lg:text-[14.5px]">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4 text-blue-300" /> {dateText}
              </span>
              {locationText && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-blue-300" /> {locationText}
                </span>
              )}
            </div>

            {registrationDeadline && (
              <div className="relative">
                <SeminarCountdown deadline={registrationDeadline} />
              </div>
            )}

            <div className="relative pt-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-black text-slate-950 transition-transform group-hover:translate-x-0.5">
                세미나 신청하기
                <ArrowRight className="size-4" />
              </span>
            </div>
          </div>

          {/* 우: 커버 */}
          <div className="relative min-h-[220px] md:min-h-full">
            {seminar.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={seminar.coverImageUrl}
                alt={seminar.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-100 text-slate-400">
                <Users className="size-10" strokeWidth={1.5} />
                <span className="text-sm font-bold tracking-wide">SMOAT 단체 세미나</span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </section>
  );
}
