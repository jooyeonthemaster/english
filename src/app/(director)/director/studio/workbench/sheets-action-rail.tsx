"use client";

// ============================================================================
// 클래스 스튜디오 — 「학습지 조판」 탭 우측 실행대 (docs/class-studio-spec.md §3.10.21 E21-5 · §3.10.23 E24)
//
// 문항 축의 `questions-action-rail.tsx`(§3.10.17-b)를 **학습지(문서) 축**에 그대로
// 복제한 판이다. 이 판이 신설되기 전, 학습지 관리 뷰의 우측은 도시에도 실행대도
// 아닌 **미정의 지대**였다 — `studio-home-client.tsx` 의 삼항 사슬이 questions →
// 도시에 → 빈 상태 순이라, 학습지 뷰에서 지문 발행이 없으면 "②에서 지문을
// 선택하면 여기서 배포합니다"라는 **문맥 불일치 문구**가 떴다(학습지 뷰에서는
// ②가 지문을 고르는 자리가 아니다). 그 자리를 이 실행대가 가져간다.
//
// 구조·자구는 문항 실행대를 미러하고 용어만 학습지 축으로 바꾼다:
//   ① 선택 요약 카드(0건에서도 자리 유지 + 유도 문구)
//   ② 종류별 칩(SHEET_PLAN_LABEL 정본 환산 — 「기본 학습지 2」 꼴)
//   ③ 실행 2버튼 [모바일 배포][학습지 조판] — **선택 0에서도 항시 노출**,
//      0이면 aria-disabled + 사유 title(문항 실행대와 동일 정책)
//   ④ 모바일 배포 인라인 폼(접힘 grid 0fr↔1fr + inert)
//
// ─── 문항 실행대와 **다른** 2가지(= 학습지 축 고유 제약) ─────────────────────
//
// (1) **모바일 배포는 「1건 · PRIME」만 열린다.**
//     · 1건 제한: `deployStudioModules` 는 `passageId` **단수**를 받고 서버가
//       그 지문의 PRIME 리포트를 재조회한다(deploy.ts:219-230·42-53). N건 배포는
//       N회 왕복 + N개 과제가 되므로 v1 범위 밖이다(E21-6-1 감독 결정).
//     · PRIME 제한: 판정은 `canDeployWorksheetRow` **1곳**이 정본이다. 여기서
//       마커를 다시 비교하지 않는다 — 자체 비교를 복제하면 행 툴팁과 실행대
//       툴팁이 갈린다(U9 needsOtherFile 지시).
//
// (2) **배포 폼을 새로 그리지 않고 `DossierDeployInline` 정본을 그대로 재사용한다.**
//     학습지 배포의 재료는 「모듈 칩 + 강도 + 라이브 미리보기(viable 게이트)」이고
//     그 조립은 `dossier-deploy-inline.tsx` 가 이미 소유한다. 여기서 폼을 새로
//     그리면 viable 게이트·미리보기 디바운스 계약(함정 2)이 두 벌이 된다.
//     → 그 컴포넌트가 요구하는 `PassageDossier` 만 이 판이 조달한다.
//
// ─── 도시에 캐시를 빌리지 않고 **자체 조회**하는 이유(스펙 미규정 — 자체 판단) ──
// 오케스트레이터에도 `dossierStates` 캐시가 있지만 빌리지 않았다. 근거 2건:
//   · `studio-home-client.tsx:861-869` 가 발행 집합(alive) 밖 항목을 **캐시에서
//     제거**한다. 「학습지 조판」 뷰 병합 목록(composer-list-pane.tsx)의 행은 발행
//     집합과 무관한 지문일 수 있어, 빌리면 폼이 열려 있는 동안 아래에서 캐시가
//     증발할 수 있다.
//   · 조회는 **선택 1건 · 폼을 처음 펼칠 때 1회**뿐이고 passageId 로 캐시한다 —
//     사용자 손가락 1회당 왕복 1회라 비용이 사실상 0이다.
// 이 판은 `getStudioPassageDossier`(기존 읽기 액션)만 쓴다. **새 배포 경로를
// 발명하지 않는다** — 제출은 끝까지 DossierDeployInline → deployStudioModules 다.
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// [모바일 배포] 갈래(버튼·인라인 폼·불가 사유 amber 문단·두 갈래 캡션)를
// 렌더하지 않고 [학습지 조판]이 전폭(grid-cols-1)을 차지한다. 코드 경로는 전부
// 존치 — 복구는 env 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true). 같은
// 개정으로 `nudge`(생성 완료 → 조판 유도 펄스, 오케스트레이터 소유) prop 이
// 추가됐다.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, LayoutTemplate, Loader2, Smartphone, X } from "lucide-react";
import { getStudioPassageDossier } from "@/actions/studio/dossier";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { PassageDossier } from "@/lib/studio/dossier-types";
import { canDeployWorksheetRow } from "@/lib/studio/sheet-deploy-eligibility";
import type { SheetPickMeta } from "@/lib/studio/sheet-pick-types";
import { SHEET_PLAN_LABEL } from "@/lib/studio/sheet-products";
import type { StudioDeployTarget } from "./deploy-target";
import { DossierDeployInline } from "./dossier-deploy-inline";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

// ── 스타일 토큰 — 문항 실행대(questions-action-rail.tsx:45-57)와 **같은 문자열**.
//    두 실행대가 같은 자리에서 교대로 뜨므로 버튼 문법이 갈리면 다른 제품처럼
//    보인다. 값이 바뀌면 두 파일을 함께 고칠 것.
const ACTION_BASE =
  "flex h-10 min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg text-[12.5px] font-bold shadow-sm transition-colors";
const ACTION_ON = `${ACTION_BASE} cursor-pointer bg-blue-600 text-white hover:bg-blue-700`;
const ACTION_OPEN = `${ACTION_BASE} cursor-pointer bg-blue-700 text-white ring-2 ring-inset ring-blue-300`;
const ACTION_DISABLED = `${ACTION_BASE} cursor-not-allowed bg-slate-100 text-slate-400 shadow-none`;

/** 선택 0건 유도 자구 — 3곳(두 버튼 title + 요약 카드)이 같은 문장을 쓴다. */
const PICK_FIRST = "왼쪽 목록에서 학습지를 먼저 체크하세요";
/** 2건 이상에서 모바일 배포가 닫히는 사유(위 (1) 근거). */
const MULTI_REASON =
  "모바일 배포는 학습지 1건씩만 보낼 수 있습니다 — 하나만 남기고 해제해 주세요";

/**
 * 조회 **결과**만 담는다 — `loading` 항목을 두지 않는 것이 의도다.
 * 항목 부재 = 아직 결과 없음(= 스피너)이고, 진행 중 여부는 `inflightRef` 가
 * 안다. 이렇게 나눠야 effect 본문에서 동기 setState 를 하지 않아도 되고
 * (react-hooks/set-state-in-effect), 재요청 가드는 `has(pid) || inflight` 두
 * 축으로 여전히 완전하다.
 */
type DossierState =
  | { status: "ready"; dossier: PassageDossier }
  | { status: "error"; error: string };

export function SheetsActionRail({
  picked,
  deployTarget,
  onClear,
  onDeployed,
  onCompose,
  nudge = false,
  pendingDeployReportId,
  onDeployIntentConsumed,
}: {
  /** 오케스트레이터 소유 선택 상태 — Map 삽입 순서 = 체크 순서 = **조판 순서** */
  picked: ReadonlyMap<string, SheetPickMeta>;
  /** 좌측 레일 체크 상태(§3.10.3) — null = 클래스 미선택. 읽기 전용 */
  deployTarget: StudioDeployTarget | null;
  onClear: () => void;
  /** 배포 성공 — 해당 지문 조용한 재조회 + 목록 리프레시는 호스트 소관 */
  onDeployed: (passageId: string) => void;
  /** 학습지 조판 — 인-플로우 조판 표면 진입(문서 로딩은 표면 소관) */
  onCompose: (reportIds: string[]) => void;
  /**
   * §M 조판 유도 펄스 — 학습지 생성 완료를 오케스트레이터가 감지해 true 를
   * 내리면 [학습지 조판] 버튼이 펄스 링으로 빤짝인다(count 0 이면 은은판 +
   * 안내 한 줄). 소등(조판 표면 열림)도 오케스트레이터 소관. 원시 boolean —
   * memo 무해.
   */
  nudge?: boolean;
  /**
   * 행 [모바일 배포] 직행 의도(§3.10.21 E21-5). 그 행의 **reportId 값 자체**가
   * 신호다 — 이 값이 지금 선택된 1건과 같고 배포 가능하면 폼을 펼친 상태로 둔다.
   *
   * ⚠ **전이(nonce) 방식이었다가 폐기됐다**(감사 L3-interaction #1, 26-08-18):
   * 조판이 열려 있는 동안 이 실행대는 **언마운트** 상태다
   * (`studio-home-client.tsx` 의 `{anyComposeVisible ? null : rightPanelView}`).
   * 행 클릭 배치가 「조판 닫기 + 신호」를 한 커밋에 담으므로, 커밋 뒤 갓 마운트된
   * 이 판의 `useState(openDeployNonce)` 가 **이미 증가한 값으로 초기화**되어
   * 전이가 통째로 사라졌다 — 조판·선택·미저장 편집만 날아가고 폼은 닫힌 채였다
   * (실측 `_audit-l3-f.mjs`: 조판 열림 상태 `form expanded:"false" inert:true`,
   * 한 번 더 눌러야 열림). **값 자체**를 보면 마운트 시점에도 그대로 읽힌다.
   */
  pendingDeployReportId?: string | null;
  /**
   * 위 의도를 소비했다고 호스트에 알린다(호스트가 null 로 되돌린다).
   * 소비하지 않으면 사용자가 폼을 손으로 접은 뒤 같은 행을 다시 눌러도 값이
   * 그대로라 전이가 없어 다시 펼쳐지지 않는다 — 소비가 곧 재발화 조건이다.
   */
  onDeployIntentConsumed?: () => void;
}) {
  const count = picked.size;
  const reportIds = useMemo(() => [...picked.keys()], [picked]);
  const metas = useMemo(() => [...picked.values()], [picked]);
  const passageIds = useMemo(
    () => [...new Set(metas.map((m) => m.passageId))],
    [metas],
  );
  // 종류 요약 칩 — 많은 순. 학습지 마커는 3종뿐이라 문항 축의 "+N종" 절단이
  // 필요 없다(SHEET_PLAN_LABEL 정본 3키 — 미지 마커는 원문 폴백).
  const planChips = useMemo(() => {
    const byPlan = new Map<string, number>();
    for (const m of metas) {
      const label = SHEET_PLAN_LABEL.get(m.planMarker) ?? m.planMarker;
      byPlan.set(label, (byPlan.get(label) ?? 0) + 1);
    }
    return [...byPlan.entries()].sort((a, b) => b[1] - a[1]);
  }, [metas]);

  // ── 배포 가능 판정 — 1건 + PRIME(canDeployWorksheetRow 정본) ──────────────
  const soleMeta = count === 1 ? metas[0] : undefined;
  const eligibility = soleMeta
    ? canDeployWorksheetRow(soleMeta.planMarker)
    : null;
  // §M off 면 버튼·행 직행(wantsDeployOpen) 어느 경로로도 폼이 열리지 않는다.
  const canOpenDeploy = SHOW_MOBILE && eligibility?.ok === true;
  // §M off 면 모바일 갈래가 없어 사유 자체가 성립하지 않는다 — undefined 로 두면
  // 아래 amber 문단·버튼 title 이 이 값 하나로 함께 소등된다(훅 아님 — 스킵 무해).
  const deployReason = !SHOW_MOBILE
    ? undefined
    : count === 0
      ? PICK_FIRST
      : count > 1
        ? MULTI_REASON
        : eligibility && !eligibility.ok
          ? eligibility.reason
          : undefined;

  // 행 [모바일 배포] 직행 의도가 **지금 이 선택과 맞는가**. 렌더 중 계산이라
  // 아래 `useState` 초기값으로 그대로 쓸 수 있다 — 이것이 언마운트 내성의 핵심:
  // 조판을 닫으면서 갓 마운트되는 경우에도 **첫 렌더부터 펼친 상태**로 태어난다.
  const wantsDeployOpen =
    canOpenDeploy &&
    !!pendingDeployReportId &&
    soleMeta?.reportId === pendingDeployReportId;

  const [formOpen, setFormOpen] = useState(wantsDeployOpen);
  // 선택이 비거나 배포 불가 조합이 되면 폼을 접는다 — 렌더 중 조건부 setState 는
  // "이전 렌더 정보 보관" 공인 패턴(문항 실행대 :104 동형).
  if (formOpen && !canOpenDeploy) setFormOpen(false);

  // 이미 마운트돼 있던 경우(조판이 닫혀 있을 때 행을 누른 경로)는 **전이**로 받는다.
  // effect 가 아니라 "이전 렌더 정보 보관" 렌더 중 조건부 setState 를 쓴다 —
  // 이 리포의 공인 패턴이고(studio-home-client.tsx 프룬 동형), effect 동기
  // setState 가 만드는 캐스케이드 렌더 경고를 피한다.
  // 배포 불가 조합(0건·다건·비PRIME)에서 온 의도는 `wantsDeployOpen` 이 이미
  // false 라 여기 닿지 않는다(폼이 한 프레임 깜빡이지 않는다).
  const [prevWantsDeployOpen, setPrevWantsDeployOpen] =
    useState(wantsDeployOpen);
  if (wantsDeployOpen !== prevWantsDeployOpen) {
    setPrevWantsDeployOpen(wantsDeployOpen);
    if (wantsDeployOpen) setFormOpen(true);
  }

  // 의도 소비 — 호스트가 `pendingDeployReportId` 를 null 로 되돌린다. **펼침을
  // 이미 확정한 뒤**(위 두 블록)에 도는 effect 라 소비가 펼침을 취소하지 않는다.
  // 소비하지 않으면 같은 행 재클릭이 값 무변화가 되어 재발화하지 못한다.
  useEffect(() => {
    if (!pendingDeployReportId) return;
    onDeployIntentConsumed?.();
  }, [pendingDeployReportId, onDeployIntentConsumed]);

  // ── 배포 폼 재료(PassageDossier) 지연 조달 ────────────────────────────────
  // 폼을 처음 펼칠 때 1회. 키는 passageId 이고 **캐시는 비우지 않는다**(다른
  // 학습지를 골랐다 되돌아와도 왕복 0). 취소 가드는 토큰 방식(도시에 조회 정본
  // studio-home-client.tsx:747-750 미러) — 응답 순서 역전 시 낡은 응답 기각.
  const deployPassageId = canOpenDeploy ? (soleMeta?.passageId ?? null) : null;
  const [dossiers, setDossiers] = useState<ReadonlyMap<string, DossierState>>(
    () => new Map(),
  );
  const inflightRef = useRef(new Map<string, number>());
  const tokenRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const inflight = inflightRef.current;
    return () => {
      mountedRef.current = false;
      inflight.clear();
    };
  }, []);

  // deps 에 `dossiers` 를 그대로 넣는다(ref 미러 금지 — 렌더 중 ref 쓰기는
  // react-hooks/refs 위반). 상태가 바뀌면 이 effect 가 다시 돌지만, 진행 중
  // 요청은 `inflightRef`(동기 마킹)가, 끝난 요청은 `dossiers.has(pid)` 가
  // 막으므로 재요청은 일어나지 않는다 — 재귀 없음. **effect 본문에서 동기
  // setState 를 하지 않는 것**이 이 구조의 목적이다(위 DossierState 주석).
  useEffect(() => {
    if (!formOpen || !deployPassageId) return;
    const pid = deployPassageId;
    if (dossiers.has(pid) || inflightRef.current.has(pid)) return;
    const token = ++tokenRef.current;
    inflightRef.current.set(pid, token);
    const settle = (state: DossierState) => {
      if (!mountedRef.current) return;
      if (inflightRef.current.get(pid) !== token) return;
      inflightRef.current.delete(pid);
      setDossiers((prev) => new Map(prev).set(pid, state));
    };
    getStudioPassageDossier({ passageId: pid })
      .then((res) => {
        if (res.data) settle({ status: "ready", dossier: res.data });
        else
          settle({
            status: "error",
            error: res.error ?? "지문을 찾을 수 없습니다.",
          });
      })
      .catch(() =>
        settle({ status: "error", error: "지문 현황을 불러오지 못했습니다." }),
      );
  }, [formOpen, deployPassageId, dossiers]);

  // 「다시 시도」 — 그 지문 항목만 버려 위 effect 를 재발화시킨다.
  const retryDossier = () => {
    if (!deployPassageId) return;
    inflightRef.current.delete(deployPassageId);
    setDossiers((prev) => {
      if (!prev.has(deployPassageId)) return prev;
      const next = new Map(prev);
      next.delete(deployPassageId);
      return next;
    });
  };

  const dossierState = deployPassageId ? dossiers.get(deployPassageId) : undefined;

  // ── 【6장 상한 폐기 — §3.10.22 E22-0 계약 3, 26-08-18】 ─────────────────────
  // 여기 있던 `overCap`(count > SHEET_COMPOSE_MAX_DOCS)과 rose 경고 문단을 걷었다.
  // 폐기 근거(감독 실측): pages JSON **중앙값 49KB · 최대 458KB · 40건 합계 1.9MB**
  // (구 근거 「문서당 수 MB」의 반증) · 렌더 곡선 평평(조판 아이템 30→300 에서
  // 토글 **890ms → 883ms**). 문서 개수 축 하드 상한은 서버 요청 **배치** 상한 12
  // (`worksheet-docs-constants.ts` SHEET_COMPOSE_DOC_BATCH) + 클라 청크 로딩으로
  // 대체됐고, 사용자에게 보이는 무게 고지는 **콘텐츠 축 소프트 경고**(총 아이템
  // 600 / A4 100p 초과 시 「무거워질 수 있습니다」, 막지 않음)로 옮겨졌다.
  //
  // ⚠ 이 실행대를 무게 고지의 **1차 채널로 되돌리지 마라.** 구 주석의 교훈이
  // 그대로 유효하다 — 예전에 이 자리는 "막지 않고 고지한다 · 표면이 배너로 다시
  // 알린다"고 적어 두었지만 둘 다 사실이 아니었고(실제 차단은 오케스트레이터
  // 입력단의 클램프+토스트였다), 존재하지 않는 안전망을 다음 수정자에게 약속했다.
  // 소프트 경고 시대의 채널은 **조판 표면 하나**다. 이 판은 개수를 판정하지 않는다.

  const composeSheets = () => {
    if (count === 0) return;
    onCompose(reportIds);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-3 py-3">
      {/* ── 선택 요약 — 0에서도 유도 문구로 항시 자리 유지 ── */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-1.5">
          <FileText
            className="size-3.5 shrink-0 text-blue-600"
            aria-hidden="true"
          />
          {count > 0 ? (
            <span className="min-w-0 truncate text-[11.5px] font-bold text-slate-800">
              학습지 <span className="tabular-nums text-blue-600">{count}</span>
              개 선택됨
              {passageIds.length > 1 ? (
                <span className="font-medium text-slate-400">
                  {" "}
                  · 지문 {passageIds.length}개
                </span>
              ) : null}
            </span>
          ) : (
            <span className="min-w-0 text-[11.5px] font-semibold text-slate-500">
              선택된 학습지가 없습니다
            </span>
          )}
          <span className="flex-1" aria-hidden="true" />
          {count > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            >
              <X className="size-3 shrink-0" aria-hidden="true" />
              선택 비우기
            </button>
          ) : null}
        </div>
        {count === 0 ? (
          nudge ? (
            /* §M 생성 완료 넛지 — 아직 체크 전이라 버튼 대신 안내가 유도한다 */
            <p className="mt-1 text-[10.5px] font-semibold leading-relaxed text-blue-600 break-keep">
              방금 만든 학습지가 도착했어요 — 목록에서 체크하면 바로 학습지
              조판으로 이어집니다
            </p>
          ) : (
            <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400 break-keep">
              {SHOW_MOBILE
                ? "왼쪽 목록에서 학습지를 체크하면 여기서 바로 배포하거나 여러 장을 이어 붙여 조판합니다"
                : "왼쪽 목록에서 학습지를 체크하면 여러 장을 이어 붙여 A4 로 조판합니다"}
            </p>
          )
        ) : planChips.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {planChips.map(([label, n]) => (
              <span
                key={label}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500"
              >
                {label} {n}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── 실행 2버튼 — 항시 노출, 비활이면 사유 title(문항 실행대 동일 정책).
          §M off 면 [학습지 조판] 단독 전폭(grid-cols-1) — 빈 반칸 잔재 금지 ── */}
      <div
        className={`mt-2.5 grid gap-1.5 ${SHOW_MOBILE ? "grid-cols-2" : "grid-cols-1"}`}
      >
        {SHOW_MOBILE ? (
          <button
            type="button"
            aria-expanded={formOpen}
            aria-disabled={!canOpenDeploy}
            title={deployReason}
            onClick={() => {
              if (!canOpenDeploy) return;
              setFormOpen((v) => !v);
            }}
            className={
              !canOpenDeploy
                ? ACTION_DISABLED
                : formOpen
                  ? ACTION_OPEN
                  : ACTION_ON
            }
          >
            <Smartphone className="size-4 shrink-0" aria-hidden="true" />
            모바일 배포
          </button>
        ) : null}
        <button
          type="button"
          aria-disabled={count === 0}
          title={count === 0 ? PICK_FIRST : undefined}
          onClick={composeSheets}
          className={`${count === 0 ? ACTION_DISABLED : ACTION_ON}${
            nudge ? (count === 0 ? " studio-pulse-soft" : " studio-pulse") : ""
          }`}
        >
          <LayoutTemplate className="size-4 shrink-0" aria-hidden="true" />
          학습지 조판
        </button>
      </div>

      {/* 비활 사유는 title 만으로는 마우스 없는 사용자에게 닿지 않는다 —
          선택이 1건 이상일 때만 문장으로도 노출(0건 유도 문구는 위 카드가 이미
          말한다 — 같은 문장 2회 반복 금지, 감사 L2-13 계열).
          §M off 면 deployReason 이 항상 undefined 라 이 문단은 렌더되지 않는다. */}
      {count > 0 && deployReason ? (
        <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] font-medium leading-relaxed text-amber-700 break-keep">
          {deployReason}
        </p>
      ) : null}

      {/* (상한 초과 rose 문단은 §3.10.22 상한 폐기와 함께 제거 — 위 composeSheets
          앞 주석의 실측 근거. 무게 고지는 조판 표면의 소프트 경고 1곳이 소유한다.) */}

      {SHOW_MOBILE ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400 break-keep">
          <span className="font-semibold text-slate-500">모바일 배포</span>는
          학생 앱 학습으로 바로 보내고,{" "}
          <span className="font-semibold text-slate-500">학습지 조판</span>은 이
          화면에서 여러 학습지를 이어 붙여 A4 로 만듭니다
        </p>
      ) : /* §M off — 버튼 아래 캡션 소거(26-08-22 사용자 지시, 문항 실행대와 동시).
           버튼 라벨·요약 카드가 이미 말하는 동어반복 한 줄이었다. */
      null}

      {/* ── 모바일 배포 인라인 폼 — inert: 접힘 중 탭 스톱 차단(문항 실행대 동형).
          §M off 면 래퍼째 미렌더(접힘 잔재·탭 스톱·검사기 소음 금지) ── */}
      {SHOW_MOBILE ? (
      <div
        inert={!formOpen}
        className={`grid transition-[grid-template-rows] duration-300 ${formOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
            {/* 대상 학습지 1줄 — 폼(DossierDeployInline)은 지문 축이라 어떤
                학습지에서 출발했는지 스스로 말하지 못한다. */}
            {soleMeta ? (
              <div className="border-b border-slate-100 bg-white px-2.5 py-2">
                <p className="truncate text-[11.5px] font-bold text-slate-800">
                  {soleMeta.title}
                </p>
                <p className="mt-0.5 truncate text-[10.5px] text-slate-400">
                  {soleMeta.passageTitle}
                </p>
              </div>
            ) : null}
            {dossierState?.status === "ready" ? (
              <DossierDeployInline
                mode="worksheet"
                dossier={dossierState.dossier}
                target={deployTarget}
                onDeployed={onDeployed}
              />
            ) : dossierState?.status === "error" ? (
              <div className="flex flex-col items-center gap-1.5 bg-slate-50/50 px-3 py-4">
                <p className="text-center text-[11px] text-slate-500 break-keep">
                  {dossierState.error}
                </p>
                <button
                  type="button"
                  onClick={retryDossier}
                  className="cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1.5 bg-slate-50/50 px-3 py-5">
                <Loader2
                  className="size-3.5 shrink-0 animate-spin text-slate-400"
                  aria-hidden="true"
                />
                <span className="text-[11px] text-slate-400">
                  배포 구성을 불러오는 중…
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      ) : null}
    </div>
  );
}
