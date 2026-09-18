import { prisma } from "@/lib/prisma";
import type { DashboardDetail } from "@/lib/admin-dashboard-detail-types";
import { getTodayKST, getYesterdayKST } from "@/lib/date-utils";
import { OPERATION_TYPE_LABELS } from "@/lib/admin-members-labels";
import { OPERATION_LABELS } from "@/lib/credit-costs";
import { workbenchDomainLabel } from "@/lib/admin-activity-labels";
import { ACADEMY_STATUS, labelOf } from "@/lib/admin-labels";
import { academyNames } from "./revenue";
import { kstDateTime, kstTime, nameOf, num, truncate } from "./format";

// 오늘 현황(신규 학원·생성 문제·크레딧 소모·활동 학원) + 오늘 오류 상세.

export async function signupsDetail(): Promise<DashboardDetail> {
  const todayStart = getTodayKST();
  const rows = await prisma.academy.findMany({
    where: { createdAt: { gte: todayStart } },
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      status: true,
      createdAt: true,
      staff: { where: { role: "DIRECTOR" }, select: { name: true, email: true }, take: 1 },
    },
  });
  return {
    title: "오늘 신규 학원",
    summary: [{ label: "가입", value: `${num(rows.length)}곳` }],
    sections: [
      {
        columns: [
          { key: "at", label: "가입" },
          { key: "name", label: "학원" },
          { key: "director", label: "원장", wide: true },
          { key: "status", label: "상태", align: "right" },
        ],
        rows: rows.map((r) => ({
          at: kstTime(r.createdAt),
          name: r.name,
          director: r.staff[0] ? `${r.staff[0].name} · ${r.staff[0].email}` : "—",
          status: labelOf(ACADEMY_STATUS, r.status),
        })),
        emptyText: "오늘 가입한 학원이 없습니다",
      },
    ],
    link: { label: "학원·회원 관리로 이동", href: "/admin/members" },
  };
}

export async function questionsDetail(): Promise<DashboardDetail> {
  const todayStart = getTodayKST();
  const where = { deletedAt: null, createdAt: { gte: todayStart } };
  const [byAcademy, byCategory] = await Promise.all([
    prisma.question.groupBy({ by: ["academyId"], where, _count: { _all: true } }),
    prisma.question.groupBy({ by: ["learningCategory"], where, _count: { _all: true } }),
  ]);
  const names = await academyNames(byAcademy.map((r) => r.academyId));
  const total = byAcademy.reduce((s, r) => s + r._count._all, 0);
  return {
    title: "오늘 생성 문제",
    summary: [
      { label: "문제", value: `${num(total)}개` },
      { label: "생성 학원", value: `${num(byAcademy.length)}곳` },
    ],
    sections: [
      {
        title: "학원별",
        columns: [
          { key: "academy", label: "학원" },
          { key: "count", label: "문제 수", align: "right" },
        ],
        rows: byAcademy
          .sort((a, b) => b._count._all - a._count._all)
          .map((r) => ({ academy: nameOf(names, r.academyId), count: num(r._count._all) })),
        emptyText: "오늘 생성된 문제가 없습니다",
      },
      {
        title: "영역별",
        columns: [
          { key: "category", label: "영역" },
          { key: "count", label: "문제 수", align: "right" },
        ],
        rows: byCategory
          .sort((a, b) => b._count._all - a._count._all)
          .map((r) => ({
            category: CATEGORY_LABELS[r.learningCategory ?? ""] ?? r.learningCategory ?? "미분류",
            count: num(r._count._all),
          })),
      },
    ],
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  VOCAB: "어휘",
  INTERPRETATION: "해석",
  GRAMMAR: "어법",
  COMPREHENSION: "독해",
};

/** 회원관리 라벨 → 크레딧 단가표 라벨 순으로 찾는다(신규 기능은 단가표에만 있다). */
function operationLabel(op: string | null) {
  if (!op) return "기타";
  return OPERATION_TYPE_LABELS[op] ?? (OPERATION_LABELS as Record<string, string>)[op] ?? op;
}

async function consumptionByAcademy(gte: Date, lt?: Date) {
  return prisma.creditTransaction.groupBy({
    by: ["academyId"],
    where: { type: "CONSUMPTION", createdAt: lt ? { gte, lt } : { gte } },
    _sum: { amount: true },
    _count: { _all: true },
  });
}

export async function creditsDetail(): Promise<DashboardDetail> {
  const todayStart = getTodayKST();
  const [byAcademy, byOperation, yesterday] = await Promise.all([
    consumptionByAcademy(todayStart),
    prisma.creditTransaction.groupBy({
      by: ["operationType"],
      where: { type: "CONSUMPTION", createdAt: { gte: todayStart } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.creditTransaction.aggregate({
      where: { type: "CONSUMPTION", createdAt: { gte: getYesterdayKST(), lt: todayStart } },
      _sum: { amount: true },
    }),
  ]);
  const names = await academyNames(byAcademy.map((r) => r.academyId));
  const total = byAcademy.reduce((s, r) => s + Math.abs(r._sum.amount ?? 0), 0);
  return {
    title: "오늘 크레딧 소모",
    summary: [
      { label: "오늘", value: `${num(total)}C` },
      { label: "어제", value: `${num(Math.abs(yesterday._sum.amount ?? 0))}C` },
    ],
    sections: [
      {
        title: "기능별",
        columns: [
          { key: "op", label: "기능" },
          { key: "count", label: "사용 횟수", align: "right" },
          { key: "credits", label: "크레딧", align: "right" },
        ],
        rows: byOperation
          .sort((a, b) => (a._sum.amount ?? 0) - (b._sum.amount ?? 0))
          .map((r) => ({
            op: operationLabel(r.operationType),
            count: `${num(r._count._all)}회`,
            credits: `${num(Math.abs(r._sum.amount ?? 0))}C`,
          })),
        emptyText: "오늘 소모 내역이 없습니다",
      },
      {
        title: "학원별",
        columns: [
          { key: "academy", label: "학원" },
          { key: "credits", label: "크레딧", align: "right" },
        ],
        rows: byAcademy
          .sort((a, b) => (a._sum.amount ?? 0) - (b._sum.amount ?? 0))
          .map((r) => ({
            academy: nameOf(names, r.academyId),
            credits: `${num(Math.abs(r._sum.amount ?? 0))}C`,
          })),
      },
    ],
  };
}

export async function activeAcademiesDetail(): Promise<DashboardDetail> {
  const todayStart = getTodayKST();
  const [byAcademy, totalActive] = await Promise.all([
    consumptionByAcademy(todayStart),
    prisma.academy.count({ where: { status: "ACTIVE" } }),
  ]);
  const names = await academyNames(byAcademy.map((r) => r.academyId));
  return {
    title: "오늘 활동 학원",
    subtitle: "오늘 크레딧을 한 번이라도 사용한 학원",
    summary: [
      { label: "활동", value: `${num(byAcademy.length)}곳` },
      { label: "전체 활성", value: `${num(totalActive)}곳` },
    ],
    sections: [
      {
        columns: [
          { key: "academy", label: "학원" },
          { key: "count", label: "사용 횟수", align: "right" },
          { key: "credits", label: "크레딧", align: "right" },
        ],
        rows: byAcademy
          .sort((a, b) => b._count._all - a._count._all)
          .map((r) => ({
            academy: nameOf(names, r.academyId),
            count: `${num(r._count._all)}회`,
            credits: `${num(Math.abs(r._sum.amount ?? 0))}C`,
          })),
        emptyText: "오늘 활동한 학원이 없습니다",
      },
    ],
    link: { label: "활동 모니터링으로 이동", href: "/admin/activity" },
  };
}

export async function errorsDetail(): Promise<DashboardDetail> {
  const todayStart = getTodayKST();
  const since = { gte: todayStart };
  const [workbench, extraction, tutor, webhook] = await Promise.all([
    prisma.workbenchAiJob.findMany({
      where: { status: "FAILED", createdAt: since },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { createdAt: true, domain: true, title: true, errorMessage: true, academyId: true },
    }),
    prisma.extractionJob.findMany({
      where: { status: "FAILED", createdAt: since },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { createdAt: true, displayName: true, originalFileName: true, errorSummary: true, academyId: true },
    }),
    prisma.tutorAiLog.findMany({
      where: { status: "FAILED", createdAt: since },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { createdAt: true, kind: true, errorCode: true, academyId: true },
    }),
    prisma.portOneWebhookEvent.findMany({
      where: { status: "FAILED", receivedAt: since },
      orderBy: { receivedAt: "desc" },
      take: 50,
      select: { receivedAt: true, eventType: true, errorMessage: true },
    }),
  ]);
  const names = await academyNames([
    ...workbench.map((r) => r.academyId),
    ...extraction.map((r) => r.academyId),
    ...tutor.map((r) => r.academyId),
  ]);

  const rows = [
    ...workbench.map((r) => ({
      at: r.createdAt,
      kind: `AI · ${workbenchDomainLabel(r.domain)}`,
      academy: nameOf(names, r.academyId),
      target: r.title,
      message: truncate(r.errorMessage, 400),
    })),
    ...extraction.map((r) => ({
      at: r.createdAt,
      kind: "자료 추출",
      academy: nameOf(names, r.academyId),
      target: r.displayName ?? r.originalFileName ?? "—",
      message: truncate(r.errorSummary, 400),
    })),
    ...tutor.map((r) => ({
      at: r.createdAt,
      kind: `튜터 · ${r.kind}`,
      academy: nameOf(names, r.academyId),
      target: "—",
      message: r.errorCode ?? "—",
    })),
    ...webhook.map((r) => ({
      at: r.receivedAt,
      kind: "결제 웹훅",
      academy: "—",
      target: r.eventType,
      message: truncate(r.errorMessage, 400),
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    title: "오늘 오류",
    summary: [
      { label: "AI 작업", value: `${num(workbench.length)}건` },
      { label: "자료 추출", value: `${num(extraction.length)}건` },
      { label: "튜터", value: `${num(tutor.length)}건` },
      { label: "결제 웹훅", value: `${num(webhook.length)}건` },
    ],
    sections: [
      {
        columns: [
          { key: "at", label: "시각" },
          { key: "kind", label: "구분" },
          { key: "academy", label: "학원" },
          { key: "target", label: "작업", wide: true },
          { key: "message", label: "오류 내용", wide: true },
        ],
        rows: rows.map((r) => ({ ...r, at: kstDateTime(r.at) })),
        emptyText: "오늘 발생한 오류가 없습니다",
      },
    ],
    link: { label: "활동 모니터링으로 이동", href: "/admin/activity" },
  };
}
