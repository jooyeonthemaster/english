"use server";

// ============================================================================
// 학생 로스터 → CSV 내보내기.
//   - 현재 로스터 필터(상태·반·학년·학교·검색·수납·정렬)를 그대로 적용해
//     화면에서 보던 목록과 같은 조건으로 내려받는다(where/orderBy 빌더 공유).
//   - 연락처(학생 전화·학부모 전화)는 PII — DIRECTOR 에게만 컬럼을 내보내고
//     그 외 역할은 액션 안에서 컬럼 자체를 제외한다(클라 분기 신뢰 금지).
//   - 5,000행 상한 가드 — 초과분은 잘라내고 capped 로 알린다.
// 인코딩: 한글 Excel 호환을 위해 UTF-8 + BOM (admin-members/export-members.ts
// 의 "all" 모드 규칙 미러 — csvCell 도 같은 규칙의 사본. 원본이 비공개 함수라
// 복제하되 규칙 변경 시 양쪽을 함께 손봐야 한다).
// 결과는 base64 바이트 + mimeType — 클라이언트가 Blob 다운로드.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireAuth } from "./_helpers";
import {
  buildStudentsOrderBy,
  buildStudentsWhere,
  type StudentFilters,
} from "./types";

/** 내보내기 상한 — 초과 시 잘라내고 capped 플래그로 알린다. */
const EXPORT_ROW_CAP = 5000;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "재원",
  PAUSED: "휴원",
  WAITING: "대기",
  WITHDRAWN: "퇴원",
};

/** 큰따옴표·쉼표·개행이 들어가도 안전하도록 모든 셀을 따옴표로 감싼다. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

/** Asia/Seoul 기준 YYYY-MM-DD (sv-SE 로케일이 ISO 날짜 포맷). */
function seoulYmd(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
}

export interface ExportStudentsCsvResult {
  filename: string;
  /** base64로 인코딩한 파일 바이트 (UTF-8 + BOM) */
  contentBase64: string;
  mimeType: string;
  totalRows: number;
  /** 5,000행 상한에 걸려 잘렸으면 true */
  capped: boolean;
}

export async function exportStudentsRosterCsv(
  filters?: StudentFilters,
): Promise<ExportStudentsCsvResult> {
  const staff = await requireAuth();
  // 연락처 컬럼은 원장 전용 — 역할 판정은 반드시 액션 안에서.
  const includeContacts = staff.role === "DIRECTOR";

  const where = buildStudentsWhere(staff.academyId, filters);

  const students = await prisma.student.findMany({
    where,
    include: {
      school: { select: { name: true } },
      classEnrollments: {
        where: { status: "ENROLLED" },
        include: { class: { select: { name: true } } },
      },
      parentLinks: {
        // 화면 정본(queries.ts getStudents)과 동일한 "최근 등록 학부모" 대표
        // 선정 규칙 — orderBy 누락 시 DB 기본순으로 CSV 대표가 화면과 어긋난다.
        orderBy: { parent: { createdAt: "desc" } },
        include: {
          parent: { select: { name: true, phone: true, relation: true } },
        },
      },
    },
    orderBy: buildStudentsOrderBy(filters?.sort, filters?.dir),
    // 상한+1건을 읽어 초과 여부만 판정하고 상한까지 잘라 내보낸다.
    take: EXPORT_ROW_CAP + 1,
  });

  const capped = students.length > EXPORT_ROW_CAP;
  const rows = capped ? students.slice(0, EXPORT_ROW_CAP) : students;

  const header = [
    "이름",
    "학생코드",
    "학교",
    "학년",
    "반",
    "상태",
    ...(includeContacts ? ["학생 전화", "학부모", "학부모 전화"] : []),
    "등록일",
  ];

  const lines = rows.map((s) => {
    const classNames = s.classEnrollments.map((e) => e.class.name).join(", ");
    const firstParent = s.parentLinks[0]?.parent ?? null;
    const parentLabel = firstParent
      ? `${firstParent.name}${firstParent.relation ? ` (${firstParent.relation})` : ""}`
      : "";
    return [
      s.name,
      s.studentCode,
      s.school?.name ?? "",
      `${s.grade}학년`,
      classNames,
      STATUS_LABEL[s.status] ?? s.status,
      ...(includeContacts
        ? [s.phone ?? "", parentLabel, firstParent?.phone ?? ""]
        : []),
      seoulYmd(s.createdAt),
    ]
      .map(csvCell)
      .join(",");
  });

  // 한글 Excel 호환: UTF-8 + BOM
  const body = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  const bytes = Buffer.from(body, "utf-8");

  const ymd = seoulYmd(new Date()).replace(/-/g, "").slice(2); // YYMMDD
  return {
    filename: `학생명단_${ymd}.csv`,
    contentBase64: bytes.toString("base64"),
    mimeType: "text/csv;charset=utf-8;",
    totalRows: rows.length,
    capped,
  };
}
