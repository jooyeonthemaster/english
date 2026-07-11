"use client";

// ============================================================================
// 학생 앱 로그인 링크 공유 — 링크 복사 + 카카오톡 공유
//
// 링크는 /g?ac={학원코드}&sc={학생코드} — 학생 앱 로그인 화면이 두 코드를
// 프리필하고 자동 로그인한다(원탭 온보딩). 코드가 곧 자격증명인 제품 설계라
// 링크에 코드가 실리는 것은 의도된 동작(강사가 문자/카톡으로 전달하는 흐름).
// 카카오 SDK 패턴은 growth/kakao-share-button 정본 미러(키 없으면 복사 폴백).
// ============================================================================

import { useCallback, useState } from "react";
import Script from "next/script";
import { Check, Link2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { copyText } from "./student-code-row";

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

/** 학생 앱 자동 로그인 링크 — login-client 의 ac/sc 프리필 계약과 한 쌍 */
export function buildStudentAppLoginUrl(academyCode: string, studentCode: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://www.smoat.co.kr";
  const params = new URLSearchParams({ ac: academyCode, sc: studentCode });
  return `${origin}/g?${params.toString()}`;
}

export function StudentAppShareRow({
  academyCode,
  studentCode,
  studentName,
}: {
  academyCode: string;
  studentCode: string;
  studentName: string;
}) {
  const [copied, setCopied] = useState(false);
  const link = buildStudentAppLoginUrl(academyCode, studentCode);

  const copyLink = useCallback(async () => {
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      toast.success("학생 앱 로그인 링크를 복사했습니다.");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("복사하지 못했습니다. 링크를 직접 선택해 주세요.");
    }
  }, [link]);

  const shareKakao = useCallback(async () => {
    try {
      const kakao = typeof window !== "undefined" ? window.Kakao : undefined;
      if (KAKAO_JS_KEY && kakao) {
        if (!kakao.isInitialized()) kakao.init(KAKAO_JS_KEY);
        kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: `${studentName} 학생 학습 앱 초대`,
            description:
              "링크를 누르면 로그인 없이 바로 학습을 시작합니다. 과제·시험·어법 훈련이 이 앱으로 옵니다.",
            imageUrl: `${window.location.origin}/og-image.png`,
            link: { mobileWebUrl: link, webUrl: link },
          },
          buttons: [{ title: "학습 시작하기", link: { mobileWebUrl: link, webUrl: link } }],
        });
      } else {
        // 카카오 키 미설정/SDK 미로드 폴백 — 링크 복사로 대신한다.
        await copyLink();
        toast.info("카카오톡을 열 수 없어 링크를 복사했습니다. 채팅에 붙여넣어 주세요.");
      }
    } catch {
      toast.error("공유하지 못했습니다. 링크 복사를 이용해 주세요.");
    }
  }, [copyLink, link, studentName]);

  return (
    <div className="rounded-xl border border-slate-200 p-3.5">
      {KAKAO_JS_KEY ? <Script src={KAKAO_SDK_SRC} strategy="afterInteractive" /> : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-400">학생 앱 로그인 링크</p>
        <span className="text-[10.5px] text-slate-300">누르면 코드 입력 없이 자동 로그인</span>
      </div>
      <p
        title={link}
        className="mt-1 select-all truncate font-mono text-[12px] text-slate-600"
      >
        {link.replace(/^https?:\/\//, "")}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-[12px] font-bold text-slate-600 transition hover:bg-slate-50"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-600" aria-hidden />
          ) : (
            <Link2 className="size-3.5" aria-hidden />
          )}
          링크 복사
        </button>
        <button
          type="button"
          onClick={shareKakao}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#FEE500] text-[12px] font-bold text-[#181600] transition hover:brightness-95"
        >
          <MessageCircle className="size-3.5" strokeWidth={2.2} fill="currentColor" aria-hidden />
          카카오톡 공유
        </button>
      </div>
    </div>
  );
}
