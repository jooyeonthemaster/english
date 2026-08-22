// ============================================================================
// 학습지 조판 — **미저장 편집 소실 가드** 정본 (docs/class-studio-spec.md §3.10.21 E21-6 4)
//
// ─── 왜 이 파일이 따로 있는가 ───────────────────────────────────────────────────
// 조판 표면(`sheet-compose-surface.tsx`)은 **자기가 dirty 인지만** 알고, 조판 대기열
// (`pickedSheets`)을 실제로 줄이는 코드는 전부 오케스트레이터(`studio-home-client.tsx`)에
// 있다. 그래서 「활성 문서를 목록에서 빼는 순간」을 잡으려면 두 파일이 한 사실을 공유해야
// 하는데, 그 통로를 prop 사슬로 만들면 표면 → 오케스트레이터 → LibraryPane → 행까지
// 계약이 번지고 우측 본문이 aside/드로어 2트리에 렌더된다는 기존 함정
// (`studio-home-client.tsx:1409-1414` 주석)과 다시 얽힌다.
// 여기서는 **모듈 싱글턴 프로브 1개**만 둔다: 표면이 자기 상태를 읽는 함수를 등록하고,
// 대기열을 줄이는 쪽이 커밋 직전에 물어본다. 조판 표면은 `sheetComposeOpen` 일 때만,
// 그것도 aside 한 곳에서만 마운트되므로(§3.10.21 E21-5) 싱글턴이 성립한다.
//
// ─── 무엇을 막는가(실측) ────────────────────────────────────────────────────────
// 프로브 `.tmp-worksheet-compose/_audit-l3-b.mjs` 로 확인된 소실:
//   활성 문서 본문에 타이핑(dirty=2) → 좌측 그 행 체크 해제 →
//   `dialogs during active-uncheck: []`(confirm 0건) · `after: dirty=0` ·
//   `ZQX still in canvas: false` · 재체크해도 복구 불가.
// 원인은 `sheet-compose-surface.tsx:308-321` 의 활성 문서 자동 수렴 + `:706`
// `key={activeDoc.reportId}` 재마운트다. 수렴 자체는 옳다(활성 없는 상태를 만들지
// 않는다) — 빠져 있던 것은 **그 앞에 서는 confirm** 뿐이라, 가드도 수렴을 건드리지 않고
// 「대기열에서 빼기」 커밋 직전에만 선다.
//
// ─── 자구 계약 ─────────────────────────────────────────────────────────────────
// 표면의 닫기(`:417-427`)·활성 전환(`:429-443`) confirm 과 **같은 계열**이어야 한다:
// 학습지 편집기에는 IndexedDB 초안이 없어 "임시 보관"이 성립하지 않으므로 자구는
// 끝까지 "사라집니다"다.
// ============================================================================

/** 조판 표면이 노출하는 최소 사실 — 활성 문서 id 와 미저장 여부. */
export interface SheetComposeDirtyState {
  /** 지금 편집 중인 문서(reportId). 없으면 잃을 것도 없다. */
  activeReportId: string | null;
  /** 편집기 툴바 dirty(= 저장 대기 중인 변경 존재). */
  dirty: boolean;
}

/**
 * 활성 문서를 대기열에서 빼기 직전 confirm 자구.
 *
 * 「다른 학습지로 옮기면」(활성 전환)과 굳이 문장을 나눈 이유: 체크 해제는 사용자가
 * 「조판에서만 빠진다」고 학습한 조작이라(구 표면 안내문 「체크하면 즉시 조판에
 * 올라가고, 해제하면 빠집니다」가 그렇게 가르쳤다 — E25 §3.10.24 로 안내문 자체는
 * 삭제됐지만 동작이 그대로 그 문장이라 학습 채널은 유지된다) **무엇이 사라지는지**를
 * 그 조작의 언어로 말해야 경고가 읽힌다.
 */
export const SHEET_COMPOSE_REMOVE_CONFIRM =
  "저장하지 않은 편집이 있어요. 편집 중인 학습지를 조판에서 빼면 사라집니다. 계속할까요?";

/**
 * (E25 §3.10.24 E25-1 3) 대기열은 그대로 둔 채 조판 표면만 **통째로 접을(언마운트)**
 * 때의 confirm — `<xl` 드로어 [조판 접기] 전용.
 *
 * REMOVE 자구를 재사용하지 않는 이유: 접기는 대기열에서 아무것도 빼지 않는다.
 * 「조판에서 빼면」이라고 말하면 대기열 보존 사실과 어긋나는 **거짓 경고**가 되고,
 * 거짓인 경고는 사용자가 confirm 자체를 무시하게 만든다(오케스트레이터의 자구 2벌
 * 원칙과 같은 근거 — 적대검수 E25 minor 확정). 잃는 것은 미저장 편집뿐이므로 표면
 * 자체 닫기 자구(「조판을 닫으면 사라집니다」)와 같은 계열로 말한다.
 * 활성 문서 membership 검사가 없는 이유: 표면 전체가 언마운트되므로 dirty 하나로
 * 손실 여부가 완결된다.
 */
export const SHEET_COMPOSE_COLLAPSE_CONFIRM =
  "저장하지 않은 편집이 있어요. 조판을 접으면 사라집니다. 계속할까요?";

/** 드로어 [조판 접기] 직전 가드 — dirty 가 아니면 조용히 통과한다. */
export function confirmSheetComposeCollapse(): boolean {
  const state = currentProbe?.();
  if (!state || !state.dirty) return true;
  if (typeof window === "undefined") return true;
  return window.confirm(SHEET_COMPOSE_COLLAPSE_CONFIRM);
}

type Probe = () => SheetComposeDirtyState;

let currentProbe: Probe | null = null;

/**
 * 조판 표면이 마운트되는 동안 자기 상태 프로브를 등록한다. 반환값은 해제 함수.
 *
 * StrictMode 이중 마운트/언마운트 순서 뒤집힘에서도 **뒤에 등록된 프로브를 앞선
 * 언마운트가 지우지 않도록** 동일성 비교 후에만 해제한다(전형적 등록 함정).
 */
export function registerSheetComposeDirtyProbe(probe: Probe): () => void {
  currentProbe = probe;
  return () => {
    if (currentProbe === probe) currentProbe = null;
  };
}

/**
 * 대기열 변경(prev → next)이 **편집 중인 문서를 떨어뜨리는가**를 보고, 그렇다면
 * confirm 을 띄워 사용자의 승인 여부를 돌려준다. 호출 측은 `false` 면 커밋을 포기하고
 * 이전 Map 을 그대로 둬야 한다(참조 유지 = 조판 재조회 0).
 *
 * 통과(=true) 조건은 넷 중 하나다:
 *  · 조판 표면이 없거나(미마운트) dirty 가 아니다 — 잃을 것이 없다.
 *  · 활성 문서가 next 에 그대로 남는다 — 이번 변경과 무관하다.
 *  · 활성 문서가 애초에 prev 에도 없다 — 표면의 자동 수렴이 아직 안 돈 한 프레임의
 *    과도 상태다. 여기서 confirm 을 띄우면 사용자가 건드리지도 않은 문서를 이유로
 *    엉뚱한 경고가 뜬다.
 *  · 사용자가 confirm 에서 확인을 눌렀다.
 */
export function confirmSheetPickRemoval(
  prev: ReadonlyMap<string, unknown> | null,
  next: ReadonlyMap<string, unknown>,
): boolean {
  const state = currentProbe?.();
  if (!state || !state.dirty) return true;
  const activeId = state.activeReportId;
  if (!activeId) return true;
  if (next.has(activeId)) return true;
  if (prev && !prev.has(activeId)) return true;
  // 서버 렌더/테스트 환경 방어 — window 가 없으면 막지 않는다(가드는 UX 장치이지
  // 데이터 무결성 장치가 아니다).
  if (typeof window === "undefined") return true;
  return window.confirm(SHEET_COMPOSE_REMOVE_CONFIRM);
}
