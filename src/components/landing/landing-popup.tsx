"use client";

import { useEffect, useMemo, useState } from "react";
import type { LandingPopupItem } from "@/lib/platform-settings";
import { LandingPopupCardView } from "./landing-popup-view";

const STORAGE_KEY = "smoat:landing-popup";

function contentHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

function versionOf(p: LandingPopupItem): string {
  return contentHash(`${p.title}|${p.text}|${p.imageUrl}|${p.href}`);
}

type DismissMap = Record<string, { v: string; until: string }>;

function readDismissed(): DismissMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as DismissMap;
    }
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * 랜딩 진입 팝업 배너 — 우선순위 큐. 배열 순서대로 하나씩 노출하고,
 * 닫으면 다음 팝업이 열린다. "오늘 하루 보지 않기"는 팝업 id별로 localStorage에 저장하며,
 * 내용이 바뀌면(해시 변경) 다시 노출된다.
 */
export function LandingPopup({ popups }: { popups: LandingPopupItem[] }) {
  // 안정된 순서 + 버전 매핑.
  const versions = useMemo(() => popups.map(versionOf), [popups]);
  const [idx, setIdx] = useState<number>(-1);

  // 오늘 안 보기로 접힌 항목을 건너뛰고 다음으로 보여줄 인덱스를 찾는다.
  function nextIndex(from: number): number {
    const dismissed = readDismissed();
    const today = new Date().toISOString().slice(0, 10);
    for (let i = from + 1; i < popups.length; i++) {
      const d = dismissed[popups[i].id];
      if (d && d.v === versions[i] && d.until >= today) continue;
      return i;
    }
    return -1;
  }

  useEffect(() => {
    setIdx(nextIndex(-1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popups]);

  if (idx < 0 || idx >= popups.length) return null;

  const popup = popups[idx];
  const close = () => setIdx(nextIndex(idx));
  const dismissToday = () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const dismissed = readDismissed();
      dismissed[popup.id] = { v: versions[idx], until: today };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
    } catch {
      /* ignore */
    }
    setIdx(nextIndex(idx));
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 px-4 py-6 backdrop-blur-[3px]"
      onClick={close}
    >
      <div className="w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <LandingPopupCardView
          popup={popup}
          interactive
          onDismissToday={dismissToday}
          onClose={close}
        />
      </div>
    </div>
  );
}
