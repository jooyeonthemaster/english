import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-auth-server";
import { prisma } from "@/lib/prisma";
import { signSocialBridgeToken } from "@/lib/social-bridge";
import { signOnboardingToken } from "@/lib/onboarding-token";

type AuthIntent = "login" | "register";

function parseIntent(value: string | null): AuthIntent {
  return value === "register" ? "register" : "login";
}

function buildErrorRedirect(origin: string, code: string, intent: AuthIntent = "login") {
  const url = new URL(intent === "register" ? "/register" : "/login", origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

function buildBridgeRedirect(origin: string, bridgeToken: string) {
  const url = new URL("/auth/complete", origin);
  url.searchParams.set("token", bridgeToken);
  return NextResponse.redirect(url);
}

function buildOnboardingRedirect(origin: string, onboardingToken: string) {
  const url = new URL("/auth/onboarding", origin);
  url.searchParams.set("token", onboardingToken);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const intent = parseIntent(searchParams.get("intent"));

  const oauthError = searchParams.get("error");
  if (oauthError) {
    return buildErrorRedirect(origin, oauthError, intent);
  }

  const code = searchParams.get("code");
  if (!code) {
    return buildErrorRedirect(origin, "missing_code", intent);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[supabase-oauth] exchangeCodeForSession failed", {
      error: error?.message,
      hasUser: !!data?.user,
    });
    return buildErrorRedirect(origin, "exchange_failed", intent);
  }

  const email = data.user.email;
  const supabaseUserId = data.user.id;
  const provider = (data.user.app_metadata?.provider ?? "google") as
    | "google"
    | "kakao";

  console.log("[supabase-oauth] callback received", {
    provider,
    email,
    supabaseUserId,
  });

  if (!email) {
    await supabase.auth.signOut();
    return buildErrorRedirect(origin, "no_email", intent);
  }

  const staff = await prisma.staff.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      supabaseUserId: true,
    },
  });

  // Auto-signup: first-time social user (no Staff yet) → redirect to onboarding
  // where they fill in academy info to provision Academy + Staff(DIRECTOR).
  if (!staff) {
    console.log("[supabase-oauth] new user — routing to onboarding", { email });
    const userMetadata = data.user.user_metadata as
      | { full_name?: string; name?: string }
      | undefined;
    const displayName =
      userMetadata?.full_name ?? userMetadata?.name ?? null;
    await supabase.auth.signOut();
    const onboardingToken = await signOnboardingToken({
      provider,
      email,
      name: displayName,
      supabaseUserId,
      kakaoId: null,
    });
    return buildOnboardingRedirect(origin, onboardingToken);
  }
  if (!staff.isActive) {
    await supabase.auth.signOut();
    return buildErrorRedirect(origin, "inactive", intent);
  }
  if (staff.role !== "DIRECTOR") {
    await supabase.auth.signOut();
    return buildErrorRedirect(origin, "not_director", intent);
  }
  if (staff.supabaseUserId && staff.supabaseUserId !== supabaseUserId) {
    await supabase.auth.signOut();
    return buildErrorRedirect(origin, "account_mismatch", intent);
  }

  await prisma.staff.update({
    where: { id: staff.id },
    data: {
      supabaseUserId: staff.supabaseUserId ?? supabaseUserId,
      authProvider: provider,
      lastLoginAt: new Date(),
    },
  });

  // We use Supabase only as the OAuth verifier — discard its session so the
  // canonical Director session lives in NextAuth.
  await supabase.auth.signOut();

  const bridgeToken = await signSocialBridgeToken({
    staffId: staff.id,
    email: staff.email,
    provider,
  });

  return buildBridgeRedirect(origin, bridgeToken);
}
