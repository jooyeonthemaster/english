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
        // 모바일(base): 헤더가 세로로 쌓여 버튼이 왼쪽에 오므로 말풍선을 왼쪽
        // 기준(left-0)으로 열어 화면 밖으로 나가지 않게 한다. 데스크톱(sm:)은
        // 버튼이 오른쪽이라 기존처럼 오른쪽 기준(right-0)으로 되돌린다.
        // 폭은 고정(w-72) — 모바일 안전레이어가 작은 글자를 키워도 안 눌리게.
        // 폭은 인라인 style 로 지정 — 모바일 안전레이어의 `[class*="w-["]
        // { max-width:100% }`(언레이어드, Tailwind 유틸보다 우선) 규칙이 w-/max-w-
        // arbitrary 클래스를 좁은 부모폭으로 눌러 버려, 클래스명에 `w-[`가 없도록
        // 하고 인라인 style(규칙보다 우선)로 폭을 확정한다.
        <div
          style={{ width: "16rem", maxWidth: "calc(100vw - 1.5rem)" }}
          className="absolute left-0 top-full z-30 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:left-auto sm:right-0"
        >
          {/* 말풍선 꼬리 — 버튼을 가리키게 모바일은 왼쪽, 데스크톱은 오른쪽. */}
          <div className="absolute -top-1.5 left-6 size-3 rotate-45 border-l border-t border-slate-200 bg-white sm:left-auto sm:right-6" />
          <button
            type="button"
            onClick={() => setShowBubble(false)}
            aria-label="닫기"
            className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-3.5" />
          </button>
          <p className="pr-6 text-[11px] font-medium leading-snug text-slate-700">
            사용자들이 실시간으로 소통하는 SMOAT 오픈채팅방에 가입해보세요!
          </p>
          {/* 입장하기(주 CTA)를 위, '다시는 보지 않기'를 아래로 세로 배치 —
              좁은 폭에서도 버튼이 삐져나오지 않는다. */}
          <div className="mt-3 flex flex-col gap-2">
            <a
              href={OPEN_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowBubble(false)}
              className="inline-flex h-8 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md bg-[#FEE500] text-[11px] font-bold text-[#3C1E1E] transition-colors hover:bg-[#F5DC00]"
            >
              <MessageCircle className="size-3" />
              입장하기
            </a>
            <button
              type="button"
              onClick={dismissForever}
              className="self-center whitespace-nowrap text-[11px] font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
            >
              다시는 보지 않기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
