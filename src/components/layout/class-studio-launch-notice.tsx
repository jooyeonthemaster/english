"use client";

// ============================================================================
// 「클래스 스튜디오」 신규 오픈 공지 (26-08-22)
//
// 로그인 첫 화면이 「문제 생성」에서 「클래스 스튜디오」로 바뀐 것을 알린다.
// 원장 레이아웃에 1회 마운트 — 브라우저당 한 번만 뜬다(class-studio-notice.ts).
//
// 문구는 **지금 켜져 있는 표면만** 말한다. 모바일 학습·학생앱 배포는 §M(26-08-22)
// 로 UI 에서 숨겨진 상태라 여기서 광고하면 없는 버튼을 찾게 만든다.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, FileText, LayoutTemplate, School, X } from "lucide-react";
import {
  classStudioNoticePending,
  markClassStudioNoticeSeen,
} from "@/lib/class-studio-notice";
import { getSpecialAccount } from "@/lib/special-accounts";
import { TOUR_OPEN_EVENT } from "@/components/studio/tour/types";

const HIGHLIGHTS = [
  { icon: FileText, label: "지문 관리", hint: "클래스별로 모아 두기" },
  { icon: LayoutTemplate, label: "학습지 조판", hint: "여러 장을 한 권으로" },
  { icon: ClipboardList, label: "시험지 조판", hint: "실전 배치 그대로" },
] as const;

/** 특별계정 환영 모달이 아직 대기 중인가(같은 순간에 두 겹으로 뜨는 것 방지). */
function specialWelcomePending(email: string): boolean {
  const account = getSpecialAccount(email);
  if (!account) return false;
  try {
    return sessionStorage.getItem(account.welcomeStorageKey) === "true";
  } catch {
    return false;
  }
}

export function ClassStudioLaunchNotice({ staffEmail }: { staffEmail: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const onStudio = pathname === "/director/studio";

  // 개방 판정은 마운트 후 한 틱 뒤 — SSR/하이드레이션 불일치를 만들지 않는다.
  // 특별계정 환영 모달이 떠 있는 동안은 대기했다가, 그 모달이 닫히면 이어서 뜬다
  // (SiteBannerHost 의 「하나 닫으면 다음이 열린다」 큐와 같은 예의).
  useEffect(() => {
    if (!classStudioNoticePending()) return;
    if (!specialWelcomePending(staffEmail)) {
      const t = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(t);
    }
    const timer = window.setInterval(() => {
      if (!specialWelcomePending(staffEmail)) {
        window.clearInterval(timer);
        setOpen(true);
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [staffEmail]);

  const close = useCallback(() => {
    markClassStudioNoticeSeen();
    setOpen(false);
  }, []);

  // 주 CTA: 스튜디오 밖이면 이동, 스튜디오 위면 투어를 직접 넘겨받는다.
  // (공지가 미열람인 동안 투어는 자동 개방을 유예한다 — class-studio-notice.ts)
  const act = useCallback(() => {
    close();
    if (onStudio) {
      window.dispatchEvent(new Event(TOUR_OPEN_EVENT));
      return;
    }
    router.push("/director/studio");
  }, [close, onStudio, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="class-studio-notice-title"
          data-class-studio-notice
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={close}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[520px] overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.42)]"
          >
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400" />
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-[18px]" />
            </button>

            <div className="px-7 pb-7 pt-9">
              <div className="flex items-center gap-3">
                <div className="flex size-[46px] items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)]">
                  <School className="size-[22px] text-blue-300" />
                </div>
                <div>
                  <p className="text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-600">
                    New · 새 기능
                  </p>
                  <h2
                    id="class-studio-notice-title"
                    className="mt-0.5 text-[21px] font-black leading-tight tracking-tight text-slate-950 break-keep"
                  >
                    「클래스 스튜디오」가 열렸습니다
                  </h2>
                </div>
              </div>

              <p className="mt-4 text-[13.5px] leading-relaxed text-slate-600 break-keep">
                클래스를 만들어 두면 그 안에서 <b className="font-bold text-slate-900">지문 →
                학습지 → 시험지</b>까지 한 화면에서 이어집니다. 매번 지문을 다시 찾아
                올릴 필요가 없습니다.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {HIGHLIGHTS.map(({ icon: Icon, label, hint }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-3"
                  >
                    <Icon className="size-4 text-blue-600" />
                    <p className="mt-2 text-[12.5px] font-bold leading-tight text-slate-900 break-keep">
                      {label}
                    </p>
                    <p className="mt-1 text-[11px] leading-tight text-slate-500 break-keep">
                      {hint}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-4 rounded-xl bg-blue-50/70 px-3.5 py-2.5 text-[12px] leading-relaxed text-slate-600 break-keep">
                로그인하면 이제 <b className="font-bold text-slate-900">클래스 스튜디오</b>가
                첫 화면입니다. 기존 「문제 생성」은 좌측 메뉴에 그대로 있습니다.
              </p>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={act}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 text-[14px] font-bold text-white transition-colors hover:bg-blue-700"
                >
                  {onStudio ? "둘러보기 시작" : "클래스 스튜디오 열기"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                >
                  나중에 보기
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
