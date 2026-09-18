"use client";

// 세션 여정 드로어 — URL ?session=<id> 로 열린다(공유 가능).
// 유입 정보 · 기기·지역 · 이벤트 타임라인 · 같은 방문자의 다른 세션 · 방문자 최초 유입 · 연결 학원 링크.

import Link from "next/link";
import { Building2, ExternalLink, History, UserRound } from "lucide-react";
import type { SessionDetailReport } from "@/lib/analytics/reports/sessions";
import { deviceLabel, inAppLabel, sourceLabel } from "@/lib/analytics/channels";
import { fmtDateTime, fmtDuration, fmtInt } from "@/lib/analytics/format";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { useReport } from "../shared/use-report";
import { Badge, ChannelName, ConversionBadge, DrawerCard, InfoList, VisitorBadge, placeText } from "./session-parts";
import { SessionTimeline } from "./session-timeline";

/** src/lib/analytics/reports/sessions.ts SESSION_EVENTS_LIMIT 과 같은 값(서버 모듈은 클라이언트에서 값 import 불가) */
const EVENTS_LIMIT = 2000;

/**
 * 연결 학원 설명 — 연결 시각과 방문 시각의 선후를 보고 고른다.
 * 세션 academyId 가 비었다는 것만으로 「나중에 연결됐다」고 쓰면 실DB 45건 중 15건(연결이 방문보다 앞선 건)이 틀린다.
 */
export function academyLinkNote(
  sessionAcademyId: string | null,
  startedAt: string,
  linkedAt: string | null,
): string {
  if (sessionAcademyId) return "로그인 상태로 방문한 세션";
  if (!linkedAt) return "이 학원에 연결된 브라우저";
  const linked = new Date(linkedAt).getTime();
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(linked) || !Number.isFinite(started)) return "이 학원에 연결된 브라우저";
  return linked >= started
    ? "가입·로그인 전 익명 방문(이후 이 학원에 연결됨)"
    : "로그아웃 상태 방문 — 이미 이 학원에 연결된 브라우저";
}

export function SessionDrawer({
  sessionId,
  onClose,
  onSelectSession,
  onShowAcademy,
}: {
  sessionId: string | null;
  onClose: () => void;
  onSelectSession: (id: string) => void;
  /** 이 학원에 연결된 방문 기록 전체로 목록 전환 */
  onShowAcademy: (academyId: string) => void;
}) {
  const { data, error } = useReport<SessionDetailReport>("session", {
    params: { id: sessionId },
    enabled: !!sessionId,
  });
  // placeholderData 가 직전 세션을 유지하므로, 요청한 id 와 일치할 때만 본문으로 쓴다.
  const detail = data && data.session.id === sessionId ? data : null;

  return (
    <Sheet open={!!sessionId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="gap-0 bg-gray-50 p-0 sm:w-[560px] sm:max-w-[560px]">
        <SheetHeader className="shrink-0 border-b border-gray-100 bg-white px-5 py-4 pr-12">
          <SheetTitle className="text-[15px] text-gray-900">방문 여정</SheetTitle>
          <SheetDescription
            className="text-[12px] tabular-nums text-gray-400"
            title="체류는 탭이 실제로 보인 누적 시간이라 시작~마지막 활동 간격보다 짧을 수 있습니다"
          >
            {detail
              ? `${fmtDateTime(detail.session.startedAt)} 시작 · 마지막 활동 ${fmtDateTime(detail.session.lastSeenAt)} · 체류 ${fmtDuration(detail.session.engagedMs)} · 페이지뷰 ${fmtInt(detail.session.pageviews)} · 커스텀 이벤트 ${fmtInt(detail.session.eventsCount)}`
              : "세션 정보를 불러오는 중"}
          </SheetDescription>
          {detail && (
            <div className="mt-1 flex flex-wrap gap-1">
              <VisitorBadge isNew={detail.session.isNewVisitor} />
              {detail.session.hasConversion && <ConversionBadge />}
              {detail.session.isInternal && (
                <Badge tone="rose" title="관리자 쿠키 보유 또는 운영 호스트가 아닌 방문">
                  내부 트래픽
                </Badge>
              )}
              {detail.session.academyId && (
                <Badge tone="violet" title="로그인 상태의 방문">
                  로그인
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {error && !detail && <ReportError message={error.message} />}
          {!error && !detail && !!sessionId && <ReportSkeleton rows={8} />}
          {detail && <DetailBody detail={detail} onSelectSession={onSelectSession} onShowAcademy={onShowAcademy} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  detail,
  onSelectSession,
  onShowAcademy,
}: {
  detail: SessionDetailReport;
  onSelectSession: (id: string) => void;
  onShowAcademy: (academyId: string) => void;
}) {
  const { session: s, visitor: v, events, otherSessions } = detail;
  const linkedAcademyId = s.academyId ?? v?.academyId ?? null;
  const firstSessionId = v?.firstSessionId ?? null;
  const landingParams = s.landingQuery ? Array.from(new URLSearchParams(s.landingQuery).entries()) : [];
  const linkNote = academyLinkNote(s.academyId, s.startedAt, v?.linkedAt ?? null);
  const pageviewRows = events.filter((e) => e.type === "pageview").length;
  const eventRows = events.length - pageviewRows;

  return (
    <>
      {linkedAcademyId && (
        <section className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-violet-700">
            <Building2 className="size-3.5" aria-hidden /> 연결 학원
          </div>
          <div className="mt-1 text-[14px] font-bold break-words text-gray-900">{s.academyName ?? "(이름 없음)"}</div>
          <p className="mt-0.5 text-[11.5px] text-gray-500">
            {linkNote}
            {v?.linkedAt && ` · 연결 ${fmtDateTime(v.linkedAt)}`}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Link
              href={`/admin/academies/${encodeURIComponent(linkedAcademyId)}`}
              prefetch={false}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Building2 className="size-3.5" aria-hidden /> 학원 상세
            </Link>
            {s.directorStaffId ? (
              <Link
                href={`/admin/members/${encodeURIComponent(s.directorStaffId)}`}
                prefetch={false}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                <UserRound className="size-3.5" aria-hidden /> 회원 상세(원장)
              </Link>
            ) : (
              <span
                className="inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-lg border border-gray-100 bg-white/60 px-3 text-[12px] font-semibold text-gray-300"
                title="이 학원에 원장 계정이 없어 회원 상세로 갈 수 없습니다"
              >
                <UserRound className="size-3.5" aria-hidden /> 회원 상세(원장)
              </span>
            )}
            <button
              type="button"
              onClick={() => onShowAcademy(linkedAcademyId)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-violet-700 hover:bg-violet-100/60"
            >
              <History className="size-3.5" aria-hidden /> 이 학원 방문 기록 전체
            </button>
          </div>
        </section>
      )}

      <DrawerCard title="유입 정보">
        <InfoList
          items={[
            { label: "채널", value: <ChannelName channel={s.channel} /> },
            { label: "소스", value: s.source ? `${sourceLabel(s.source)}${sourceLabel(s.source) !== s.source ? ` (${s.source})` : ""}` : null },
            { label: "매체", value: s.medium },
            { label: "캠페인", value: s.campaign },
            { label: "키워드", value: s.term },
            { label: "콘텐츠", value: s.content },
            { label: "추적 링크", value: s.trackedLink ? `/go/${s.trackedLink}` : null, mono: true },
            { label: "클릭 ID", value: s.clickIdType, mono: true },
            { label: "referrer", value: s.referrer ?? "없음", mono: !!s.referrer },
            { label: "참조 도메인", value: s.referrerHost, mono: true },
            { label: "진입 페이지", value: s.entryPath, mono: true },
            { label: "진입 제목", value: s.entryTitle },
            { label: "종료 페이지", value: s.exitPath, mono: true },
            { label: "호스트", value: s.hostname, mono: true },
          ]}
        />
        {landingParams.length > 0 && (
          <div className="mt-3">
            <div className="text-[11.5px] font-semibold text-gray-400">랜딩 쿼리(허용 키만 저장)</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {landingParams.map(([k, val], i) => (
                <span key={`${k}-${i}`} className="inline-flex max-w-full items-center rounded-md bg-gray-50 px-1.5 py-0.5 font-mono text-[11.5px] break-all text-gray-700">
                  <span className="text-gray-400">{k}=</span>
                  {val}
                </span>
              ))}
            </div>
          </div>
        )}
      </DrawerCard>

      <DrawerCard title="기기·지역">
        <InfoList
          items={[
            { label: "기기", value: `${deviceLabel(s.deviceType)}${s.screen ? ` · ${s.screen}` : ""}` },
            { label: "OS", value: s.os },
            { label: "브라우저", value: s.browser ? `${s.browser}${s.browserVersion ? ` ${s.browserVersion}` : ""}` : null },
            { label: "인앱", value: s.inApp ? inAppLabel(s.inApp) : "아님(일반 브라우저)" },
            { label: "지역", value: placeText(s.country, s.region, s.city) },
            { label: "언어", value: s.language },
            { label: "시간대", value: s.timezone },
          ]}
        />
      </DrawerCard>

      <DrawerCard
        title="이벤트 타임라인"
        right={
          <span
            className="text-[11.5px] tabular-nums text-gray-400"
            title="헤더의 「커스텀 이벤트」는 페이지뷰를 뺀 수입니다"
          >
            {fmtInt(events.length)}개 기록(페이지뷰 {fmtInt(pageviewRows)} · 이벤트 {fmtInt(eventRows)}) · 시간순
          </span>
        }
      >
        <SessionTimeline events={events} startedAt={s.startedAt} truncatedAt={EVENTS_LIMIT} />
      </DrawerCard>

      <DrawerCard
        title="같은 방문자의 다른 세션"
        right={<span className="text-[11.5px] tabular-nums text-gray-400">{v ? `총 ${fmtInt(v.sessionCount)}회 방문` : ""}</span>}
      >
        {otherSessions.length === 0 ? (
          <p className="text-[12px] text-gray-400">이 브라우저의 다른 방문 기록이 없습니다</p>
        ) : (
          <ul className="-mx-2">
            {otherSessions.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onSelectSession(o.id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-2 text-left text-[12.5px] hover:bg-blue-50/50"
                >
                  <span className="w-[92px] shrink-0 tabular-nums text-gray-800">{fmtDateTime(o.startedAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-700">
                    <ChannelName channel={o.channel} />
                    <span className="text-gray-400"> · {sourceLabel(o.source)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-gray-500">
                    PV {fmtInt(o.pageviews)} · {fmtDuration(o.engagedMs)}
                  </span>
                  {o.hasConversion && <ConversionBadge />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DrawerCard>

      <DrawerCard title="방문자 최초 유입">
        {v ? (
          <InfoList
            items={[
              { label: "첫 방문", value: fmtDateTime(v.firstSeenAt) },
              { label: "누적", value: `방문 ${fmtInt(v.sessionCount)}회 · 페이지뷰 ${fmtInt(v.pageviewCount)}` },
              { label: "채널", value: v.firstChannel ? <ChannelName channel={v.firstChannel} /> : null },
              { label: "소스", value: v.firstSource ? sourceLabel(v.firstSource) : null },
              { label: "매체", value: v.firstMedium },
              { label: "캠페인", value: v.firstCampaign },
              { label: "참조 도메인", value: v.firstReferrerHost, mono: true },
              { label: "첫 진입", value: v.firstLandingPath, mono: true },
              { label: "추적 링크", value: v.firstTrackedLink ? `/go/${v.firstTrackedLink}` : null, mono: true },
            ]}
          />
        ) : (
          <p className="text-[12px] text-gray-400">방문자 기록이 없습니다</p>
        )}
        {firstSessionId && firstSessionId !== s.id && (
          <button
            type="button"
            onClick={() => onSelectSession(firstSessionId)}
            className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden /> 첫 방문 세션 보기
          </button>
        )}
        <p className="mt-2 font-mono text-[11px] break-all text-gray-300">visitor {s.visitorId} · session {s.id}</p>
      </DrawerCard>
    </>
  );
}
