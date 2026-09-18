import type {
  DuplicateNotificationCandidate,
  ManualGrantCandidate,
} from "@/components/admin/credit-topups-admin-parts/manual-complete-modal";

// 결제 관리(충전 내역) 클라이언트가 쓰는 타입·상수. API 응답 모양을 그대로 옮긴 것.

export type AdminTopUp = {
  id: string;
  academyId: string;
  creditAmount: number;
  price: number;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentId: string | null;
  orderName: string | null;
  storeId?: string | null;
  channelKey?: string | null;
  currency?: string;
  portoneStatus: string | null;
  portoneTransactionId: string | null;
  paidAmount: number | null;
  receiptUrl: string | null;
  failureCode?: string | null;
  failureMessage: string | null;
  status: string;
  completedAt: Date | string | null;
  verifiedAt?: Date | string | null;
  paidAt: Date | string | null;
  cancelledAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  customData?: unknown;
  academy: {
    id: string;
    name: string;
    slug: string;
    creditBalance: {
      balance: number;
      bonusCredits: number;
      totalAllocated: number;
      monthlyAllocation?: number;
    } | null;
    staff: Array<{
      id: string;
      name: string;
      email: string;
    }>;
  };
  creditTransaction: {
    id: string;
    balanceAfter: number;
    createdAt: Date | string;
  } | null;
};

export type AdminWebhookEvent = {
  id: string;
  webhookId: string;
  eventType: string;
  status: string;
  errorMessage: string | null;
  receivedAt: Date | string;
  processedAt: Date | string | null;
};

export type AdminRelatedCreditTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  adminId: string | null;
  staffId: string | null;
  metadata: string | null;
  createdAt: Date | string;
};

export type AdminCreditActivity = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  operationType: string | null;
  description: string | null;
  staffId: string | null;
  createdAt: Date | string;
};

export type AdminTopUpDetail = AdminTopUp & {
  /** 수동 충전 완료 처리 가능 여부(미지급 + 대기 상태) */
  canManualComplete?: boolean;
  manualGrantCandidates?: ManualGrantCandidate[];
  duplicateNotificationCandidates?: DuplicateNotificationCandidate[];
  webhookEvents: AdminWebhookEvent[];
  relatedCreditTransactions: AdminRelatedCreditTransaction[];
  academyCreditActivity: AdminCreditActivity[];
  academyActivityTotal: number;
  academyActivityPageSize: number;
  academyUsageSummary: {
    totalConsumed: number;
    consumptionCount: number;
  };
};

// 상단 카드 집계 타입의 정본은 서버 집계 모듈(admin-credit-topup-stats.ts)이다 —
// 매출 정의는 admin-revenue.ts(D1), 대기 분류는 admin-topup-progress.ts.
// 여기서 같은 이름의 타입을 따로 선언하면 「대기 = pendingCount」처럼 이미 갈라진 정의가
// 조용히 되살아난다(§9.2 F2·D3: 대기는 진행 중 / 미완료(이탈·만료)로 나눠 센다).
// `export type` 이라 컴파일 뒤 남지 않는다 — 서버 모듈(prisma)이 클라이언트 번들로 끌려오지 않음.
export type { AdminTopUpStats } from "@/lib/admin-credit-topup-stats";

// 카드 0값 상수(ZERO_STATS)는 스트림을 소유한 화면(credit-topups-admin-client.tsx)이 갖는다 —
// 시간창·검토창 상수(PENDING_STALE_MINUTES 등)를 함께 채워야 해 두 벌로 두면 또 갈라진다.

export const TOPUPS_PAGE_SIZE = 50;
