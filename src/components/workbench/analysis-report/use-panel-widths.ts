/**
 * 3분할 편집기 셸의 패널 폭 상태 훅.
 *
 * [E21/U5 — 26-08-17] `docs/class-studio-spec.md` §3.10.21 E21-3 「전역 오염 차단」 표 3행이
 * 요구한 **localStorage 네임스페이스**를 옵셔널 인자 1개로 얹었다. 학습지 조판 표면은 이
 * 편집기를 우측 aside 에 임베드하는데, 그 컨테이너는 중앙 420px 을 뺀 나머지라 사용자가
 * 패널·레일을 바짝 줄이게 된다. 지금까지는 폭 3키가 전역 단일 키라서 **임베드에서 줄인 폭이
 * 독립 라우트(지문 스튜디오·학습지 생성 모달)로 영구 누수**했다 — 넓은 화면에서 편집기를
 * 열어도 레일이 88px 로 쭈그러든 채 남는다. `usePanelWidths("sheetCompose")` 처럼 ns 를 주면
 * 조판 표면만의 키에 쓰고 읽는다.
 *
 * 불변식 2가지 — 어기면 유일 소비처(`AnalysisReportEditor.tsx:604`, 인자 없음)가 즉시 회귀한다:
 *  1) **ns 미전달 = 현행 동작 바이트 동일.** 키 조립은 전부 U4 의 `reportEditorWidthKeys(ns)`
 *     한 곳에 위임했고, 그 함수는 ns 가 없으면 기존 상수 3개를 **그대로** 돌려준다
 *     (`editor-storage.ts:75-89`). 이 파일에서 키 문자열을 재조립하지 않는다.
 *  2) **드래그·클릭 억제 로직은 무개변** — 단 하나, `[data-panel-key]` 앵커 조회만
 *     **자기 셸(`.are-shell`) 스코프**로 바꿨다(아래 startWidthDrag 주석의 실측 근거 참조).
 *     §3.10.21 E21-3 인용구의 '좁히지 마라' 는 편집기 키 vs 스튜디오 키(tree/dossier) 축을
 *     겨냥한 문장이고, E21 이 새로 만든 **편집기 2인스턴스 공존** 축을 덮지 못한다.
 *     `pointercancel` 복구 경로는 이미 있는 것을 그대로 쓴다(신설 금지).
 *     ※ 스펙 §3.10.21 E21-3 「하지 말 것」 블록쿼트의 해당 문장은 정정 필요(문서 담당자에게 이관).
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  ACTIVITY_WIDTH_DEFAULT,
  clampActivityWidth,
  clampPanelWidth,
  clampRailWidth,
  PANEL_WIDTH_DEFAULT,
  RAIL_WIDTH_DEFAULT,
  readStoredWidth,
  reportEditorWidthKeys,
} from "./editor-storage";

// 이 픽셀 이하의 이동은 '클릭(여닫기)'으로 간주 — 같은 핸들이 클릭=토글, 드래그=폭조절.
const WIDTH_DRAG_THRESHOLD = 4;

/**
 * 3분할 레이아웃(좌측 학습활동 레일 · 중앙 캔버스 · 우측 속성 패널)의 폭 상태 + 드래그 리사이즈.
 * 폭은 localStorage에 영속되며, 드래그 중에는 widthDragging=true로 트랜지션을 끈다.
 *
 * 여닫기 탭과 폭조절 핸들을 한 요소로 합칠 수 있도록(시험지 생성 UI와 동일), 드래그가
 * 임계값을 넘으면 `consumeWidthDragClick()` 이 true 를 돌려 직후의 click(토글)을 막는다.
 *
 * @param ns 임베드 네임스페이스(예: `"sheetCompose"`). **미전달이 기존 경로** — 현행 전역 키를
 *   그대로 쓴다. 전달하면 폭 3키만 ns 아래로 갈라진다(§3.10.21 E21-3). ns 는 호출부에서
 *   사실상 상수지만, 아래 영속 effect 의 deps 에 **키 문자열을 넣어** ns 가 바뀐 렌더에서는
 *   새 키로 다시 쓰도록 했다(정확성 우선 — 값이 아니라 키가 바뀌어도 영속이 따라간다).
 */
export function usePanelWidths(ns?: string) {
  // 폭 드래그 중에는 너비 트랜지션을 꺼서(여닫힘 애니메이션과 충돌 방지) 즉각 반응하게 한다.
  const [widthDragging, setWidthDragging] = useState(false);
  // 드래그로 폭을 바꾼 직후 발생하는 click 이 패널을 토글하지 않도록 막는 플래그.
  const suppressClickRef = useRef(false);
  // 키 조립은 U4 의 단일 정본에 위임한다. 매 렌더 새 객체지만 필드가 전부 **문자열**이라
  // 아래 deps 는 Object.is 값 비교로 안정 — 별도 메모이제이션이 필요 없다.
  const widthKeys = reportEditorWidthKeys(ns);
  // lazy initializer 는 마운트 1회만 도는 게 계약이므로 최초 ns 의 키로 읽는다.
  // (ns 를 런타임에 바꾸는 호출부는 편집기 `key` 교체로 재마운트하는 것이 정본 — E21-6 4.)
  const [railWidth, setRailWidth] = useState(() =>
    readStoredWidth(widthKeys.rail, RAIL_WIDTH_DEFAULT, clampRailWidth),
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    readStoredWidth(widthKeys.panel, PANEL_WIDTH_DEFAULT, clampPanelWidth),
  );
  const [activityWidth, setActivityWidth] = useState(() =>
    readStoredWidth(widthKeys.activity, ACTIVITY_WIDTH_DEFAULT, clampActivityWidth),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(widthKeys.rail, String(railWidth));
    } catch {
      // 편의 설정이라 실패해도 현재 세션 동작엔 영향 없음.
    }
  }, [railWidth, widthKeys.rail]);
  useEffect(() => {
    try {
      window.localStorage.setItem(widthKeys.panel, String(panelWidth));
    } catch {
      // 편의 설정이라 실패해도 현재 세션 동작엔 영향 없음.
    }
  }, [panelWidth, widthKeys.panel]);
  useEffect(() => {
    try {
      window.localStorage.setItem(widthKeys.activity, String(activityWidth));
    } catch {
      // 편의 설정이라 실패해도 현재 세션 동작엔 영향 없음.
    }
  }, [activityWidth, widthKeys.activity]);

  // 좌/우 패널 폭 드래그 — 포인터 이벤트로 col-resize (exam paper builder 와 동일한 UX).
  // pointerdown 에서 preventDefault 하지 않아 이어지는 click(토글)이 살아 있고,
  // 임계값을 넘겨 움직였을 때만 폭을 조절하며 그 직후의 click 은 억제한다.
  //
  // 성능 계약(2026-08-11 전역 핸들 수술 — resizable-panels.startResize 동형):
  // 매 pointermove 의 세터는 에디터 셸 전체를 프레임마다 리렌더시키고 폭 영속
  // effect 까지 드래그 내내 발화시켰다. 드래그 중에는 `[data-panel-key]` 앵커의
  // style.width 에 rAF 코얼레싱으로 직접 쓰고, 놓을 때 세터 1회로 커밋한다
  // (localStorage 영속은 기존 effect 담당). 앵커가 없으면 종전 setState 경로
  // 폴백(무회귀).
  const startWidthDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, side: "rail" | "panel" | "activity") => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      suppressClickRef.current = false;
      const startX = event.clientX;
      const startRail = railWidth;
      const startPanel = panelWidth;
      const startActivity = activityWidth;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      let didDrag = false;

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 이벤트가 끊기지 않고,
      // 아래의 body pointer-events:none 과 조합해도 move 가 계속 들어온다.
      const handleEl = event.currentTarget as HTMLElement;
      try {
        handleEl.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      // 드래그 대상 앵커 — activity/panel 은 애니메이션 컨테이너와 내용 aside
      // 두 요소가 같은 폭을 쓰므로 같은 키 전부를 갱신한다.
      //
      // ★ 조회 스코프 = 드래그한 핸들이 속한 **자기 셸**(`.are-shell`, AnalysisReportEditor.tsx:2240).
      // [E21 회귀 수정 — 26-08-17] 종전에는 `document.querySelectorAll` 전역이었다. E21 이전에는
      // AnalysisReportEditor 가 한 DOM 에 2개 뜨는 상황이 없어서(모달은 배타적) 무해했으나,
      // E21 이 학습지 조판 편집기를 **숨김 마운트로 상시 보존**하면서(studio-home-client.tsx:1986-1989
      // `className={sheetComposeVisible ? … : "hidden"}`) 지문관리 뷰의 분석 모달
      // (library-pane.tsx:2070-2076 → prime-analysis-view.tsx:277, `:63` 이 초기 모드 "edit")
      // 과 **2인스턴스 공존**이 처음 가능해졌다. 실측(2560x1200): 모달을 열면 shells:2,
      // 앵커 {rail:2, panel:4, activity:2} → 모달 panel 을 304→410 으로 드래그하니 숨김 조판
      // 인스턴스의 앵커 2개에도 inline width "410px" 이 기록됐고(커밋 setState 는 :175-177 로
      // 드래그한 인스턴스에만 들어가므로) 조판 쪽 state/localStorage 는 304, DOM 은 410 으로
      // 갈라진 채 남아 조판 뷰로 돌아오면 만진 적 없는 폭(410)이 보였다. ns 로 폭 키를 갈라 둔
      // E21-3 의 격리 의도가 DOM 축에서 무효화되는 셈.
      //
      // 스펙 §3.10.21 E21-3 「하지 말 것」의 '스코프를 좁히지 마라' 는 **편집기 키 vs 스튜디오 키
      // (tree/dossier) 교집합 0** 을 근거로 한 문장이라 이 새 축(편집기 vs 편집기)을 덮지 못한다.
      // 스튜디오 키는 애초에 resizable-panels.tsx:199 가 자기 컨테이너 안에서 따로 조회하므로
      // 이 수술과 충돌하지 않는다. 셸이 없는 호스트는 document 폴백 → 무회귀.
      //
      // 수정 검증(`.tmp-worksheet-compose/_verify-f19-scope3.mjs`, /dev/passage-report?mode=edit,
      // 2560x1200, 두 번째 `.are-shell` 주입 후 panel 핸들 드래그):
      //   · 수정 후 — 자기 셸 304→410px, 주입 셸 277px **무변**(V2/V3 PASS).
      //   · 음성 대조(이 줄을 `document` 로 되돌린 상태) — 주입 셸도 410px 로 덮임(V2 FAIL).
      // 고속 경로 생존도 같이 확인했다(스코프가 과하게 좁으면 앵커 0 → setState 폴백 성능 회귀).
      const anchorScope: ParentNode = handleEl.closest(".are-shell") ?? document;
      const anchorEls = Array.from(
        anchorScope.querySelectorAll<HTMLElement>(`[data-panel-key="${side}"]`),
      );
      const fastPath = anchorEls.length > 0;
      let latest: number | null = null;
      let rafId: number | null = null;
      const flush = () => {
        // 다음 무브가 새 프레임을 잡을 수 있게 먼저 해제한다.
        rafId = null;
        if (latest === null) return;
        for (const el of anchorEls) el.style.width = `${latest}px`;
      };

      const move = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        if (!didDrag) {
          if (Math.abs(delta) < WIDTH_DRAG_THRESHOLD) return;
          didDrag = true;
          suppressClickRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          // 드래그 중 hover 스타일 재평가 차단 — 캡처 덕에 move 수신은 유지된다.
          document.body.style.pointerEvents = "none";
          // 폭 트랜지션 끄기 — 드래그 시작 시 1회 상태 전환(매 무브 아님).
          setWidthDragging(true);
        }
        moveEvent.preventDefault();
        // 학습 활동 패널은 창 왼쪽에 있어 핸들이 오른쪽 모서리 → 오른쪽 드래그가 폭 증가(+delta).
        const next =
          side === "rail"
            ? clampRailWidth(startRail + delta)
            : side === "activity"
              ? clampActivityWidth(startActivity + delta)
              : clampPanelWidth(startPanel - delta);
        if (fastPath) {
          latest = next;
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          if (side === "rail") setRailWidth(next);
          else if (side === "activity") setActivityWidth(next);
          else setPanelWidth(next);
        }
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (fastPath && latest !== null) {
          flush();
          // 커밋 1회 — 이후 리렌더가 같은 값을 다시 쓰므로 튐이 없다.
          if (side === "rail") setRailWidth(latest);
          else if (side === "activity") setActivityWidth(latest);
          else setPanelWidth(latest);
        }
        if (didDrag) {
          document.body.style.cursor = prevCursor;
          document.body.style.userSelect = prevSelect;
          document.body.style.pointerEvents = prevPointerEvents;
          setWidthDragging(false);
        }
        try {
          handleEl.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [railWidth, panelWidth, activityWidth],
  );

  // 토글 핸들의 onClick 에서 호출 — 직전에 드래그(폭조절)했으면 true(토글 생략).
  const consumeWidthDragClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  return { railWidth, panelWidth, activityWidth, widthDragging, startWidthDrag, consumeWidthDragClick };
}
