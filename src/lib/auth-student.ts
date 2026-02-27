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
  schoolId: string;
  schoolSlug: string;
  name: string;
  grade: number;
}

/**
 * Creates a signed JWT for a student session.
 */
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

/**
 * Verifies a student JWT and returns the decoded payload.
 * Returns null if the token is invalid or expired.
 */
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

/**
 * Validates a student by schoolId and studentCode, then sets a session cookie.
 * Returns the student info on success, or throws an error on failure.
 */
export async function loginStudent(
  schoolId: string,
  studentCode: string
): Promise<{
  studentId: string;
  schoolId: string;
  schoolSlug: string;
  name: string;
  grade: number;
}> {
  const student = await prisma.student.findUnique({
    where: { studentCode },
    include: { school: true },
  });

  if (!student) {
    throw new Error("존재하지 않는 학생 코드입니다.");
  }

  if (student.schoolId !== schoolId) {
    throw new Error("학교 정보가 일치하지 않습니다.");
  }

  if (!student.isActive) {
    throw new Error("비활성화된 계정입니다. 선생님에게 문의하세요.");
  }

  const tokenPayload = {
    studentId: student.id,
    schoolId: student.schoolId,
    schoolSlug: student.school.slug,
    name: student.name,
    grade: student.grade,
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

  return tokenPayload;
}

/**
 * Clears the student session cookie.
 */
export async function logoutStudent(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Reads the student session from the cookie and verifies it.
 * Returns the student info if valid, or null if not authenticated.
 */
export async function getStudentSession(): Promise<StudentTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyStudentToken(token);
}
