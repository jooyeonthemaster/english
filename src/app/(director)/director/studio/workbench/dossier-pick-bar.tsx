"use client";

// ============================================================================
// 도시에 문항 선택 실행 바 — 우측 패널 하단 고정 (26-08-14 지시)
//
// 문제 행 체크(passage-dossier-pane E11 행)로 고른 문항을 지문 경계 없이 모아
// 두 갈래로 흘려보내는 종착 표면. 선택이 1개 이상일 때만 하단에서 올라온다
// (grid-rows 0fr↔1fr 300ms — 코드베이스 접힘 정본).
//   ① 모바일 배포 — deployStudioQuestions(선택 id 전량). passageId 는 서버
//      미사용 계약(deploy.ts StudioQuestionsDeployInput 주석)이라 지문 여러
//      개를 한 과제로 묶어도 안전하다. 대상은 좌측 레일 deployTarget 읽기
//      전용(E4 — 다시 묻지 않는다), 마감은 DossierDeployInline 과 동일 재료
//      (서울 달력 고정·해당일 23:59).
//   ② 시험지 조판 — seedExamAndNavigate(워크벤치 정본 통로): 선택 id 를
//      sessionStorage 시드로 넘기고 /director/workbench/exams/create 로 이동,
//      빌더가 1회 소비해 미리보기(시험지)에 그대로 올린다(체크 순서 유지).
// 선택 상태는 호스트(PassageDossierAccordion) 소유 — 이 파일은 요약·실행만.
// 두 버튼은 동등 위계(같은 폭·같은 파란 채움) — 갈래 구분은 아이콘·라벨·
// 하단 한 줄 안내가 담당한다(26-08-14 사용자 지시 "동등하게 나란히").
//
// ─── E22-U14(§3.10.22 E22-0 계약 4 — 26-08-18 사용자 지시) ──────────────────
// "문제 선택하면 실행 바 뜨는 것처럼 **학습지 선택해도 조판되게** 해줘."
// → 이 바에 **학습지 축을 합류**시킨다. 신규 4 prop(pickedSheets·onClearSheets·
//   onComposeSheets·onDeploySheet)은 전부 옵셔널이고, **미전달이면 sheetCount 가
//   0이라 요약 문구·칩 줄·실행 2버튼·안내줄이 전부 기존 분기로 떨어진다**
//   (렌더 결과 바이트 동일 — additive 계약). 배선은 U13(studio-home-client) 소관.
//
// 이 바가 **하지 않는** 일 — 학습지 모바일 배포. 정본은 우측 실행대
// (`sheets-action-rail.tsx:30-44` 「배포 폼을 새로 그리지 않고 DossierDeployInline
// 정본을 그대로 재사용한다」 · `:190-239` PassageDossier 지연 조달)이고, 그 폼은
// 「1건 · PRIME」에서만 열린다(`sheet-deploy-eligibility.ts:63-70`). 여기에 폼을
// 복제하면 viable 게이트·미리보기 디바운스 계약이 두 벌이 된다 — 그래서 이 바는
// 「우측 실행대를 여는 링크 1줄」까지만 담당한다(지시서 U14-7).
//
// ⚠ 실행대 열기는 `onDeploySheet` = 오케스트레이터 `deploySheetFromRow`
// (`studio-home-client.tsx:1971-1985`)로 흐르는데, 그 콜백은
// `setPickedSheets(new Map([[meta.reportId, meta]]))`(:1976)로 **대기열을 그 1건으로
// 좁힌다**. 그래서 이 바에서는 「1건 · PRIME」이 아닐 때 그 버튼을 열지 않고
// 사유를 문장으로 먼저 말한다 — 고지 없는 대기열 축소는 E21-0 이 금지한 바로 그
// 신뢰 사고다(체크한 문서가 조용히 빠지는 것).
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// 좌측 슬롯 두 분기([모바일 배포]·[학습지 실행대] — 둘 다 모바일 배포 계열)와
// 모바일 표면(50문항 상한 rose 배너·인라인 배포 폼·혼합 선택 「실행대 열기」
// 박스·학습지 축 amber 사유 문단)을 렌더하지 않고 우측 조판 버튼이 전폭
// (grid-cols-1)을 차지하며, 두 갈래 캡션은 조판 단독 문장으로 갈아탄다. 코드
// 경로는 전부 존치 — 복구는 env 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// 같은 개정으로 `nudge`(생성 완료 → 조판 유도 펄스, 오케스트레이터 소유)
// prop 이 추가됐다.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  LayoutTemplate,
  ListChecks,
  Loader2,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { deployStudioQuestions } from "@/actions/studio/deploy";
import { addPassagesToStudioClass } from "@/actions/studio/passages";
import {
  dueLabelKo,
  dueYmdToIso,
  resolveDueYmd,
  thisSundayYmd,
  type DuePreset,
} from "@/components/studio/deploy-dialog-dates";
import {
  seoulTodayYmd,
  ymdWeekdayKo,
} from "@/components/study-assignments/composer-config-form";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { canDeployWorksheetRow } from "@/lib/studio/sheet-deploy-eligibility";
import type { SheetPickMeta } from "@/lib/studio/sheet-pick-types";
import { SHEET_PLAN_LABEL } from "@/lib/studio/sheet-products";
import { seedExamAndNavigate } from "../../workbench/generate/seed-exam-and-navigate";
import type { StudioDeployTarget } from "./deploy-target";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

/** 체크한 문항의 표시·배포 재료 — 카드가 접히거나 도시에가 갱신돼도 바가 자립 */
export interface PickedQuestionMeta {
  passageId: string;
  passageTitle: string;
  /** 행과 같은 함수(questionRowTypeLabel)로 뽑은 표시 라벨 — 요약 칩 재료 */
  typeLabel: string;
  difficulty: string | null;
  premium: boolean;
}

// ── 스타일 토큰 — 실행 2버튼은 동등 위계(파란 채움), 폼은 인라인 배포 정본 ──
const ACTION_BASE =
  "flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg text-[12.5px] font-bold text-white shadow-sm transition-colors";
const ACTION_BLUE = `${ACTION_BASE} bg-blue-600 hover:bg-blue-700`;
/** 모바일 배포 폼 펼침 중 — "지금 이 갈래를 조작 중"의 눌림 상태 */
const ACTION_BLUE_OPEN = `${ACTION_BASE} bg-blue-700 ring-2 ring-inset ring-blue-300`;
/** 비활 실행 버튼(E22-U14) — 자구·색은 학습지 실행대 정본을 미러한다
 *  (`sheets-action-rail.tsx:78` ACTION_DISABLED). 두 표면이 같은 실행을 다른
 *  모양으로 잠그면 같은 제품으로 안 보인다. 여기서는 ACTION_BASE 가
 *  cursor-pointer·text-white 를 이미 물고 있어 재사용하지 않고 따로 적는다. */
const ACTION_DISABLED =
  "flex h-10 min-w-0 cursor-not-allowed items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg bg-slate-100 text-[12.5px] font-bold text-slate-400 transition-colors";
const DUE_CHIP_ON =
  "rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white";
const DUE_CHIP_OFF =
  "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600";
// 배포 버튼 — aria-disabled 관용구(§3.9v2 정본): 비활에서도 title 사유가 뜨게
const DEPLOY_BASE =
  "flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold transition-colors";
const DEPLOY_ON = `${DEPLOY_BASE} cursor-pointer bg-blue-600 text-white hover:bg-blue-700`;
const DEPLOY_DISABLED = `${DEPLOY_BASE} cursor-not-allowed bg-slate-200 text-slate-400`;

/** 모바일 배포 1회 상한 — createStudyAssignment(QUESTIONS) 서버 정본 미러
 *  (actions/study-assignments: "문제 세트는 한 번에 50문항까지"). 다지문 집계로
 *  50 초과가 처음 가능해졌다(지문당 50행 × 표시 5지문) — 서버 거부를 사전
 *  게이트·안내로 막는다(26-08-14 적대 검수 major). 시험지 조판은 상한 무관. */
const MOBILE_DEPLOY_MAX = 50;

/** 학습지 축 실행대가 2건 이상에서 닫히는 사유 — 자구는 실행대 정본 미러
 *  (`sheets-action-rail.tsx:83-85` MULTI_REASON). 근거는 서버 계약이다:
 *  `deployStudioModules` 는 passageId **단수**를 받고 그 지문의 PRIME 리포트를
 *  재조회한다(`actions/studio/deploy.ts:219-230`·`:42-53`). */
const SHEET_MULTI_REASON =
  "모바일 배포는 학습지 1건씩만 보낼 수 있습니다 — 하나만 남기고 해제해 주세요";

/** 참조 안정 빈 배열 — 미전달(undefined) 경로에서 매 렌더 새 배열을 만들지
 *  않게(호스트가 memo 방어선을 깔아 둔 트리다 — passage-dossier-pane.tsx:1938). */
const EMPTY_SHEET_METAS: readonly SheetPickMeta[] = [];
const EMPTY_REPORT_IDS: readonly string[] = [];

export function DossierPickBar({
  picked,
  passageTitleById,
  deployTarget,
  onClear,
  onDeployed,
  onComposeExam,
  pickedSheets,
  onClearSheets,
  onComposeSheets,
  onDeploySheet,
  nudge = false,
}: {
  /** 호스트 소유 선택 상태 — 삽입 순서가 곧 시험지 조판 순서 */
  picked: ReadonlyMap<string, PickedQuestionMeta>;
  /** 표시 스냅샷의 현재 지문 제목 — 배포 과제 제목 재료(체크 시점 스냅샷은
   *  제목 수정 시 stale — 적대 검수 minor). 부재 지문은 메타 스냅샷 폴백 */
  passageTitleById: ReadonlyMap<string, string>;
  /** 좌측 레일 체크 상태(§3.10.3) — null = 클래스 미선택. 읽기 전용 */
  deployTarget: StudioDeployTarget | null;
  onClear: () => void;
  /** 배포 성공 — 관련 지문 전부(호스트가 선택 비움 + 조용한 재조회 업링크) */
  onDeployed: (passageIds: string[]) => void;
  /**
   * 「시험지 조판」 착지 오버라이드(§3.10.16-b, additive) — 제공 시 라우팅
   * 대신 호출(인스튜디오 시험지 스튜디오 오버레이). 시드 주입은 호스트 소관.
   * 미제공 = 기존 seedExamAndNavigate(워크벤치 빌더로 이동) 그대로.
   */
  onComposeExam?: (questionIds: string[]) => void;

  // ── 학습지(문서) 축 합류(§3.10.22 E22-0 계약 4, additive) ─────────────────
  // 4개 전부 옵셔널이고 **pickedSheets 가 곧 스위치**다: 미전달이면 sheetCount 0
  // → 아래 모든 분기가 문항 전용 경로로 떨어져 렌더 결과가 기존과 같다.
  /** 조판 대기열(Map) — **삽입 순서 = 조판 순서**(sheet-pick-types.ts:17-29).
   *  오케스트레이터 소유인 이유는 문항 축 `picked` 와 같다(aside/드로어 2트리). */
  pickedSheets?: ReadonlyMap<string, SheetPickMeta>;
  /** 학습지 축 선택 비움 — 「선택 해제」가 두 축을 함께 걷는다. 오케스트레이터의
   *  `clearPickedSheets`(studio-home-client.tsx:1819-1825)가 dirty 가드를 지난다. */
  // 반환 boolean = 「실제로 비웠는가」(false = dirty confirm 취소). 아래 clearAll
  // 의 2축 원자 청산에 필요하다. void 를 돌려주는 구 호스트도 그대로 받는다.
  onClearSheets?: () => boolean | void;
  /** 조판 발사 — 인자는 조판 순서(대기열 삽입 순서) reportId 배열. 문항이 함께
   *  선택돼 있으면 **합본**이 되지만 그 합류는 조판 표면이 한다(E22-1: 합류
   *  지점은 buildComposedView 안이 유일한 정답) — 여기서 섞지 않는다. */
  onComposeSheets?: (reportIds: string[]) => void;
  /** 학습지 1건 모바일 배포 = **우측 실행대 열기**(deploySheetFromRow). 위 파일
   *  머리 ⚠ 참조 — 대기열을 그 1건으로 좁히므로 「1건·PRIME」에서만 연다. */
  onDeploySheet?: (meta: SheetPickMeta) => void;
  /**
   * §M 조판 유도 펄스(26-08-22) — 생성 완료를 오케스트레이터가 감지해 true 를
   * 내리면 우측 조판 버튼이 펄스 링으로 빤짝인다. 이 바는 선택 1건 이상에서만
   * 올라오는 표면이라(open = count+sheetCount > 0) 견본(questions-action-rail)의
   * 0건 studio-pulse-soft 분기 없이 studio-pulse 단일이다. 소등(조판 표면
   * 열림)도 오케스트레이터 소관. 원시 boolean — memo 무해.
   */
  nudge?: boolean;
}) {
  const router = useRouter();
  const count = picked.size;
  // E22-U14-2: 열림 판정은 **두 축의 합**이다. 학습지만 골라도 바가 올라온다
  // (사용자 확정 4 — "학습지 선택해도 조판되게").
  const sheetCount = pickedSheets?.size ?? 0;
  const open = count + sheetCount > 0;

  const questionIds = useMemo(() => [...picked.keys()], [picked]);
  // ⚠ 이 배열은 **문항 축 전용**이다 — 배포 페이로드(addPassagesToStudioClass ·
  // deployStudioQuestions.passageId · 과제 제목)가 전부 이 값을 먹는다. 학습지
  // 지문을 여기에 union 하면 문항 과제에 무관한 지문이 등록·기록된다.
  // 요약 표시용 union 은 아래 `summaryPassageCount` 가 따로 센다.
  const passageIds = useMemo(
    () => [...new Set([...picked.values()].map((m) => m.passageId))],
    [picked],
  );
  // 유형 요약 칩 — 많은 순 정렬, 6종 초과는 "+N종"으로 접어 바의 수직 폭주 방지
  const typeChips = useMemo(() => {
    const byType = new Map<string, number>();
    for (const meta of picked.values())
      byType.set(meta.typeLabel, (byType.get(meta.typeLabel) ?? 0) + 1);
    return [...byType.entries()].sort((a, b) => b[1] - a[1]);
  }, [picked]);
  const shownChips = typeChips.slice(0, 6);
  const hiddenTypeCount = typeChips.length - shownChips.length;

  // ── 학습지 축 파생 ────────────────────────────────────────────────────────
  const sheetMetas = useMemo(
    () => (pickedSheets ? [...pickedSheets.values()] : EMPTY_SHEET_METAS),
    [pickedSheets],
  );
  const sheetReportIds = useMemo(
    () => (pickedSheets ? [...pickedSheets.keys()] : EMPTY_REPORT_IDS),
    [pickedSheets],
  );
  // 요약 줄의 「지문 K개」 — E22-U14-3: **두 축 union**. 표시 전용이라 개수만 센다.
  const summaryPassageCount = useMemo(() => {
    const ids = new Set(passageIds);
    for (const m of sheetMetas) ids.add(m.passageId);
    return ids.size;
  }, [passageIds, sheetMetas]);
  // 학습지 종류 칩 — SHEET_PLAN_LABEL(sheet-products.ts:88-92) 3키뿐이라 문항 축의
  // "+N종" 절단이 필요 없다(실행대 정본과 같은 판단 — sheets-action-rail.tsx:131-142).
  const planChips = useMemo(() => {
    const byPlan = new Map<string, number>();
    for (const m of sheetMetas) {
      const label = SHEET_PLAN_LABEL.get(m.planMarker) ?? m.planMarker;
      byPlan.set(label, (byPlan.get(label) ?? 0) + 1);
    }
    return [...byPlan.entries()].sort((a, b) => b[1] - a[1]);
  }, [sheetMetas]);

  // ── 모바일 배포 인라인 폼 — **문항 축** 폼이므로 문항 선택이 비면 접는다.
  // E22-U14-6: 예전 조건은 `!open`(= 두 축 합)이었는데, 학습지 축이 합류하면
  // 「문항 0 · 학습지 2」에서 폼이 열린 채 남아 대상 없는 배포 폼이 된다.
  // 렌더 중 조건부 setState = "이전 렌더 정보 보관" 공인 패턴(pane 동형).
  const [formOpen, setFormOpen] = useState(false);
  if (count === 0 && formOpen) setFormOpen(false);

  // 시험지 조판 이동 중 — 빌더 라우트가 뜰 때까지 버튼에 스피너를 물린다
  const [navigating, setNavigating] = useState(false);

  // ── 마감 프리셋 — DossierDeployInline 과 동일 재료(서울 달력 고정·23:59) ──
  const [duePreset, setDuePreset] = useState<DuePreset>("tomorrow");
  const [customYmd, setCustomYmd] = useState(() => seoulTodayYmd(1));
  const dueYmd = resolveDueYmd(duePreset, customYmd);
  const dueIso = dueYmdToIso(dueYmd);
  const duePresetChips: { key: DuePreset; label: string }[] = [
    { key: "today", label: `오늘(${ymdWeekdayKo(seoulTodayYmd(0))})` },
    { key: "tomorrow", label: `내일(${ymdWeekdayKo(seoulTodayYmd(1))})` },
    { key: "week", label: `이번 주(${ymdWeekdayKo(thisSundayYmd())})` },
    { key: "custom", label: "직접" },
  ];

  // ── 배포 가능 판정 — 인라인 폼과 같은 3분기 사유(§3.10.5) ──────────────
  const [pending, startTransition] = useTransition();
  const targetReason =
    deployTarget === null
      ? "①에서 클래스를 먼저 선택하세요"
      : !deployTarget.loading && deployTarget.total === 0
        ? "클래스에 학생이 없습니다 — 레일에서 학생을 추가하세요"
        : !deployTarget.loading && deployTarget.count === 0
          ? "대상 학생을 선택하세요"
          : null;

  // 서버 상한 사전 게이트 — 51+ 는 서버가 통째 거부하므로 제출 자체를 막고
  // 사유를 안내한다(멱등 선등록 부작용만 남는 실패 경로 차단).
  const overCap = count > MOBILE_DEPLOY_MAX;

  const canDeploy =
    !pending &&
    deployTarget !== null &&
    !deployTarget.loading &&
    deployTarget.count > 0 &&
    dueIso !== null &&
    count > 0 &&
    !overCap;

  const deployDisabledTitle = canDeploy
    ? undefined
    : (overCap
        ? `모바일 배포는 한 번에 ${MOBILE_DEPLOY_MAX}문항까지입니다 — ${count - MOBILE_DEPLOY_MAX}개를 줄여 주세요`
        : (targetReason ??
          (deployTarget?.loading
            ? "학생 목록을 불러오는 중입니다"
            : dueIso === null
              ? "마감 날짜를 선택해 주세요"
              : undefined)));

  // ── 학습지 축 비활 사유(E22-U14-8) — 문항 축 rose 문단과 **완전히 다른
  // 배너**로 띄운다. 판정은 `canDeployWorksheetRow` 1곳 정본을 그대로 쓴다
  // (자체 마커 비교 복제 금지 — sheet-deploy-eligibility.ts 파일 머리 계약).
  const soleSheet = sheetCount === 1 ? sheetMetas[0] : undefined;
  const sheetEligibility = soleSheet
    ? canDeployWorksheetRow(soleSheet.planMarker)
    : null;
  const sheetRailReason =
    sheetCount === 0
      ? undefined
      : !onDeploySheet
        ? "학습지 배포는 [학습지 조판] 화면의 실행대에서 진행합니다"
        : sheetCount > 1
          ? SHEET_MULTI_REASON
          : sheetEligibility && !sheetEligibility.ok
            ? sheetEligibility.reason
            : undefined;
  const canOpenSheetRail = sheetCount > 0 && !sheetRailReason;
  /** 좌측 슬롯 교체 조건 — **학습지만 골랐을 때만**. `count === 0` 단독으로
   *  가르면 두 축이 다 비는 접힘 순간(선택 해제 직후 300ms)에 버튼이 「실행대
   *  열기」로 뒤바뀌는 게 보인다(접힘은 시각 클립일 뿐 DOM 은 남는다). */
  const sheetOnly = count === 0 && sheetCount > 0;

  // ── 제출 — 멱등 선등록 → 배포 → 토스트 정본 → onDeployed 업링크(폼 동형).
  // 일반 함수: 참조 안정이 필요한 소비처가 없고, 수동 useCallback 은 파생값
  // (dueIso 등) 탓에 React Compiler 메모 보존이 깨진다(lint 실측) ──────────
  const submitDeploy = () => {
    if (!canDeploy || deployTarget === null || dueIso === null) return;
    startTransition(async () => {
      try {
        // 멱등 선등록(§3.10.9 함정 3) — 실패해도 진행. 문항 과제에는 링크
        // 게이트가 없어(§3.10.8) 이건 순수하게 등록 편의다.
        await addPassagesToStudioClass({
          classId: deployTarget.classId,
          passageIds,
        });
      } catch {
        // 무시 — 위 주석 참조
      }
      const firstMeta = picked.values().next().value;
      // 제목은 현재 표시 스냅샷 우선(체크 후 제목이 수정됐을 수 있다) —
      // 프룬이 표시 이탈 지문을 걷으므로 폴백은 사실상 안전망이다.
      const soleTitle =
        (passageIds[0] ? passageTitleById.get(passageIds[0]) : undefined) ??
        firstMeta?.passageTitle;
      const res = await deployStudioQuestions({
        classId: deployTarget.classId,
        // 서버 미사용 계약 — 재조회 키 용도로 대표 지문 하나만 싣는다
        passageId: passageIds[0] ?? "",
        questionIds,
        studentIds: deployTarget.studentIds,
        dueAt: dueIso,
        title:
          passageIds.length === 1 && soleTitle
            ? `[${soleTitle}] 선택 문제 ${questionIds.length}문항`
            : `선택 문제 ${questionIds.length}문항 (지문 ${passageIds.length}개)`,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "배포에 실패했습니다.");
        return;
      }
      toast.success(
        `${res.data.taskCount}명에게 배포했습니다 — 결과 탭에서 확인할 수 있습니다`,
      );
      onDeployed(passageIds);
    });
  };

  // ── 시험지 조판 — 인스튜디오 오버라이드(§3.10.16-b) 우선, 폴백은 시드 후
  // 빌더 라우트 이동. 오버라이드 경로는 오버레이가 즉시 뜨므로 스피너·선택
  // 청산 없음(닫고 돌아와도 작업 집합이 남아 재조판 가능). 토스터는 루트
  // 공유라 이동 후에도 남는다.
  const composeExam = () => {
    if (count === 0 || navigating) return;
    if (onComposeExam) {
      onComposeExam(questionIds);
      return;
    }
    setNavigating(true);
    toast.success(
      `선택한 ${count}문항을 시험지 미리보기에 올렸습니다 — 조판을 이어가세요`,
    );
    seedExamAndNavigate(router, questionIds);
  };

  // ── 조판 CTA 분기(E22-U14-5) — **학습지가 1건이라도 있으면 학습지(합본)
  // 경로**다. 순수 문항은 기존 시험지 빌더에 남긴다(§3.10.22 E22-6 감독 확정:
  // 문항이 ReportPages 호스트로 오면 시험지 빌더의 IntersectionObserver 페이지
  // 가상화를 잃는다 — 같은 51페이지가 1,311노드 → 약 12,800노드).
  const sheetAxis = sheetCount > 0;
  const composeSheets = () => {
    if (!onComposeSheets || sheetReportIds.length === 0) return;
    onComposeSheets([...sheetReportIds]);
  };
  const canCompose = sheetAxis
    ? sheetReportIds.length > 0 && !!onComposeSheets
    : count > 0;
  const composeLabel = !sheetAxis
    ? "시험지 조판"
    : count > 0
      ? "합본 조판"
      : "학습지 조판";
  // ── 비활 사유(E24 §3-B) — **자기참조 금지** ────────────────────────────────
  // 구 자구는 「학습지 조판은 학습지 관리 화면에서 진행합니다」였다. 3필 개편으로
  // 「학습지 관리」 필이 소멸하고 그 자리를 「학습지 조판」 필이 받았으므로 그대로
  // 개칭하면 **「학습지 조판은 [학습지 조판] 에서 진행합니다」** — 버튼이 제 이름을
  // 되풀이할 뿐 「왜 지금 못 누르는지」를 한 글자도 말하지 않는 문장이 된다.
  // → **실제 비활 조건을 사용자 말로** 옮긴다.
  //   sheetAxis 분기의 canCompose 는 `sheetReportIds.length > 0 && !!onComposeSheets`
  //   인데 `sheetReportIds = [...pickedSheets.keys()]` 이므로 sheetAxis(=size>0)면
  //   앞 항은 **항상 참**이다. 따라서 이 분기가 거짓이 되는 유일한 사유는
  //   **`onComposeSheets` 미배선** — 즉 이 바를 학습지 조판 채널 없이 띄운 호스트다
  //   (파일 머리 E22-U14 의 additive 계약: 4 prop 은 전부 옵셔널).
  //   스튜디오 호스트는 항상 배선하므로(studio-home-client → PassageDossierAccordion
  //   → 이 바) 실사용에서 이 문장은 거의 보이지 않지만, 보일 때는 「이 표면에는
  //   조판 통로가 없다 · 어디로 가면 되는가」를 말해야 한다.
  const composeTitle = canCompose
    ? undefined
    : sheetAxis
      ? "이 화면에서는 학습지 조판을 열 수 없습니다 — 상단 [학습지 조판] 탭에서 진행하세요"
      : "문항을 먼저 체크하세요";

  // 실행대 열기 — 파일 머리 ⚠(대기열 1건 축소) 때문에 「1건 · PRIME」에서만 연다
  const openSheetRail = () => {
    if (!canOpenSheetRail || !soleSheet || !onDeploySheet) return;
    onDeploySheet(soleSheet);
  };

  // 「선택 해제」 — 두 축을 함께 걷는다. 학습지 축은 **골라진 게 있을 때만**
  // 호출한다(빈 Map 전이로 dirty 가드를 공연히 깨우지 않게 —
  // studio-home-client.tsx clearPickedSheets 가 가드를 지난다).
  //
  // ⚠ **학습지 축이 먼저다**(적대 검수 major — 자료 목록판 마키에서 확인된 것과
  //   같은 계열의 결함. 그 판은 구 「조판실」 필에 살았고, E24 §3.10.23 에서 그 필이
  //   [학습지 조판]·[시험지 조판] 2필로 해체되며 두 뷰가 같은 판을 공유한다).
  //   구 코드는 onClear()(문항, 무가드)를 먼저 부르고 그 다음
  //   onClearSheets?.()(학습지, dirty confirm 관문)를 불렀다. 그래서 편집 중인
  //   학습지가 있을 때 「선택 해제」→「취소」를 누르면 학습지 픽만 남고 **문항
  //   대기열은 이미 증발**한 뒤였다 — 「취소는 아무 일도 일어나지 않는다」는
  //   confirm 의 최소 계약 위반이다.
  //   → 가드가 있는 축을 먼저 물어 거부(false)면 두 축 모두 손대지 않는다.
  //     구 호스트가 void 를 돌려주면 `=== false` 가 아니므로 동작이 종전과 같다.
  const clearAll = () => {
    if (sheetCount > 0 && onClearSheets?.() === false) return;
    if (count > 0) onClear();
    // 두 축이 다 비어 있으면 아무 일도 없다(바 자체가 접혀 있어 도달 불가).
  };

  return (
    // inert: 0fr 접힘은 시각 클립일 뿐이라 내부 버튼·칩이 보이지 않는 탭
    // 스톱으로 남는다(적대 검수 — 키보드 포커스가 허공에 잡힘). React 19
    // 불리언 inert 로 접힘 중 포커스·클릭을 서브트리째 차단한다.
    <div
      inert={!open}
      className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="border-t border-slate-200 bg-white px-3 pb-3 pt-2.5 shadow-[0_-8px_20px_-12px_rgba(15,23,42,0.25)]">
          {/* 요약 행 — 무엇이 얼마나 골라졌는지 + 즉시 되돌릴 출구(선택 해제).
              두 축 합류(E22-U14-3): 「문항 N개 · 학습지 M건 선택됨 · 지문 K개」.
              학습지가 0이면 문구가 기존과 글자 하나까지 같다. */}
          <div className="flex items-center gap-1.5">
            <ListChecks
              className="size-3.5 shrink-0 text-blue-600"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate text-[11.5px] font-bold text-slate-800">
              {count > 0 ? (
                <>
                  문항 <span className="tabular-nums text-blue-600">{count}</span>
                  개
                </>
              ) : null}
              {count > 0 && sheetCount > 0 ? " · " : null}
              {sheetCount > 0 ? (
                <>
                  학습지{" "}
                  <span className="tabular-nums text-blue-600">
                    {sheetCount}
                  </span>
                  건
                </>
              ) : null}{" "}
              선택됨
              {summaryPassageCount > 1 ? (
                <span className="font-medium text-slate-400">
                  {" "}
                  · 지문 {summaryPassageCount}개
                </span>
              ) : null}
            </span>
            <span className="flex-1" aria-hidden="true" />
            <button
              type="button"
              onClick={clearAll}
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            >
              <X className="size-3 shrink-0" aria-hidden="true" />
              선택 해제
            </button>
          </div>

          {/* 유형 요약 칩 — 인라인 폼 byType 칩 문법 동형 */}
          {shownChips.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {shownChips.map(([label, n]) => (
                <span
                  key={label}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500"
                >
                  {label} {n}
                </span>
              ))}
              {hiddenTypeCount > 0 ? (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-400">
                  +{hiddenTypeCount}종
                </span>
              ) : null}
            </div>
          ) : null}

          {/* 학습지 종류 칩 — E22-U14-4: **줄을 따로** 쓰고 앞머리 라벨을 붙인다.
              문항 유형 라벨(QUESTION_SUBTYPE_LABEL 계열)과 학습지 상품 라벨
              (SHEET_PLAN_LABEL)은 다른 네임스페이스라 한 줄에 섞으면 「어법 3
              기본 학습지 2」처럼 같은 종류로 읽힌다. 색도 slate↔blue 로 가른다. */}
          {planChips.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-semibold text-slate-400">
                학습지
              </span>
              {planChips.map(([label, n]) => (
                <span
                  key={label}
                  className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-blue-600"
                >
                  {label} {n}
                </span>
              ))}
            </div>
          ) : null}

          {/* 실행 2버튼 — 동등 폭·동등 위계. 라벨은 짧게 유지해 절대 찌그러지지
              않는다(whitespace-nowrap + overflow-hidden 이중 방어).
              E22-U14-5: 좌측 슬롯은 **문항이 있으면 모바일 배포**(문항 축 폼
              토글), 학습지만 골랐으면 **학습지 실행대 열기**로 바뀐다. 긴
              설명(몇 건 + 몇 개)은 버튼이 아니라 아래 안내줄이 진다. */}
          <div
            className={`mt-2 grid gap-1.5 ${SHOW_MOBILE ? "grid-cols-2" : "grid-cols-1"}`}
          >
            {/* §M off 면 좌측 슬롯(두 분기 다 모바일 배포 계열)째 미렌더 —
                우측 조판 버튼이 전폭(grid-cols-1)을 차지한다 */}
            {SHOW_MOBILE ? (
            !sheetOnly ? (
              <button
                type="button"
                aria-expanded={formOpen}
                onClick={() => setFormOpen((v) => !v)}
                className={formOpen ? ACTION_BLUE_OPEN : ACTION_BLUE}
              >
                <Smartphone className="size-4 shrink-0" aria-hidden="true" />
                모바일 배포
              </button>
            ) : (
              <button
                type="button"
                aria-disabled={!canOpenSheetRail}
                title={sheetRailReason}
                onClick={openSheetRail}
                className={canOpenSheetRail ? ACTION_BLUE : ACTION_DISABLED}
              >
                <Smartphone className="size-4 shrink-0" aria-hidden="true" />
                학습지 실행대
              </button>
            )
            ) : null}
            <button
              type="button"
              aria-disabled={sheetAxis ? !canCompose : navigating}
              title={composeTitle}
              onClick={sheetAxis ? composeSheets : composeExam}
              className={`${canCompose ? ACTION_BLUE : ACTION_DISABLED}${
                nudge ? " studio-pulse" : ""
              }`}
            >
              {navigating && !sheetAxis ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin"
                  aria-hidden="true"
                />
              ) : sheetAxis ? (
                <LayoutTemplate className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
              )}
              {composeLabel}
            </button>
          </div>

          {/* 상한 초과 안내 — 폼을 열기 전에 보이는 표면에서 먼저 알린다.
              **문항 축 전용 배너**(E22-U14-8: 두 축 사유를 한 문단에 섞지 않는다).
              §M 모바일 배포 상한이므로 off 면 미렌더(조판은 상한 무관) */}
          {SHOW_MOBILE && overCap ? (
            <p className="mt-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-[10.5px] font-medium leading-relaxed text-rose-600 break-keep">
              모바일 배포는 한 번에 {MOBILE_DEPLOY_MAX}문항까지 보낼 수
              있습니다 — {count - MOBILE_DEPLOY_MAX}개를 줄이거나 시험지 조판을
              이용하세요
            </p>
          ) : null}

          {/* 다음 단계 안내 — 두 갈래가 각각 어디로 이어지는지 한 줄로.
              §3.10.16 개정: 조판은 이동이 아니라 이 화면 위 오버레이다.
              E22-U14-5 혼합 2행 중 **둘째 행**이 이 줄이다(버튼 라벨은 짧게
              두고 「무엇이 몇 개 묶이는지」는 여기서 말한다). */}
          {sheetAxis ? (
            SHOW_MOBILE ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400 break-keep">
              <span className="font-semibold text-slate-500">
                {composeLabel}
              </span>
              은 학습지 {sheetCount}건
              {count > 0 ? ` + 문항 ${count}개` : ""}를 A4 한 묶음으로 이어
              붙입니다{count > 0 ? " (문항은 맨 뒤에 붙습니다)" : ""}
              {sheetOnly
                ? " · 학습지 실행대는 우측에서 모바일 배포 폼(학습지 1건)을 엽니다"
                : ""}
            </p>
            ) : /* §M off 학습지 축 — 캡션도 지운다(26-08-22 사용자 지시, 문항 축과
                 동시 소거). 요약 카드 칩(학습지 N건·문항 N개)이 구성을 이미
                 말하고 있어 버튼 아래 한 줄은 중복이었다. */
            null
          ) : SHOW_MOBILE ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400 break-keep">
              <span className="font-semibold text-slate-500">모바일 배포</span>는
              학생 앱 과제로 바로 보내고,{" "}
              <span className="font-semibold text-slate-500">시험지 조판</span>은
              시험지 스튜디오를 열어 A4 시험지를 만듭니다
            </p>
          ) : /* §M off 문항 축 — 캡션 자체를 지운다(26-08-22 사용자 지시 "이것도
               없애버려"). 버튼 라벨 「시험지 조판」이 이미 전부 말하는 동어반복
               한 줄이었다. 학습지 축 캡션(위)은 묶음 구성(N건+N개·문항은 맨 뒤)
               이라는 라벨 밖 정보를 담고 있어 존치. */
          null}

          {/* 모바일 배포 인라인 폼 — 대상(읽기 전용)·마감·바로 배포.
              inert: 접힘 중 마감 칩·배포 버튼이 탭 스톱으로 남지 않게.
              §M off 면 래퍼(inert grid)째 미렌더 — 접힘 잔재·탭 스톱 금지(T3) */}
          {SHOW_MOBILE ? (
          <div
            inert={!formOpen}
            className={`grid transition-[grid-template-rows] duration-300 ${formOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="mt-2 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2.5">
                {/* 대상 요약 — 좌측 레일 읽기 전용(E4: 다시 묻지 않는다) */}
                <div>
                  {deployTarget !== null ? (
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-[11.5px] font-bold tabular-nums text-slate-800">
                        → {deployTarget.className} ·{" "}
                        {deployTarget.partial
                          ? `${deployTarget.count}/${deployTarget.total}명`
                          : `${deployTarget.count}명`}
                      </span>
                      {deployTarget.loading ? (
                        <Loader2
                          className="size-3 shrink-0 animate-spin text-slate-400"
                          aria-label="학생 목록을 불러오는 중"
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-0.5 text-[10.5px] text-slate-400">
                    대상은 왼쪽 레일에서 바꿉니다
                  </p>
                  {targetReason ? (
                    <p className="mt-1 text-[10.5px] font-medium text-amber-600 break-keep">
                      {targetReason}
                    </p>
                  ) : null}
                </div>

                {/* 마감 프리셋 4칩 — 서울 달력 고정, 해당일 23:59 */}
                <div>
                  <span className="mb-1 block text-[10.5px] font-semibold text-slate-500">
                    마감
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {duePresetChips.map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setDuePreset(chip.key)}
                        className={
                          duePreset === chip.key ? DUE_CHIP_ON : DUE_CHIP_OFF
                        }
                      >
                        {chip.label}
                      </button>
                    ))}
                    {duePreset === "custom" ? (
                      <input
                        type="date"
                        value={customYmd}
                        min={seoulTodayYmd(0)}
                        onChange={(e) => setCustomYmd(e.target.value)}
                        aria-label="마감 날짜 직접 선택"
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10.5px] tabular-nums text-slate-400">
                    {dueYmd
                      ? `${dueLabelKo(dueYmd)} 23:59 마감`
                      : "마감 날짜를 선택해 주세요"}
                  </p>
                </div>

                {/* 바로 배포 — aria-disabled + onClick 초입 return(정본 관용구) */}
                <button
                  type="button"
                  aria-disabled={!canDeploy}
                  title={deployDisabledTitle}
                  onClick={() => {
                    if (!canDeploy) return;
                    submitDeploy();
                  }}
                  className={canDeploy ? DEPLOY_ON : DEPLOY_DISABLED}
                >
                  {pending ? (
                    <Loader2
                      className="size-3.5 shrink-0 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Send className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {pending
                    ? "배포 중…"
                    : `선택 ${count}문항 바로 배포`}
                </button>
              </div>
            </div>
          </div>
          ) : null}

          {/* 혼합 선택 전용 — **모바일 배포 폼 아래** 한 줄(E22-U14-7).
              이 폼은 문항 축만 보낸다(deployStudioQuestions). 학습지 배포는
              서버 계약 자체가 다르고(passageId 단수 + 클래스 링크 + PRIME 한정 —
              actions/studio/deploy.ts:219-250,346-356) 폼 재료도 PassageDossier 라,
              여기 복제하지 않고 정본 실행대로 보낸다. §M 실행대 열기 = 모바일
              배포 폼 진입이므로 off 면 미렌더 */}
          {SHOW_MOBILE && count > 0 && sheetCount > 0 ? (
            <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
              <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-slate-500 break-keep">
                학습지 {sheetCount}건은 우측 실행대에서 배포합니다
              </p>
              <button
                type="button"
                aria-disabled={!canOpenSheetRail}
                title={sheetRailReason}
                onClick={openSheetRail}
                className={
                  canOpenSheetRail
                    ? "shrink-0 cursor-pointer rounded-md border border-blue-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                    : "shrink-0 cursor-not-allowed rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-400"
                }
              >
                실행대 열기
              </button>
            </div>
          ) : null}

          {/* 학습지 축 비활 사유 — 문항 축 rose 배너와 **별개 문단**(E22-U14-8).
              title 만으로는 마우스 없는 사용자에게 닿지 않는다(실행대 정본
              sheets-action-rail.tsx:362-368 과 같은 이유·같은 amber 문법).
              §M 사유 전부(1건씩만·PRIME 한정·실행대 안내)가 모바일 배포 계열이라
              off 면 미렌더 — 걸린 버튼 자체가 없다 */}
          {SHOW_MOBILE && sheetRailReason ? (
            <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] font-medium leading-relaxed text-amber-700 break-keep">
              {sheetRailReason}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
