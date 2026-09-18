import type { AdminDetail, AdminDetailSection } from "@/lib/admin-detail-types";
import { formatDateTime } from "@/lib/utils";
import type { PromoMonitoringPayload } from "@/actions/admin/credit-promotion-monitoring";

// 프로모션 모니터링 요약 카드 → 클릭 상세. 패널이 이미 받은 집계(같은 기간)만 쓴다(추가 조회 없음).

export type MonitoringSummaryKey = "views" | "claims" | "visitors" | "academies";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const dt = (v: string | null) => (v ? formatDateTime(v) : "-");

function targetRows(data: PromoMonitoringPayload, by: "views" | "claims") {
  return [
    ...data.perPromotion.map((p) => ({
      name: p.name,
      type: "프로모션",
      sub: p.productName ?? "-",
      views: p.views,
      claims: p.claims,
      academies: p.uniqueAcademies,
      last: p.lastEventAt,
    })),
    ...data.perBundle.map((b) => ({
      name: b.name,
      type: "번들",
      sub: `/b/${b.slug}`,
      views: b.views,
      claims: b.claims,
      academies: b.uniqueAcademies,
      last: b.lastEventAt,
    })),
  ]
    .filter((r) => r[by] > 0)
    .sort((a, b) => b[by] - a[by]);
}

function targetSection(data: PromoMonitoringPayload, by: "views" | "claims"): AdminDetailSection {
  return {
    title: by === "views" ? "링크별 방문" : "링크별 혜택받기 클릭",
    columns: [
      { key: "name", label: "대상", wide: true },
      { key: "type", label: "구분" },
      { key: "views", label: "방문", align: "right" },
      { key: "claims", label: "혜택받기", align: "right" },
      { key: "conv", label: "전환율", align: "right" },
      { key: "last", label: "최근" },
    ],
    rows: targetRows(data, by).map((r) => ({
      name: `${r.name} (${r.sub})`,
      type: r.type,
      views: fmt(r.views),
      claims: fmt(r.claims),
      conv: r.views ? `${Math.round((r.claims / r.views) * 100)}%` : "-",
      last: dt(r.last),
    })),
    emptyText: "이 기간에 집계된 링크 활동이 없습니다.",
  };
}

function academySection(data: PromoMonitoringPayload, by: "views" | "claims"): AdminDetailSection {
  return {
    title: by === "views" ? "학원별 방문" : "학원별 혜택받기 클릭",
    columns: [
      { key: "name", label: "학원", wide: true },
      { key: "members", label: "회원", align: "right" },
      { key: "views", label: "방문", align: "right" },
      { key: "claims", label: "혜택받기", align: "right" },
      { key: "last", label: "최근" },
    ],
    rows: [...data.perAcademy]
      // 방문 학원 = 링크를 눌러본 학원 전체(카드 숫자와 동일), 혜택받기는 클릭한 학원만.
      .filter((a) => by === "views" || a.claims > 0)
      .sort((a, b) => b[by] - a[by])
      .map((a) => ({
        name: a.academyName,
        members: `${fmt(a.members)}명`,
        views: fmt(a.views),
        claims: fmt(a.claims),
        last: dt(a.lastEventAt),
      })),
    emptyText: "로그인 상태로 활동한 학원이 없습니다.",
  };
}

function seriesSection(data: PromoMonitoringPayload): AdminDetailSection {
  return {
    title: `${data.mode === "monthly" ? "월별" : "일별"} 추이 (${data.rangeLabel})`,
    columns: [
      { key: "label", label: "구간" },
      { key: "views", label: "방문", align: "right" },
      { key: "claims", label: "혜택받기", align: "right" },
    ],
    rows: data.series
      .filter((s) => s.views + s.claims > 0)
      .map((s) => ({ label: s.label, views: fmt(s.views), claims: fmt(s.claims) })),
    emptyText: "추이 범위에 활동이 없습니다.",
  };
}

export function monitoringSummaryDetail(
  data: PromoMonitoringPayload,
  key: MonitoringSummaryKey,
): AdminDetail {
  const t = data.totals;
  const subtitle = `집계 기간 ${data.summaryLabel}`;
  const convRate = t.views ? `${Math.round((t.claims / t.views) * 100)}%` : "-";

  switch (key) {
    case "views":
      return {
        title: "총 링크 방문",
        subtitle,
        summary: [
          { label: "총 방문", value: fmt(t.views) },
          { label: "로그인 원장", value: fmt(t.identifiedViews) },
          { label: "익명", value: fmt(t.anonViews) },
        ],
        sections: [targetSection(data, "views"), seriesSection(data)],
      };
    case "claims":
      return {
        title: "혜택받기 클릭",
        subtitle,
        summary: [
          { label: "혜택받기", value: fmt(t.claims) },
          { label: "방문 대비", value: convRate },
        ],
        sections: [targetSection(data, "claims"), academySection(data, "claims")],
      };
    case "visitors":
      return {
        title: "순 방문자",
        subtitle,
        summary: [
          { label: "순 방문자(근사)", value: fmt(t.uniqueVisitors) },
          { label: "식별 회원", value: fmt(data.perMember.length) },
        ],
        sections: [
          {
            title: "로그인한 방문 회원 (익명 제외)",
            columns: [
              { key: "name", label: "회원" },
              { key: "academy", label: "학원", wide: true },
              { key: "views", label: "방문", align: "right" },
              { key: "claims", label: "혜택받기", align: "right" },
              { key: "last", label: "최근" },
            ],
            rows: data.perMember.map((m) => ({
              name: m.name,
              academy: m.academyName,
              views: fmt(m.views),
              claims: fmt(m.claims),
              last: dt(m.lastEventAt),
            })),
            emptyText: "로그인 상태로 방문한 회원이 없습니다.",
          },
        ],
      };
    case "academies":
      return {
        title: "방문 학원",
        subtitle,
        summary: [
          { label: "방문 학원", value: fmt(t.uniqueAcademies) },
          { label: "혜택받기 학원", value: fmt(data.perAcademy.filter((a) => a.claims > 0).length) },
        ],
        sections: [academySection(data, "views")],
      };
  }
}
