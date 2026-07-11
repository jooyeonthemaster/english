// ---------------------------------------------------------------------------
// Shared types for students server actions
// ---------------------------------------------------------------------------

export interface StudentFilters {
  status?: string;
  schoolId?: string;
  /** Class id, or the virtual key "__unassigned__" for students in no class. */
  classId?: string;
  grade?: number;
  search?: string;
  /** "unpaid" → only students with an outstanding (PENDING/PARTIAL/OVERDUE) invoice. */
  billing?: string;
  /** 로스터 정렬 — 미지정 시 recent(최근 등록순). optional이라 타 호출부 무회귀. */
  sort?: "recent" | "name" | "grade";
  page?: number;
  pageSize?: number;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface StudentDeviceItem {
  id: string;
  deviceFingerprint: string;
  userAgent: string;
  ip: string;
  issuedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface CreateStudentData {
  name: string;
  birthDate?: string;
  gender?: string;
  phone?: string;
  schoolId?: string;
  grade: number;
  memo?: string;
  parentName?: string;
  parentPhone?: string;
  parentRelation?: string;
  emergencyContact?: string;
}

// ---------------------------------------------------------------------------
// Where/orderBy 빌더 — getStudents(queries.ts)와 exportStudentsRosterCsv
// (export.ts)가 같은 필터 해석을 공유한다. "use server" 파일은 sync 함수를
// export 할 수 없어 이 타입 모듈에 둔다(순수 함수 — 서버 전용 의존 없음).
// ---------------------------------------------------------------------------

/** getStudents 필터 → Prisma student where 절. */
export function buildStudentsWhere(
  academyId: string,
  filters?: StudentFilters,
): Record<string, unknown> {
  const where: Record<string, unknown> = { academyId };

  if (filters?.status && filters.status !== "ALL") {
    // 가상 상태값 — "휴원·대기" 칩은 PAUSED+WAITING 합산(pausedWaitingCount)을
    // 표시하므로 두 상태를 함께 노출해야 칩 숫자와 목록이 정합한다.
    where.status =
      filters.status === "PAUSED_WAITING"
        ? { in: ["PAUSED", "WAITING"] }
        : filters.status;
  }
  if (filters?.schoolId) {
    where.schoolId = filters.schoolId;
  }
  if (filters?.classId === "__unassigned__") {
    // Virtual filter: active students belonging to no class.
    where.classEnrollments = { none: { status: "ENROLLED" } };
  } else if (filters?.classId) {
    where.classEnrollments = {
      some: {
        classId: filters.classId,
        status: "ENROLLED",
      },
    };
  }
  if (filters?.grade) {
    where.grade = filters.grade;
  }
  if (filters?.billing === "unpaid") {
    where.invoices = { some: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } } };
  }
  if (filters?.search) {
    const term = filters.search.trim();
    const or: Record<string, unknown>[] = [
      { name: { contains: term, mode: "insensitive" } },
      { studentCode: { contains: term, mode: "insensitive" } },
      // 전화 검색 — 학생 본인 + 연결된 학부모 번호까지 훑는다.
      { phone: { contains: term } },
      { parentLinks: { some: { parent: { phone: { contains: term } } } } },
    ];
    // 숫자/하이픈 입력이면 하이픈 제거 변형도 OR — 저장 포맷이
    // "010-1234-5678" / "01012345678" 로 섞여 있는 편차 대응.
    // 단, DB측 정규화 비교가 아니라 하이픈 저장분을 숫자-only 검색어로
    // 찾는 방향은 여전히 놓칠 수 있다(알려진 불완전함 — 정규화 컬럼 없이 한계).
    if (/^[0-9-]+$/.test(term) && term.includes("-")) {
      const digits = term.replace(/-/g, "");
      if (digits.length >= 3) {
        or.push({ phone: { contains: digits } });
        or.push({ parentLinks: { some: { parent: { phone: { contains: digits } } } } });
      }
    }
    where.OR = or;
  }

  return where;
}

/** 로스터 정렬 키 → Prisma orderBy (기본 recent = 최근 등록순). */
export function buildStudentsOrderBy(sort?: StudentFilters["sort"]) {
  if (sort === "name") return [{ name: "asc" as const }];
  if (sort === "grade") return [{ grade: "asc" as const }, { name: "asc" as const }];
  return [{ createdAt: "desc" as const }];
}
