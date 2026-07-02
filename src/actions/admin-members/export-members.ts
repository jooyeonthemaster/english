"use server";

// ============================================================================
// 회원 관리 → 엑셀(CSV) 내보내기.
//   - 전화번호 포함 (PII이므로 SUPER_ADMIN 전용)
//   - 허수/내부 계정(유재영·네안데르·악센트 등)은 행에서 제외
//   - mode "all" : 상세 15컬럼 (분석·관리용, SMS발송대상 Y/N + 사유 포함)
//   - mode "info": 정보성 발송대상(전화번호 있는 활성 회원 전체, 동의 무관) — 뿌리오 양식
//   - mode "ad"  : 광고성 발송대상(info 조건 + 마케팅 동의자만) — 뿌리오 양식
//       업로드 양식 헤더 = 이름,휴대폰,[*1*],[*2*],[*3*],[*4*]
//       치환변수 [*1*]=크레딧잔고 [*2*]=학원명 [*3*]=플랜 [*4*]=예비(빈칸)
//       → 다운로드 후 발송툴에 그대로 업로드하면 "[*이름*] 선생님, 무료
//         크레딧 [*1*]개…" 처럼 회원마다 개인화 발송이 된다.
//   ※ 정보성/광고성 구분: 정보통신망법상 광고성 문자는 사전 동의 필수(ad),
//     본인 보유 크레딧 소멸 안내 같은 정보성은 동의 없이 발송 가능(info).
// 인코딩:
//   - all  : 한글 Excel 호환을 위해 UTF-8 + BOM
//   - info/ad: 뿌리오 등 발송툴 주소록이 한글을 CP949(EUC-KR)로 읽으므로
//     CP949로 인코딩(BOM 없음). UTF-8로 주면 한글이 전부 깨진다.
// 결과는 base64 바이트 + mimeType으로 돌려주고 클라이언트가 Blob 다운로드.
// ============================================================================

import iconv from "iconv-lite";
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
  /** base64로 인코딩한 파일 바이트 (발송용=CP949, 전체엑셀=UTF-8+BOM) */
  contentBase64: string;
  /** 다운로드 Blob에 쓸 MIME 타입(charset 포함) */
  mimeType: string;
  totalRows: number;
  smsTargetRows: number;
}

/** 큰따옴표·쉼표·개행이 들어가도 안전하도록 모든 셀을 따옴표로 감싼다. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

/**
 * 발송툴 업로드용 CSV 셀 — 쉼표·따옴표·개행이 든 값만 따옴표로 감싼다.
 * (뿌리오 샘플 양식이 단순 값은 따옴표 없이 받으므로 거기에 맞춘다.)
 */
function smsCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

export type ExportMode =
  | "all" // 상세 15컬럼(분석용). SMS발송대상 Y/N은 광고성(동의) 기준
  | "info" // 정보성 발송대상 — 전화번호 있는 활성 회원 전체(동의 무관). 크레딧 소멸 등 안내용
  | "ad"; // 광고성 발송대상 — info 조건 + 마케팅 동의자만. 추가증정·이벤트 등 홍보용

/**
 * @param mode
 *  - "all" : 상세 15컬럼 전체 회원(분석·관리용)
 *  - "info": 정보성 발송대상만, 뿌리오 업로드 양식 (마케팅 동의 불필요)
 *  - "ad"  : 광고성 발송대상만, 뿌리오 업로드 양식 (마케팅 동의 필수 — 법적 전제)
 * @param memberIds
 *  지정 시 해당 회원(Staff.id)만 대상으로 내보낸다(회원 목록에서 다중 선택 시).
 *  미지정이면 전체 원장 회원. 내부/허수 계정 제외·발송대상 판정 규칙은 동일하게 적용.
 */
export async function exportMembers(
  opts: { mode?: ExportMode; memberIds?: string[] } = {},
): Promise<ExportMembersResult> {
  const session = await requireAdminAuth();
  if (!isSuperAdmin(session)) {
    // 전화번호(PII)가 들어가므로 최고 관리자만 허용
    throw new Error("회원 내보내기는 SUPER_ADMIN 권한이 필요합니다");
  }

  // 선택 내보내기: 중복 제거 후 id 필터. 빈 배열이면(선택 0명) 선택 필터를 무시하지
  // 않고 "대상 없음"으로 취급 — 실수로 전체가 나가는 것을 방지한다.
  const selectedIds =
    opts.memberIds !== undefined
      ? [...new Set(opts.memberIds.filter((id) => typeof id === "string" && id))]
      : undefined;

  const staffRows = await prisma.staff.findMany({
    where: {
      role: "DIRECTOR",
      ...(selectedIds !== undefined ? { id: { in: selectedIds } } : {}),
    },
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

  const mode: ExportMode = opts.mode ?? "all";
  // info/ad는 발송툴 업로드 양식, all은 상세 15컬럼
  const uploadFormat = mode !== "all";
  // 광고성(ad)·상세(all의 Y/N 판정)은 마케팅 동의 필요. 정보성(info)은 동의 무관
  const consentRequired = mode !== "info";

  const header = uploadFormat
    ? ["이름", "휴대폰", "[*1*]", "[*2*]", "[*3*]", "[*4*]"]
    : [
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
        "마케팅동의",
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
    // 마케팅 수신 동의 — 광고성 발송의 법적 전제(정보통신망법 제50조 opt-in)
    const consented = s.marketingConsent === true;
    const consentLabel = consented
      ? `Y${s.marketingConsentAt ? ` (${formatDate(s.marketingConsentAt)})` : ""}`
      : "N";

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
    } else if (consentRequired && !consented) {
      // 광고성 문자를 미동의자에게 보내면 위법 — 광고성/상세 모드에서만 제외.
      // 정보성(info)은 본인 크레딧 소멸 안내 등이라 동의 없이도 합법.
      isTarget = false;
      reason = "마케팅 미동의";
    } else {
      isTarget = true;
    }

    if (uploadFormat && !isTarget) continue;

    totalRows += 1;
    if (isTarget) smsTargetRows += 1;

    if (uploadFormat) {
      // 발송툴 업로드 양식 — 휴대폰은 하이픈/공백 제거(숫자만), 변수는 개인화 데이터
      lines.push(
        [
          s.name, // 이름 → [*이름*]
          phone.replace(/[^0-9]/g, ""), // 휴대폰 (01012345678)
          academy.creditBalance?.balance ?? 0, // [*1*] 크레딧잔고
          academy.name, // [*2*] 학원명
          academy.subscriptions[0]?.plan.name ?? "", // [*3*] 플랜
          "", // [*4*] 예비
        ]
          .map(smsCell)
          .join(","),
      );
    } else {
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
          consentLabel,
          isTarget ? "Y" : "N",
          reason,
          academy.memo ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const suffix =
    mode === "info" ? "sms-info" : mode === "ad" ? "sms-ad" : "all";
  const filename = `smoat-members-${suffix}-${today}.csv`;

  let bytes: Buffer;
  let mimeType: string;
  if (uploadFormat) {
    // 발송툴 주소록은 CP949로 한글을 읽는다 → CP949 인코딩(BOM 없음).
    // 헤더도 데이터와 동일하게 smsCell(필요시에만 따옴표)로 통일.
    const body = [header.map(smsCell).join(","), ...lines].join("\r\n");
    bytes = iconv.encode(body, "cp949");
    mimeType = "text/csv;charset=euc-kr;";
  } else {
    // 상세 엑셀: 한글 Excel 호환 위해 UTF-8 + BOM
    const body =
      "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
    bytes = Buffer.from(body, "utf-8");
    mimeType = "text/csv;charset=utf-8;";
  }

  return {
    filename,
    contentBase64: bytes.toString("base64"),
    mimeType,
    totalRows,
    smsTargetRows,
  };
}
