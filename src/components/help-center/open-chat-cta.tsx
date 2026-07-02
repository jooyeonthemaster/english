"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";

const OPEN_CHAT_URL = "https://open.kakao.com/o/g6H20Cwi";
// "다시는 보지 않기"를 누르면 이 키로 영구 저장 → 말풍선을 다시 띄우지 않는다.
const DISMISS_KEY = "smoat_openchat_bubble_dismissed";

/**
 * 헬프센터(피드백·문의) 상단의 오픈채팅방 입장 유도 CTA.
 * 버튼 옆에 말풍선 팝오버로 안내 문구를 띄우고, X로 이번만 닫거나
 * "다시는 보지 않기"로 영구히 숨길 수 있다(localStorage). 버튼 자체는 항상 노출.
 */
export function OpenChatCta() {
  const [showBubble, setShowBubble] = useState(false);

  // 마운트 후 localStorage 를 읽어 결정(SSR 하이드레이션 불일치·깜빡임 방지).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(DISMISS_KEY) !== "1") setShowBubble(true);
    } catch {
      setShowBubble(true);
    }
  }, []);

  function dismissForever() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 저장 실패해도 이번 세션에선 닫아준다.
    }
    setShowBubble(false);
  }

  return (
    <div className="relative flex shrink-0 items-center">
      <a
        href={OPEN_CHAT_URL}
        target="_blank"
        rel="noopener noreferrer"
        role="button"
        className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#FEE500] px-4 py-2 text-sm font-bold text-[#3C1E1E] shadow-sm transition-colors hover:bg-[#F5DC00]"
      >
        <MessageCircle className="size-4" />
        오픈채팅 입장
      </a>

      {showBubble && (
        <div className="absolute right-0 top-full z-30 mt-2 w-max max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          {/* 말풍선 꼬리 */}
          <div className="absolute -top-1.5 right-6 size-3 rotate-45 border-l border-t border-slate-200 bg-white" />
          <button
            type="button"
            onClick={() => setShowBubble(false)}
            aria-label="닫기"
            className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-3.5" />
          </button>
          <p className="pr-6 text-[11px] font-medium leading-snug text-slate-700">
            <span className="block whitespace-nowrap">사용자들이 실시간으로 소통하는</span>
            <span className="block whitespace-nowrap">SMOAT 오픈채팅방에 가입해보세요!</span>
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={dismissForever}
              className="text-[11px] font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
            >
              다시는 보지 않기
            </button>
            <a
              href={OPEN_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowBubble(false)}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#FEE500] px-2.5 text-[11px] font-bold text-[#3C1E1E] transition-colors hover:bg-[#F5DC00]"
            >
              <MessageCircle className="size-3" />
              입장하기
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
