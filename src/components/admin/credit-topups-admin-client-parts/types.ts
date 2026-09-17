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

export type AdminTopUpStats = {
  todayCount: number;
  todayRevenue: number;
  todayCredits: number;
  pendingCount: number;
  completedCount: number;
  completedRevenue: number;
  completedCredits: number;
  failedCount: number;
};

export const ZERO_STATS: AdminTopUpStats = {
  todayRevenue: 0,
  todayCount: 0,
  todayCredits: 0,
  completedCredits: 0,
  completedCount: 0,
  completedRevenue: 0,
  pendingCount: 0,
  failedCount: 0,
};

export const TOPUPS_PAGE_SIZE = 50;
