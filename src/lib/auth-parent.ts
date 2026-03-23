import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "parent-session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function getJwtSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export interface ParentTokenPayload extends JWTPayload {
  parentId: string;
  academyId: string;
  name: string;
  phone: string;
  studentIds: string[];
}

export async function signParentToken(
  payload: Omit<ParentTokenPayload, "iat" | "exp">
): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(getJwtSecret());
  return token;
}

export async function verifyParentToken(
  token: string
): Promise<ParentTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as ParentTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Login parent by phone number verification or token link
 */
export async function loginParentByToken(
  loginToken: string
): Promise<ParentTokenPayload> {
  const parent = await prisma.parent.findUnique({
    where: { loginToken },
    include: {
      studentLinks: {
        include: { student: true },
      },
    },
  });

  if (!parent) {
    throw new Error("유효하지 않은 로그인 링크입니다.");
  }

  const tokenPayload: Omit<ParentTokenPayload, "iat" | "exp"> = {
    parentId: parent.id,
    academyId: parent.academyId,
    name: parent.name,
    phone: parent.phone,
    studentIds: parent.studentLinks.map((l) => l.studentId),
  };

  const token = await signParentToken(tokenPayload);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return tokenPayload as ParentTokenPayload;
}

/**
 * Login parent by phone number (simplified auth for parents)
 */
export async function loginParentByPhone(
  academyId: string,
  phone: string
): Promise<ParentTokenPayload> {
  const parent = await prisma.parent.findFirst({
    where: { academyId, phone },
    include: {
      studentLinks: {
        include: { student: true },
      },
    },
  });

  if (!parent) {
    throw new Error("등록된 학부모 정보가 없습니다. 학원에 문의하세요.");
  }

  const tokenPayload: Omit<ParentTokenPayload, "iat" | "exp"> = {
    parentId: parent.id,
    academyId: parent.academyId,
    name: parent.name,
    phone: parent.phone,
    studentIds: parent.studentLinks.map((l) => l.studentId),
  };

  const token = await signParentToken(tokenPayload);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return tokenPayload as ParentTokenPayload;
}

export async function logoutParent(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getParentSession(): Promise<ParentTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyParentToken(token);
}

export async function requireParentAuth(): Promise<ParentTokenPayload> {
  const session = await getParentSession();
  if (!session) {
    throw new Error("로그인이 필요합니다.");
  }
  return session;
}
