import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Supabase 풀러는 유휴 시 일시 중단되어 첫 요청에서 "Can't reach database server"(P1001 등)가
// 발생할 수 있다. 이런 일시적 연결 오류는 자동으로 재시도해 500을 막는다.
const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;

function isTransientError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_CODES.has(error.code);
  }
  const message = error instanceof Error ? error.message : String(error);
  return /can't reach database server|connection.*closed|timed out/i.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createPrismaClient() {
  return new PrismaClient().$extends({
    query: {
      async $allOperations({ args, query }) {
        let lastError: unknown;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            lastError = error;
            if (attempt === MAX_RETRIES || !isTransientError(error)) throw error;
            await sleep(BASE_DELAY_MS * 2 ** attempt);
          }
        }
        throw lastError;
      },
    },
  });
}

// 확장 클라이언트는 동일한 모델/$transaction API를 제공하므로, 호출부 타입 호환을 위해
// 기본 PrismaClient 타입으로 노출한다(재시도는 런타임에서 동작).
export const prisma =
  globalForPrisma.prisma ?? (createPrismaClient() as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
