import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      academyId: string;
      academyName: string;
      academySlug: string;
      displayTitle: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role?: string;
    academyId?: string;
    academyName?: string;
    academySlug?: string;
    displayTitle?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    academyId: string;
    academyName: string;
    academySlug: string;
    displayTitle: string;
  }
}
