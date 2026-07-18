"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "./_helpers";

/** Get schools for the academy (for dropdown) */
export async function getSchools(academyId: string) {
  const staff = await requireAuth();
  if (academyId !== staff.academyId) throw new Error("권한이 없습니다.");

  return prisma.school.findMany({
    where: { academyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
}

/** 학교급 — 스키마상 String 이지만 값은 이 셋으로 서버에서 강제한다. */
const SCHOOL_TYPE_VALUES = ["MIDDLE", "HIGH", "ELEMENTARY"] as const;
type SchoolType = (typeof SCHOOL_TYPE_VALUES)[number];
function isSchoolType(value: string): value is SchoolType {
  return (SCHOOL_TYPE_VALUES as readonly string[]).includes(value);
}

/**
 * 학교명 → slug. 기존 시드 slug 는 수동 로마자("강동중"→"gangdong-ms")라 한글
 * 자동 음역 규칙이 리포에 없다. 그래서 ASCII 만 남기고, 한글처럼 남는 글자가
 * 없으면 "school" + 랜덤 접미로 떨어뜨린다(slug 는 [academyId, slug] 유니크
 * 키·라우트 파라미터일 뿐 화면 표시는 name 이 하므로 의미 없어도 무해).
 */
function toSchoolSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = ascii.length >= 2 ? ascii : "school";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 학교 추가 — 학생 등록 폼의 학교 셀렉트에서 인라인으로 호출한다.
 * (지금까지 School 은 seed 로만 생겼고 앱 안에 생성 경로가 없어서, 목록에 없는
 * 학교의 학생은 등록할 방법이 아예 없었다.)
 *
 * 같은 학원에 같은 이름이 이미 있으면 새로 만들지 않고 **기존 학교를 돌려준다**
 * — name 에는 unique 제약이 없어 방치하면 "강동중"이 여러 개 쌓이고, 학생·지문·
 * 시험지가 서로 다른 행에 붙어 필터가 조용히 갈라진다.
 */
export async function createSchool(input: {
  name: string;
  type: string;
}): Promise<
  | { success: true; school: { id: string; name: string; type: string }; existed: boolean }
  | { success: false; error: string }
> {
  // academyId 는 세션에서만 가져온다 — 클라이언트가 보낸 값을 신뢰하지 않는다.
  const staff = await requireAuth();

  const name = input.name.trim();
  if (name.length < 2) return { success: false, error: "학교 이름을 2자 이상 입력해 주세요." };
  if (name.length > 40) return { success: false, error: "학교 이름이 너무 깁니다." };
  if (!isSchoolType(input.type)) return { success: false, error: "학교급이 올바르지 않습니다." };

  const existing = await prisma.school.findFirst({
    where: { academyId: staff.academyId, name },
    select: { id: true, name: true, type: true },
  });
  if (existing) return { success: true, school: existing, existed: true };

  try {
    const school = await prisma.school.create({
      data: {
        academyId: staff.academyId,
        name,
        type: input.type,
        slug: toSchoolSlug(name),
      },
      select: { id: true, name: true, type: true },
    });
    // 학교 목록은 서버 컴포넌트가 prop 으로 내려주므로 렌더 지점 전부 재검증.
    revalidatePath("/director/students");
    revalidatePath("/director/tutor");
    revalidatePath("/teacher/students");
    return { success: true, school, existed: false };
  } catch {
    return { success: false, error: "학교 추가에 실패했습니다. 다시 시도해 주세요." };
  }
}

/** Get classes for the academy (for dropdown) */
export async function getClasses(academyId: string) {
  const staff = await requireAuth();
  if (academyId !== staff.academyId) throw new Error("권한이 없습니다.");

  return prisma.class.findMany({
    where: { academyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
