"use client";

import { useCallback, useState } from "react";
import Script from "next/script";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSiteUrl } from "@/lib/growth/constants";
import { notifyCreditsChanged } from "@/lib/credits-client";
import { notifyNotificationsChanged } from "@/lib/growth/notifications-client";

// Minimal typed shim for the Kakao JS SDK surface we touch (keeps tsc clean).
interface KakaoShareLink {
  mobileWebUrl: string;
  webUrl: string;
}
interface KakaoSdk {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Share: {
    sendDefault: (settings: {
      objectType: "feed";
      content: {
        title: string;
        description: string;
        imageUrl: string;
        link: KakaoShareLink;
      };
      buttons?: Array<{ title: string; link: KakaoShareLink }>;
    }) => void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

const KAKAO_SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

interface KakaoShareButtonProps {
  link: string;
  className?: string;
  /** Called after a share is recorded so the parent (rewards page) can refresh
   *  the KAKAO_SHARE mission card + referral stats without a manual reload. */
  onShared?: () => void;
  /**
   * 카드 자구 오버라이드(26-09-03) — 기본값은 추천(referral) 카드다. 리포트 공유처럼
   * 학부모에게 가는 링크는 「추천 코드로 가입하면 크레딧」 문구가 나가면 안 되므로
   * 호출부가 제목·설명·버튼명을 넘긴다. 미지정 필드는 기본 카드 자구 유지.
   */
  title?: string;
  description?: string;
  buttonTitle?: string;
  /** 버튼 라벨(기본 「카카오톡 공유」) */
  label?: string;
  /** 하위 컴팩트 아이콘 크기 클래스(기본 size-4) */
  iconClassName?: string;
  /** false 면 KAKAO_SHARE 미션 보상 기록을 건너뛴다(추천 공유가 아닌 컨텍스트). 기본 true. */
  recordMission?: boolean;
}

export function KakaoShareButton({
  link,
  className,
  onShared,
  title,
  description,
  buttonTitle,
  label,
  iconClassName,
  recordMission = true,
}: KakaoShareButtonProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // One-time KAKAO_SHARE reward after sharing (either Kakao or clipboard fallback).
  const recordShare = useCallback(async () => {
    try {
      await fetch("/api/missions/share", { method: "POST" });
      // Ignore already_claimed / non-200 — sharing should never feel like a failure.
      notifyCreditsChanged();
      notifyNotificationsChanged();
      onShared?.();
    } catch {
      // silent — reward bookkeeping is best-effort
    }
  }, [onShared]);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const kakao = typeof window !== "undefined" ? window.Kakao : undefined;
      if (KAKAO_JS_KEY && kakao) {
        if (!kakao.isInitialized()) kakao.init(KAKAO_JS_KEY);
        kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: title ?? "SMOAT — AI 영어 문제 생성",
            description:
              description ?? "추천 코드로 가입하면 두 학원 모두 크레딧을 받아요",
            imageUrl: `${getSiteUrl()}/og-image.png`,
            link: { mobileWebUrl: link, webUrl: link },
          },
          buttons: [
            {
              title: buttonTitle ?? "지금 시작하기",
              link: { mobileWebUrl: link, webUrl: link },
            },
          ],
        });
      } else {
        // Graceful fallback: copy the link so the director can paste it into KakaoTalk.
        await navigator.clipboard.writeText(link);
        toast.success("링크를 복사했어요. 카카오톡에 붙여넣어 공유하세요");
      }
      if (recordMission) await recordShare();
      else onShared?.();
    } catch {
      // If even clipboard fails, surface a gentle hint rather than crashing.
      toast.error("공유에 실패했어요. 링크를 직접 복사해 주세요");
    } finally {
      setBusy(false);
    }
  }, [busy, link, recordShare, title, description, buttonTitle, recordMission, onShared]);

  return (
    <>
      {KAKAO_JS_KEY && (
        <Script
          src={KAKAO_SDK_SRC}
          strategy="afterInteractive"
          onLoad={() => setSdkReady(true)}
        />
      )}
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        aria-label={label ? `카카오톡으로 공유: ${label}` : "카카오톡으로 추천 링크 공유"}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] px-4 text-[13px] font-bold text-[#181600] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <MessageCircle
          className={cn("size-4", iconClassName)}
          strokeWidth={2.2}
          fill="currentColor"
        />
        {label ?? (KAKAO_JS_KEY && sdkReady ? "카카오톡 공유" : "카카오톡으로 공유")}
      </button>
    </>
  );
}
