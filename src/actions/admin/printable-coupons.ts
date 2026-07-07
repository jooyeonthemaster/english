"use server";

// ============================================================================
// 실물(인쇄형) 쿠폰 — 어드민 발급/조회 서버액션.
// 규약: requireAdminAuth("SUPER_ADMIN") + zod + prisma.$transaction + ActionResult<T>.
// (선례: src/actions/admin-members/adjust-member-credits.ts)
// ============================================================================

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { datetimeLocalToIso } from "@/lib/utils";
import { getSiteUrl } from "@/lib/growth/constants";
import {
  createReadableCode,
  createCouponToken,
  buildClaimUrl,
  renderCouponQrDataUrl,
} from "@/lib/printable-coupons";
import { type ActionResult, fail } from "@/actions/admin-members/_shared";
import type { PrintableCouponStatus } from "@/lib/printable-coupon-format";

// ── 발급 입력 검증 (§1 무결성: effectType별 분기) ───────────────────────────

const MAX_QUANTITY = 500;
const MAX_GRANT_CREDITS = 1_000_000;
const MAX_DISCOUNT_AMOUNT = 10_000_000;
const MAX_GRANT_EXPIRY_DAYS = 3650;

const issueSchema = z
  .object({
    batchName: z.string().trim().min(1, "발급 라벨을 입력해주세요.").max(120),
    title: z.string().trim().min(1, "쿠폰명을 입력해주세요.").max(80),
    description: z.string().trim().max(500).optional(),
    effectType: z.enum([
      "CREDIT_GRANT",
      "DISCOUNT_AMOUNT",
      "DISCOUNT_PERCENT",
    ]),
    grantCredits: z.number().int().positive().max(MAX_GRANT_CREDITS).optional(),
    grantExpiryDays: z
      .number()
      .int()
      .min(0)
      .max(MAX_GRANT_EXPIRY_DAYS)
      .optional(),
    // 캘린더로 고른 지급 크레딧 만료일 "YYYY-MM-DD" (선택). 비우면 무기한(RIDE).
    grantExpiryAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "만료일 형식이 올바르지 않습니다.")
      .optional(),
    discountAmount: z.number().int().max(MAX_DISCOUNT_AMOUNT).optional(),
    discountPercent: z.number().int().optional(),
    validUntil: z.string().optional(), // datetime-local (로컬 벽시계)
    quantity: z.number().int().min(1).max(MAX_QUANTITY),
    perAcademyLimit: z.number().int().min(1).max(MAX_QUANTITY).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.effectType === "CREDIT_GRANT") {
      if (!v.grantCredits || v.grantCredits <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["grantCredits"],
          message: "지급 크레딧은 1 이상이어야 합니다.",
        });
      }
      if (v.grantExpiryAt) {
        const d = grantExpiryDate(v.grantExpiryAt);
        if (!d) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["grantExpiryAt"],
            message: "만료일이 올바르지 않습니다.",
          });
        } else if (d.getTime() <= Date.now()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["grantExpiryAt"],
            message: "만료일은 오늘 이후로 선택해주세요.",
          });
        }
      }
    } else if (v.effectType === "DISCOUNT_AMOUNT") {
      if (!v.discountAmount || v.discountAmount < 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountAmount"],
          message: "할인 금액은 100원 이상이어야 합니다.",
        });
      } else if (v.discountAmount % 100 !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountAmount"],
          message: "할인 금액은 100원 단위로 입력해주세요.",
        });
      }
    } else if (v.effectType === "DISCOUNT_PERCENT") {
      if (!v.discountPercent || v.discountPercent < 1 || v.discountPercent > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountPercent"],
          message: "할인율은 1~100 사이여야 합니다.",
        });
      }
    }
  });

export interface IssuedCouponCard {
  serialNumber: string;
  qrImageUrl: string;
}

export interface IssueBatchResult {
  batchId: string;
  batchName: string;
  title: string;
  effectType: string;
  quantity: number;
  cards: IssuedCouponCard[];
}

function isUniqueViolation(
  e: unknown,
): e is Prisma.PrismaClientKnownRequestError {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

/**
 * QR에 실을 origin. "관리자가 지금 접속한 호스트"를 우선 사용 → 발급 환경 그대로
 * 스캔 가능(로컬은 LAN IP, 운영은 실도메인). 헤더가 없으면 getSiteUrl() 폴백.
 * 이렇게 하면 로컬 dev에서도 관리자가 http://<LAN_IP>:3000 으로 접속해 발급하면
 * 같은 와이파이의 폰이 그 QR을 열 수 있다(하드코딩 운영도메인 404 회피).
 */
async function resolveQrOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const isLocal = host.includes("localhost") || /^\d/.test(host);
      const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    /* headers() 사용 불가 컨텍스트 → 폴백 */
  }
  return getSiteUrl();
}

/**
 * 캘린더 만료일 "YYYY-MM-DD" → 그 날 끝(KST 23:59:59)의 절대시각.
 * KST(+09:00)로 고정 파싱해 프로덕션(UTC)에서도 날짜가 밀리지 않게 한다.
 */
function grantExpiryDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** quantity개의 (serialNumber, token, tokenHash) — intra-batch 유일성은 Set으로 보장. */
function generateCodes(quantity: number) {
  const serials = new Set<string>();
  const out: Array<{ serialNumber: string; token: string; tokenHash: string }> =
    [];
  while (out.length < quantity) {
    const serialNumber = createReadableCode();
    if (serials.has(serialNumber)) continue;
    serials.add(serialNumber);
    const { token, tokenHash } = createCouponToken();
    out.push({ serialNumber, token, tokenHash });
  }
  return out;
}

/**
 * 실물 쿠폰 배치 발급. effectType 하나를 고르고 quantity장을 ACTIVE로 생성한다.
 * QR 원본 토큰은 DB에 저장하지 않고(§11) 이 응답에만 담아 즉시 인쇄에 쓴다.
 */
export async function issuePrintableCouponBatch(input: {
  batchName: string;
  title: string;
  description?: string;
  effectType: "CREDIT_GRANT" | "DISCOUNT_AMOUNT" | "DISCOUNT_PERCENT";
  grantCredits?: number;
  grantExpiryDays?: number;
  grantExpiryAt?: string;
  discountAmount?: number;
  discountPercent?: number;
  validUntil?: string;
  quantity: number;
  perAcademyLimit?: number;
}): Promise<ActionResult<{ batch: IssueBatchResult }>> {
  const session = await requireAdminAuth("SUPER_ADMIN");

  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const v = parsed.data;

  // effectType에 맞는 값만 저장(나머지 null) — 데이터 무결성.
  const grantCredits = v.effectType === "CREDIT_GRANT" ? v.grantCredits! : null;
  const grantExpiryDays =
    v.effectType === "CREDIT_GRANT" ? v.grantExpiryDays ?? null : null;
  const grantExpiryAt =
    v.effectType === "CREDIT_GRANT" ? grantExpiryDate(v.grantExpiryAt) : null;
  const discountAmount =
    v.effectType === "DISCOUNT_AMOUNT" ? v.discountAmount! : null;
  const discountPercent =
    v.effectType === "DISCOUNT_PERCENT" ? v.discountPercent! : null;
  const validUntilIso = datetimeLocalToIso(v.validUntil);

  let codes = generateCodes(v.quantity);
  let batchId = "";

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const batch = await tx.printableCouponBatch.create({
            data: {
              batchName: v.batchName,
              title: v.title,
              description: v.description || null,
              effectType: v.effectType,
              grantCredits,
              grantExpiryDays,
              grantExpiryAt,
              discountAmount,
              discountPercent,
              validUntil: validUntilIso ? new Date(validUntilIso) : null,
              quantity: v.quantity,
              perAcademyLimit: v.perAcademyLimit ?? 1,
              createdByAdminId: session.adminId,
              createdByAdminEmail: session.email,
            },
            select: { id: true },
          });
          await tx.printableCouponCode.createMany({
            data: codes.map((c) => ({
              batchId: batch.id,
              serialNumber: c.serialNumber,
              tokenHash: c.tokenHash,
            })),
          });
          return batch;
        });
        batchId = created.id;
        break;
      } catch (e) {
        // serialNumber/tokenHash 전역 충돌 → 코드 재생성 후 재시도(배치도 롤백됨).
        if (isUniqueViolation(e) && attempt < 5) {
          codes = generateCodes(v.quantity);
          continue;
        }
        throw e;
      }
    }
  } catch (err) {
    console.error("[issuePrintableCouponBatch] failed", { input, err });
    return fail("발급 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  // QR 이미지(data URL)는 발급 응답에만 — DB 미저장. 인쇄 딥링크로 토큰을 실어 보낸다.
  const origin = await resolveQrOrigin();
  const cards: IssuedCouponCard[] = await Promise.all(
    codes.map(async (c) => ({
      serialNumber: c.serialNumber,
      qrImageUrl: await renderCouponQrDataUrl(buildClaimUrl(origin, c.token)),
    })),
  );

  revalidatePath("/admin/coupons");

  return {
    success: true,
    batch: {
      batchId,
      batchName: v.batchName,
      title: v.title,
      effectType: v.effectType,
      quantity: v.quantity,
      cards,
    },
  };
}

// ── 배치 목록 (서버 페이지네이션 + status 카운트) ───────────────────────────

export interface BatchListRow {
  id: string;
  batchName: string;
  title: string;
  effectType: string;
  grantCredits: number | null;
  grantExpiryDays: number | null;
  grantExpiryAt: string | null;
  discountAmount: number | null;
  discountPercent: number | null;
  validUntil: string | null;
  quantity: number;
  perAcademyLimit: number;
  isActive: boolean;
  createdAt: string;
  counts: Record<PrintableCouponStatus, number>;
}

export interface ListBatchesResult {
  rows: BatchListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const EMPTY_COUNTS = (): Record<PrintableCouponStatus, number> => ({
  ACTIVE: 0,
  CLAIMED: 0,
  USED: 0,
  VOID: 0,
});

export async function listPrintableCouponBatches(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  effectType?: string;
}): Promise<ListBatchesResult> {
  await requireAdminAuth();

  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize ?? 20)));
  const search = (input.search ?? "").trim().slice(0, 100);
  const effectType = input.effectType?.trim();

  const where: Prisma.PrintableCouponBatchWhereInput = {};
  if (search) {
    where.OR = [
      { batchName: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
    ];
  }
  if (
    effectType &&
    ["CREDIT_GRANT", "DISCOUNT_AMOUNT", "DISCOUNT_PERCENT"].includes(effectType)
  ) {
    where.effectType = effectType;
  }

  const [total, batches] = await Promise.all([
    prisma.printableCouponBatch.count({ where }),
    prisma.printableCouponBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const batchIds = batches.map((b) => b.id);
  const grouped = batchIds.length
    ? await prisma.printableCouponCode.groupBy({
        by: ["batchId", "status"],
        where: { batchId: { in: batchIds } },
        _count: { _all: true },
      })
    : [];

  const countsByBatch = new Map<string, Record<PrintableCouponStatus, number>>();
  for (const id of batchIds) countsByBatch.set(id, EMPTY_COUNTS());
  for (const g of grouped) {
    const rec = countsByBatch.get(g.batchId);
    if (rec && g.status in rec) {
      rec[g.status as PrintableCouponStatus] = g._count._all;
    }
  }

  return {
    rows: batches.map((b) => ({
      id: b.id,
      batchName: b.batchName,
      title: b.title,
      effectType: b.effectType,
      grantCredits: b.grantCredits,
      grantExpiryDays: b.grantExpiryDays,
      grantExpiryAt: b.grantExpiryAt ? b.grantExpiryAt.toISOString() : null,
      discountAmount: b.discountAmount,
      discountPercent: b.discountPercent,
      validUntil: b.validUntil ? b.validUntil.toISOString() : null,
      quantity: b.quantity,
      perAcademyLimit: b.perAcademyLimit,
      isActive: b.isActive,
      createdAt: b.createdAt.toISOString(),
      counts: countsByBatch.get(b.id) ?? EMPTY_COUNTS(),
    })),
    total,
    page,
    pageSize,
  };
}

// ── 운영: 킬스위치 · 무효화 (SUPER_ADMIN) ──────────────────────────────────

/** 배치 활성/중지 토글(킬스위치). 중지 시 신규 등록·미사용 보유 쿠폰이 즉시 차단된다. */
export async function setBatchActive(input: {
  batchId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  await requireAdminAuth("SUPER_ADMIN");
  const schema = z.object({ batchId: z.string().min(1), isActive: z.boolean() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("입력값이 올바르지 않습니다.");

  try {
    const res = await prisma.printableCouponBatch.updateMany({
      where: { id: parsed.data.batchId },
      data: { isActive: parsed.data.isActive },
    });
    if (res.count === 0) return fail("배치를 찾을 수 없습니다.");
  } catch (err) {
    console.error("[setBatchActive] failed", { input, err });
    return fail("상태 변경 중 오류가 발생했습니다.");
  }
  revalidatePath("/admin/coupons");
  return { success: true };
}

/**
 * 미등록(ACTIVE) 코드를 무효화(VOID)한다. batchId면 배치 전체, codeId면 한 장.
 * 이미 CLAIMED/USED(귀속·지급 완료)인 코드는 건드리지 않는다(확정 상태 보존).
 */
export async function voidPrintableCoupons(input: {
  batchId?: string;
  codeId?: string;
}): Promise<ActionResult<{ voided: number }>> {
  await requireAdminAuth("SUPER_ADMIN");
  if (!input.batchId && !input.codeId) {
    return fail("무효화 대상을 지정해주세요.");
  }

  try {
    const where: Prisma.PrintableCouponCodeWhereInput = {
      status: "ACTIVE",
      ...(input.codeId ? { id: input.codeId } : { batchId: input.batchId }),
    };
    const res = await prisma.printableCouponCode.updateMany({
      where,
      data: { status: "VOID" },
    });
    revalidatePath("/admin/coupons");
    return { success: true, voided: res.count };
  } catch (err) {
    console.error("[voidPrintableCoupons] failed", { input, err });
    return fail("무효화 중 오류가 발생했습니다.");
  }
}
