import { auth } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Shared internal helpers for students server actions
// ---------------------------------------------------------------------------

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("인증이 필요합니다.");
  const user = session.user as unknown as Record<string, unknown>;
  return {
    id: user.id as string,
    role: user.role as string,
    academyId: user.academyId as string,
  };
}
