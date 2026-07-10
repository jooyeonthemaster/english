"use client";

import { useState, type ReactNode } from "react";

type TabKey = "landing" | "app";

/** 배너 관리 상단 세그먼트 탭. 랜딩페이지 배너와 앱(로그인) 배너를 구분해 보여준다.
 *  서버에서 렌더된 카드 요소를 slot으로 받아 탭에 따라 노출한다. */
export function BannersTabs({
  landing,
  app,
}: {
  landing: ReactNode;
  app: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("landing");

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="보기"
        className="inline-flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "landing"}
          onClick={() => setTab("landing")}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
            tab === "landing"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          랜딩페이지
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "app"}
          onClick={() => setTab("app")}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
            tab === "app"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          앱
        </button>
      </div>

      <div className={tab === "landing" ? "space-y-5" : "hidden"}>{landing}</div>
      <div className={tab === "app" ? "space-y-5" : "hidden"}>{app}</div>
    </div>
  );
}
