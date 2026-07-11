// ============================================================================
// 공유 QR 자기등록 랜딩 — /t/e/[enrollToken] (무인증 · force-dynamic · noindex)
//
// 종이 OMR/태블릿 배포용 공유 QR 1개로 30명이 스캔 → 반 로스터에서 본인 이름
// 검색·선택 + 학생 코드 확인 → ExamSubmission 자기등록 → /t/[accessToken] 응시.
// (설계문서 §6.9 Wave-3 E2 — 개별 링크 모델과 공존하는 additive 표면.)
//
// 이 서버 페이지는 시험 존재/공개 여부만 판정한다: enrollToken 으로 exam 조회
// → (없음 | enrollEnabled=false | KOREAN) 이면 "닫힌 링크" 안내(존재 은닉),
// 유효하면 EnrollClient 에 **시험명만** 내려보낸다. 정답·문항 데이터는 이 트리
// 어디로도 전송되지 않는다(§6-1). 전역 크롬 격리는 /t 트리를 그대로 승계한다.
// 신규 표면 전체가 FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT 게이트(§5).
// ============================================================================

import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import { EnrollClient } from "./enroll-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  // 시험명·학생명은 정적 메타에 절대 싣지 않는다(조회 자체가 불필요).
  return {
    title: "시험 응시 등록 | SMOAT",
    description: "본인을 확인하고 시험에 응시하는 페이지입니다.",
    robots: { index: false, follow: false },
  };
}

export default async function EnrollLandingPage({
  params,
}: {
  params: Promise<{ enrollToken: string }>;
}) {
  const { enrollToken } = await params;

  // 기능 플래그 off — 존재를 구분하지 않고 닫힌 링크 화면으로(레거시 무영향).
  if (!FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT) return <ClosedNotice />;
  if (!isValidShareToken(enrollToken)) return <ClosedNotice />;

  // enrollToken 은 Exam @unique — 공개면이므로 시험명 외 어떤 필드도 읽지 않는다.
  const exam = await prisma.exam.findUnique({
    where: { enrollToken },
    select: { title: true, enrollEnabled: true, subject: true },
  });

  // 미존재 · 등록 미개방 · KOREAN(자기등록 차단, §6-7) — 전부 동일하게 은닉 안내.
  if (!exam || !exam.enrollEnabled || exam.subject === "KOREAN") {
    return <ClosedNotice />;
  }

  return (
    <EnrollClient
      enrollToken={enrollToken}
      examTitle={exam.title?.trim() || "시험"}
    />
  );
}

// ── 서버 안내 화면(무상태) ────────────────────────────────────────────────────

function ClosedNotice() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Link2Off className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">
          닫혔거나 잘못된 시험 링크입니다
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          이 응시 등록 링크는 더 이상 유효하지 않습니다. 시험지의 QR을 다시
          확인하거나 선생님께 문의해 주세요.
        </p>
        <p className="mt-6 text-[11px] text-slate-400">SMOAT 시험 응시</p>
      </div>
    </div>
  );
}
