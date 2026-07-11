// ============================================================================
// 어법 드릴 — 학생 세션 (경량 JWT 쿠키)
//
// 진입: 학원코드(Academy.code, 전역 유일 4자) + 학생코드(academy 스코프 6자).
// 조회는 tutor 인증 정본(src/lib/tutor/crypto.ts)의 HMAC 인덱스를 그대로
// 재사용한다. 세션은 디바이스 한도 없는 단순 JWT(90일) — 학습 툴 특성상
// 마찰 최소화가 우선이고, 파괴적 권한이 없다(자기 학습 데이터 기록만).
// 레이트리밋은 tutor_login_rate_limits 테이블을 sentinel slug 로 공유한다.
// ============================================================================

import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import {
  createStudentCodeLookupHmac,
  normalizeTutorCode,
  verifyStudentCodeHash,
} from "@/lib/tutor/crypto";

export const GRAMMAR_DRILL_COOKIE = "grammar-drill-session";
const SESSION_DAYS = 90;
const RATE_SLUG = "__grammar-drill__"; // tutor_login_rate_limits 공유용 sentinel
const RATE_LIMIT_PER_MIN = 8;

function jwtSecret(): Uint8Array {
  const secret =
    process.env.GRAMMAR_DRILL_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("GRAMMAR_DRILL_JWT_SECRET/NEXTAUTH_SECRET 미설정");
  return new TextEncoder().encode(secret);
}

export interface GrammarDrillSession {
  studentId: string;
  academyId: string;
  studentName: string;
  academyName: string;
  grade: number;
}

export async function loginRateLimited(ip: string): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const row = await prisma.tutorLoginRateLimit.upsert({
    where: {
      academySlug_ip_windowStart: { academySlug: RATE_SLUG, ip, windowStart },
    },
    create: { academySlug: RATE_SLUG, ip, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count > RATE_LIMIT_PER_MIN;
}

export type GrammarLoginResult =
  | { ok: true; session: GrammarDrillSession }
  | { ok: false; error: "RATE_LIMITED" | "NOT_FOUND" };

/** 학원코드+학생코드 검증 — 성공 시 세션 페이로드 반환(쿠키 발급은 라우트가). */
export async function verifyGrammarLogin(
  academyCodeRaw: string,
  studentCodeRaw: string,
): Promise<GrammarLoginResult> {
  const academyCode = normalizeTutorCode(academyCodeRaw);
  const studentCode = normalizeTutorCode(studentCodeRaw);
  if (academyCode.length < 3 || studentCode.length < 4) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const academy = await prisma.academy.findUnique({
    where: { code: academyCode },
    select: { id: true, name: true, status: true },
  });
  if (!academy || academy.status === "DEACTIVATED") {
    return { ok: false, error: "NOT_FOUND" };
  }

  const lookup = createStudentCodeLookupHmac(academy.id, studentCode);
  let student = await prisma.student.findFirst({
    where: {
      academyId: academy.id,
      status: "ACTIVE",
      studentCodeLookupHmac: lookup,
    },
    select: { id: true, name: true, grade: true, studentCodeHash: true },
  });

  if (student?.studentCodeHash) {
    const valid = await verifyStudentCodeHash(
      academy.id,
      studentCode,
      student.studentCodeHash,
    );
    if (!valid) student = null;
  }

  // 레거시 평문 코드 폴백(auth-tutor-student.ts 미러) — HMAC 미백필 학생 대응.
  if (!student) {
    const legacy = await prisma.student.findFirst({
      where: {
        academyId: academy.id,
        status: "ACTIVE",
        studentCode,
        studentCodeLookupHmac: null,
      },
      select: { id: true, name: true, grade: true, studentCodeHash: true },
    });
    if (legacy) student = legacy;
  }

  if (!student) return { ok: false, error: "NOT_FOUND" };

  return {
    ok: true,
    session: {
      studentId: student.id,
      academyId: academy.id,
      studentName: student.name,
      academyName: academy.name,
      grade: student.grade,
    },
  };
}

export async function signGrammarSession(
  session: GrammarDrillSession,
): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("nara-grammar-drill")
    .setAudience("grammar-drill-student")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(jwtSecret());
}

export async function getGrammarSession(): Promise<GrammarDrillSession | null> {
  const store = await cookies();
  const token = store.get(GRAMMAR_DRILL_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: "nara-grammar-drill",
      audience: "grammar-drill-student",
    });
    if (
      typeof payload.studentId !== "string" ||
      typeof payload.academyId !== "string"
    ) {
      return null;
    }
    return {
      studentId: payload.studentId,
      academyId: payload.academyId,
      studentName: String(payload.studentName ?? ""),
      academyName: String(payload.academyName ?? ""),
      grade: Number(payload.grade ?? 0),
    };
  } catch {
    return null;
  }
}

export async function requireGrammarSession(): Promise<GrammarDrillSession> {
  const session = await getGrammarSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
