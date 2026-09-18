"use client";

// 개인정보처리방침의 「방문 분석 거부」 토글 — 거부 쿠키를 설정/해제한다(src/lib/analytics/consent.ts).

import { useEffect, useState } from "react";
import { hasGlobalPrivacyControl, hasOptOutCookie, setAnalyticsOptOut } from "@/lib/analytics/consent";

export function AnalyticsOptOutToggle() {
  const [ready, setReady] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [gpc, setGpc] = useState(false);

  useEffect(() => {
    setOptedOut(hasOptOutCookie());
    setGpc(hasGlobalPrivacyControl());
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-700">
      <p className="font-semibold text-gray-900">이 브라우저의 방문 분석·광고 측정 도구</p>
      <p className="mt-1 text-gray-600">
        {gpc
          ? "브라우저의 Global Privacy Control(GPC) 신호가 켜져 있어 방문 분석과 외부 광고·분석 도구가 실행되지 않습니다."
          : optedOut
            ? "거부 상태입니다. 이 브라우저에서는 방문 분석과 외부 광고·분석 도구가 실행되지 않습니다."
            : "허용 상태입니다. 아래 버튼으로 이 브라우저에서의 수집을 거부할 수 있습니다."}
      </p>
      {!gpc && (
        <button
          type="button"
          onClick={() => {
            const next = !optedOut;
            setAnalyticsOptOut(next);
            setOptedOut(next);
          }}
          className="mt-2 inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-[13px] font-semibold text-gray-800 hover:bg-gray-100"
        >
          {optedOut ? "방문 분석 다시 허용하기" : "이 브라우저에서 방문 분석 거부하기"}
        </button>
      )}
      <p className="mt-2 text-[12px] text-gray-500">설정은 이 브라우저에만 적용되며, 쿠키를 삭제하면 초기화됩니다.</p>
    </div>
  );
}
