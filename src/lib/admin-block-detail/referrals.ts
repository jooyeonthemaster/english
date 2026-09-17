import { prisma } from "@/lib/prisma";
import { REFERRAL_STATUS, labelOf } from "@/lib/admin-labels";
import { detailFields, type AdminDetail, type AdminDetailColumn } from "@/lib/admin-detail-types";
import { kstDateTime, num, truncate } from "@/lib/admin-dashboard-detail/format";

// 추천 관리(/admin/referrals) 상세. 지표 카드는 getReferralOverview 의 stats 와 같은 기준,
// 행 상세는 목록에 없는 값(보상 분배·심사·회수·위험 신호)을 채운다.
// 가입 IP·User-Agent 같은 개인 식별 값은 내보내지 않는다.

export type ReferralStatKey =
  | "total"
  | "granted"
  | "held"
  | "rejected"
  | "clawedBack"
  | "creditsIssued";

const statusLabel = (s: string) => labelOf(REFERRAL_STATUS, s);

const TAKE = 100;

const LIST_SELECT = {
  id: true,
  status: true,
  referrerReward: true,
  referredReward: true,
  fraudScore: true,
  createdAt: true,
  grantedAt: true,
  reviewedAt: true,
  clawedBackAt: true,
  reviewNote: true,
  referrerAcademy: { select: { name: true } },
  referredAcademy: { select: { name: true } },
} as const;

const STAT_META: Record<
  ReferralStatKey,
  { title: string; subtitle: string; statuses: string[] | null; timeCol: { key: string; label: string } }
> = {
  total: {
    title: "총 전환",
    subtitle: "추천 코드로 가입한 모든 추천 기록(상태 무관). 최근 생성 순",
    statuses: null,
    timeCol: { key: "created", label: "생성" },
  },
  granted: {
    title: "지급 완료",
    subtitle: "위험 신호 없이 가입 즉시 양쪽 보상이 자동 지급된 추천(GRANTED). 심사 후 승인 지급분은 제외",
    statuses: ["GRANTED"],
    timeCol: { key: "granted", label: "지급" },
  },
  held: {
    title: "보류",
    subtitle: "위험도가 높아 보상 지급을 멈추고 심사를 기다리는 추천(HELD). '보류 심사' 탭에서 처리",
    statuses: ["HELD"],
    timeCol: { key: "created", label: "생성" },
  },
  rejected: {
    title: "반려",
    subtitle: "보류 심사에서 반려되어 보상이 지급되지 않은 추천(REJECTED)",
    statuses: ["REJECTED"],
    timeCol: { key: "reviewed", label: "심사" },
  },
  clawedBack: {
    title: "회수",
    subtitle: "지급했던 보상을 관리자가 회수한 추천(CLAWED_BACK)",
    statuses: ["CLAWED_BACK"],
    timeCol: { key: "clawed", label: "회수" },
  },
  creditsIssued: {
    title: "지급 크레딧",
    subtitle: "실제로 지급된 추천 보상 합계 = 지급 완료(GRANTED) + 승인 지급(APPROVED)의 추천인 보상 + 가입 학원 보상",
    statuses: ["GRANTED", "APPROVED"],
    timeCol: { key: "granted", label: "지급" },
  },
};

export async function referralStatDetail(key: ReferralStatKey): Promise<AdminDetail> {
  const meta = STAT_META[key];
  const where = meta.statuses ? { status: { in: meta.statuses } } : {};

  const [rows, count, sums] = await Promise.all([
    prisma.referral.findMany({ where, orderBy: { createdAt: "desc" }, take: TAKE, select: LIST_SELECT }),
    prisma.referral.count({ where }),
    prisma.referral.aggregate({ where, _sum: { referrerReward: true, referredReward: true }, _avg: { fraudScore: true } }),
  ]);

  const referrerSum = sums._sum.referrerReward ?? 0;
  const referredSum = sums._sum.referredReward ?? 0;

  const columns: AdminDetailColumn[] = [
    { key: meta.timeCol.key, label: meta.timeCol.label },
    { key: "referrer", label: "추천한 학원", wide: true },
    { key: "referred", label: "가입한 학원", wide: true },
    ...(key === "total" ? [{ key: "status", label: "상태" }] : []),
    { key: "reward", label: "보상(추천/가입)", align: "right" as const },
    { key: "score", label: "위험도", align: "right" as const },
    ...(key === "rejected" || key === "clawedBack" ? [{ key: "note", label: "사유", wide: true }] : []),
  ];

  const detail: AdminDetail = {
    title: meta.title,
    subtitle: meta.subtitle,
    summary: [
      { label: "건수", value: `${num(count)}건` },
      { label: key === "creditsIssued" ? "지급 합계" : "보상 합계", value: `${num(referrerSum + referredSum)}C` },
      { label: "추천인 / 가입 학원", value: `${num(referrerSum)}C / ${num(referredSum)}C` },
      { label: "평균 위험도", value: sums._avg.fraudScore === null ? "—" : sums._avg.fraudScore.toFixed(1) },
    ],
    sections: [],
  };

  // 지급 크레딧은 "누가 많이 받아 갔나"가 핵심 — 추천인 학원별 합계를 먼저 보여준다.
  if (key === "creditsIssued") {
    const top = await prisma.referral.groupBy({
      by: ["referrerAcademyId"],
      where,
      _sum: { referrerReward: true, referredReward: true },
      _count: { _all: true },
      orderBy: { _sum: { referrerReward: "desc" } },
      take: 20,
    });
    const academies = await prisma.academy.findMany({
      where: { id: { in: top.map((t) => t.referrerAcademyId) } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(academies.map((a) => [a.id, a.name]));
    detail.sections!.push({
      title: "추천인 학원별 지급 (상위 20)",
      columns: [
        { key: "academy", label: "추천한 학원", wide: true },
        { key: "count", label: "추천", align: "right" },
        { key: "referrer", label: "추천인 보상", align: "right" },
        { key: "referred", label: "가입 학원 보상", align: "right" },
      ],
      rows: top.map((t) => ({
        academy: nameMap.get(t.referrerAcademyId) ?? "(삭제된 학원)",
        count: `${num(t._count._all)}건`,
        referrer: `${num(t._sum.referrerReward ?? 0)}C`,
        referred: `${num(t._sum.referredReward ?? 0)}C`,
      })),
    });
  }

  detail.sections!.push({
    title: count > TAKE ? `최근 ${TAKE}건 (전체 ${num(count)}건)` : "추천 내역",
    columns,
    rows: rows.map((r) => ({
      created: kstDateTime(r.createdAt),
      granted: kstDateTime(r.grantedAt),
      reviewed: kstDateTime(r.reviewedAt),
      clawed: kstDateTime(r.clawedBackAt),
      referrer: r.referrerAcademy?.name ?? "(삭제된 학원)",
      referred: r.referredAcademy?.name ?? "(삭제된 학원)",
      status: statusLabel(r.status),
      reward: `${num(r.referrerReward)} / ${num(r.referredReward)}C`,
      score: String(r.fraudScore),
      note: truncate(r.reviewNote, 60),
    })),
    emptyText: "해당 추천 기록이 없습니다",
  });

  return detail;
}

type FraudSignal = { code: string; detail: string; weight: number };

function coerceSignals(raw: unknown): FraudSignal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((o) => ({
      code: typeof o.code === "string" ? o.code : "UNKNOWN",
      detail: typeof o.detail === "string" ? o.detail : "",
      weight: typeof o.weight === "number" ? o.weight : 0,
    }));
}

export async function referralRowDetail(id: string): Promise<AdminDetail> {
  const r = await prisma.referral.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      fraudSignals: true,
      reviewedByAdminId: true,
      referredStaffId: true,
      referralCode: { select: { code: true, totalClicks: true, totalSignups: true } },
    },
  });
  if (!r) throw new Error("추천 기록을 찾을 수 없습니다.");

  const [reviewer, staff] = await Promise.all([
    r.reviewedByAdminId
      ? prisma.superAdmin.findUnique({ where: { id: r.reviewedByAdminId }, select: { name: true } })
      : null,
    r.referredStaffId
      ? prisma.staff.findUnique({ where: { id: r.referredStaffId }, select: { name: true } })
      : null,
  ]);

  const signals = coerceSignals(r.fraudSignals);
  const referrer = r.referrerAcademy?.name ?? "(삭제된 학원)";
  const referred = r.referredAcademy?.name ?? "(삭제된 학원)";

  return {
    title: `${referrer} → ${referred}`,
    subtitle: `${statusLabel(r.status)} · 위험도 ${r.fraudScore}`,
    fields: detailFields([
      ["추천인 보상", `${num(r.referrerReward)}C`],
      ["가입 학원 보상", `${num(r.referredReward)}C`],
      ["지급 시각", r.grantedAt && kstDateTime(r.grantedAt)],
      ["심사 시각", r.reviewedAt && kstDateTime(r.reviewedAt)],
      ["회수 시각", r.clawedBackAt && kstDateTime(r.clawedBackAt)],
      ["심사자", reviewer?.name],
      ["위험 신호", signals.length ? `${signals.length}건 · 합계 +${signals.reduce((s, x) => s + x.weight, 0)}` : "없음"],
      ["심사·회수 사유", r.reviewNote, true],
      ["상태", statusLabel(r.status)],
      ["생성", kstDateTime(r.createdAt)],
      ["추천 코드", r.referralCode && `${r.referralCode.code} (클릭 ${num(r.referralCode.totalClicks)} · 가입 ${num(r.referralCode.totalSignups)})`],
      ["가입한 직원", staff?.name],
    ]),
    sections: signals.length
      ? [
          {
            title: "위험도 산정 근거",
            columns: [
              { key: "code", label: "신호" },
              { key: "detail", label: "내용", wide: true },
              { key: "weight", label: "가중치", align: "right" },
            ],
            rows: signals.map((s) => ({ code: s.code, detail: s.detail || "—", weight: `+${s.weight}` })),
          },
        ]
      : [],
  };
}
