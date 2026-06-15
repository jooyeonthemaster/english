import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  createDeviceFingerprintSeed,
  createStudentCodeLookupHmac,
  hashDeviceFingerprint,
  hashStudentCode,
  normalizeTutorCode,
  verifyStudentCodeHash,
} from "@/lib/tutor/crypto";

export const TUTOR_STUDENT_COOKIE = "tutor-student-session";
export const TUTOR_DEVICE_COOKIE = "tutor-device";
/** Max active devices a single student code may be logged in on at once. */
export const TUTOR_DEVICE_LIMIT = 2;
/** Sentinel thrown by loginTutorStudent when the device limit is reached. */
export const DEVICE_LIMIT_EXCEEDED = "DEVICE_LIMIT_EXCEEDED";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const COOKIE_PATH = "/";
const LEGACY_TUTOR_COOKIE_PATH = "/tutor";

export interface TutorStudentTokenPayload extends JWTPayload {
  typ: "tutor-student";
  aud: "tutor-student";
  iss: "nara-tutor";
  sessionId: string;
  studentId: string;
  academyId: string;
  academySlug: string;
  name: string;
  grade: number;
  schoolId?: string;
  deviceFingerprint: string;
}

function getTutorJwtSecret(): Uint8Array {
  const secret = process.env.TUTOR_STUDENT_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("TUTOR_STUDENT_JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

async function getDeviceSeed(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(TUTOR_DEVICE_COOKIE)?.value;
  if (existing) return existing;
  const seed = createDeviceFingerprintSeed();
  cookieStore.set(TUTOR_DEVICE_COOKIE, seed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: COOKIE_PATH,
  });
  return seed;
}

async function signTutorStudentToken(
  payload: Omit<TutorStudentTokenPayload, "iat" | "exp">,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("nara-tutor")
    .setAudience("tutor-student")
    .setExpirationTime("30d")
    .sign(getTutorJwtSecret());
}

export async function verifyTutorStudentToken(
  token: string,
): Promise<TutorStudentTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getTutorJwtSecret(), {
      issuer: "nara-tutor",
      audience: "tutor-student",
    });
    if (payload.typ !== "tutor-student") return null;
    if (typeof payload.studentId !== "string" || typeof payload.academyId !== "string") {
      return null;
    }
    return payload as TutorStudentTokenPayload;
  } catch {
    return null;
  }
}

export async function getTutorStudentSession(): Promise<TutorStudentTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TUTOR_STUDENT_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyTutorStudentToken(token);
  if (!payload) return null;

  const session = await prisma.tutorStudentSession.findUnique({
    where: { id: payload.sessionId },
    select: { revokedAt: true, expiresAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  await prisma.tutorStudentSession.update({
    where: { id: payload.sessionId },
    data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + COOKIE_MAX_AGE * 1000) },
  });

  return payload;
}

export async function requireTutorStudentSession(): Promise<TutorStudentTokenPayload> {
  const session = await getTutorStudentSession();
  if (!session) {
    throw new Error("튜터 로그인이 필요합니다.");
  }
  return session;
}

export async function loginTutorStudent({
  academySlug,
  academyCode,
  studentCode,
}: {
  academySlug: string;
  academyCode: string;
  studentCode: string;
}) {
  const normalizedAcademyCode = normalizeTutorCode(academyCode);
  const normalizedStudentCode = normalizeTutorCode(studentCode);
  const academy = await prisma.academy.findUnique({
    where: { slug: academySlug },
    select: { id: true, slug: true, name: true, code: true },
  });

  if (!academy?.code || normalizeTutorCode(academy.code) !== normalizedAcademyCode) {
    throw new Error("로그인 정보를 확인해주세요.");
  }

  const lookup = createStudentCodeLookupHmac(academy.id, normalizedStudentCode);
  let student = await prisma.student.findFirst({
    where: {
      academyId: academy.id,
      status: "ACTIVE",
      studentCodeLookupHmac: lookup,
    },
    include: { school: true },
  });

  if (student?.studentCodeHash) {
    const ok = await verifyStudentCodeHash(academy.id, normalizedStudentCode, student.studentCodeHash);
    if (!ok) student = null;
  }

  if (!student) {
    const legacy = await prisma.student.findFirst({
      where: {
        academyId: academy.id,
        status: "ACTIVE",
        studentCode: normalizedStudentCode,
      },
      include: { school: true },
    });
    if (!legacy) {
      throw new Error("로그인 정보를 확인해주세요.");
    }
    const studentCodeHash = await hashStudentCode(academy.id, normalizedStudentCode);
    student = await prisma.student.update({
      where: { id: legacy.id },
      data: { studentCodeLookupHmac: lookup, studentCodeHash },
      include: { school: true },
    });
  }

  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent") ?? "unknown";
  const forwardedFor = headerStore.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || "0.0.0.0";
  const deviceSeed = await getDeviceSeed();
  const deviceFingerprint = hashDeviceFingerprint(deviceSeed, userAgent);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + COOKIE_MAX_AGE * 1000);
  const studentId = student.id;
  const academyId = academy.id;

  // Per-student device limit (max TUTOR_DEVICE_LIMIT active devices).
  // count + create are wrapped in a transaction so two concurrent new-device
  // logins can't both read "1 device" and both create a 3rd session (TOCTOU).
  const tutorSession = await prisma.$transaction(async (tx) => {
    // (A) Same device re-login → reuse & refresh the existing active session.
    const sameDevice = await tx.tutorStudentSession.findFirst({
      where: {
        studentId,
        deviceFingerprint,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { issuedAt: "desc" },
      select: { id: true },
    });
    if (sameDevice) {
      return tx.tutorStudentSession.update({
        where: { id: sameDevice.id },
        data: {
          academyId,
          userAgent,
          ip,
          issuedAt: now,
          lastSeenAt: now,
          expiresAt,
          revokedAt: null,
          revokedReason: null,
        },
      });
    }

    // (B) New device → enforce the active device limit (distinct fingerprints).
    const activeSessions = await tx.tutorStudentSession.findMany({
      where: { studentId, revokedAt: null, expiresAt: { gt: now } },
      select: { deviceFingerprint: true },
    });
    const activeDevices = new Set(activeSessions.map((s) => s.deviceFingerprint));
    if (activeDevices.size >= TUTOR_DEVICE_LIMIT) {
      throw new Error(DEVICE_LIMIT_EXCEEDED);
    }

    // (C) Under the limit → register the new device session.
    return tx.tutorStudentSession.create({
      data: {
        academyId,
        studentId,
        deviceFingerprint,
        userAgent,
        ip,
        issuedAt: now,
        lastSeenAt: now,
        expiresAt,
      },
    });
  });

  const tokenPayload: Omit<TutorStudentTokenPayload, "iat" | "exp"> = {
    typ: "tutor-student",
    aud: "tutor-student",
    iss: "nara-tutor",
    sessionId: tutorSession.id,
    studentId: student.id,
    academyId: academy.id,
    academySlug: academy.slug,
    name: student.name,
    grade: student.grade,
    deviceFingerprint,
  };
  if (student.schoolId) tokenPayload.schoolId = student.schoolId;
  const token = await signTutorStudentToken(tokenPayload);

  const cookieStore = await cookies();
  cookieStore.set(TUTOR_STUDENT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: LEGACY_TUTOR_COOKIE_PATH,
  });
  cookieStore.set(TUTOR_DEVICE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: LEGACY_TUTOR_COOKIE_PATH,
  });
  cookieStore.set(TUTOR_DEVICE_COOKIE, deviceSeed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: COOKIE_PATH,
  });
  cookieStore.set(TUTOR_STUDENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: COOKIE_PATH,
  });

  return { studentId: student.id, academyId: academy.id, academySlug: academy.slug };
}

export async function logoutTutorStudent() {
  const session = await getTutorStudentSession();
  if (session) {
    await prisma.tutorStudentSession.updateMany({
      where: { id: session.sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "logout" },
    });
  }
  const cookieStore = await cookies();
  cookieStore.set(TUTOR_STUDENT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: COOKIE_PATH,
  });
  cookieStore.set(TUTOR_STUDENT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: LEGACY_TUTOR_COOKIE_PATH,
  });
}
