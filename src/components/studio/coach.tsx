"use client";

// ============================================================================
// 클래스 스튜디오 — 온보딩 코치마크 (docs/class-studio-spec.md §4)
//
// 말풍선 1개 = 대상 요소의 data-coach="<step-id>" 를 찾아 뷰포트 기준 위치에
// 꼬리 달린 말풍선을 띄운다. 진행 상태는 localStorage["studio-coach-v1"]
// (완료 step-id 배열). 한 화면에 동시 1개만 — 호출부가 조건(when)으로 보장한다.
// 대상 요소가 없으면 조용히 스킵. 문구는 스펙 §4 표가 정본(변형 금지).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const STORAGE_KEY = "studio-coach-v1";

function readDone(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function markDone(id: string) {
  try {
    const next = [...new Set([...readDone(), id])];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage 불가 환경 — 세션 내 상태만으로 동작
  }
}

const ALL_STEP_IDS = [
  "create-class",
  "add-passage",
  "run-analysis",
  "pick-modules",
  "deploy",
  "invite",
] as const;

/** "다시 보지 않기" — 전 스텝 완료 처리. */
function dismissAll() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ALL_STEP_IDS]));
  } catch {
    // 무시
  }
}

interface BubblePos {
  top: number;
  left: number;
  /** 말풍선이 대상 위에 붙는지(꼬리가 아래를 향함) */
  above: boolean;
  /** 꼬리의 말풍선 내 가로 오프셋(px) */
  tailX: number;
}

const BUBBLE_WIDTH = 288;
const GAP = 10;

/**
 * 코치마크 말풍선. `stepId` 는 대상 요소의 data-coach 값과 일치해야 한다.
 * `when` 이 true 이고 아직 완료하지 않은 스텝일 때만 표시된다.
 */
export function CoachMark({
  stepId,
  text,
  when,
}: {
  stepId: (typeof ALL_STEP_IDS)[number];
  text: string;
  when: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<BubblePos | null>(null);
  const [dismissedNow, setDismissedNow] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  useEffect(() => {
    // SSR 하이드레이션 후 localStorage 판정(서버·클라 첫 렌더 불일치 방지)
    setVisible(when && !dismissedNow && !readDone().includes(stepId));
  }, [when, stepId, dismissedNow]);

  // 온보딩 투어(E26) 활성 중 억제 — 투어 딤(z-[100]) 아래에서 말풍선이
  // 회색으로 비쳐 보이는 겹침 방지. body 계약 속성을 관찰한다.
  // 초기 동기화는 태스크로 미룬다(effect 내 동기 setState 금지 규칙 준수 —
  // 투어가 이미 켜진 채 마운트되는 경우는 한 프레임 늦게 숨어도 무해하다).
  useEffect(() => {
    const sync = () =>
      setTourActive(document.body.dataset.studioTourActive === "1");
    const t = window.setTimeout(sync, 0);
    const mo = new MutationObserver(sync);
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-studio-tour-active"],
    });
    return () => {
      window.clearTimeout(t);
      mo.disconnect();
    };
  }, []);

  const measure = useCallback(() => {
    const target = document.querySelector<HTMLElement>(`[data-coach="${stepId}"]`);
    if (!target) {
      setPos(null);
      return;
    }
    const r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setPos(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 앵커가 뷰포트 밖으로 완전히 벗어나면(스크롤) 말풍선을 숨긴다 — 허공 표시 방지.
    if (r.bottom < 0 || r.top > vh) {
      setPos(null);
      return;
    }
    const centerX = r.left + r.width / 2;
    const left = Math.min(Math.max(8, centerX - BUBBLE_WIDTH / 2), Math.max(8, vw - BUBBLE_WIDTH - 8));
    // 기본은 대상 아래. 아래 공간이 부족하거나 앵커가 큰 경우(그리드 등) 위로 붙인다.
    const roomBelow = vh - r.bottom;
    const above = (roomBelow < 160 && r.top > 180) || r.height > vh * 0.5;
    // 앵커 위/아래 가장자리 기준 위치를 뷰포트 안으로 클램프.
    const anchorTop = above ? Math.max(8, r.top) : Math.min(vh - 8, r.bottom);
    setPos({
      top: above ? anchorTop - GAP : anchorTop + GAP,
      left,
      above,
      tailX: Math.min(Math.max(16, centerX - left), BUBBLE_WIDTH - 16),
    });
  }, [stepId]);

  useEffect(() => {
    if (!visible) return;
    measure();
    // 레이아웃 안정화 뒤 1회 재측정(폰트·이미지 로드)
    const t = window.setTimeout(measure, 300);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [visible, measure]);

  if (!visible || !pos || tourActive) return null;

  return createPortal(
    <div
      role="status"
      className="fixed z-[80] w-72 rounded-xl border border-blue-200 bg-white shadow-lg shadow-blue-100/60"
      style={{
        top: pos.top,
        left: pos.left,
        transform: pos.above ? "translateY(-100%)" : undefined,
      }}
    >
      {/* 꼬리 */}
      <div
        className={`absolute h-3 w-3 rotate-45 border-blue-200 bg-white ${
          pos.above ? "-bottom-1.5 border-b border-r" : "-top-1.5 border-l border-t"
        }`}
        style={{ left: pos.tailX - 6 }}
      />
      <div className="flex items-start gap-2 p-3.5">
        <p className="flex-1 text-[13px] leading-relaxed text-slate-700 break-keep">{text}</p>
        <button
          type="button"
          aria-label="닫기"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-300 hover:text-slate-500"
          onClick={() => {
            markDone(stepId);
            setDismissedNow(true);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-3.5 py-2">
        <button
          type="button"
          className="text-[11px] text-slate-400 hover:text-slate-600"
          onClick={() => {
            dismissAll();
            setDismissedNow(true);
          }}
        >
          다시 보지 않기
        </button>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
          onClick={() => {
            markDone(stepId);
            setDismissedNow(true);
          }}
        >
          확인했습니다
        </button>
      </div>
    </div>,
    document.body,
  );
}
