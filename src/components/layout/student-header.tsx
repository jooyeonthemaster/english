"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";

// ---------------------------------------------------------------------------
// 섹션별 타이틀
// ---------------------------------------------------------------------------
const SECTION_TITLES: Record<string, string> = {
  "/student/attendance": "출석",
  "/student/learn": "학습",
  "/student/resources": "자료실",
  "/student/mypage": "마이페이지",
  "/student/notifications": "알림",
  "/student/review": "오답 복습",
  "/student/vocab": "단어장",
  "/student/mypage/settings": "설정",
  "/student/mypage/progress": "학습 추이",
  "/student/learn/ranking": "랭킹",
  "/student/learn/analytics": "학습 분석",
};

function getPageTitle(pathname: string): string | null {
  if (SECTION_TITLES[pathname]) return SECTION_TITLES[pathname];
  if (/^\/student\/learn\/[^/]+\/session/.test(pathname)) return "학습 세션";
  if (/^\/student\/learn\/[^/]+\/stories/.test(pathname)) return "스토리";
  if (/^\/student\/learn\/[^/]+$/.test(pathname)) return "지문 학습";
  if (/^\/student\/vocab\/[^/]+/.test(pathname)) return "단어 시험";
  if (pathname === "/student") return null;
  return null;
}

// ---------------------------------------------------------------------------
// 전광판 멘트
// ---------------------------------------------------------------------------
const MARQUEE_MESSAGES = [
  "오늘도 한 걸음 더! 꾸준함이 실력이 됩니다 💪",
  "🔥 30일 연속 학습 달성하면 문화상품권 1만원!",
  "상위 1%는 매일 학습합니다. 오늘도 시작해볼까요?",
  "단어 10개만 외우면 하루 미션 완료! ✨",
  "어제보다 1문제 더! 작은 차이가 큰 변화를 만듭니다",
  "🏆 이번 주 랭킹 도전! XP를 모아보세요",
  "틀린 문제 복습하면 정답률 2배 UP! 📈",
  "매일 3분 투자로 영어 실력이 달라집니다",
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface StudentHeaderProps {
  studentName?: string;
  schoolName?: string;
  grade?: number;
  academyName?: string;
  streak?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudentHeader({
  studentName = "",
  schoolName = "",
  grade,
  academyName = "",
}: StudentHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isHomePage = pathname === "/student";
  const pageTitle = getPageTitle(pathname);
  const gradeLabel = grade ? `${grade}학년` : "";

  const marqueeChunk = MARQUEE_MESSAGES.join("   ✦   ");

  // ── 홈 화면: 2줄 헤더 ──
  if (isHomePage) {
    return (
      <header className="w-full bg-[#F5F5F5]">
        {/* 1줄: 로고 — 학원명 — 알림 */}
        <div className="flex items-center justify-between px-5 h-12">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="text-[10px] font-black text-white">N</span>
            </div>
            <span className="text-sm font-extrabold text-gray-900 tracking-tight">
              {academyName || "NARA"}
            </span>
          </div>

          <button
            onClick={() => router.push("/student/notifications")}
            className="relative p-2 rounded-2xl active:bg-black/5 transition-colors"
            aria-label="알림"
          >
            <Bell className="w-5 h-5 text-gray-500" strokeWidth={2} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#F5F5F5]" />
          </button>
        </div>

        {/* 2줄: 학생 버블 + 전광판 */}
        <div className="flex items-center gap-3 px-5 pb-3">
          {/* 학생 정보 버블 */}
          <button
            onClick={() => router.push("/student/mypage")}
            className="shrink-0 flex flex-col items-center px-4 py-2 rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] active:scale-95 transition-transform"
          >
            <span className="text-xs font-bold text-gray-800 leading-tight">
              {studentName || "학생"}
            </span>
            {(schoolName || gradeLabel) && (
              <span className="text-[10px] text-gray-400 leading-tight mt-0.5">
                {[schoolName, gradeLabel].filter(Boolean).join(" · ")}
              </span>
            )}
          </button>

          {/* 전광판 — 무한 루프 */}
          <div className="flex-1 overflow-hidden rounded-2xl bg-white/60 py-2.5 min-w-0">
            <div className="flex whitespace-nowrap" style={{ animation: "marquee-loop 6s linear infinite" }}>
              <span className="text-xs font-medium text-gray-500 shrink-0 px-2">{marqueeChunk}</span>
              <span className="text-xs font-medium text-gray-500 shrink-0 px-2">{marqueeChunk}</span>
            </div>
          </div>
        </div>
      </header>
    );
  }

  // ── 서브 페이지 ──
  return (
    <header className="w-full bg-[#F5F5F5]">
      <div className="relative flex h-14 items-center px-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-0.5 p-2 rounded-2xl active:bg-black/5 transition-colors shrink-0"
          aria-label="뒤로 가기"
        >
          <ArrowLeft className="w-5 h-5 text-gray-900" strokeWidth={2.5} />
        </button>
        {pageTitle && (
          <span className="text-sm font-bold text-gray-900 ml-0.5">
            {pageTitle}
          </span>
        )}

        {studentName && (
          <button
            onClick={() => router.push("/student/mypage")}
            className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center px-4 py-1.5 rounded-full bg-white shadow-[0_1px_8px_rgba(0,0,0,0.08)] active:scale-95 transition-transform"
          >
            <span className="text-xs font-bold text-gray-800 leading-tight">
              {studentName}
            </span>
            {(schoolName || gradeLabel) && (
              <span className="text-[10px] text-gray-400 leading-tight">
                {[schoolName, gradeLabel].filter(Boolean).join(" · ")}
              </span>
            )}
          </button>
        )}

        <div className="ml-auto">
          <button
            onClick={() => router.push("/student/notifications")}
            className="relative p-2 rounded-2xl active:bg-black/5 transition-colors"
            aria-label="알림"
          >
            <Bell className="w-5 h-5 text-gray-600" strokeWidth={2} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#F5F5F5]" />
          </button>
        </div>
      </div>
    </header>
  );
}
