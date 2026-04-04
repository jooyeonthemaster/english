"use client";

import { motion } from "framer-motion";
import { CreditCard } from "lucide-react";

// ---------------------------------------------------------------------------
// 수납 탭 (더미 UI — 나중에 데이터 연동)
// ---------------------------------------------------------------------------

// 더미 데이터 (연동 시 서버 액션으로 교체)
const DUMMY_PAYMENTS = [
  { id: "1", month: "2026년 4월", amount: 350000, status: "UNPAID" as const },
  { id: "2", month: "2026년 3월", amount: 350000, status: "PAID" as const, paidAt: "2026-03-05" },
  { id: "3", month: "2026년 2월", amount: 350000, status: "PAID" as const, paidAt: "2026-02-03" },
];

export function PaymentTab() {
  const current = DUMMY_PAYMENTS[0];
  const history = DUMMY_PAYMENTS.slice(1);

  return (
    <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* 이번 달 수납 */}
      <div className="rounded-3xl bg-white p-6">
        <p className="text-sm font-medium text-black mb-1">{current.month} 수강료</p>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black tracking-tight" style={{ color: "var(--key-color)" }}>
            {current.amount.toLocaleString()}
          </span>
          <span className="text-lg font-bold text-black">원</span>
        </div>
        <div className="mt-3">
          {current.status === "PAID" ? (
            <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full">
              납부 완료
            </span>
          ) : (
            <span className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-full">
              미납
            </span>
          )}
        </div>
      </div>

      {/* 수납 내역 */}
      {history.length > 0 && (
        <div className="rounded-3xl bg-white p-5">
          <h3 className="text-sm font-bold text-black mb-3">수납 내역</h3>
          <div className="space-y-2">
            {history.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-black">{p.month}</p>
                  {p.paidAt && (
                    <p className="text-xs text-gray-400">납부일: {p.paidAt}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-black">{p.amount.toLocaleString()}원</p>
                  <p className="text-xs text-emerald-500">납부 완료</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 안내 */}
      <div className="rounded-3xl bg-white p-5 text-center">
        <CreditCard className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">
          수납 관련 문의는 학원으로 연락해 주세요
        </p>
      </div>
    </motion.div>
  );
}
