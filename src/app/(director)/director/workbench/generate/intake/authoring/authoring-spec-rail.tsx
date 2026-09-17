"use client";

// ============================================================================
// 설계 레일 — 조판대(Composing Desk)의 오른쪽 상주 컬럼. 폭을 드래그로 조절하고
// 그 값을 기억한다.
//
// 왜 본문에서 빼냈나:
//   학년·어휘·분량·편수는 "한 번 정해 두고 계속 쓰는" 값이다. 그런데 이전
//   설계는 이걸 입력 흐름 한가운데에 아코디언으로 끼워, 매번 접었다 폈다 하며
//   본문을 위아래로 밀어냈다. 설정은 옆에 상주하는 게 맞다.
//
// 이번 개편에서 바뀐 것(되돌리지 말 것)
//  · 폭 312/268/460 → **320/280/420**. 4px 그리드로 재정렬한 값이다. 예전 값이
//    저장돼 있어도 clampW 가 새 범위로 접어 넣으므로 마이그레이션이 필요 없다.
//  · 레일 머리 53px 2줄(아이콘 그릇 + 제목 + 부제) → **컬럼 헤더 h-9 1줄**.
//    좌측 발주 컬럼의 헤더와 **같은 기하학**(h-9 · px-4 · border-b hairline)이라
//    두 헤더가 이어져 화면을 가로지르는 선 하나를 만든다 — 이번 리디자인에서
//    "정렬이 하나도 안 맞다"를 고치는 단일 장치가 이 선이다. 부제("한 번 정해
//    두면 계속 쓰여요")는 그 자리를 현재 요약(고2 · 165단어 · 3편)에 내줬다.
//    설정 화면에서 필요한 것은 소개문이 아니라 "지금 뭐로 돼 있나"이기 때문이다.
//  · 핸들 12px → **16px**, 히트박스 40px(after 로 좌우 12px 씩 확장). 12px 짜리
//    표적은 WCAG 타깃 크기·터치 양쪽 미달이었다.
//  · 핸들의 **세로쓰기 '설정' 텍스트 삭제**. 12px 폭 안에 10.5px 한글을 세워
//    좌우 여백이 0.75px 이었다 — 글자로 읽히지 않으면서 폰트 종류만 하나 늘렸다.
//    지금은 GripVertical(size-3.5) 하나뿐이고, hover 시 색이 진해진다.
//
// 드래그 규약은 자료추출 화면(text-input-board 의 누적 패널)과 동일하게 맞춘다 —
// 같은 워크벤치 안에서 손에 익은 동작이 서로 달라지면 안 된다:
//   · 세로 그립 바를 왼쪽으로 끌면 패널이 넓어진다
//   · pointer 캡처 대신 window 리스너 + body cursor/user-select 잠금
//   · 놓는 순간 localStorage 에 저장
//
// 회귀 방지 계약
//  · **이 레일은 어떤 폭에서도 사라지지 않는다.** 숨김 조건(브레이크포인트,
//    접기 토글, 오버레이 대체)을 다시 만들지 말 것 — 사용자가 명시적으로
//    "계속 펼쳐져 있을 것"을 요구했다. 좁은 폭에서는 보드가 세로로 쌓아
//    발주 밴드 **아래**로 내려보낼 뿐, 사라지지도 접히지도 덮지도 않는다.
//  · 폭 조절 중에 화면의 다른 부분을 덮거나 비활성화하지 않는다(오버레이 금지).
//  · 레일은 자체 스크롤을 정확히 하나만 갖는다.
//  · body 에 걸어 둔 cursor/user-select 는 **무슨 일이 있어도** 원상복구된다.
//    pointerup 이 안 오는 경로(OS 포인터 그랩·alt-tab·컨텍스트 메뉴·언마운트)가
//    실재하고, 새면 앱 전체가 col-resize 커서 + 글자선택 불가 상태로 굳는다.
//  · 폭은 px 이지만 상한은 컨테이너 대비로 한 번 더 조인다(max-w-[38cqi]) —
//    px 만으로는 좁은 호스트에서 레일이 입력 컬럼을 잡아먹는다.
// ============================================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";

import { Kicker } from "./authoring-primitives";
import { DESK, FOCUS_RING, HAIRLINE } from "./authoring-tokens";

const WIDTH_KEY = "smoat:authoring:spec-width";
// 4px 그리드. 하한 280 은 설정 줄의 라벨(62px)+값이 잘리지 않는 실측 하한이고,
// 상한 420 은 1180px 호스트에서 좌측 발주 컬럼에 700px 이상을 남기는 값이다.
const MIN_W = 280;
const MAX_W = 420;
const DEFAULT_W = 320;
// 키보드로 조절할 때의 한 걸음 — shift 를 누르면 성큼(드래그와 같은 체감 속도).
const STEP = 8;
const STEP_FAST = 32;

const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_W;
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    // 구 범위(268~460)로 저장된 값도 여기서 새 범위로 접힌다 — 별도 마이그레이션
    // 없이 다음 드래그 때 새 값이 덮인다.
    return Number.isNaN(n) ? DEFAULT_W : clampW(n);
  } catch {
    return DEFAULT_W;
  }
}

function storeWidth(w: number) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(w));
  } catch {
    /* 저장 실패는 다음 세션 기본폭으로 돌아갈 뿐 — 무해하게 넘긴다. */
  }
}

export interface AuthoringSpecRailProps {
  /**
   * 컬럼 헤더 우측 한 줄 요약("고2 · 165단어 · 3편"). 보드가
   * describeSpecSummary(spec, count)(authoring-spec-panel.tsx)로 만들어 넘긴다 —
   * 레일은 설정 값을 모르고(children 만 받는다), 그 계산을 여기서 다시 하면
   * 같은 문장이 두 곳에 살게 된다.
   */
  summary?: string;
  children: ReactNode;
}

/**
 * 지문 설정 레일 — **항상 펼쳐져 있고, 항상 좌우로 끌 수 있다.**
 *
 * 접히는 변형(좁은 화면에서 버튼 + 오버레이로 대체)이 한때 있었으나 삭제했다.
 * 폭 임계값 아래에서는 레일이 통째로 사라지고 "고2 · 150단어 · 1편" 요약 버튼만
 * 남았는데, 그건 사용자가 요구한 것(설정이 오른쪽에 펼쳐져 있을 것)의 정반대였다.
 * 게다가 오버레이는 뒷배경을 어둡게 덮어 나머지 화면을 못 쓰게 만들었다.
 * → 지금은 사라지는 조건도, 덮는 오버레이도 없다.
 */
export function AuthoringSpecRail({ summary, children }: AuthoringSpecRailProps) {
  const [width, setWidth] = useState<number>(readStoredWidth);
  // 드래그가 이미 돌고 있는지. 두 번째 pointerdown 이 경쟁 핸들러를 하나 더 달면
  // 먼저 끝난 쪽이 body 스타일을 복구해 버려 나머지 하나가 영영 남는다.
  const activeRef = useRef(false);
  // 드래그 고속 경로의 대상 — 폭(--rail-w)을 소유한 aside. 드래그 중에는 이
  // 요소의 CSS 변수에 직접 쓰고, 놓을 때 한 번만 setWidth 로 커밋한다.
  const railRef = useRef<HTMLElement | null>(null);

  const beginResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (activeRef.current) return;
      event.preventDefault();
      activeRef.current = true;
      const startX = event.clientX;
      const startW = width;
      // 남의 인라인 스타일을 지우지 않는다 — 빈 문자열로 밀면 이 화면 밖에서
      // 걸어 둔 커서·선택 잠금이 조용히 사라진다. 원래 값을 돌려준다.
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단 — 폭이 프레임마다 바뀌면 커서 아래
      // 요소가 계속 바뀐다(아래 포인터 캡처 덕에 move 수신은 유지).
      document.body.style.pointerEvents = "none";

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 이벤트가 끊기지 않는다.
      const handleEl = event.currentTarget as HTMLElement;
      try {
        handleEl.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      // 드래그 고속 경로 — 매 pointermove 의 setState 는 레일 껍데기+헤더를
      // 프레임마다 리렌더시킨다. 드래그 중에는 aside 의 --rail-w 변수에 rAF
      // 코얼레싱으로 직접 쓰고(렌더의 style 형식과 동일 → max-w-[38cqi] 상한
      // 계약 그대로), 놓을 때 한 번만 커밋한다. 레일 요소를 못 찾으면 종전
      // setState 경로로 폴백(무회귀).
      const railEl = railRef.current;
      let latest = startW;
      let rafId: number | null = null;
      const flush = () => {
        // 다음 무브가 새 프레임을 잡을 수 있게 먼저 해제한다.
        rafId = null;
        if (!railEl) return;
        railEl.style.setProperty("--rail-w", `${latest}px`);
        // 접근성 — 드래그 중에도 separator 의 현재값이 실제 폭을 따라간다.
        handleEl.setAttribute("aria-valuenow", String(latest));
      };
      const move = (e: PointerEvent) => {
        e.preventDefault();
        // 왼쪽으로 끌수록 넓어진다(오른쪽에 고정된 패널이므로).
        latest = clampW(startW - (e.clientX - startX));
        if (railEl) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          setWidth(latest);
        }
      };
      const finish = () => {
        if (!activeRef.current) return;
        activeRef.current = false;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        window.removeEventListener("blur", finish);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (railEl) {
          flush();
          // 커밋 1회 — 드래그 내내 리렌더 0회.
          setWidth(latest);
        }
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        try {
          handleEl.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        storeWidth(latest);
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
      // pointerup 이 끝내 오지 않는 경로가 있다(OS 가 포인터를 가져가는 경우,
      // alt-tab, 컨텍스트 메뉴). 창이 포커스를 잃으면 드래그는 끝난 것으로 본다.
      window.addEventListener("blur", finish, { once: true });
    },
    [width],
  );

  // 드래그 도중 언마운트되면 finish 가 영영 안 돈다 — body 잠금만 앱에 남는다.
  useEffect(
    () => () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.pointerEvents = "";
    },
    [],
  );

  const nudge = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? STEP_FAST : STEP;
    // 드래그와 방향을 맞춘다 — 왼쪽이 넓어지는 쪽.
    const next = clampW(width + (event.key === "ArrowLeft" ? step : -step));
    setWidth(next);
    storeWidth(next);
  };

  return (
    <>
      <button
        type="button"
        onPointerDown={beginResize}
        onKeyDown={nudge}
        onDoubleClick={() => {
          setWidth(DEFAULT_W);
          storeWidth(DEFAULT_W);
        }}
        title={AUTHORING_COPY.A11Y.railResizeTitle}
        aria-label={AUTHORING_COPY.A11Y.railResize}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={MIN_W}
        aria-valuemax={MAX_W}
        // 보이는 폭은 16px, 잡히는 폭은 좌우 12px 씩 넓혀 40px(의사요소). 구 값
        // (보임 12 / 잡힘 28)은 WCAG 타깃 크기와 터치 하한 양쪽에 미달이었다.
        className={cn(
          "group/handle relative flex h-full min-h-0 w-4 shrink-0 cursor-col-resize touch-none select-none items-center justify-center border-l bg-slate-50 transition-colors",
          HAIRLINE,
          "after:absolute after:inset-y-0 after:-left-3 after:-right-3 after:content-['']",
          "hover:bg-blue-50 active:bg-blue-100",
          FOCUS_RING,
        )}
      >
        {/* 세로쓰기 '설정' 글자는 삭제했다(12px 폭 안 10.5px 한글). 잡는 곳임을
            알리는 신호는 그립 아이콘 + hover 색 변화로 충분하다. */}
        <GripVertical
          className="size-3.5 text-slate-400 transition-colors group-hover/handle:text-blue-600"
          aria-hidden="true"
        />
      </button>

      <aside
        ref={railRef}
        // 폭은 인라인 style 이 아니라 **CSS 변수**로 넘긴다. style={{width}} 로 두면
        // 인라인 선언이 클래스보다 강해서, 좁은 폭(<720cqi)에서 보드가 레일을
        // 발주 밴드 아래로 쌓을 때 w-full 로 펼 방법이 !important 밖에 없어진다.
        style={{ "--rail-w": `${width}px` } as CSSProperties}
        // 상한을 **컨테이너 대비(38cqi)** 로 한 번 더 조인다. 저장된 폭이 420 이어도
        // 보드가 좁으면 입력 컬럼이 쪼그라들면 안 되기 때문이다. cqi 는 조상
        // 컨테이너(보드 셸의 @container)를 기준으로 평가되고, 컨테이너가 없으면
        // 뷰포트로 폴백한다 — 어느 쪽이든 이것은 **상한**이라 레일이 사라지는
        // 경로가 되지 않는다(계약: 어떤 폭에서도 사라지지 않는다).
        className="flex min-h-0 w-(--rail-w) max-w-[38cqi] shrink-0 flex-col overflow-hidden bg-white @max-[720px]:w-full @max-[720px]:max-w-none"
      >
        <RailHeader summary={summary} />
        {/* 레일의 유일한 스크롤. 배경은 흰색 그대로 둔다 — 구 배경은 slate-50 의
            50% 알파 표기(디렉터리 금지)였고, 흰 배경 합성 시 기여가 사실상 0이었다. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}

/**
 * 레일 머리 = **오른쪽 컬럼 헤더**. 좌측 발주 컬럼 헤더와 h-9 · px-4 ·
 * border-b hairline 이 정확히 같아야 두 헤더가 한 줄로 이어진다. 여기서 높이나
 * 인셋을 따로 정하지 말 것 — 그 순간 화면을 가로지르는 선이 두 동강 난다.
 */
function RailHeader({ summary }: { summary?: string }) {
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center justify-between gap-2 border-b px-4",
        HAIRLINE,
      )}
    >
      <Kicker className="shrink-0">{AUTHORING_COPY.KICKER.spec}</Kicker>
      {summary ? (
        // 요약은 헤더의 곁말이라 meta(12/500) + slate-500(정보 텍스트 색 하한).
        // 좁은 레일에서는 잘린다 — 아래 줄들이 같은 값을 다시 말하므로 안전하다.
        <span className={cn(DESK.meta, "min-w-0 truncate text-slate-500")}>
          {summary}
        </span>
      ) : null}
    </div>
  );
}
