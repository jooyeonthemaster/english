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
  sort?: StudentsSortKey;
  /** 정렬 방향 — 미지정 시 asc(recent 만 desc 고정). */
  dir?: StudentsSortDir;
  /** 특정 학생만(CSV 선택 내보내기). academyId 는 항상 별도로 걸리므로
   *  여기에 남의 학원 id 를 섞어도 테넌트 밖으로 새지 않는다. */
  ids?: string[];
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
  if (filters?.ids?.length) {
    where.id = { in: filters.ids };
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

/** 로스터 정렬 키 → Prisma orderBy (기본 recent = 최근 등록순).
 *
 *  여기 있는 키만 **서버 정렬**이 가능하다 — 페이지네이션 때문에 화면 정렬은
 *  전체 집합 기준이어야 하고, 클라이언트에서 현재 페이지만 재배열하면 거짓말이
 *  된다. 반/접속 기기/이번 달 수납은 표시값이 쿼리 후 JS 계산(또는 필터된
 *  to-many 집계)이라 Prisma orderBy 로 충실히 표현되지 않아 제외했다.
 *  - 반: classEnrollments 는 해제 시 status update(하드 삭제 아님) → _count 가
 *        화면의 ENROLLED 칩 수와 어긋난다.
 *  - 접속 기기: 표시값은 revokedAt/expiresAt 로 필터한 활성 세션 수인데
 *        orderBy _count 는 필터가 안 걸려 만료·폐기 세션까지 센다.
 *  - 이번 달 수납: 당월 인보이스의 payments 합계와 finalAmount 비교로 도출.
 *  이 셋은 raw SQL 없이는 불가하다.
 */
export type StudentsSortKey =
  | "recent"
  | "name"
  | "grade"
  | "school"
  | "status"
  | "contact";
export type StudentsSortDir = "asc" | "desc";

export function buildStudentsOrderBy(
  sort?: StudentsSortKey,
  dir: StudentsSortDir = "asc",
) {
  const d = dir === "desc" ? ("desc" as const) : ("asc" as const);
  // 동점 시 이름순 — 페이지 경계에서 행이 흔들리지 않게 안정 정렬을 만든다.
  const tie = [{ name: "asc" as const }, { id: "asc" as const }];
  if (sort === "name") return [{ name: d }, { id: "asc" as const }];
  if (sort === "grade") return [{ grade: d }, ...tie];
  // 열 라벨이 "학교·학년"이라 읽는 순서대로 학교 → 학년 순으로 묶는다.
  // (학교가 하나뿐인 학원에서는 사실상 학년 정렬로 동작한다.)
  if (sort === "school")
    return [{ school: { name: d } }, { grade: "asc" as const }, ...tie];
  if (sort === "status") return [{ status: d }, ...tie];
  if (sort === "contact") return [{ phone: d }, ...tie];
  return [{ createdAt: dir === "asc" ? ("asc" as const) : ("desc" as const) }, { id: "asc" as const }];
}
