import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  ACADEMY_STATUS,
  AUTH_PROVIDER,
  PLAN_TIER,
  SUBSCRIPTION_STATUS,
  labelOf,
} from "@/lib/admin-labels";
import type { MemberListItem } from "@/actions/admin-members";

// 회원 관리 목록 행 → 호버 상세. 목록에 이미 실려 온 값만 쓴다(추가 조회 없음).
// 회원 수만큼 행마다 호출되므로 문자열 조립만 하는 가벼운 순수 함수로 유지한다.
// 상태·경로 라벨은 레지스트리(src/lib/admin-labels)에서만 가져온다.

type DateLike = Date | string | null | undefined;

const dt = (v: DateLike) => (v ? formatDateTime(v) : null);
const day = (v: DateLike) => (v ? formatDate(v) : null);
const c = (n: number) => `${n.toLocaleString("ko-KR")}C`;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function subscriptionText(sub: MemberListItem["subscription"]) {
  if (!sub) return null;
  const status = labelOf(SUBSCRIPTION_STATUS, sub.status);
  const end = day(sub.currentPeriodEnd);
  return `${sub.planName} (${labelOf(PLAN_TIER, sub.planTier)}) · ${status}${end ? ` · ~${end}` : ""}`;
}

function purchaseText(p: MemberListItem["latestPurchase"]) {
  if (!p) return null;
  return `${won(p.price)} · ${c(p.creditAmount)} · ${formatDate(p.purchasedAt)}`;
}

function balanceSummary(balance: MemberListItem["creditBalance"]) {
  if (!balance) return undefined;
  return [
    { label: "잔액", value: c(balance.balance) },
    { label: "월 할당", value: c(balance.monthlyAllocation) },
    { label: "보너스", value: c(balance.bonusCredits) },
    { label: "누적 사용", value: c(balance.totalConsumed) },
  ];
}

/** 회원별 보기 행 — 목록 열에 없는 값(연락처·로그인·구독·잔액 구성·메모 전문) 위주. */
export function memberRowDetail(m: MemberListItem): AdminDetail {
  const login = [
    labelOf(AUTH_PROVIDER, m.authProvider ?? "credentials"),
    m.marketingConsent ? "마케팅 동의" : "마케팅 미동의",
  ].join(" · ");
  const academyState = [
    labelOf(ACADEMY_STATUS, m.academy.status),
    m.isInternal ? "내부/테스트 계정" : null,
    m.isActive ? null : "계정 비활성",
  ]
    .filter(Boolean)
    .join(" · ");

  // 호버 전용(click="none")이라 항목은 팝오버에 다 보이는 8개 이내로 둔다.
  return {
    title: `${m.name} · ${m.academy.name}`,
    subtitle: m.email,
    summary: balanceSummary(m.creditBalance),
    fields: detailFields([
      ["휴대폰", m.phone],
      ["로그인 · 수신", login],
      ["마지막 로그인", dt(m.lastLoginAt) ?? "기록 없음"],
      ["학원 상태", academyState],
      ["구독", subscriptionText(m.subscription)],
      ["최근 구매", purchaseText(m.latestPurchase)],
      ["누적 지급", m.creditBalance && c(m.creditBalance.totalAllocated)],
      ["메모", m.academy.memo?.trim(), true],
    ]),
  };
}

type AcademyGroupLike = {
  academyId: string;
  academyName: string;
  slug: string;
  status: string;
  memo: string | null;
  latestPurchase: MemberListItem["latestPurchase"];
  creditBalance: MemberListItem["creditBalance"];
  members: MemberListItem[];
};

/** 학원별 보기 행 — 학원 상태·잔액 구성 + 소속 회원 전체 목록. */
export function academyGroupDetail(g: AcademyGroupLike): AdminDetail {
  const rep = g.members[0];
  const balance = g.creditBalance;
  return {
    title: g.academyName,
    subtitle: `/${g.slug} · 회원 ${g.members.length}명`,
    summary: [
      ...(balance
        ? [
            { label: "잔액", value: c(balance.balance) },
            { label: "보너스", value: c(balance.bonusCredits) },
            { label: "소멸일", value: day(balance.expiresAt) ?? "없음" },
          ]
        : [{ label: "잔액", value: "미생성" }]),
      { label: "회원", value: `${g.members.length}명` },
    ],
    fields: detailFields([
      ["학원 상태", labelOf(ACADEMY_STATUS, g.status)],
      ["주소(slug)", `/${g.slug}`],
      ["구독", rep ? subscriptionText(rep.subscription) : null],
      ["최근 구매", g.latestPurchase && `${g.latestPurchase.name} · ${purchaseText(g.latestPurchase)}`, true],
      ["월 할당", balance && c(balance.monthlyAllocation)],
      ["누적 지급 / 사용", balance && `${c(balance.totalAllocated)} / ${c(balance.totalConsumed)}`],
      ["메모", g.memo?.trim(), true],
    ]),
    sections: [
      {
        title: "소속 회원",
        columns: [
          { key: "name", label: "이름" },
          { key: "role", label: "역할" },
          { key: "email", label: "이메일", wide: true },
          { key: "phone", label: "휴대폰" },
          { key: "active", label: "최근 활동" },
        ],
        rows: g.members.map((m) => ({
          name: m.isActive ? m.name : `${m.name} (비활성)`,
          role: "원장",
          email: m.email,
          phone: m.phone ?? "—",
          active: dt(m.lastActiveAt) ?? "활동 없음",
        })),
        emptyText: "소속 회원이 없습니다",
      },
    ],
    link: rep ? { label: "대표 회원 상세로 이동", href: `/admin/members/${rep.id}` } : undefined,
  };
}
