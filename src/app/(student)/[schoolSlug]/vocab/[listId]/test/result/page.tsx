"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { TestResultSummary } from "@/components/vocab/test-result-summary";

// ---------------------------------------------------------------------------
// This page serves as a standalone result view.
// In the primary flow, results are shown inline within the test client.
// This page handles the case where a user navigates directly to /test/result
// (e.g., from history or shared link). It reads query params for display.
// ---------------------------------------------------------------------------

export default function VocabTestResultPage() {
  const router = useRouter();
  const params = useParams<{ schoolSlug: string; listId: string }>();
  const searchParams = useSearchParams();

  const score = Number(searchParams.get("score") ?? 0);
  const total = Number(searchParams.get("total") ?? 0);
  const time = Number(searchParams.get("time") ?? 0);

  const handleGoBack = () => {
    router.push(`/${params.schoolSlug}/vocab/${params.listId}`);
  };

  const handleRetryTest = () => {
    router.push(`/${params.schoolSlug}/vocab/${params.listId}/test`);
  };

  // If no valid params, redirect to test
  if (total === 0) {
    return (
      <>
        <TopBarBack
          title="테스트 결과"
          showBack
          onBack={handleGoBack}
        />
        <div className="flex flex-col items-center justify-center gap-4 px-5 py-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex flex-col items-center gap-4"
          >
            {/* Empty state icon */}
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[#F3F4F0]">
              <svg
                className="size-7 text-[#9CA396]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                />
              </svg>
            </div>

            <div className="flex flex-col items-center gap-1">
              <p className="text-[15px] font-semibold text-[#4A5043]">
                표시할 결과가 없습니다
              </p>
              <p className="text-[13px] text-[#9CA396]">
                단어 테스트를 먼저 진행해주세요
              </p>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleRetryTest}
              className="mt-2 flex h-12 items-center justify-center rounded-xl gradient-primary px-8 text-[14px] font-bold text-white shadow-glow-green"
            >
              테스트 시작하기
            </motion.button>
          </motion.div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBarBack
        title="테스트 결과"
        showBack
        onBack={handleGoBack}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <TestResultSummary
          score={score}
          total={total}
          elapsedTime={time}
          wrongItems={[]}
          onGoBack={handleGoBack}
          onRetryWrong={handleRetryTest}
        />
      </motion.div>
    </>
  );
}
