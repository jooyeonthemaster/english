import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/lib/app-events";
import { verifySocialBridgeToken } from "@/lib/social-bridge";
import { isJooyeonSpecialAccount } from "@/lib/jooyeon-special-account";
import { getDefaultStaffDisplayTitle, getStaffDisplayTitle } from "@/lib/staff-display";

type StaffSessionSnapshot = {
  id: string;
  email: string;
  name: string;
  role: string;
  academyId: string;
  academyName: string;
  academySlug: string;
  displayTitle: string;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function hasCompleteStaffClaims(value: Record<string, unknown>): boolean {
  return Boolean(
    readString(value.id) &&
      readString(value.role) &&
      readString(value.academyId) &&
      readString(value.academyName) &&
      readString(value.academySlug),
  );
}

async function loadStaffSessionSnapshot(
  staffId?: string | null,
  email?: string | null,
): Promise<StaffSessionSnapshot | null> {
  const staff = staffId
    ? await prisma.staff.findUnique({
        where: { id: staffId },
        include: { academy: { select: { name: true, slug: true, settings: true } } },
      })
    : email
      ? await prisma.staff.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          include: { academy: { select: { name: true, slug: true, settings: true } } },
        })
      : null;

  if (!staff || !staff.isActive) return null;

  return {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
    academyId: staff.academyId,
    academyName: staff.academy.name,
    academySlug: staff.academy.slug,
    displayTitle: getStaffDisplayTitle(staff.academy.settings, staff.id, staff.role),
  };
}

function applyStaffClaims(target: Record<string, unknown>, staff: StaffSessionSnapshot) {
  target.id = staff.id;
  target.email = staff.email;
  target.name = staff.name;
  target.role = staff.role;
  target.academyId = staff.academyId;
  target.academyName = staff.academyName;
  target.academySlug = staff.academySlug;
  target.displayTitle = staff.displayTitle;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "ID or Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).trim();
        const password = credentials.password as string;
        const staffEmail = isJooyeonSpecialAccount(email) ? "jooyeon" : email;

        const staff = await prisma.staff.findFirst({
          where: { email: { equals: staffEmail, mode: "insensitive" } },
          include: { academy: { select: { name: true, slug: true, settings: true } } },
        });

        if (!staff || !staff.isActive) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, staff.password);

        if (!isPasswordValid) {
          return null;
        }

        await prisma.staff.update({
          where: { id: staff.id },
          data: { lastLoginAt: new Date(), authProvider: "credentials" },
        });

        await logAppEvent({
          academyId: staff.academyId,
          actorType: "STAFF",
          actorId: staff.id,
          eventType: "LOGIN",
          metadata: { provider: "credentials" },
        });

        return {
          id: staff.id,
          email: staff.email,
          name: staff.name,
          role: staff.role,
          academyId: staff.academyId,
          academyName: staff.academy.name,
          academySlug: staff.academy.slug,
          displayTitle: getStaffDisplayTitle(staff.academy.settings, staff.id, staff.role),
        };
      },
    }),
    Credentials({
      id: "social-bridge",
      name: "social-bridge",
      credentials: {
        bridgeToken: { label: "Bridge Token", type: "text" },
      },
      async authorize(credentials) {
        const token = credentials?.bridgeToken as string | undefined;
        if (!token) return null;

        const payload = await verifySocialBridgeToken(token);
        if (!payload) return null;

        const staff = await prisma.staff.findUnique({
          where: { id: payload.staffId },
          include: { academy: { select: { name: true, slug: true, settings: true } } },
        });

        if (!staff || !staff.isActive) return null;
        if (staff.email !== payload.email) return null;
        if (staff.role !== "DIRECTOR") return null;

        await logAppEvent({
          academyId: staff.academyId,
          actorType: "STAFF",
          actorId: staff.id,
          eventType: "LOGIN",
          metadata: { provider: staff.authProvider ?? "social-bridge" },
        });

        return {
          id: staff.id,
          email: staff.email,
          name: staff.name,
          role: staff.role,
          academyId: staff.academyId,
          academyName: staff.academy.name,
          academySlug: staff.academy.slug,
          displayTitle: getStaffDisplayTitle(staff.academy.settings, staff.id, staff.role),
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const tokenRecord = token as unknown as Record<string, unknown>;
      if (user) {
        const u = user as unknown as Record<string, unknown>;
        token.id = user.id;
        token.role = u.role as string;
        token.academyId = u.academyId as string;
        token.academyName = u.academyName as string;
        token.academySlug = u.academySlug as string;
        token.displayTitle = u.displayTitle as string;
      }
      // 프로필/학원 정보 수정 후 useSession().update()로 토큰 갱신
      if (trigger === "update" && session) {
        const s = session as Record<string, unknown>;
        if (typeof s.name === "string") token.name = s.name;
        if (typeof s.email === "string") token.email = s.email;
        if (typeof s.academyName === "string") token.academyName = s.academyName;
        if (typeof s.displayTitle === "string") token.displayTitle = s.displayTitle;
      }
      if (!hasCompleteStaffClaims(tokenRecord)) {
        const staff = await loadStaffSessionSnapshot(
          readString(tokenRecord.id) ?? readString(token.sub),
          readString(token.email),
        );
        if (staff) applyStaffClaims(tokenRecord, staff);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as unknown as Record<string, unknown>;
        const tokenRecord = token as unknown as Record<string, unknown>;
        const staff =
          hasCompleteStaffClaims(tokenRecord)
            ? null
            : await loadStaffSessionSnapshot(
                readString(tokenRecord.id) ?? readString(token.sub),
                readString(token.email),
              );
        const source = staff ?? tokenRecord;

        su.id = source.id;
        su.email = source.email ?? su.email;
        su.name = source.name ?? su.name;
        su.role = source.role;
        su.academyId = source.academyId;
        su.academyName = source.academyName;
        su.academySlug = source.academySlug;
        su.displayTitle =
          typeof source.displayTitle === "string" && source.displayTitle.trim()
            ? source.displayTitle
            : getDefaultStaffDisplayTitle(typeof source.role === "string" ? source.role : undefined);
      }
      return session;
    },
  },
});

// Helper to get current staff session (server-side)
export async function getStaffSession() {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as unknown as Record<string, unknown>;
  if (!hasCompleteStaffClaims(user)) {
    return loadStaffSessionSnapshot(readString(user.id), readString(user.email));
  }

  const role = readString(user.role) ?? "";
  const displayTitle =
    readString(user.displayTitle) ?? getDefaultStaffDisplayTitle(role);

  return {
    id: readString(user.id) ?? "",
    email: readString(user.email) ?? "",
    name: readString(user.name) ?? "",
    role,
    academyId: readString(user.academyId) ?? "",
    academyName: readString(user.academyName) ?? "",
    academySlug: readString(user.academySlug) ?? "",
    displayTitle,
  };
}

// Helper to require staff auth (throws redirect if not authenticated)
export async function requireStaffAuth(requiredRole?: "DIRECTOR" | "TEACHER") {
  const staff = await getStaffSession();
  if (!staff) {
    throw new Error("Unauthorized");
  }
  if (requiredRole && staff.role !== requiredRole && staff.role !== "DIRECTOR") {
    throw new Error("Forbidden");
  }
  return staff;
}
