"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionResult } from "@/lib/learning-types";

interface ResultScreenProps {
  result: SessionResult;
  passageId: string;
}

export default function ResultScreen({ result, passageId }: ResultScreenProps) {
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center mb-6",
            result.score >= 80 ? "bg-emerald-100" : result.score >= 50 ? "bg-blue-100" : "bg-amber-100"
          )}
        >
          <Sparkles
            className={cn(
              "size-10",
              result.score >= 80
                ? "text-emerald-500"
                : result.score >= 50
                  ? "text-blue-500"
                  : "text-amber-500"
            )}
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold text-gray-900 mb-2"
        >
          {result.score >= 80 ? "훌륭해요!" : result.score >= 50 ? "잘했어요!" : "괜찮아요!"}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-6 mb-6"
        >
          <div>
            <p className="text-3xl font-bold text-gray-900">{result.score}%</p>
            <p className="text-xs text-gray-500">정답률</p>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <p className="text-3xl font-bold text-blue-500">+{result.xpEarned}</p>
            <p className="text-xs text-gray-500">
              XP {result.xpMultiplier > 1 ? `(x${result.xpMultiplier})` : ""}
            </p>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-sm text-gray-500 mb-8"
        >
          {result.correctCount}/{result.totalCount} 문제 정답
        </motion.p>

        {/* Wrong questions summary */}
        {result.wrongQuestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full text-left mb-6"
          >
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
              틀린 문제 ({result.wrongQuestions.length}개)
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {result.wrongQuestions.map((wq) => (
                <div
                  key={wq.questionId}
                  className="bg-rose-50 rounded-xl p-3 text-xs"
                >
                  <p className="text-gray-700 mb-1 line-clamp-2">{wq.questionText}</p>
                  <p className="text-rose-600">
                    정답: <span className="font-medium">{wq.correctAnswer}</span>
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="px-5 pb-8 space-y-2.5">
        <button
          onClick={() => router.push(`/student/learn/${passageId}`)}
          className="w-full py-3.5 rounded-xl bg-blue-500 text-white font-bold text-sm active:bg-blue-600"
        >
          레슨으로 돌아가기
        </button>
        <button
          onClick={() => router.push("/student/learn")}
          className="w-full py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm active:bg-gray-200"
        >
          학습 홈
        </button>
      </div>
    </div>
  );
}
