"use server";

// ============================================================================
// 회원 관리 → 엑셀(CSV) 내보내기.
//   - 전화번호 포함 (PII이므로 SUPER_ADMIN 전용)
//   - 허수/내부 계정(유재영·네안데르·악센트 등)은 행에서 제외
//   - 각 회원의 "SMS 발송대상" 여부 + 제외사유 컬럼 제공 → 솔라피/알리고 등
//     대량발송 업로드용으로 바로 필터링 가능
// CSV는 한글 엑셀 호환을 위해 UTF-8 BOM을 붙인다(트래킹 내보내기와 동일 패턴).
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getProviderLabel } from "@/lib/admin-members-labels";
import {
  SMS_OPT_OUT_FLAG_KEY,
  isInternalAccount,
  isSuperAdmin,
} from "./_shared";

export interface ExportMembersResult {
  filename: string;
  /** UTF-8 BOM 포함 CSV 문자열 */
  csv: string;
  totalRows: number;
  smsTargetRows: number;
}

/** 큰따옴표·쉼표·개행이 들어가도 안전하도록 모든 셀을 따옴표로 감싼다. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * @param onlyTargets true면 SMS 발송대상(전화번호 있고 제외 안된)만 내보낸다.
 */
export async function exportMembers(
  opts: { onlyTargets?: boolean } = {},
): Promise<ExportMembersResult> {
  const session = await requireAdminAuth();
  if (!isSuperAdmin(session)) {
    // 전화번호(PII)가 들어가므로 최고 관리자만 허용
    throw new Error("회원 내보내기는 SUPER_ADMIN 권한이 필요합니다");
  }

  const staffRows = await prisma.staff.findMany({
    where: { role: "DIRECTOR" },
    orderBy: { createdAt: "desc" },
    include: {
      academy: {
        select: {
          name: true,
          slug: true,
          status: true,
          memo: true,
          subscriptions: {
            where: { status: { in: ["ACTIVE", "TRIAL"] } },
            include: { plan: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          creditBalance: { select: { balance: true } },
          academyFeatureFlags: {
            where: { key: SMS_OPT_OUT_FLAG_KEY },
            select: { enabled: true },
            take: 1,
          },
        },
      },
    },
  });

  const header = [
    "이름",
    "이메일",
    "전화번호",
    "학원",
    "학원경로",
    "가입경로",
    "플랜",
    "크레딧잔고",
    "가입일",
    "최근로그인",
    "활성",
    "SMS발송대상",
    "제외사유",
    "메모",
  ];

  const lines: string[] = [];
  let totalRows = 0;
  let smsTargetRows = 0;

  for (const s of staffRows) {
    const academy = s.academy;

    // 허수/내부 계정은 아예 제외(행에서 제거)
    if (
      isInternalAccount({
        name: s.name,
        academyName: academy.name,
        email: s.email,
      })
    ) {
      continue;
    }

    const optedOut = academy.academyFeatureFlags[0]?.enabled ?? false;
    const phone = (s.phone ?? "").trim();

    let isTarget: boolean;
    let reason = "";
    if (optedOut) {
      isTarget = false;
      reason = "발송제외 체크";
    } else if (!phone) {
      isTarget = false;
      reason = "번호없음";
    } else if (!s.isActive) {
      isTarget = false;
      reason = "비활성 회원";
    } else {
      isTarget = true;
    }

    if (opts.onlyTargets && !isTarget) continue;

    totalRows += 1;
    if (isTarget) smsTargetRows += 1;

    lines.push(
      [
        s.name,
        s.email,
        phone,
        academy.name,
        `/${academy.slug}`,
        getProviderLabel(s.authProvider),
        academy.subscriptions[0]?.plan.name ?? "",
        academy.creditBalance?.balance ?? "",
        formatDate(s.createdAt),
        formatDate(s.lastLoginAt),
        s.isActive ? "활성" : "비활성",
        isTarget ? "Y" : "N",
        reason,
        academy.memo ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  const today = new Date().toISOString().split("T")[0];
  const suffix = opts.onlyTargets ? "sms-targets" : "all";
  const filename = `smoat-members-${suffix}-${today}.csv`;

  return { filename, csv, totalRows, smsTargetRows };
}
