import { SignJWT, jwtVerify } from "jose";

const ISSUER = "yshin-onboarding";
const AUDIENCE = "yshin-onboarding-flow";

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export type OnboardingTokenPayload = {
  provider: "google" | "kakao";
  email: string | null;
  name: string | null;
  supabaseUserId: string | null;
  kakaoId: string | null;
};

export async function signOnboardingToken(payload: OnboardingTokenPayload) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret());
}

export async function verifyOnboardingToken(
  token: string,
): Promise<OnboardingTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return {
      provider: payload.provider as "google" | "kakao",
      email: (payload.email as string | null) ?? null,
      name: (payload.name as string | null) ?? null,
      supabaseUserId: (payload.supabaseUserId as string | null) ?? null,
      kakaoId: (payload.kakaoId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
