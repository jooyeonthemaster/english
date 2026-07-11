"use client";

// ============================================================================
// AI 심층분석 보강 버튼 (V4 소유) — POST /api/exams/[examId]/analysis-boost (W6)
//
// 비용 = 살아있는 문항 수 × EXAM_ANALYSIS_BOOST(1cr) — 라벨에 상시 고지하고,
// 실행 전 confirm 다이얼로그에서 비용·효과를 재고지한다(계약 §V4-a).
// 라우트 응답 계약: { ok, boostedCount, failedNumbers, chargedCredits } /
// 409 ALREADY_RUNNING / 402 크레딧 부족 / 502 전량실패(전액 환불).
// maxDuration 300s — 진행 중 버튼 잠금 + 스피너.
// ============================================================================

import { useState } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CREDIT_COSTS } from "@/lib/credit-costs";

interface BoostResponseBody {
  ok?: boolean;
  boostedCount?: number;
  failedNumbers?: string[];
  chargedCredits?: number;
  error?: string;
  code?: string;
  balance?: number;
  required?: number;
}

interface AnalysisBoostButtonProps {
  examId: string;
  /** 시험지 문항 수 — 비용 고지용(청구 정본은 서버의 살아있는 문항 수) */
  questionCount: number;
}

export function AnalysisBoostButton({ examId, questionCount }: AnalysisBoostButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const totalCost = questionCount * CREDIT_COSTS.EXAM_ANALYSIS_BOOST;

  async function runBoost() {
    setRunning(true);
    try {
      const res = await fetch(`/api/exams/${examId}/analysis-boost`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as BoostResponseBody | null;

      if (res.status === 409) {
        toast.info("이미 진행 중입니다.");
        return;
      }
      if (res.status === 402) {
        toast.error(
          body?.balance != null && body?.required != null
            ? `크레딧이 부족합니다. (보유 ${body.balance} / 필요 ${body.required})`
            : "크레딧이 부족합니다.",
        );
        return;
      }
      if (!res.ok || !body?.ok) {
        toast.error(
          body?.error ?? "AI 심층분석 보강에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const failed = Array.isArray(body.failedNumbers) ? body.failedNumbers : [];
      const boosted = body.boostedCount ?? 0;
      if (failed.length > 0) {
        toast.info(
          `${boosted}문항 보강이 완료되었습니다. ${failed.length}문항은 실패해 환불되었습니다. (${failed.join(", ")}번)`,
        );
      } else {
        toast.success(
          body.chargedCredits != null
            ? `${boosted}문항 보강이 완료되었습니다. (${body.chargedCredits}크레딧 차감)`
            : `${boosted}문항 보강이 완료되었습니다.`,
        );
      }
    } catch {
      toast.error("네트워크 문제로 보강 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={running || questionCount === 0}
        onClick={() => setConfirmOpen(true)}
        className="h-11 border-[#E5E8EB] px-4 text-[#4E5968]"
      >
        {running ? (
          <Loader2 className="size-4 animate-spin text-[#3182F6]" />
        ) : (
          <ScanSearch className="size-4 text-[#3182F6]" />
        )}
        {running ? "보강 진행 중…" : `AI 심층분석 보강 · ${totalCost}cr`}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AI 심층분석 보강</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-[#4E5968]">
                <p>
                  문항 {questionCount}개를 AI 로 심층 분석하며{" "}
                  <span className="font-semibold text-[#191F28]">
                    {totalCost}크레딧
                  </span>
                  이 차감됩니다.
                </p>
                <p>리포트의 함정 분석과 개념 지도가 정밀해집니다.</p>
                <p className="text-xs text-[#8B95A1]">
                  분석에는 최대 수 분이 걸릴 수 있습니다. 실패한 문항의 크레딧은
                  자동으로 환불됩니다.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">취소</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-[#3182F6] text-white hover:bg-[#1B64DA]"
              onClick={() => {
                setConfirmOpen(false);
                void runBoost();
              }}
            >
              {totalCost}크레딧 차감하고 보강하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
