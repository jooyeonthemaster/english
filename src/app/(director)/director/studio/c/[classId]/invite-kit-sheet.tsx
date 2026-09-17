"use client";

// ============================================================================
// 클래스 스튜디오 — 학생 초대 키트 시트 (docs/class-studio-spec.md §5)
//
// 견본풍 오버레이 우측 시트(모바일 전폭) — 학생 등록 모달(z-70) 위에 자동
// 오픈되므로 z-[90]. getStudioInviteKit 로드 → 카톡 말풍선 모양 프리뷰
// (연한 노랑은 배경톤만 — 로고·상표 사용 금지) 안에 스펙 §5 안내문 템플릿을
// 치환해 표시. {접속링크} = window.location.origin + loginPath (기존 /g?ac=&sc=
// 자동 로그인 계약 — 신규 토큰 체계 발명 금지). 복사는 기존 copyText 재사용.
// KakaoShareButton 은 추천(리퍼럴) 문구·미션 보상 호출이 하드코딩돼 있어
// 초대장 용도로 재사용 불가 — 생략(주 경로는 안내문 복사 → 카톡 붙여넣기).
// ============================================================================

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import {
  getStudioInviteKit,
  type StudioInviteKit,
} from "@/actions/studio/students";
import { copyText } from "@/components/students/devices/student-code-row";

/** 안내문 템플릿 치환 — 문구는 스펙 §5 가 정본(변형 금지). */
function buildInviteMessage(kit: StudioInviteKit, link: string): string {
  return [
    `[${kit.academyName}] 모바일 학습 초대장`,
    "",
    `${kit.studentName} 학생, 반갑습니다!`,
    "아래 순서대로 접속해 주세요.",
    "",
    `1. 접속 주소: ${link}`,
    `2. 학원 코드: ${kit.academyCode}`,
    "3. 이름과 학생 코드로 로그인",
    `   · 이름: ${kit.studentName}`,
    `   · 학생 코드: ${kit.studentCode}`,
    "",
    "접속 후 [과제] 에서 오늘의 학습을 시작할 수 있습니다.",
    "휴대폰·태블릿 모두 사용할 수 있습니다.",
  ].join("\n");
}

export function InviteKitSheet({
  open,
  studentId,
  onClose,
}: {
  open: boolean;
  studentId: string | null;
  onClose: () => void;
}) {
  const [kit, setKit] = useState<StudioInviteKit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"message" | "link" | null>(null);

  useEffect(() => {
    if (!open || !studentId) return;
    setKit(null);
    setLoadError(null);
    setCopied(null);
    let cancelled = false;
    void (async () => {
      const res = await getStudioInviteKit({ studentId });
      if (cancelled) return;
      if (!res.success || !res.data) {
        setLoadError(res.error ?? "초대 정보를 불러오지 못했습니다.");
        return;
      }
      setKit(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  if (!open || !studentId) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = kit ? `${origin}${kit.loginPath}` : "";
  const message = kit ? buildInviteMessage(kit, link) : "";

  const copy = async (kind: "message" | "link") => {
    const text = kind === "message" ? message : link;
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setCopied(kind);
      toast.success("복사했습니다 — 카카오톡에 붙여넣어 보내세요");
      window.setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 1500);
    } else {
      toast.error("복사하지 못했습니다. 안내문을 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-900/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="학생 초대장"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-xl sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <MessageCircle className="h-4.5 w-4.5 text-blue-600" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">
                {kit ? `${kit.studentName} 학생 초대장` : "학생 초대장"}
              </h2>
              <p className="text-xs text-slate-400">
                복사해서 카카오톡으로 보내 주세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 본문 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!kit && !loadError && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              초대 정보를 불러오는 중입니다…
            </div>
          )}

          {loadError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
              {loadError}
            </div>
          )}

          {kit && (
            <>
              {/* 카톡 말풍선 프리뷰 — 연한 노랑은 배경톤만(로고·상표 미사용) */}
              <div className="rounded-xl bg-slate-100 p-4">
                <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-[#EFE3A0] bg-[#FFF8CC] px-4 py-3.5 shadow-sm">
                  <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-slate-800">
                    {message}
                  </p>
                </div>
              </div>

              {/* 코드 요약 */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold text-slate-400">학원 코드</p>
                  <p className="mt-0.5 select-all font-mono text-base font-bold tracking-[0.2em] text-slate-900">
                    {kit.academyCode}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold text-slate-400">학생 코드</p>
                  <p className="mt-0.5 select-all font-mono text-base font-bold tracking-[0.2em] text-slate-900">
                    {kit.studentCode}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-400 break-keep">
                접속 링크에는 두 코드가 미리 채워져 있어, 학생이 링크만 누르면
                이름 확인 후 바로 시작할 수 있습니다.
              </p>
            </>
          )}
        </div>

        {/* 푸터 — 안내문 복사(primary) · 링크만 복사(ghost) */}
        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            disabled={!kit}
            onClick={() => void copy("message")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {copied === "message" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            안내문 복사
          </button>
          <button
            type="button"
            disabled={!kit}
            onClick={() => void copy("link")}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            {copied === "link" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            링크만 복사
          </button>
        </div>
      </div>
    </div>
  );
}
