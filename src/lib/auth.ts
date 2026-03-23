import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const staff = await prisma.staff.findUnique({
          where: { email },
          include: { academy: true },
        });

        if (!staff || !staff.isActive) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, staff.password);

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: staff.id,
          email: staff.email,
          name: staff.name,
          role: staff.role,
          academyId: staff.academyId,
          academyName: staff.academy.name,
          academySlug: staff.academy.slug,
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
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as Record<string, unknown>;
        token.id = user.id;
        token.role = u.role as string;
        token.academyId = u.academyId as string;
        token.academyName = u.academyName as string;
        token.academySlug = u.academySlug as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as unknown as Record<string, unknown>;
        su.id = token.id;
        su.role = token.role;
        su.academyId = token.academyId;
        su.academyName = token.academyName;
        su.academySlug = token.academySlug;
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
  return {
    id: user.id as string,
    email: user.email as string,
    name: user.name as string,
    role: user.role as string,
    academyId: user.academyId as string,
    academyName: user.academyName as string,
    academySlug: user.academySlug as string,
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
