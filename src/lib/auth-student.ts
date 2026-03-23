import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "student-session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getJwtSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export interface StudentTokenPayload extends JWTPayload {
  studentId: string;
  academyId: string;
  name: string;
  grade: number;
  schoolId?: string;
  xp: number;
  level: number;
}

export async function signStudentToken(
  payload: Omit<StudentTokenPayload, "iat" | "exp">
): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());
  return token;
}

export async function verifyStudentToken(
  token: string
): Promise<StudentTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as StudentTokenPayload;
  } catch {
    return null;
  }
}

export async function loginStudent(
  academyId: string,
  studentCode: string
): Promise<StudentTokenPayload> {
  const student = await prisma.student.findUnique({
    where: { studentCode },
    include: { academy: true, school: true },
  });

  if (!student) {
    throw new Error("존재하지 않는 학생 코드입니다.");
  }

  if (student.academyId !== academyId) {
    throw new Error("학원 정보가 일치하지 않습니다.");
  }

  if (student.status !== "ACTIVE") {
    throw new Error("비활성화된 계정입니다. 선생님에게 문의하세요.");
  }

  const tokenPayload: Omit<StudentTokenPayload, "iat" | "exp"> = {
    studentId: student.id,
    academyId: student.academyId,
    name: student.name,
    grade: student.grade,
    schoolId: student.schoolId ?? undefined,
    xp: student.xp,
    level: student.level,
  };

  const token = await signStudentToken(tokenPayload);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return tokenPayload as StudentTokenPayload;
}

export async function logoutStudent(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getStudentSession(): Promise<StudentTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyStudentToken(token);
}

export async function requireStudentAuth(): Promise<StudentTokenPayload> {
  const session = await getStudentSession();
  if (!session) {
    throw new Error("로그인이 필요합니다.");
  }
  return session;
}
