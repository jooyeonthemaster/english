"use client";

import { motion } from "framer-motion";
import { Award, Lock } from "lucide-react";

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

interface BadgeGridProps {
  earned: (Badge & { earnedAt: string })[];
  locked: Badge[];
}

export function BadgeGrid({ earned, locked }: BadgeGridProps) {
  if (earned.length === 0 && locked.length === 0) {
    return (
      <div className="text-center py-8">
        <Award className="size-10 text-gray-200 mx-auto" />
        <p className="text-xs text-gray-500 mt-2">아직 배지가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {earned.length > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <h4 className="text-xs font-bold text-gray-900 mb-2">
            획득한 배지 ({earned.length})
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {earned.map((b) => (
              <motion.div
                key={b.id}
                className="flex flex-col items-center gap-1 p-2.5 bg-gradient-to-b from-amber-50 to-white rounded-xl border border-amber-100"
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-xl">{b.icon}</span>
                <span className="text-[var(--fs-caption)] font-medium text-gray-700 text-center leading-tight">
                  {b.name}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <h4 className="text-xs font-bold text-gray-900 mb-2">
            미획득 배지 ({locked.length})
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {locked.map((b) => (
              <div
                key={b.id}
                className="flex flex-col items-center gap-1 p-2.5 bg-gray-50 rounded-xl border border-gray-100 opacity-50"
              >
                <div className="relative">
                  <span className="text-xl grayscale">{b.icon}</span>
                  <Lock className="size-2.5 text-gray-400 absolute -bottom-0.5 -right-0.5" />
                </div>
                <span className="text-[var(--fs-caption)] font-medium text-gray-400 text-center leading-tight">
                  {b.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
