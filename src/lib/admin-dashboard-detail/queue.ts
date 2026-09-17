import { prisma } from "@/lib/prisma";
import type { DashboardDetail } from "@/lib/admin-dashboard-detail-types";
import { SEMINAR_STATUSES, SUPPORT_STATUSES } from "@/lib/help-center";
import { kstDateTime, num, truncate, won } from "./format";

// 처리 필요 스트립(미확인 입금·미답변 문의·세미나 신청) 상세.

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  UNMATCHED: "미매칭",
  AMBIGUOUS: "확인 필요",
};

function statusLabel(options: readonly { value: string; label: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value;
}

export async function depositsDetail(): Promise<DashboardDetail> {
  const rows = await prisma.bankDepositNotification.findMany({
    where: { status: { in: ["UNMATCHED", "AMBIGUOUS"] } },
    orderBy: { receivedAt: "desc" },
    take: 50,
    select: { receivedAt: true, amount: true, depositorName: true, bankName: true, status: true, note: true },
  });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    title: "미확인 입금",
    subtitle: "자동 매칭되지 않아 관리자 확인이 필요한 입금",
    summary: [
      { label: "건수", value: `${num(rows.length)}건` },
      { label: "금액 합계", value: won(total) },
    ],
    sections: [
      {
        columns: [
          { key: "at", label: "수신" },
          { key: "depositor", label: "입금자" },
          { key: "status", label: "상태" },
          { key: "note", label: "비고", wide: true },
          { key: "amount", label: "금액", align: "right" },
        ],
        rows: rows.map((r) => ({
          at: kstDateTime(r.receivedAt),
          depositor: r.depositorName ?? "—",
          status: DEPOSIT_STATUS_LABELS[r.status] ?? r.status,
          note: truncate(r.note, 200),
          amount: won(r.amount),
        })),
        emptyText: "확인할 입금이 없습니다",
      },
    ],
    link: { label: "입금 확인으로 이동", href: "/admin/credit-plans?tab=deposits&status=ACTION" },
  };
}

export async function supportDetail(): Promise<DashboardDetail> {
  const rows = await prisma.helpPost.findMany({
    where: { board: "SUPPORT", status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { createdAt: true, authorName: true, title: true, status: true },
  });
  return {
    title: "미답변 문의",
    subtitle: "오래된 문의부터 표시",
    summary: [
      { label: "접수", value: `${num(rows.filter((r) => r.status === "OPEN").length)}건` },
      { label: "처리중", value: `${num(rows.filter((r) => r.status === "IN_PROGRESS").length)}건` },
    ],
    sections: [
      {
        columns: [
          { key: "at", label: "작성" },
          { key: "author", label: "작성자" },
          { key: "title", label: "제목", wide: true },
          { key: "status", label: "상태", align: "right" },
        ],
        rows: rows.map((r) => ({
          at: kstDateTime(r.createdAt),
          author: r.authorName,
          title: truncate(r.title, 200),
          status: statusLabel(SUPPORT_STATUSES, r.status),
        })),
        emptyText: "미답변 문의가 없습니다",
      },
    ],
    link: { label: "문의 게시판으로 이동", href: "/admin/support?status=PENDING" },
  };
}

export async function seminarsDetail(): Promise<DashboardDetail> {
  const rows = await prisma.seminarRequest.findMany({
    where: { status: "RECEIVED" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { createdAt: true, applicantName: true, academyName: true, phone: true, topic: true, status: true },
  });
  return {
    title: "세미나 신청",
    subtitle: "연락 전(접수) 상태의 1:1 세미나 신청",
    summary: [{ label: "건수", value: `${num(rows.length)}건` }],
    sections: [
      {
        columns: [
          { key: "at", label: "신청" },
          { key: "applicant", label: "신청자" },
          { key: "academy", label: "학원" },
          { key: "topic", label: "관심 주제", wide: true },
          { key: "status", label: "상태", align: "right" },
        ],
        rows: rows.map((r) => ({
          at: kstDateTime(r.createdAt),
          applicant: `${r.applicantName} · ${r.phone}`,
          academy: r.academyName ?? "—",
          topic: truncate(r.topic, 200),
          status: statusLabel(SEMINAR_STATUSES, r.status),
        })),
        emptyText: "신규 신청이 없습니다",
      },
    ],
    link: { label: "1:1 세미나로 이동", href: "/admin/seminars?status=RECEIVED" },
  };
}
