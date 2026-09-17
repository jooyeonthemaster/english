// ============================================================================
// 클래스 스튜디오 「위치」 URL 계약 — 정본 (R1 새로고침 위치 복원, 26-08-27)
//
// 지시 원문: "작업을 하다가 새로고침을 해버리면 무조건 클래스 선택 페이지로
// 가버린다 … 새로고침 한다고 페이지가 달라지지 않도록."
//
// ── 왜 URL 인가(sessionStorage·localStorage 기각) ────────────────────────────
// ① **플래시 0 은 URL 만 가능하다.** 저장소 복원은 반드시 「마운트 → 읽기 →
//    setState」라 첫 페인트가 무조건 StepGuidePane 이고 다음 커밋에서 지문함으로
//    튄다. 서버가 쿼리를 읽어 이미 고른 클래스로 렌더하면 그 중간 프레임이
//    아예 존재하지 않는다. 사용자가 요구한 "부드럽게"의 실체가 이것이다.
// ② **탭 격리가 공짜다.** 저장소는 탭을 넘나들어, 두 탭에서 다른 클래스를 보다
//    한쪽을 새로고침하면 다른 탭의 클래스로 튄다. URL 은 탭의 것이다.
// ③ **기존 프로브 12종이 무사하다.** 프로브는 전부 쿼리 없는
//    `/director/studio` 로 진입하므로 복원이 발화하지 않는다 — 종전과 글자
//    단위로 같은 ① 단계를 만난다. 저장소 방식이면 `reload()` 하는 프로브가
//    전부 복원에 걸린다.
// ④ 이 라우트는 이미 쿼리를 쓴다(`?tour=start|off`, `?tourShift=` —
//    components/studio/tour/storage.ts:65,79). 새 관례가 아니다.
//
// ── 이 모듈이 **정본**인 이유 ────────────────────────────────────────────────
// 파싱(서버 · page.tsx)과 기록(클라이언트 · studio-home-client.tsx)이 **같은
// 상수·같은 도메인**을 읽어야 한다. 한쪽만 값이 늘면(예: 뷰에 새 필 추가)
// 서버는 걸러 내고 클라이언트는 써 넣는 「주소창엔 있는데 복원은 안 되는」
// 유령이 된다 — 타입 에러 0 · 콘솔 0 이라 화면으로만 드러난다.
//
// ⚠ 뷰 도메인은 source-switcher.tsx 의 `StudioAssetView` 와 **한 몸**이다.
//   그 union 이 늘면 여기 `STUDIO_ASSET_VIEWS` 도 같이 늘려야 한다 — 아래
//   `satisfies` 가 그 누락을 **컴파일 타임에** 잡는다(런타임 도메인과 타입
//   도메인이 갈리는 것을 구조적으로 막는 유일한 장치).
// ============================================================================

import type { StudioAssetView } from "./source-switcher";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

/** 작업 클래스 — `?class=<classId>` */
export const STUDIO_CLASS_PARAM = "class";
/** 중앙 자산 뷰 — `?view=sheet|exam` (지문관리는 기본값이라 쓰지 않는다) */
export const STUDIO_VIEW_PARAM = "view";

/** 런타임 도메인. `satisfies` 가 StudioAssetView union 과의 이탈을 잡는다. */
const STUDIO_ASSET_VIEWS = [
  "passages",
  "sheet",
  "exam",
  "analysis",
  "students",
] as const satisfies readonly StudioAssetView[];

/** 복원된 위치. 클래스가 없으면 뷰도 없다(아래 §불변식). */
export interface StudioLocation {
  classId: string | null;
  view: StudioAssetView;
}

export const STUDIO_LOCATION_HOME: StudioLocation = {
  classId: null,
  view: "passages",
};

function isAssetView(v: unknown): v is StudioAssetView {
  return (
    typeof v === "string" &&
    (STUDIO_ASSET_VIEWS as readonly string[]).includes(v)
  );
}

/** 쿼리값이 배열/undefined 로도 오는 Next 규약을 한 곳에서 접는다. */
export function firstParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (typeof raw === "string") return raw || undefined;
  if (Array.isArray(raw)) return raw[0] || undefined;
  return undefined;
}

/**
 * URL → 위치. **반드시 실재하는 클래스 id 목록으로 대조한다.**
 *
 * 검증이 없으면 `selectedClassId` 는 非null 인데 `selectedClass`(= 목록 조회
 * 결과)는 null 인 좀비 조합이 생긴다 — 보관·삭제·타 학원·손으로 고친 URL 이
 * 전부 이 조합을 만든다. 그 상태의 증상은 고약하다: 중앙은 StepGuidePane 을
 * 그리는데 스텝 스트립은 ①완료라고 말하고, 무엇보다
 * studio-home-client.tsx 의 「미선택이면 레일 자동 펼침」 구조대(가드가
 * `!selectedClassId`)가 **무장 해제**되어 접힌 레일에서 빠져나올 길이 없다.
 *
 * 서버는 이 대조를 **공짜로** 할 수 있다 — page.tsx 가 이미 클래스 목록을
 * 조회해 두었다(추가 질의 0).
 *
 * ⚠ **불변식: 클래스가 null 이면 뷰는 항상 "passages" 다.**
 *   클래스 없이 조판 뷰만 살아나면 중앙이 StepGuidePane 이라 LibraryPane 자체가
 *   마운트되지 않고, 그 값은 소비처 없는 유령이 된다. 여기서 접어 두면 하류
 *   전체가 이 조합을 신경 쓸 필요가 없다.
 */
export function parseStudioLocation(
  params: { class?: string | string[]; view?: string | string[] },
  knownClassIds: readonly string[],
): StudioLocation {
  const rawClass = firstParam(params.class);
  const classId =
    rawClass && knownClassIds.includes(rawClass) ? rawClass : null;
  if (!classId) return STUDIO_LOCATION_HOME;
  const rawView = firstParam(params.view);
  let view: StudioAssetView = isAssetView(rawView) ? rawView : "passages";
  // 「시험 분석」 뷰(26-09-01)는 허브 nav 와 같은 플래그로 게이트한다 — 필 렌더
  // (source-switcher)와 여기 **양쪽**이다. 한쪽만 걸면 플래그 off 에서 「필은
  // 없는데 URL 복원으로는 들어가지는」(또는 그 역) 진입로 비대칭이 남는다
  // (설계 정본 §3-1, 적대검수 M9). NEXT_PUBLIC 플래그라 서버·클라 양쪽에서 같다.
  // 「학생 관리」(v4 26-09-02, docs/exam-analysis-v4-spec.md §3 U6-1)도 같은
  // 플래그 — 시험 분석 레일의 「학생」 CTA 가 건너가는 뷰라 운명 공동체다.
  if (
    (view === "analysis" || view === "students") &&
    !FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT
  ) {
    view = "passages";
  }
  return { classId, view };
}

/**
 * 위치 → 주소창. **머지한다(재조립 금지).**
 *
 * `new URLSearchParams()` 로 새로 만들면 `?tour=` · `?tourShift=` 가 사라져
 * 투어 프로브가 죽는다(그쪽은 `window.location.search` 를 직접 읽는다).
 * 값이 이미 같으면 `null` 을 돌려 **호출부가 history 를 건드리지 않게** 한다 —
 * 복원된 마운트에서 첫 페인트에 쓰기가 0 이어야 한다.
 */
export function nextStudioLocationUrl(
  href: string,
  loc: StudioLocation,
): string | null {
  const url = new URL(href);
  const curClass = url.searchParams.get(STUDIO_CLASS_PARAM);
  const curView = url.searchParams.get(STUDIO_VIEW_PARAM);
  // 지문관리(기본값)는 쓰지 않는다 — 주소창을 조용히 유지한다.
  const wantView = loc.classId && loc.view !== "passages" ? loc.view : null;
  if ((curClass ?? null) === loc.classId && (curView ?? null) === wantView) {
    return null;
  }
  if (loc.classId) url.searchParams.set(STUDIO_CLASS_PARAM, loc.classId);
  else url.searchParams.delete(STUDIO_CLASS_PARAM);
  if (wantView) url.searchParams.set(STUDIO_VIEW_PARAM, wantView);
  else url.searchParams.delete(STUDIO_VIEW_PARAM);
  return url.toString();
}
