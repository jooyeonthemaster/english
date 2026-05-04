import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSocialBridgeToken } from "@/lib/social-bridge";
import { signOnboardingToken } from "@/lib/onboarding-token";

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_URL = "https://kapi.kakao.com/v2/user/me";

function errorRedirect(origin: string, code: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return errorRedirect(origin, oauthError);
  }

  const clientId = process.env.KAKAO_CLIENT_ID;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!clientId) {
    return errorRedirect(origin, "kakao_not_configured");
  }

  const redirectUri = `${origin}/api/auth/kakao`;

  if (!code) {
    const authorizeUrl = new URL(KAKAO_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "profile_nickname profile_image");
    return NextResponse.redirect(authorizeUrl.toString());
  }

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  });
  if (clientSecret) tokenBody.set("client_secret", clientSecret);

  console.log("[kakao-oauth] exchanging code", {
    redirect_uri: redirectUri,
    client_id_prefix: clientId.slice(0, 8),
    has_client_secret: !!clientSecret,
  });

  const tokenRes = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: tokenBody,
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error("[kakao-oauth] token endpoint failed", {
      status: tokenRes.status,
      body: errorBody,
      redirect_uri_sent: redirectUri,
    });
    return errorRedirect(origin, "kakao_token_failed");
  }
  const tokenData: { access_token?: string } = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error("[kakao-oauth] no access_token in response", tokenData);
    return errorRedirect(origin, "kakao_token_failed");
  }

  const userRes = await fetch(KAKAO_USER_URL, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
  if (!userRes.ok) {
    const errorBody = await userRes.text();
    console.error("[kakao-oauth] user info endpoint failed", {
      status: userRes.status,
      body: errorBody,
    });
    return errorRedirect(origin, "kakao_user_failed");
  }

  const kakaoUser: {
    id: number | string;
    kakao_account?: {
      profile?: {
        nickname?: string;
        profile_image_url?: string;
        thumbnail_image_url?: string;
      };
    };
  } = await userRes.json();

  const kakaoId = String(kakaoUser.id);
  const profile = kakaoUser.kakao_account?.profile ?? {};
  const nickname = profile.nickname ?? null;
  const avatarUrl = profile.profile_image_url ?? profile.thumbnail_image_url ?? null;

  const staff = await prisma.staff.findUnique({
    where: { kakaoId },
    include: { academy: true },
  });

  if (staff) {
    if (!staff.isActive) return errorRedirect(origin, "inactive");
    if (staff.role !== "DIRECTOR") return errorRedirect(origin, "not_director");

    await prisma.staff.update({
      where: { id: staff.id },
      data: {
        authProvider: "kakao",
        lastLoginAt: new Date(),
      },
    });

    const bridgeToken = await signSocialBridgeToken({
      staffId: staff.id,
      email: staff.email,
      provider: "kakao",
    });

    const completeUrl = new URL("/auth/complete", origin);
    completeUrl.searchParams.set("token", bridgeToken);
    return NextResponse.redirect(completeUrl);
  }

  // Auto-signup: first-time Kakao user → onboarding form. Email cannot come
  // from Kakao (biz scope gate), so the user supplies it during onboarding.
  void avatarUrl; // not yet persisted — Staff has no avatar field for OAuth profile
  const onboardingToken = await signOnboardingToken({
    provider: "kakao",
    email: null,
    name: nickname,
    supabaseUserId: null,
    kakaoId,
  });

  const onboardingUrl = new URL("/auth/onboarding", origin);
  onboardingUrl.searchParams.set("token", onboardingToken);
  return NextResponse.redirect(onboardingUrl);
}
