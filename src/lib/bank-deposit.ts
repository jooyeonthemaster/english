import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  expiresAtConflictSql,
  expiresAtInsertSql,
} from "@/lib/credit-expiry";

/**
 * 무통장입금 자동확인 (manual bank transfer, auto-credited via deposit alerts)
 *
 * Flow:
 *  1. Director picks "무통장입금" → POST /api/credits/top-ups/bank-deposit/prepare
 *     creates a CreditTopUp(status=WAITING_FOR_DEPOSIT, paymentMethod=BANK_TRANSFER)
 *     and shows the company account + exact amount + depositor name to use.
 *  2. They transfer the money from their bank.
 *  3. The bank's deposit-alert SMS/push is relayed to
 *     POST /api/credits/top-ups/bank-notify (HMAC-authenticated).
 *  4. We match (amount + depositor name + time window) → grant credits instantly.
 *     Unmatched/ambiguous deposits are stored for admin review (no money lost).
 *
 * This path has ZERO dependency on PortOne / the PG contract, so it ships today.
 */

export const BANK_TRANSFER_PAY_METHOD = "BANK_TRANSFER" as const;

const DEFAULT_MATCH_WINDOW_MINUTES = 30;

export type BankDepositConfig = {
  enabled: boolean;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  matchWindowMinutes: number;
};

function publicEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "심사 제출 전 입력 필요" ? trimmed : "";
}

export function getBankDepositConfig(): BankDepositConfig {
  const bankName = publicEnv(process.env.NEXT_PUBLIC_BANK_DEPOSIT_BANK_NAME);
  const accountNumber = publicEnv(
    process.env.NEXT_PUBLIC_BANK_DEPOSIT_ACCOUNT_NUMBER,
  );
  const accountHolder = publicEnv(
    process.env.NEXT_PUBLIC_BANK_DEPOSIT_ACCOUNT_HOLDER,
  );

  const flag =
    process.env.NEXT_PUBLIC_BANK_DEPOSIT_ENABLED ??
    process.env.BANK_DEPOSIT_ENABLED;
  const flagEnabled = flag?.trim().toLowerCase() === "true";

  const windowRaw = Number(process.env.BANK_DEPOSIT_MATCH_WINDOW_MINUTES);
  const matchWindowMinutes =
    Number.isFinite(windowRaw) && windowRaw > 0
      ? Math.floor(windowRaw)
      : DEFAULT_MATCH_WINDOW_MINUTES;

  return {
    // Only truly enabled when an account is configured to display.
    enabled: flagEnabled && Boolean(bankName && accountNumber && accountHolder),
    bankName,
    accountNumber,
    accountHolder,
    matchWindowMinutes,
  };
}

export class BankDepositError extends Error {
  code:
    | "DISABLED"
    | "CONFIG_MISSING"
    | "INVALID_INPUT"
    | "PRODUCT_NOT_FOUND"
    | "UNAUTHORIZED";
  constructor(code: BankDepositError["code"], message: string) {
    super(message);
    this.name = "BankDepositError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Relay authentication (HMAC-SHA256 over the raw request body)
// ---------------------------------------------------------------------------

export function getBankNotifyRelaySecret(): string | null {
  const raw = process.env.BANK_NOTIFY_RELAY_SECRET?.trim();
  return raw || null;
}

/**
 * Simple bearer token for relays that hit SMOAT directly (no Cloudflare proxy,
 * no HMAC). The phone sends `Authorization: Bearer <token>`. Lower ceremony than
 * HMAC; fine over HTTPS for this low-stakes ingest.
 */
export function getBankNotifyIngestToken(): string | null {
  const raw = process.env.BANK_NOTIFY_INGEST_TOKEN?.trim();
  return raw || null;
}

/** Constant-time compare for the bearer token. */
export function verifyBankNotifyToken(authHeader: string | null): boolean {
  const expected = getBankNotifyIngestToken();
  if (!expected) return false;
  if (!authHeader) return false;
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify the relay signature. The forwarder must send header
 * `x-bank-notify-signature: sha256=<hex>` where the hmac is computed over the
 * exact raw request body using BANK_NOTIFY_RELAY_SECRET.
 */
export function verifyBankNotifySignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = getBankNotifyRelaySecret();
  if (!secret) return false;
  if (!signatureHeader) return false;

  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  if (!/^[0-9a-fA-F]+$/.test(provided)) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Depositor-name normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a depositor name for comparison: drop whitespace and any
 * non-letter/number chars, lowercase Latin. Bank alerts often prefix/suffix
 * the raw name (e.g. branch codes), so callers should only compare the core.
 */
export function normalizeDepositorName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Za-z가-힣]/g, "")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// SMS / push deposit-alert parsing
// ---------------------------------------------------------------------------

export type ParsedDeposit = {
  amount: number | null;
  depositorName: string | null;
  bankName: string | null;
};

const BANK_KEYWORDS = [
  "국민",
  "신한",
  "우리",
  "하나",
  "농협",
  "기업",
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "새마을",
  "신협",
  "우체국",
  "SC",
  "씨티",
  "부산",
  "대구",
  "광주",
  "전북",
  "경남",
  "수협",
];

/**
 * Best-effort parser for Korean bank deposit-alert text. Relays may also send
 * structured { amount, depositorName } directly — prefer that when available.
 *
 * Typical formats handled:
 *   "[Web발신] 신한 입금 50,000원 홍길동 잔액1,234,567"
 *   "KB국민 04/12 13:01 입금 19,837원 김철수"
 */
export function parseDepositNotification(text: string): ParsedDeposit {
  const normalized = text.replace(/ /g, " ");

  // Amount: number immediately before 원, that is the DEPOSIT not the 잔액.
  // Strategy: take the amount nearest to the "입금" keyword.
  let amount: number | null = null;
  const depositIdx = normalized.indexOf("입금");
  const amountMatches = [...normalized.matchAll(/([0-9,]+)\s*원/g)];
  if (amountMatches.length > 0) {
    let best = amountMatches[0];
    if (depositIdx >= 0) {
      let bestDist = Infinity;
      for (const m of amountMatches) {
        const idx = m.index ?? 0;
        const dist = Math.abs(idx - depositIdx);
        // Skip values explicitly tagged as 잔액(balance).
        const around = normalized.slice(Math.max(0, idx - 6), idx);
        if (around.includes("잔액") || around.includes("잔액:")) continue;
        if (dist < bestDist) {
          bestDist = dist;
          best = m;
        }
      }
    }
    const digits = best[1].replace(/,/g, "");
    const value = Number(digits);
    if (Number.isFinite(value) && value > 0) amount = value;
  }

  // Depositor name: token after the amount-원, before 잔액. Korean name or Latin.
  let depositorName: string | null = null;
  const afterDeposit =
    depositIdx >= 0 ? normalized.slice(depositIdx) : normalized;
  const nameMatch = afterDeposit.match(
    /원\s*([가-힣]{2,5}|[A-Za-z][A-Za-z .]{1,20})/,
  );
  if (nameMatch) {
    depositorName = nameMatch[1].trim().replace(/\s+/g, " ");
  }

  // Bank name: first known keyword present.
  const bankName = BANK_KEYWORDS.find((kw) => normalized.includes(kw)) ?? null;

  return { amount, depositorName, bankName };
}

// ---------------------------------------------------------------------------
// Matching + crediting
// ---------------------------------------------------------------------------

export type DepositInput = {
  amount: number;
  depositorName: string | null;
  occurredAt: Date | null;
};

export type MatchOutcome =
  | { status: "MATCHED"; topUpId: string }
  | { status: "UNMATCHED" }
  | { status: "AMBIGUOUS"; candidateIds: string[] };

type CandidateTopUp = {
  id: string;
  customData: Prisma.JsonValue;
  createdAt: Date;
};

/**
 * Find the single WAITING_FOR_DEPOSIT bank-transfer order that matches this
 * deposit by exact amount + normalized depositor name + within the time window.
 * 0 candidates → UNMATCHED, 1 → MATCHED, >1 → AMBIGUOUS (sent to admin).
 */
export async function matchBankDeposit(
  input: DepositInput,
  windowMinutes: number,
): Promise<MatchOutcome> {
  const windowStart = new Date(
    (input.occurredAt ?? new Date()).getTime() - windowMinutes * 60_000,
  );

  const candidates = (await prisma.creditTopUp.findMany({
    where: {
      status: "WAITING_FOR_DEPOSIT",
      paymentMethod: BANK_TRANSFER_PAY_METHOD,
      price: input.amount,
      createdAt: { gte: windowStart },
    },
    select: { id: true, customData: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })) as CandidateTopUp[];

  const wanted = normalizeDepositorName(input.depositorName);

  const matches = candidates.filter((c) => {
    const stored = readDepositorName(c.customData);
    // If no depositor name was captured on either side, fall back to
    // amount + time window only (still bounded, but flagged via single-match).
    if (!wanted || !stored) return true;
    return normalizeDepositorName(stored) === wanted;
  });

  if (matches.length === 1) return { status: "MATCHED", topUpId: matches[0].id };
  if (matches.length === 0) return { status: "UNMATCHED" };
  return { status: "AMBIGUOUS", candidateIds: matches.map((m) => m.id) };
}

function readDepositorName(customData: Prisma.JsonValue): string | null {
  if (customData && typeof customData === "object" && !Array.isArray(customData)) {
    const v = (customData as Record<string, unknown>).depositorName;
    if (typeof v === "string") return v;
  }
  return null;
}

export type GrantResult = {
  topUpId: string;
  credited: boolean;
  balanceAfter: number | null;
  transactionId: string | null;
};

/**
 * Credit a matched bank-transfer top-up. Mirrors the PortOne grant path
 * (row lock + balance upsert + audit transaction + status flip), idempotent on
 * an already-COMPLETED order. Pass the verified deposit for the audit trail.
 */
export async function grantBankDepositTopUp(
  topUpId: string,
  deposit: { amount: number; depositorName: string | null; externalId: string },
): Promise<GrantResult> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          academyId: string;
          creditAmount: number;
          price: number;
          status: string;
          requestedBy: string | null;
          creditTransactionId: string | null;
        }>
      >`
        SELECT id, "academyId", "creditAmount", price, status, "requestedBy", "creditTransactionId"
        FROM credit_top_ups
        WHERE id = ${topUpId}
        FOR UPDATE
      `;
      const topUp = rows[0];
      if (!topUp) {
        throw new BankDepositError("PRODUCT_NOT_FOUND", "Top-up order not found.");
      }

      // Idempotency: already credited → return current balance, no double-grant.
      if (topUp.status === "COMPLETED" && topUp.creditTransactionId) {
        const balance = await tx.creditBalance.findUnique({
          where: { academyId: topUp.academyId },
          select: { balance: true },
        });
        return {
          topUpId: topUp.id,
          credited: false,
          balanceAfter: balance?.balance ?? null,
          transactionId: topUp.creditTransactionId,
        };
      }

      const activeSub = await tx.academySubscription.findFirst({
        where: {
          academyId: topUp.academyId,
          status: { in: ["ACTIVE", "TRIAL"] },
        },
        include: { plan: { select: { monthlyCredits: true } } },
        orderBy: { createdAt: "desc" },
      });
      const monthlyAllocation = activeSub?.plan.monthlyCredits ?? 0;

      // Extend the balance-wide expiry by the purchased product's validity
      // (keyed by creditAmount, UNIQUE). 0/null = never expires.
      const productRows = await tx.$queryRaw<
        Array<{ expiryDays: number | null }>
      >`
        SELECT "expiryDays" FROM credit_top_up_products
        WHERE "creditAmount" = ${topUp.creditAmount}
        LIMIT 1
      `;
      const expiryDays = productRows[0]?.expiryDays ?? 0;

      const balances = await tx.$queryRaw<Array<{ balance: number }>>`
        INSERT INTO credit_balances (
          id, "academyId", balance, "monthlyAllocation", "bonusCredits", "totalAllocated", "expiresAt", "updatedAt"
        )
        VALUES (
          ${randomUUID()}, ${topUp.academyId}, ${topUp.creditAmount},
          ${monthlyAllocation}, ${topUp.creditAmount}, ${topUp.creditAmount}, ${expiresAtInsertSql(expiryDays)}, NOW()
        )
        ON CONFLICT ("academyId") DO UPDATE
          SET balance = credit_balances.balance + EXCLUDED.balance,
              "bonusCredits" = credit_balances."bonusCredits" + EXCLUDED."bonusCredits",
              "totalAllocated" = credit_balances."totalAllocated" + EXCLUDED."totalAllocated",
              "expiresAt" = ${expiresAtConflictSql(expiryDays)},
              "updatedAt" = NOW()
        RETURNING balance
      `;
      const balanceAfter = balances[0]?.balance;
      if (typeof balanceAfter !== "number") {
        throw new Error("credit_balance_upsert_failed");
      }

      const now = new Date();
      const transaction = await tx.creditTransaction.create({
        data: {
          academyId: topUp.academyId,
          type: "TOP_UP",
          amount: topUp.creditAmount,
          balanceAfter,
          description: buildBankTopUpDescription(topUp.creditAmount, topUp.price),
          referenceId: topUp.id,
          referenceType: "CREDIT_TOP_UP",
          staffId: topUp.requestedBy,
          metadata: JSON.stringify({
            source: "bank_deposit",
            depositAmount: deposit.amount,
            depositorName: deposit.depositorName,
            relayExternalId: deposit.externalId,
          }),
        },
      });

      await tx.creditTopUp.update({
        where: { id: topUp.id },
        data: {
          status: "COMPLETED",
          paymentReference: deposit.externalId,
          paidAmount: deposit.amount,
          verifiedAt: now,
          paidAt: now,
          completedAt: now,
          creditTransactionId: transaction.id,
        },
      });

      return {
        topUpId: topUp.id,
        credited: true,
        balanceAfter,
        transactionId: transaction.id,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    },
  );
}

function buildBankTopUpDescription(credits: number, price: number) {
  return `무통장입금 크레딧 충전: ${credits.toLocaleString("ko-KR")}C / ${price.toLocaleString("ko-KR")}원`;
}
