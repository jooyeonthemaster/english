import { SignJWT, jwtVerify } from "jose";

const ISSUER = "yshin-social-bridge";
const AUDIENCE = "yshin-nextauth";

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export type SocialBridgePayload = {
  staffId: string;
  email: string;
  provider: "google" | "kakao";
};

export async function signSocialBridgeToken(payload: SocialBridgePayload) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("3m")
    .sign(getSecret());
}

export async function verifySocialBridgeToken(
  token: string,
): Promise<SocialBridgePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return {
      staffId: payload.staffId as string,
      email: payload.email as string,
      provider: payload.provider as "google" | "kakao",
    };
  } catch {
    return null;
  }
}
