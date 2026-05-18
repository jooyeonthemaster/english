// Matches the return type of getAcademyDetail (academy spread at top level)
export interface AcademyDetailData {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  status: string;
  createdAt: Date;
  staff: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
  }[];
  creditBalance: {
    balance: number;
    monthlyAllocation: number;
    bonusCredits: number;
    totalConsumed: number;
    totalAllocated: number;
    lowCreditThreshold: number;
  } | null;
  subscription: {
    id: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    plan: {
      name: string;
      tier: string;
      monthlyPrice: number;
      monthlyCredits: number;
    };
  } | null;
  recentTransactions: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    createdAt: Date;
  }[];
  usageStats: {
    creditsConsumedLast30Days: number;
    transactionCountLast30Days: number;
    questionCount: number;
    studentCount: number;
    passageCount: number;
    examCount: number;
    classCount: number;
  };
  content?: {
    passages: unknown[];
    questions: unknown[];
    exams: unknown[];
  };
}

export const TX_TYPE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  ALLOCATION: { label: "할당", className: "text-emerald-600" },
  CONSUMPTION: { label: "사용", className: "text-red-500" },
  TOP_UP: { label: "충전", className: "text-blue-600" },
  ADJUSTMENT: { label: "조정", className: "text-slate-600" },
  REFUND: { label: "환불", className: "text-blue-600" },
  RESET: { label: "초기화", className: "text-gray-500" },
  ROLLOVER: { label: "이월", className: "text-slate-600" },
};
