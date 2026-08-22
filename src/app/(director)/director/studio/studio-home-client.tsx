"use client";

// ============================================================================
// 클래스 스튜디오 홈 — 클래스-우선 워크벤치 (docs/class-studio-spec.md §3.10)
//
// 시선 흐름 = 좌(①대상: 클래스+학생 체크) → 중(②자료: 클래스 스코프 지문함)
// → 우(③배포: 지문 도시에 = 배포 실행대). 이 파일은 오케스트레이터 — 상태
// 소유·액션 결선·프레임만 갖고, 각 판(pane)의 실체는 workbench/ 하위 소유
// 파일에 있다. 레일 「학생 추가」의 학생 등록 모달·초대 키트 시트(§3.2·§5
// 재사용)도 여기서 호스팅한다(초대 시트 z-90 은 모달 z-70 위 중첩).
//
// 프레임 정본(§3.1.0): 블리드는 StudioShell 실측(-mx-3/-mt-3/-mb-3, md:-m-6),
// 페이지 스크롤 없음(열별 독립 스크롤), 상단바 h-12 + pr-16(전역 플로팅 회피),
// 패널 폭·접기 = useResizablePanels(storageKey "studio-workbench-panels").
// 큐 엔진(usePassageQueue)은 useStudioQueue 로 워크벤치당 정확히 1개(§3.7.2).
//
// §3.10 위계: 중앙 = 클래스 미선택이면 단계 가이드(클래스-우선 구조 강제),
// 선택이면 지문함. 우측 = 도시에 아코디언(지문 선택 시) 또는 빈 상태 1줄 —
// ClassPanel(E5)·BatchGeneratePane(E6)·배포 모달 경유(E4)는 전면 폐기됐다.
// 배포 대상은 레일 체크(checkedByClass → StudioDeployTarget)로 접어 도시에
// 인라인 폼에 내리고, 생성 큐 3원천(모듈 분석·실전 워크북·문항)은
// queueItemsByPassage 로 접어 도시에 「생성 중」 스트립에 내린다(§3.10.6).
// 도시에 조회는 지연 1회 + Map 캐시 — 자동 갱신은 **조용한 재조회**(silent,
// ready 유지)만 쓴다: 활성 시그니처 소멸 전이 + 배포 성공 업링크가 트리거.
// §3.10.11(E9~E11): 생성 스트리밍 꼬리는 스트림 스토어(ref 소유 1개, React 밖)
// 로만 나르고 — 표시 리렌더는 QueueStreamLine 키 구독 1개 — 발사 순간
// (launchSig 신규 토큰 전이 — 이 표면 발사분 한정)에는 그 지문 카드를 1회
// 자동 펼침한다.
//
// §3.10.21(E21 학습지 조판): 문항 축에 있던 배선을 **학습지(문서) 축에 동형
// 복제**했다 — 신규 레이아웃 코드는 0줄이다. 상태 3개(sheetComposeOpen ·
// pickedSheets(Map, 삽입 순서 = 조판 순서) · activeSheetId)를 이 파일이 소유
// 하고(우측 본문이 aside/드로어 2트리에 렌더돼 별개 인스턴스가 되므로 —
// :1409-1414 와 같은 근거), 레이아웃 뒤집기 2곳은 composeVisible 을
// anyComposeVisible(= 시험지 ∪ 학습지)로 바꾸는 것으로 끝난다. 두 조판은
// centerAssetView 값 하나로 **구조적 상호배제**이고, 각자 숨김 마운트로
// 보존되는 동안의 전역 오염(print-root id·인쇄 par-root)은 표면이 내리는
// printRootId/printExclude 가 막는다. 학습지 조판 뷰의 우측은 이제 도시에가
// 아니라 SheetsActionRail(실행대)이다 — 구 문맥 불일치 문구가 사라진 자리.
//
// §3.10.22(E22 조판실) → **§3.10.23(E24)에서 되돌려졌다**: E22 는 문제관리·
// 학습지 관리 두 뷰를 「조판실」 한 뷰로 접었고, 그 때문에 위 문단이 근거로
// 삼던 「두 조판은 centerAssetView 값 하나로 구조적 상호배제」가 소멸해
// 상호배제를 명시 상태 `composeMode(null|"exam"|"sheet")` 로 이사해야 했다.
// E24 가 조판실을 **[학습지 조판 | 시험지 조판] 2필로 해체**하면서 그 전제가
// 다시 성립하므로 `composeMode` 는 **전량 폐지**됐다 — 가시 산식은 다시
//     composeVisible      = examStudioOpen   && centerAssetView === "exam"
//     sheetComposeVisible = sheetComposeOpen && centerAssetView === "sheet"
// 두 줄이다. 이 되돌림의 전제 조건은 **개방 경로가 자기 뷰를 강제하는 것**이다
// (아래 【E24 최상위 불변식】 주석 — 강제가 빠지면 표면이 열렸는데 영원히
// 안 보이거나, 반대로 두 print-root 가 동시 가시가 되어 인쇄가 백지로 나온다).
// 우측 실행대도 「두 실행대 스택」에서 **자기 축 실행대 + 반대 축 요약 스트립**
// 으로 바뀌었다(E24 §⑥): 반대 축 full 실행대를 상대 뷰에 두면 그 CTA 가
// 사용자를 방금 고른 탭 밖으로 튕겨 내 「내가 어디 있는지 모르겠다」는 바로 그
// 지시 원문이 재생산된다. 두 배포 서버 계약이 원리적으로 다르다는 사실
// (다지문 1과제 vs passageId 단수 + 클래스 링크 + PRIME 한정 —
// actions/studio/deploy.ts:219-250,346-356)은 그대로라 **두 CTA 를 합치지
// 않는다**. 6장 하드 상한은 폐기됐다(E22-0 3번).
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ClipboardList,
  GraduationCap,
  LayoutTemplate,
  PanelLeft,
  PanelRight,
  School,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  archiveStudioClass,
  createStudioClass,
  listStudioClasses,
  renameStudioClass,
  type StudioClassRow,
} from "@/actions/studio/classes";
import {
  getStudioPassageDossier,
  getStudioQuestionCard,
} from "@/actions/studio/dossier";
import {
  addPassagesToStudioClass,
  listStudioClassPassages,
  removePassagesFromStudioClass,
  type StudioPassageRow,
} from "@/actions/studio/passages";
import {
  typeLabel,
  type QueueItem,
} from "@/app/(director)/director/workbench/generate/generate-page-types";
import { useGenerationSessionQueue } from "@/app/(director)/director/workbench/generate/generation-session-store";
import { CoachMark } from "@/components/studio/coach";
import { StudioTour } from "@/components/studio/tour/engine";
import { TOUR_OPEN_EVENT } from "@/components/studio/tour/types";
import {
  PanelHandle,
  useResizablePanels,
} from "@/components/layout/resizable-panels";
import { QUESTION_TYPES } from "@/lib/constants";
import { readQuestionTypeDifficultySetting } from "@/lib/question-type-generation-settings";
import { planForDifficulty } from "@/lib/question-generation-plans";
import { isSectionBackedModuleId } from "@/lib/studio/module-sections";
import { STUDIO_MODULE_BY_ID } from "@/lib/studio/modules";
import type { SheetPickMeta } from "@/lib/studio/sheet-pick-types";
import {
  confirmSheetComposeCollapse,
  confirmSheetPickRemoval,
} from "@/lib/studio/sheet-compose-dirty-guard";
import { sheetProductLabel } from "@/lib/studio/sheet-products";
// (E22-0 3번) 구 `SHEET_COMPOSE_MAX_DOCS`(=6) import 는 **폐기**했다 — 이 파일이
// 소유하던 클램프 4지점(applySheetPicked · toggleSheetPick · composeSheetFromRow ·
// composeSheetsFromDossier)과 고지 자구 1개가 함께 사라졌다. 근거였던 「pages JSON
// 이 문서당 수 MB 급」은 감독 실측으로 반증됐고(중앙값 49KB · 최대 458KB · 40건
// 합계 1.9MB), 렌더 곡선도 초선형이 아니다(조판 아이템 30→300 에서 토글
// 890ms→883ms, 아이템당 약 1.3ms). 남은 방어는 ① 서버 요청 배치 상한 12
// (`SHEET_COMPOSE_DOC_BATCH` — worksheet-docs.ts:131) ② 클라 청크 로딩
// (sheet-compose-surface.tsx) ③ 콘텐츠 축 소프트 경고 3층이며, **셋 다 막지 않는다**.
import {
  createStreamTailStore,
  type StreamTailStore,
} from "@/lib/studio/stream-tail-store";
import {
  collectPassageActivity,
  passageActivitySignature,
  type PassageActivityEntry,
} from "@/lib/passage-activity";
import { listStudioClassRosters } from "@/actions/studio/students";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { InviteKitSheet } from "./c/[classId]/invite-kit-sheet";
import { StudentAddModal } from "./c/[classId]/student-add-modal";
import { ClassTree, type ClassStudentsState } from "./workbench/class-tree";
import type {
  DossierQueueItem,
  StudioDeployTarget,
} from "./workbench/deploy-target";
import type { PickedQuestionMeta } from "./workbench/dossier-pick-bar";
import { ExamComposeSurface } from "./workbench/exam-compose-surface";
import { LibraryPane, type QuestionGenBridge } from "./workbench/library-pane";
import { QuestionsActionRail } from "./workbench/questions-action-rail";
import { SheetComposeSurface } from "./workbench/sheet-compose-surface";
import { SheetsActionRail } from "./workbench/sheets-action-rail";
import type { StudioAssetView } from "./workbench/source-switcher";
import { StepGuidePane } from "./workbench/step-guide-pane";
import { StepStrip } from "./workbench/step-strip";
import {
  DossierQuestionModal,
  PassageDossierAccordion,
  type DossierFetchState,
  type DossierPassageRef,
  type DossierQuestionState,
} from "./workbench/passage-dossier-pane";
import {
  WorkbookGenerateModal,
  type WorkbookModalPassage,
} from "./workbench/workbook-generate-modal";
import {
  useStudioQueue,
  type StudioQueueStamp,
} from "./workbench/use-studio-queue";

// §M(26-08-22) 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비(prop 화 금지).
// false(기본)면 이 오케스트레이터는 ① 행 [모바일 배포] 채널(onDeploySheet/
// onSheetDeploy)을 내리지 않고 ② 초대 키트 동선(자동 오픈·시트 렌더)을 봉인하며
// ③ 우측 빈 상태 카피를 조판 단독형으로 바꾼다. 같은 개정으로 composeNudge
// (생성 완료 → 조판 유도 펄스) 엔진이 추가됐다 — 이는 플래그와 무관하게 동작.
// 복구: NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

// 클래스별 등록 지문 캐시 — 구 트리 펼침용이었으나 §3.1.1v2(레일은 자료를
// 보여주지 않음)부터는 중앙 담기 스코프(registeredIds)·스코프 칩 전용이다.
type ClassChildrenState = StudioPassageRow[] | "loading" | undefined;

// ── 생성 모달 (1필드 — §3.1, 부제·타이포는 26-08-10 감사 D7 개정) ────────────

function CreateClassModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("클래스 이름을 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const res = await createStudioClass({ name: trimmed });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "클래스 생성에 실패했습니다.");
        return;
      }
      toast.success(`「${trimmed}」 클래스를 만들었습니다.`);
      setName("");
      onCreated(res.data.id);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="새 클래스 만들기"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <School className="h-4 w-4 text-blue-600" />
          </span>
          <div>
            <h2 className="text-[13.5px] font-bold text-slate-900">새 클래스 만들기</h2>
            <p className="text-[11.5px] text-slate-400">
              이름만 입력하면 됩니다. 나머지는 나중에 설정합니다.
            </p>
          </div>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          placeholder="예: 한영고 1학년 내신 심화반"
          maxLength={60}
          className="mt-4 h-9 w-full rounded-lg border border-slate-200 px-3 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-lg px-3 text-[12.5px] font-medium text-slate-500 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="flex h-9 items-center rounded-lg bg-blue-600 px-3.5 text-[12.5px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "만드는 중…" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 워크벤치 ─────────────────────────────────────────────────────────────────

// §3.8.1 은 우측을 고정 폭(360px)으로 뒀으나, §3.9v2 로 도시에·일괄 생성 패널이
// 상주하게 되면서 2026-08-11 사용자 지시로 리사이즈·접기를 복원한다(트리와 동일
// 핸들 — 직접 DOM+rAF 고속 경로). 키는 "dossier"(신규) — 구 §3.8.1 이전의
// "panel" localStorage 잔존값(폭·접힘)이 되살아나지 않게 개명한다(훅이 모르는
// 키는 자연 무효). min 320 은 xl 미만 드로어 실측 폭과 동일한 하한.
const PANEL_SPECS = [
  { key: "tree", min: 200, max: 340, defaultWidth: 248, sign: 1 as const },
  // dossier max 960(§3.10.17-a v2): 우측 내장 조판이 드래그로 넓힐 수 있게
  // 상한을 올린다(구 560). 기본 폭·최소는 불변.
  { key: "dossier", min: 320, max: 960, defaultWidth: 360, sign: -1 as const },
];

// 구 도시에 표시 상한(§3.9v2.1 MAX_DOSSIER_PASSAGES=5)은 §3.10.17-e 로 폐기 —
// "누구 마음대로 최근 5개만"(사용자). 조회는 fetch-on-expand 라 전량 나열해도
// 접힘 헤더(제목 1줄) 렌더 비용뿐이다.

// 신규 문항 글로우 시간 폴백(§3.10.11-e v2) — 세션 diff 는 새로고침에 증발하므로
// 조회 시점 기준 최근 30분 생성분도 "방금 만든 것"으로 취급한다(settle 에서 판정).
const FRESH_QUESTION_WINDOW_MS = 30 * 60_000;

// 문항 유형 value → 한글 라벨(도시에 생성 중 스트립 — §3.10.6 자구 "유형·N문항").
const QUESTION_TYPE_LABEL_MAP = new Map<string, string>(
  QUESTION_TYPES.map((t) => [t.value, t.label]),
);
// 세션 큐 config.typeCounts 의 키는 **생성 유형 id**(EXAM_TYPE_GROUPS 계보,
// 예: GRAMMAR_ERROR)라 DB 문항 타입 맵(QUESTION_TYPES)에 없는 값이 온다 —
// typeLabel(생성 계보 정본)을 1순위로, DB 맵을 폴백으로 해석한다
// (26-08-12 행동 게이트 G4a 실증: 무해석 원시 id "GRAMMAR_ERROR" 노출).
function questionTypeLabelOf(raw: string): string {
  const viaExam = typeLabel(raw);
  if (viaExam !== raw) return viaExam;
  return QUESTION_TYPE_LABEL_MAP.get(raw) ?? raw;
}
// 유형 라벨("첫 유형" 또는 "첫 유형 외 N유형")·총 문항·**실효** 난이도/플랜 —
// 스트립 라벨 자구와 큐 항목 배지(§3.10.11-c badges)가 같은 도출을 공유한다.
// ⚠ 난이도·플랜은 config 전역값이 아니라 유형별 설정(questionTypeSettings —
// 모달 「이 유형만」 세그먼트)이 우선이다: 발사 경로(use-workspace-generation)·
// 서버와 같은 정본 리더로 해석한다. 전역만 읽으면 킬러·프리미엄 발사가 중급·
// 일반 배지로 오표시된다(26-08-12 사용자 실측). 유형 간 값이 갈리면 해당
// 배지는 생략(허위 단일 표기 금지 — fast 유닛은 유형당 1카드라 실전에선 단일).
function questionQueueBadge(config: QueueItem["config"] | undefined): {
  type: string;
  count: number;
  difficulty?: string;
  plan?: "STANDARD" | "PREMIUM";
} | null {
  const entries = Object.entries(config?.typeCounts ?? {}).filter(
    ([, n]) => n > 0,
  );
  if (entries.length === 0) return null;
  const first = questionTypeLabelOf(entries[0][0]);
  const diffs = new Set<string>();
  const plans = new Set<"STANDARD" | "PREMIUM">();
  for (const [typeId] of entries) {
    const settings = config?.questionTypeSettings?.[typeId];
    const difficulty = readQuestionTypeDifficultySetting(
      settings,
      config?.difficulty,
    );
    diffs.add(difficulty);
    // 26-08-18 난이도 기반 티어: 플랜은 실효 난이도에서 유도(요청 generationPlan 은
    // 서버가 무시 — 같은 규칙으로 배지를 그려야 표시≠청구 불일치가 없다).
    plans.add(planForDifficulty(difficulty));
  }
  return {
    type: entries.length > 1 ? `${first} 외 ${entries.length - 1}유형` : first,
    count: entries.reduce((acc, [, n]) => acc + n, 0),
    difficulty: diffs.size === 1 ? [...diffs][0] : undefined,
    plan: plans.size === 1 ? [...plans][0] : undefined,
  };
}
function questionQueueLabel(
  config: QueueItem["config"] | undefined,
  queued?: boolean,
): string {
  // 전역 동시성(≤5) 때문에 아직 시작 못 한 발사분은 「대기 중」 — 시작도 안 한
  // 작업을 「생성 중」으로 적으면, 정말 끝났는데 안 사라지는 항목과 화면상
  // 구분이 안 된다(26-08-18).
  const tail = queued ? "대기 중" : "생성 중";
  const badge = questionQueueBadge(config);
  if (!badge) return `문제 ${tail}`;
  return `${badge.type} · ${badge.count}문항 ${tail}`;
}
/**
 * 분석 큐 running 자구 — 도시에 큐 스트립(§3.10.6)과 지문 행 활동 표식
 * (§3.10.20)이 **같은 한 곳**에서 읽는다. 두 벌로 복제하면 상품 개명·모듈
 * 추가 때 한쪽만 고쳐져 같은 잡이 자리에 따라 다른 이름으로 보인다.
 *
 * · 학습지 상품 발사(E19-4)가 우선 — 상품명이 곧 산출물 이름이다.
 * · 구 섹션 종량제 스탬프(sheet 부재)는 기존 모듈 나열 라벨 그대로.
 * · launchWorksheet 성공이 스탬프에 합류시키는 "exam" 이 분석 라벨을
 *   「…·실전 문제 생성 중」으로 오염하지 않게 섹션 분석 모듈로 한정한다
 *   (실전은 별도 항목 — §3.10.11-c).
 */
function analysisRunningLabel(stamp: StudioQueueStamp | undefined): string {
  if (stamp?.sheet) return `${sheetProductLabel(stamp.sheet)} 생성 중`;
  const modules = stamp?.modules.filter(isSectionBackedModuleId) ?? [];
  if (modules.length === 0) return "학습지 생성 중";
  return `${modules
    .map((m) => STUDIO_MODULE_BY_ID.get(m)?.label ?? m)
    .join("·")} 생성 중`;
}

// ── 학습지 조판 축 순수 헬퍼(§3.10.21 E21-5) ─────────────────────────────────
// 모듈 최상위에 둔다 — 컴포넌트 안의 일반 함수로 두면 useCallback deps 에 걸려
// 안정 참조가 깨지고, useCallback 으로 감싸면 파생값 의존 탓에 React Compiler
// 의 메모 보존 규칙과 부딪친다(questions-action-rail.tsx:150-151 동일 판단).

/**
 * reportId → SheetPickMeta 복원.
 *
 * 도시에 행의 [학습지 조판]은 **id 배열만** 올린다(passage-dossier-pane.tsx:207
 * — 행은 "무엇을 조판할지"만 말하고 메타 조립은 상위 몫). 그런데 그 배열에는
 * *아직 체크되지 않은 이 행*이 섞여 있을 수 있으므로(:923-926 composeIdsWith),
 * 대기열에 없는 id 는 도시에 캐시에서 되찾아야 한다.
 *
 * `DossierSheetRow` 에는 passageId/passageTitle 이 없다(dossier-types.ts:83-91 —
 * 도시에는 지문 1건 스코프라 서버가 싣지 않는다). 그래서 **행을 찾은 그 도시에의
 * `passage`** 에서 두 필드를 채운다 — passage-dossier-pane.tsx:900-907 sheetMeta
 * 와 같은 조립이며, 값이 갈리면 저장 PATCH·모바일 배포가 엉뚱한 지문으로 흐른다.
 */
function resolveSheetPickMeta(
  reportId: string,
  picked: ReadonlyMap<string, SheetPickMeta>,
  states: ReadonlyMap<string, DossierFetchState>,
): SheetPickMeta | null {
  const cur = picked.get(reportId);
  if (cur) return cur;
  for (const st of states.values()) {
    if (st.status !== "ready") continue;
    const row = st.dossier.sheets.find((r) => r.reportId === reportId);
    if (!row) continue;
    return {
      reportId: row.reportId,
      passageId: st.dossier.passage.id,
      title: row.title,
      passageTitle: st.dossier.passage.title,
      planMarker: row.planMarker,
      status: row.status,
    };
  }
  return null;
}

/**
 * 다음 활성 문서 id. 현재 활성이 새 대기열에 살아 있으면 **그대로 둔다** —
 * 활성 전환은 미저장 편집을 날리므로(편집기 `key` 교체 재마운트, E21-6-4)
 * 필요 없을 때 건드리지 않는 것이 계약이다. 살아 있지 않으면 선호 후보(방금
 * 조판을 누른 행) → 대기열 첫 문서 → null 순으로 내려간다.
 */
function pickActiveSheetId(
  next: ReadonlyMap<string, SheetPickMeta>,
  current: string | null,
  prefer?: string,
): string | null {
  if (current && next.has(current)) return current;
  if (prefer && next.has(prefer)) return prefer;
  for (const id of next.keys()) return id;
  return null;
}

/**
 * [E27 개명·확장 — 구 이름 `withActiveSheetFirst`] 대기열을 **지문 그룹 단위**로
 * 재정렬한 Map. 구 함수는 「활성 문서를 맨 앞으로 재삽입」만 했고, E27 이 그 위에
 * **지문(passageId) 묶음** 축을 얹었다(E27-SPEC §2 R1-2 — 아래 [E27] 절).
 * **키 시퀀스가 기존과 같으면 같은 참조를 그대로**
 * 돌려준다(조판 표면은 `picked` 참조가 바뀔 때만 재조회한다 — 아래 pickedSheets 선언
 * 주석의 계약. `sheet-compose-surface.tsx` 의 조회 effect 는 "이미 캐시/드롭/인-플라이트"
 * 를 걸러 내므로 순서만 바뀐 새 Map 은 요청 0건이다 — 실측 CONSOLE ERRORS: [] · 재조회 없음).
 *
 * ─ 왜 필요한가(실측) ────────────────────────────────────────────────────────────
 * 합성 스트림은 활성 문서가 **무조건 선두**다: `compose/compose-flow.ts:207`
 * `const flowItems: FlowItem[] = [...activeItems]` 뒤에 `:283` 이 부착 문서를 순차 push.
 * 반면 화면의 순번 숫자는 전부 **이 Map 의 삽입 순서**에서만 파생된다 —
 * `composer-list-pane.tsx:544`(sheetOrder — 병합 목록 학습지 행 배지) ·
 * `passage-dossier-pane.tsx:965`(sheetOrderById · 툴팁 `:761` 「체크 순서 N번 — 학습지
 * 조판 순서」+배지) · `sheet-compose-surface.tsx:1122,1143`(칩 `index + 1`). 두 축이 갈리면 인쇄물이 화면 숫자와 다른 순서로 나온다:
 * 3장을 1→2→3 으로 체크한 뒤 3번 칩을 눌러 활성 전환하면 실제 조판은 **3,1,2**
 * 인데 배지는 그대로 1,2,3 이었다(프로브 `_audit-l3-a.mjs` A①b docSeq 실측 ·
 * 스크린샷 `.tmp-worksheet-compose/shots/l3a/a2-active-switch-to-3.png`).
 * 칩 클릭만의 문제가 아니다 — A·B·C 를 체크한 뒤 **B 행의 [학습지 조판]** 을 누르면
 * (`composeSheetFromRow` → `pickActiveSheetId(prefer=B)`) active=B 라 인쇄는 B,A,C 다.
 * 수정 후 실측(`.tmp-worksheet-compose/_zz-fixer-order.mjs` · `_zz-fixer-order2.mjs`):
 *   칩3 활성화 → docSeq `[ACTIVE(3),1,2]` · 행 배지 `3:1 / 1:2 / 2:3` · 칩 `1(3),2(1),3(2)`
 *   B행 조판   → docSeq `[ACTIVE(B),A,C]` · 행 배지 `B:1 / A:2 / C:3` (3표면 전원 일치).
 *
 * ─ 왜 이 방향으로 고치는가 ──────────────────────────────────────────────────────
 * 숫자를 조판 순서에 맞추는 길은 둘인데(① 활성 인덱스를 합성 스트림까지 내려보내
 * 활성을 제자리에 조판 ② 삽입 순서 자체를 조판 순서로 맞춤), ②가 **한 곳만 고쳐
 * 3표면이 동시에 정합**해진다 — 세 숫자가 이미 전부 이 Map 파생이기 때문이다.
 * ①은 `compose-flow`/편집기/표면 3층에 활성 위치 인자를 새로 뚫어야 하고, 활성
 * 아이템 선두의 `breakBefore` 를 편집기 소유 FlowItem 에 얹어야 해서(문서 경계 =
 * 새 페이지 — compose-flow.ts:254 `if (i === 0) ns.breakBefore = true`) 편집 계약까지
 * 건드린다.
 *
 * ─ [E27] 그 위에 얹은 지문 그룹 축 ─────────────────────────────────────────────
 * 규칙 4개(E27-SPEC §2 R1-2 원문 그대로):
 *  1) 그룹 = `passageId`. 그룹 순서 = 현재 Map 에서의 **첫 등장 순서**.
 *  2) `activeId` 가 있으면 그 문서의 그룹을 **맨 앞**, 그 그룹 안에서 그 문서를 **맨 앞**.
 *     (compose-flow 가 활성 문서를 스트림 선두에 두므로 이래야 Map 순서 = 인쇄 순서다 —
 *      위 실측이 세운 「선두 = 활성 = 인쇄 첫 문서」 불변식을 그룹 축 위에서 재현한 것.)
 *  3) 그룹 내부 상대 순서는 보존.
 *  4) **키 시퀀스가 기존과 동일하면 원본 참조를 그대로 반환**.
 *
 * ⚠ 4)가 정렬 effect 의 **유일한 무한루프 방지 장치**다. 구 코드의
 *   `firstId === activeId` 조기 반환이 하던 역할인데, 이제는 선두 1개가 아니라
 *   **시퀀스 전체**를 비교해야 한다 — 활성이 이미 선두여도 그룹 축이 뒤쪽 순서를
 *   바꿀 수 있어서, 선두만 보고 조기 반환하면 「매 패스마다 새 Map → setState →
 *   같은 effect 재발화」가 영원히 돈다(에러 0 · 콘솔 0 · 화면만 멈춘다).
 *   수렴 증명은 정렬 effect 바로 위 【수렴 증명】 주석에 있다.
 *
 * ⚠ 지문이 1종뿐이거나 픽이 0~1건이면 그룹 축은 **아무것도 바꾸지 않는다** — 산출
 *   시퀀스가 활성-선두 규칙만 적용한 구 동작과 글자 그대로 같다(무회귀).
 */
function withPassageGroupedOrder(
  picked: ReadonlyMap<string, SheetPickMeta>,
  activeId: string | null,
): ReadonlyMap<string, SheetPickMeta> {
  // 0~1건은 어떤 규칙으로도 이미 정렬돼 있다 — 참조 유지가 곧 재조회 0이다.
  if (picked.size < 2) return picked;

  // ① 그룹 버킷. Map 삽입 순서가 곧 규칙 1)의 「첫 등장 순서」다(별도 정렬 없음).
  const groups = new Map<string, string[]>();
  for (const [id, meta] of picked) {
    const bucket = groups.get(meta.passageId);
    if (bucket) bucket.push(id);
    else groups.set(meta.passageId, [id]);
  }

  // ② 활성 그룹 판정. activeId 가 대기열에 없는 프레임(프룬 직전)에는 활성 규칙만
  //    조용히 빠지고 **그룹 정렬은 그대로 돈다** — 호출부 effect 가 같은 커밋에서
  //    activeSheetId 를 수렴시키므로 여기서 조기 반환할 이유가 없다.
  const activeMeta = activeId === null ? undefined : picked.get(activeId);
  const activeGroupKey = activeMeta === undefined ? null : activeMeta.passageId;

  const nextKeys: string[] = [];
  const pushGroup = (key: string) => {
    const bucket = groups.get(key);
    if (!bucket) return;
    const isActiveGroup = key === activeGroupKey && activeId !== null;
    // ③ 그룹 내부 상대 순서 보존 — 활성 문서 하나만 자기 그룹의 선두로 끌어올린다.
    if (isActiveGroup) nextKeys.push(activeId);
    for (const id of bucket) {
      if (isActiveGroup && id === activeId) continue;
      nextKeys.push(id);
    }
  };
  if (activeGroupKey !== null) pushGroup(activeGroupKey);
  for (const key of groups.keys()) {
    if (key === activeGroupKey) continue;
    pushGroup(key);
  }

  // ④ 시퀀스 동일 → 원본 참조. **이 비교를 지우면 정렬 effect 가 무한 루프다.**
  let i = 0;
  let same = true;
  for (const id of picked.keys()) {
    if (nextKeys[i] !== id) {
      same = false;
      break;
    }
    i += 1;
  }
  if (same) return picked;

  const next = new Map<string, SheetPickMeta>();
  for (const id of nextKeys) {
    const meta = picked.get(id);
    if (meta !== undefined) next.set(id, meta);
  }
  return next;
}

/**
 * [E27] `withPassageGroupedQuestionOrder` 는 **`@/lib/studio/pick-order` 로 이사했다.**
 * 조판 표면도 같은 규칙을 써야 하는데 표면이 이 파일을 import 하면 순환이 되기 때문이다
 * (이 파일 :149 가 이미 표면을 import 한다). 여기로 되돌리지 마라.
 *
 * ⚠ 그 함수를 **이 파일에서 호출하지 마라** — 문항 축(`flatPicked`)은 체크 순서가 정본이고
 *   재정렬은 조판 표면의 파생 계산에서만 한다(아래 「교차축 정정」 절 참조).
 */

/** 「조판이 통째로 사라진다」를 정본 가드에 넘길 때 쓰는 빈 대기열(참조 고정). */
const EMPTY_SHEET_PICKS: ReadonlyMap<string, SheetPickMeta> = new Map();

// (구 `SHEET_CAP_MESSAGE` 는 상한 폐기와 함께 소멸 — 「먼저 고른 6장을 유지합니다」
//  라는 문장이 가리키던 클램프 자체가 없어졌으므로 자구만 남기면 거짓말이 된다.)

/* ══ 【E24 최상위 불변식】 조판 개방 = open 플래그 + **자기 뷰 강제**, 한 커밋에 ══
 *
 * §3.10.23(E24)에서 「조판실」 1필이 [학습지 조판 | 시험지 조판] 2필로 해체되면서,
 * E22-3 이 신설했던 명시 상태 `composeMode` 는 **폐지**됐다. 상호배제가 다시
 * `centerAssetView` 값 하나로 구조적으로 성립하기 때문이다(가시 산식 2줄은
 * composeVisible/sheetComposeVisible 선언부 참조). **뷰가 곧 모드다.**
 *
 * 그 대가로 이 파일의 조판 **개방 경로 6개**가 아래 두 가지를 반드시 **함께**
 * 커밋해야 한다 — 하나라도 빠지면 타입 에러 0 · 콘솔 0 으로 조용히 깨진다:
 *   (a) 자기 open 플래그를 켠다        — setExamStudioOpen / setSheetComposeOpen
 *   (b) 자기 뷰로 강제 전환한다        — composeViewControlRef(exam) /
 *                                        sheetComposeViewControlRef(sheet)
 *
 *   exam  축: openComposeFromFlat · openComposeFromDossier
 *   sheet 축: openSheetComposeFromRail · composeSheetFromRow ·
 *             composeSheetsFromDossier · openCombinedCompose
 *   (+E25 §3.10.24) 제7 경로 = 「선택 즉시 조판」 효과(autoComposePrevRef 아래) —
 *   발화 전제조건이 「이미 그 뷰」라 (b) 가 조건으로 충족되는 **유일한** 경로다.
 *   다른 곳에서 이 모양을 흉내내 (b) 를 생략하지 마라 — 전제조건 없는 생략은
 *   아래 두 사고 중 하나로 직행한다.
 *
 * ─ 어기면 무슨 사고가 나는가 ─────────────────────────────────────────────────
 *  · (b) 누락 → 표면은 열렸는데 가시 산식이 거짓이라 **영원히 안 보인다**.
 *    에러 0 · 경고 0. 사용자에게는 정확히 "버튼이 안 먹는다"로 보인다.
 *  · (a) 만 남고 뷰가 반대로 갈리면 → 두 print-root(`#exam-paper-print-root` 와
 *    `#sheet-compose-print-root`/`.par-root`)가 **동시 가시**가 되어
 *    **인쇄가 백지**로 나온다(report-styles.ts:1878-1885 — 다중 루트가 같은
 *    좌표에 겹친다). 화면상 이상 0 · 콘솔 0 · **PDF 로만** 드러난다.
 *
 * 그래서 (a)(b) 를 **다른 커밋으로 나누지 마라.** 뷰 분할과 composeMode 제거를
 * 따로 하면 어느 쪽을 먼저 해도 위 두 실패 중 하나가 열린다(E24-SPEC §1②-a).
 * DOM 축 감시 계기는 hasRightPanel 아래 useEffect(§②-b) — 파생값이 아니라
 * **인쇄 대상 루트 개수**를 직접 재므로 `active` prop 누락까지 잡는다.
 * ═════════════════════════════════════════════════════════════════════════ */

// ── 조판 파기 고지 자구(감사 L3-interaction #2·#3 수정) ──────────────────────
// **왜 필요한가**: 학습지 조판 표면은 자기 손으로 닫히거나 활성 문서를 바꿀 때
// dirty confirm 을 이미 단다(sheet-compose-surface.tsx:420·434). 그런데 조판을
// **오케스트레이터가 밖에서 닫아 버리는** 경로 2개는 그 가드를 통째로 우회했다:
//   · 클래스 전환 리셋 effect(:1610-1618) — 프로브 `_audit-l3-d.mjs ⑧b`:
//     dirty 2 상태에서 「1학년」 클릭 → `{"surface":0,"railPick":0,"dialogs":[]}`
//     (confirm 0건, 조판·선택·편집 전부 소멸).
//   · 행 [모바일 배포](deploySheetFromRow) — 프로브 `_audit-l3-e.mjs E1`:
//     `picked: 3 dirty: 2` → 클릭 → `{"picked":1,"surface":0,"formOpen":0}`.
// 학습지 편집기에는 **IndexedDB 초안 보관이 없다**(같은 파일 :417-427 주석 —
// 저장은 명시 PATCH 뿐). 시험지 조판(exam-compose-surface.tsx:107-110)과 달리
// 복구 경로가 0이라, 밖에서 닫을 때도 같은 계열의 고지가 있어야 한다.
//
// **두 갈래로 묻는다(중복 confirm 0 보장 — if/else 1회)**:
//   ① 대기열 2장 이상 → 아래 자구. 편집을 안 했어도 6장까지 쌓은 대기열이
//      통째로 사라지는 것 자체가 되돌릴 수 없는 손실이라 dirty 와 무관하게 묻는다.
//   ② 1장 이하 → `confirmSheetPickRemoval`(sheet-compose-dirty-guard.ts 정본
//      싱글턴 프로브). dirty 가 아니면 **조용히 통과**한다 — 잃을 것이 없는데
//      묻는 confirm 은 사용자가 confirm 자체를 무시하게 만든다.
//
// ── 【E24 수리, 적대 검수 minor】 판정축은 「조판이 열렸는가」가 아니라 ─────────
//    **「파괴할 것이 있는가」**다.
// 구 조기 반환은 `if (!sheetComposeOpenRef.current) return true;` — 즉 조판이
// 닫혀 있으면 대기열이 몇 장이든 **무조건 통과**했다. 그런데 대기열은 조판 표면과
// 수명이 다르다: 사용자는 조판을 열지 않은 채로도 목록·도시에에서 학습지를 골라
// 담고, 그 **Map 삽입 순서 자체가 인쇄 순서**(무회귀 계약 §2-1)라 순서 자체가
// 작업물이다. 5장을 순서대로 담아 둔 사용자가 여섯 번째 행의 [모바일 배포] 를
// 잘못 누르면 구 코드에서는 **확인 한 번 없이** 5장이 1장으로 덮어써졌다
// (deploySheetFromRow 가 `setPickedSheets(new Map([[reportId, meta]]))` 로
//  대기열을 통째로 갈아치운다). 같은 함수가 ① 에서 이미 「2장 이상은 dirty 와
// 무관하게 묻는다」를 기준으로 갖고 있었는데, 그 기준이 조판 개방 여부라는
// **무관한 축**에 가려 있었던 것이다.
// → 조기 반환은 `!open && count <= 1` 일 때만. 조판이 닫혀 있어도 2장 이상이면
//   ① 로 떨어져 묻는다.
//
// ⚠ 그래서 자구가 2벌이다. 구 자구는 "학습지 조판에 올려 둔"·"조판을 닫고"라고
//   말하는데 **조판이 닫힌 상태에서는 그 말이 거짓**이고, 거짓인 경고는 사용자가
//   confirm 자체를 무시하게 만든다(= ② 가 dirty 아닐 때 조용히 통과하는 것과 같은
//   이유). `open` 자구는 **한 글자도 바꾸지 않고**(감사 L3-interaction #2·#3 에서
//   굳은 자구) `closed` 만 새로 쓴다 — 닫힌 상태에는 잃을 「미저장 편집」이 없고
//   (표면 미마운트) 잃는 것은 **담아 둔 순서**뿐이라 그것만 말한다.
// 빈 Map 을 next 로 넘기는 이유: 두 경로 모두 조판 표면을 통째로 언마운트하므로
// 「활성 문서가 대기열에서 빠진다」와 손실이 정확히 같다(배포 직행은 그 행을
// 남기지만, 표면이 사라지는 순간 미저장 편집은 어차피 복구 불가다).
/** 파기 고지 자구 1쌍 — 조판 개방/폐쇄에 따라 **사실인 문장**을 고른다(위 ⚠). */
interface SheetDiscardCopy {
  /** 조판 표면이 마운트돼 있을 때: 대기열 + 미저장 편집이 함께 사라진다. */
  readonly open: string;
  /** 조판이 닫혀 있을 때: 사라지는 것은 **담아 둔 순서**뿐이다. */
  readonly closed: string;
}
const SHEET_DISCARD_ON_CLASS_SWITCH: SheetDiscardCopy = {
  open: "학습지 조판에 올려 둔 학습지가 여러 장이에요. 다른 클래스로 옮기면 조판 구성이 사라지고, 저장하지 않은 편집도 함께 사라집니다. 계속할까요?",
  closed:
    "조판에 담아 둔 학습지가 여러 장이에요. 다른 클래스로 옮기면 담아 둔 목록과 순서가 사라집니다. 계속할까요?",
};
const SHEET_DISCARD_ON_DEPLOY: SheetDiscardCopy = {
  open: "학습지 조판에 올려 둔 학습지가 여러 장이에요. 모바일 배포로 가면 조판을 닫고 이 학습지 1건만 남깁니다 — 저장하지 않은 편집도 사라집니다. 계속할까요?",
  closed:
    "조판에 담아 둔 학습지가 여러 장이에요. 모바일 배포로 가면 이 학습지 1건만 남고 나머지는 담아 둔 순서째 사라집니다. 계속할까요?",
};

export function StudioHomeClient({
  academyId,
  initialClasses,
}: {
  academyId: string;
  initialClasses: StudioClassRow[];
}) {
  // ── 클래스 목록·선택 ──
  const [classes, setClasses] = useState<StudioClassRow[]>(initialClasses);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [childrenByClass, setChildrenByClass] = useState<
    Record<string, ClassChildrenState>
  >({});
  const [createOpen, setCreateOpen] = useState(false);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  // xl 미만 클래스 패널 슬라이드오버 (감사 D1 — 등록·초대 경로 소실 방지)
  const [panelDrawerOpen, setPanelDrawerOpen] = useState(false);

  // Esc 로 드로어 닫기(26-08-11 검수 V6) — 트리·우측 패널 드로어 공용 핸들러,
  // 열림 상태에서만 window keydown 을 청취한다(닫힘 상태 리스너 0개).
  useEffect(() => {
    if (!treeDrawerOpen && !panelDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTreeDrawerOpen(false);
      setPanelDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [treeDrawerOpen, panelDrawerOpen]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );
  // 안정 콜백([] deps) 안에서 현재 선택을 읽는 미러(보관 청산 판정용).
  const selectedClassIdRef = useRef(selectedClassId);
  selectedClassIdRef.current = selectedClassId;
  const totals = useMemo(
    () => ({
      classCount: classes.length,
      studentCount: classes.reduce((acc, c) => acc + c.studentCount, 0),
    }),
    [classes],
  );

  const refreshClasses = useCallback(async () => {
    const res = await listStudioClasses();
    if (res.success && res.data) setClasses(res.data);
  }, []);

  // 등록 지문 지연 로드 — 트리 펼침·클래스 스코프 칩이 공유한다.
  // ⚠ 중복 판정은 ref 로 한다 — setState 업데이터 안에서 바깥 플래그를 세우는
  // 패턴은 업데이터 실행 시점(커밋)이 호출 시점보다 늦어 조회가 영원히 스킵된다
  // (2026-08-10 행동 게이트 G3 실측: 스코프 칩 (0)·트리 자식 무한 로딩).
  const childrenRef = useRef<Record<string, ClassChildrenState>>({});
  childrenRef.current = childrenByClass;
  const loadChildren = useCallback(async (classId: string, force = false) => {
    if (!force && childrenRef.current[classId] !== undefined) return;
    setChildrenByClass((prev) => ({
      ...prev,
      [classId]: prev[classId] ?? "loading",
    }));
    const res = await listStudioClassPassages(classId);
    setChildrenByClass((prev) => ({
      ...prev,
      [classId]: res.success && res.data ? res.data : [],
    }));
  }, []);

  // §3.10.9: 클래스 선택 = 등록 지문 + 로스터 자동 로드 + 레일 자동 펼침 —
  // 배포 실행대가 로스터를 전제하므로 선택 즉시 깔아 둔다(펼침은 학생 구성을
  // 좌측에서 즉시 보여주는 E3 의 구조적 표현). loadStudents·도시에 청산은 아래
  // 블록에서 선언되므로 ref 경유로 부른다.
  const loadStudentsRef = useRef<(classId: string, force?: boolean) => void>(
    () => {},
  );
  // 해제 시 도시에 일괄 청산(검수 L1-1/L2-1 — 미청산 시 우측에 이전 선택의
  // 배포 실행대가 잔존해 스텝 스트립 모순·선택 0 desync 가 영구화된다).
  const clearDossierRef = useRef<() => void>(() => {});
  // §3.10.12: 명시적 선택 = 레일 자동 접힘(위저드 — ① 확정 후 레일 불필요,
  // 스텝 ① 칩이 요약·재진입). 패널 훅이 선언 순서상 뒤라 ref 경유로 접는다.
  const collapseTreeRef = useRef<() => void>(() => {});
  // 학습지 조판 가시성·대기열 미러 — 두 상태 선언이 선언 순서상 한참 뒤라 ref 로
  // 읽는다(이 파일의 childrenRef/pickedSheetsRef 와 같은 관용구).
  // **파기할 것이 없을 때만** 묻지 않는다 — 조판 폐쇄 ≠ 무손실(위 자구 주석의
  // 【E24 수리】 문단). 대기열 2장 이상은 조판이 닫혀 있어도 잃을 작업물이다.
  const sheetComposeOpenRef = useRef(false);
  const sheetPickCountRef = useRef(0);
  const confirmSheetComposeDiscard = useCallback((copy: SheetDiscardCopy) => {
    // 조판도 닫혀 있고 대기열도 1장 이하 — 파괴할 것이 정말로 없다.
    // ⚠ 이 조건을 `!sheetComposeOpenRef.current` 단독으로 되돌리지 마라:
    //   대기열 N장이 확인 없이 1장으로 덮어써지는 경로가 그대로 다시 열린다.
    if (!sheetComposeOpenRef.current && sheetPickCountRef.current <= 1)
      return true;
    // ① 대기열 2장 이상 — dirty 와 무관하게, **조판 개방 여부와도 무관하게** 묻는다
    //    (위 자구 주석 ①). 자구만 상태에 맞는 쪽을 고른다.
    if (sheetPickCountRef.current > 1) {
      if (typeof window === "undefined") return true;
      return window.confirm(
        sheetComposeOpenRef.current ? copy.open : copy.closed,
      );
    }
    // 여기 도달 = 조판이 열려 있고 대기열 1장 이하(위 조기 반환의 여집합).
    // ② 1장 이하 — 미저장 편집이 있을 때만 정본 프로브가 묻는다(위 ②).
    //    `guardSheetPickRemoval`(:1744) 을 부르지 않고 프로브를 직접 부르는 이유:
    //    그 가드는 「픽이 만들어진 클래스 ≠ 현재 클래스」면 조용히 통과시키는데,
    //    그 예외는 **전환이 이미 끝난 뒤** 자식 effect 가 올리는 빈 Map 을 위한
    //    것이다. 여기는 전환 **직전**이라 아직 같은 클래스이고, 무엇보다 이
    //    지점의 confirm 은 취소가 실제로 전환을 막는다(= 잡음이 아니다).
    return confirmSheetPickRemoval(pickedSheetsRef.current, EMPTY_SHEET_PICKS);
  }, []);
  const selectClass = useCallback(
    (classId: string | null) => {
      // ⚠ 클래스 전환은 아래 리셋 effect(:1610-1618)가 학습지 3상태를 **무조건**
      // 청산한다 — effect 는 이미 벌어진 뒤라 늦으므로 진입부에서 막는다.
      if (!confirmSheetComposeDiscard(SHEET_DISCARD_ON_CLASS_SWITCH)) return;
      setSelectedClassId(classId);
      setTreeDrawerOpen(false);
      if (classId) {
        void loadChildren(classId);
        loadStudentsRef.current(classId);
        setExpanded((prev) => (prev[classId] ? prev : { ...prev, [classId]: true }));
        collapseTreeRef.current();
      } else {
        clearDossierRef.current();
      }
    },
    [loadChildren, confirmSheetComposeDiscard],
  );
  // 레일 내부 조작의 선택 보장(§3.10.12 quiet) — rename 진입 dblclick·비선택
  // 클래스 체크. 접힘을 발화하지 않는다(접으면 rename 입력째 레일이 소멸하는
  // 실측 결함 — behavior-class-rail G11). 드로어 닫기도 없음(레일 내부 전용).
  const selectClassQuiet = useCallback(
    (classId: string) => {
      // ⚠ selectClass 와 **똑같이** 막는다 — setSelectedClassId 직접 호출 두 번째
      // 진입점이라, 여기만 비우면 rename dblclick·비선택 클래스 체크로 조판이
      // 무고지 파기되는 구멍이 그대로 남는다(감사 L3 #2 보강 지시).
      if (!confirmSheetComposeDiscard(SHEET_DISCARD_ON_CLASS_SWITCH)) return;
      setSelectedClassId(classId);
      void loadChildren(classId);
      loadStudentsRef.current(classId);
      setExpanded((prev) => (prev[classId] ? prev : { ...prev, [classId]: true }));
    },
    [loadChildren, confirmSheetComposeDiscard],
  );

  const handleRename = useCallback(
    async (classId: string, name: string) => {
      const res = await renameStudioClass({ classId, name });
      if (!res.success) {
        toast.error(res.error ?? "이름을 바꾸지 못했습니다.");
        return false;
      }
      setClasses((prev) =>
        prev.map((c) => (c.id === classId ? { ...c, name } : c)),
      );
      return true;
    },
    [],
  );

  const handleArchive = useCallback(
    (cls: StudioClassRow) => {
      const ok = window.confirm(
        `「${cls.name}」 클래스를 보관할까요?\n보관하면 목록에서 숨겨집니다. 학생 관리(ERP)의 반 목록에서도 비활성 처리되며, 학생 기록은 지워지지 않습니다.`,
      );
      if (!ok) return;
      void archiveStudioClass({ classId: cls.id }).then((res) => {
        if (!res.success) {
          toast.error(res.error ?? "보관하지 못했습니다.");
          return;
        }
        toast.success(`「${cls.name}」 클래스를 보관했습니다.`);
        setClasses((prev) => prev.filter((c) => c.id !== cls.id));
        // 보관 = 선택 해제로 귀결되면 도시에도 청산(검수 L1-1 — 업데이터 안
        // 부작용 금지라 미러 ref 로 밖에서 판정한다).
        if (selectedClassIdRef.current === cls.id) clearDossierRef.current();
        setSelectedClassId((cur) => (cur === cls.id ? null : cur));
      });
    },
    [],
  );

  // ── 레일 학생 로스터(§3.10.2 성능 개정 2026-08-12) — **마운트 시 전 클래스
  //    1왕복 프리페치**(슬림 질의, 과제 집계 없음). 구 클래스별 지연 로드는
  //    무거운 집계 + dev 왕복이 펼침 토글 체감 지연(1~3s)으로 직결됐다 — 이제
  //    토글은 순수 클라이언트, 배포 대상 해석(deployTarget.loading)도 즉시다.
  //    force 재조회(학생 추가·연결·재시도·신규 클래스)도 같은 액션(단일 질의라
  //    저렴). 재진입은 inflight+again 큐로 합류(연속 등록 중 refresh 유실 방지).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [studentsByClass, setStudentsByClass] = useState<
    Record<string, ClassStudentsState>
  >({});
  const studentsRef = useRef<Record<string, ClassStudentsState>>({});
  studentsRef.current = studentsByClass;
  // classes 미러 — 안정 콜백에서 초회 실패 error 마킹에 읽는다.
  const classesRef = useRef(classes);
  classesRef.current = classes;
  const rostersInflightRef = useRef(false);
  const rostersAgainRef = useRef(false);
  const loadRosters = useCallback(async (force = false) => {
    if (rostersInflightRef.current) {
      if (force) rostersAgainRef.current = true;
      return;
    }
    if (!force && Object.keys(studentsRef.current).length > 0) return;
    rostersInflightRef.current = true;
    try {
      do {
        rostersAgainRef.current = false;
        const res = await listStudioClassRosters();
        if (res.success && res.data) {
          setStudentsByClass(res.data);
        } else if (Object.keys(studentsRef.current).length === 0) {
          // 초회 실패 — 펼친 클래스가 「다시 시도」 행을 그리도록 전 클래스 error.
          setStudentsByClass(
            Object.fromEntries(
              classesRef.current.map((c) => [c.id, "error" as const]),
            ),
          );
        }
      } while (rostersAgainRef.current);
    } finally {
      rostersInflightRef.current = false;
    }
  }, []);
  // 마운트 프리페치 — 이후 펼침·선택은 네트워크 왕복 없음.
  useEffect(() => {
    void loadRosters();
  }, [loadRosters]);
  // 선택 시 보장 훅(ref 경유) — 프리페치 이후 생성된 신규 클래스만 재조회를 탄다.
  loadStudentsRef.current = (classId) => {
    if (studentsRef.current[classId] === undefined) void loadRosters(true);
  };
  const retryStudents = useCallback(
    () => void loadRosters(true),
    [loadRosters],
  );
  const expandedRef = useRef<Record<string, boolean>>({});
  expandedRef.current = expanded;
  const toggleExpand = useCallback((classId: string) => {
    const willExpand = !expandedRef.current[classId];
    setExpanded((prev) => ({ ...prev, [classId]: !prev[classId] }));
    if (willExpand) loadStudentsRef.current(classId);
  }, []);

  // ── 배포 대상 체크(§3.10.3) — 엔트리 없음·로스터 미로드 = 전원 계약.
  //    로스터가 배열로 처음 전이하면 전원 체크로 초기화하고, force 재조회로
  //    로스터가 변하면 **신입은 체크 합류·이탈은 제거·기존 해제는 보존**한다.
  //    신입/이탈 판정은 직전 로스터 스냅샷(lastRosterRef)과의 diff — 체크 집합
  //    과의 비교만으로는 "새 학생"과 "해제한 학생"을 구분할 수 없다.
  const [checkedByClass, setCheckedByClass] = useState<
    Record<string, ReadonlySet<string>>
  >({});
  // 안정 콜백·이펙트 본문에서 최신 체크를 읽는 미러.
  const checkedRef = useRef<Record<string, ReadonlySet<string>>>({});
  checkedRef.current = checkedByClass;
  const lastRosterRef = useRef<Record<string, ReadonlySet<string>>>({});
  useEffect(() => {
    // ⚠ diff 계산·lastRosterRef 갱신은 **업데이터 밖**(이펙트 본문)에서 —
    // 업데이터 안에서 ref 를 변이하면 StrictMode 이중 호출의 2회차가 오염된
    // 미러를 읽어 "신입은 체크 합류" 계약이 dev 에서 사문화된다(검수 L1-2 실증).
    const updates = new Map<string, ReadonlySet<string>>();
    for (const [cid, st] of Object.entries(studentsByClass)) {
      if (!Array.isArray(st)) continue;
      const rosterIds = new Set(st.map((s) => s.studentId));
      const lastRoster = lastRosterRef.current[cid];
      lastRosterRef.current[cid] = rosterIds;
      const cur = checkedRef.current[cid];
      if (!cur) {
        // 첫 로드 — 전원 체크
        updates.set(cid, rosterIds);
        continue;
      }
      // 재조회 diff — 이탈 제거 + 신입 합류. 신입 판정은 **직전 로스터가 있을
      // 때만**: 첫 배열 전이에서 기존 엔트리(예: 로딩 창 전원 해제)가 있으면
      // 전원을 신입으로 오인해 명시적 해제를 역전시킨다(검수 L1-3 — cur 존중).
      const merged = new Set<string>();
      let changed = false;
      for (const id of cur) {
        if (rosterIds.has(id)) merged.add(id);
        else changed = true;
      }
      if (lastRoster !== undefined) {
        for (const id of rosterIds) {
          if (!merged.has(id) && !lastRoster.has(id) && !cur.has(id)) {
            merged.add(id);
            changed = true;
          }
        }
      }
      if (changed) updates.set(cid, merged);
    }
    if (updates.size === 0) return;
    setCheckedByClass((prev) => {
      const next = { ...prev };
      for (const [cid, set] of updates) next[cid] = set;
      return next;
    });
  }, [studentsByClass]);
  const toggleStudent = useCallback((classId: string, studentId: string) => {
    setCheckedByClass((prev) => {
      const roster = studentsRef.current[classId];
      const base =
        prev[classId] ??
        new Set(Array.isArray(roster) ? roster.map((s) => s.studentId) : []);
      const next = new Set(base);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return { ...prev, [classId]: next };
    });
  }, []);
  const toggleClassAll = useCallback(
    (classId: string) => {
      const roster = studentsRef.current[classId];
      if (!Array.isArray(roster)) {
        // 미로드 — 로스터를 깔고 펼쳐서 보여준 뒤, "전원 표시 중 클릭"의 의도인
        // 전원 해제로 착지한다(§3.10.9 레일 계약: 레일은 콜백만 부른다).
        // force: "loading"/"error" 상태에서도 실제 재조회 후 착지(검수 L1-3).
        setExpanded((prev) => (prev[classId] ? prev : { ...prev, [classId]: true }));
        void loadRosters(true).then(() => {
          setCheckedByClass((prev) => ({ ...prev, [classId]: new Set() }));
        });
        return;
      }
      setCheckedByClass((prev) => {
        const cur = prev[classId];
        const allChecked = !cur || cur.size >= roster.length;
        return {
          ...prev,
          [classId]: allChecked
            ? new Set<string>()
            : new Set(roster.map((s) => s.studentId)),
        };
      });
    },
    [loadRosters],
  );

  // ── 학생 추가(§3.1.1v2) — 레일 케밥·펼침 꼬리 행 「학생 추가」 → 학생 탭
  //    (§3.2)의 등록 모달·초대 키트 동선을 그대로 재사용한다(이 오케스트레이터가
  //    호스팅). 로스터 변동 = 클래스 목록 리프레시(레일 배지·상단바 메타) +
  //    해당 클래스 **자동 펼침 + 학생 목록 강제 재조회**(결과 즉시 노출 — 신입은
  //    체크 합류가 로스터 diff 이펙트에서 자동으로 일어난다 §3.10.3).
  const [studentTarget, setStudentTarget] = useState<StudioClassRow | null>(null);
  const [inviteStudentId, setInviteStudentId] = useState<string | null>(null);
  const studentTargetRef = useRef<StudioClassRow | null>(null);
  studentTargetRef.current = studentTarget;
  const openAddStudents = useCallback((cls: StudioClassRow) => {
    setStudentTarget(cls);
  }, []);
  const closeAddStudents = useCallback(() => setStudentTarget(null), []);
  const closeInviteKit = useCallback(() => setInviteStudentId(null), []);
  const handleRosterChanged = useCallback(() => {
    void refreshClasses();
    void loadRosters(true);
    const target = studentTargetRef.current;
    if (target) {
      setExpanded((prev) =>
        prev[target.id] ? prev : { ...prev, [target.id]: true },
      );
    }
  }, [loadRosters, refreshClasses]);
  const handleStudentAdded = useCallback(
    (studentId: string) => {
      handleRosterChanged();
      // §M off 면 초대 키트(모바일 학습 초대장) 자동 오픈을 봉인 — 등록 동선은
      // 그대로(Enter 연속 등록·로스터 리프레시 무손상).
      if (SHOW_MOBILE) setInviteStudentId(studentId);
    },
    [handleRosterChanged],
  );

  // ── 클래스 스코프(중앙 임베드 연동) ──
  const registeredIds = useMemo(() => {
    if (!selectedClassId) return null;
    const rows = childrenByClass[selectedClassId];
    if (!Array.isArray(rows)) return new Set<string>();
    return new Set(rows.map((r) => r.passageId));
  }, [childrenByClass, selectedClassId]);

  // classCtx 는 **참조 안정** 이어야 한다 — 인라인 리터럴로 넘기면 큐 폴링(5초)
  // 리렌더마다 새 객체가 내려가 memo(LibraryPane)가 무력화되고, 카드 수백 장이
  // 주기적으로 재렌더된다(2026-08-11 전역 버벅임 수술).
  // registeredLoading(§3.10.9): 기본 스코프가 「이 클래스」라 등록 목록 로딩 중
  // "0개 깜빡임"을 스켈레톤으로 가린다.
  const registeredLoading = selectedClassId
    ? !Array.isArray(childrenByClass[selectedClassId])
    : false;
  const libraryClassCtx = useMemo(
    () =>
      selectedClass && registeredIds
        ? {
            classId: selectedClass.id,
            className: selectedClass.name,
            registeredIds,
            registeredLoading,
          }
        : null,
    [selectedClass, registeredIds, registeredLoading],
  );

  // ── 담기/빼기 후 갱신 정책(26-08-15 지연 수술 — 실측 기반) ───────────────
  // ① `refreshClasses()` 를 부르지 않는다: listStudioClasses 가 주는 필드 중
  //    화면이 쓰는 건 studentCount 뿐이고(class-tree.tsx:267 — passageCount·
  //    assignmentCount·lastActivityAt 은 소비처 0건, 정렬에도 안 쓰임), 지문
  //    담기로는 studentCount 가 변하지 않는다. 로스터 변동 경로는 그대로
  //    refreshClasses 를 직접 부른다.
  // ② `skipRefresh` — 호출자가 뒤이어 onLibraryChanged 로 한 번에 갱신하거나
  //    청크 루프를 도는 경우, 매 호출마다 loadChildren 을 돌리지 않게 한다.
  //    **Next.js 는 서버 액션을 직렬 처리한다**(실측: listStudioClassPassages
  //    1719ms 종료 직후에야 listStudioClasses 시작 — Promise.all 이 병렬이
  //    아니다). 그래서 중복 갱신 1건 = 체감 지연 1.5~2.5초다.
  const registerToClass = useCallback(
    async (passageIds: string[], opts?: { skipRefresh?: boolean }) => {
      if (!selectedClassId) return 0;
      const res = await addPassagesToStudioClass({
        classId: selectedClassId,
        passageIds,
      });
      if (!res.success) {
        toast.error(res.error ?? "클래스에 담지 못했습니다.");
        return 0;
      }
      if (!opts?.skipRefresh) await loadChildren(selectedClassId, true);
      return res.data?.addedCount ?? 0;
    },
    [loadChildren, selectedClassId],
  );

  // 클래스에서 빼기(§3.10.4) — 담기의 대칭. 갱신 정책도 동일.
  const unregisterFromClass = useCallback(
    async (passageIds: string[], opts?: { skipRefresh?: boolean }) => {
      if (!selectedClassId) return 0;
      const res = await removePassagesFromStudioClass({
        classId: selectedClassId,
        passageIds,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "클래스에서 빼지 못했습니다.");
        return 0;
      }
      if (!opts?.skipRefresh) await loadChildren(selectedClassId, true);
      return res.data.removedCount;
    },
    [loadChildren, selectedClassId],
  );

  // ── 지문 도시에 v2(§3.9v2.1) — LibraryPane 선택 집합 업링크 수신 ──
  // dossierPassages 는 발행 배열 그대로 보관(표시용 최근 5개 절단은 파생 메모).
  // 조회는 지문별 **펼침 시 지연 1회** — Map 캐시(불변 갱신) + 지문별 취소
  // 가드(inflight 토큰). 접었다 펴도 재조회 없음, 재선택(집합 재발행)이 갱신,
  // 폴링 없음(§3.9.6).
  const [dossierPassages, setDossierPassages] = useState<
    DossierPassageRef[] | null
  >(null);
  const [dossierStates, setDossierStates] = useState<
    ReadonlyMap<string, DossierFetchState>
  >(() => new Map());
  const [expandedDossierId, setExpandedDossierId] = useState<string | null>(
    null,
  );
  // 방금 생성 문항 id(지문별) — 재조회 diff 로 세션 내 누적(§3.10.11-e v2).
  // 표시부(문항 행 글로우)의 세션 재료 — 시간 폴백(최근 30분)은 표시부 소관.
  const [freshQuestionIds, setFreshQuestionIds] = useState<
    ReadonlyMap<string, ReadonlySet<string>>
  >(() => new Map());
  // 미조회 판정용 미러 — 안정 콜백([] deps) 안에서 최신 캐시를 읽는다.
  const dossierStatesRef = useRef(dossierStates);
  dossierStatesRef.current = dossierStates;
  // 지문별 취소 가드 — 토큰이 다르면 stale 응답(재조회·선택 해제·언마운트)을
  // 무시한다. 언마운트 클린업이 맵을 비워 이후 도착분은 전부 버려진다.
  const dossierInflightRef = useRef(new Map<string, number>());
  const dossierTokenRef = useRef(0);
  useEffect(() => {
    const inflight = dossierInflightRef.current;
    return () => inflight.clear();
  }, []);

  // silent(§3.10.9): 자동 재조회(생성 완료·배포 성공) 전용 — ready 상태를
  // 유지한 채 성공 시에만 교체해 펼친 카드가 스켈레톤으로 깜빡이지 않는다.
  const fetchDossier = useCallback((passageId: string, opts?: { silent?: boolean }) => {
    // silent 는 진행 중 조회가 있으면 보류(검수 L1-5) — 사용자 발화 normal 조회
    // 의 토큰을 덮어써 응답을 기각시키고, silent 실패 시 영구 스켈레톤에 고착
    // 시키는 경쟁 창을 닫는다(normal 이 어차피 최신을 가져온다).
    if (opts?.silent && dossierInflightRef.current.has(passageId)) return;
    const token = ++dossierTokenRef.current;
    dossierInflightRef.current.set(passageId, token);
    if (!opts?.silent) {
      setDossierStates((prev) =>
        new Map(prev).set(passageId, { status: "loading" }),
      );
    }
    const settle = (state: DossierFetchState) => {
      // 이 요청이 여전히 해당 지문의 최신 조회일 때만 반영한다(취소 가드).
      if (dossierInflightRef.current.get(passageId) !== token) return;
      dossierInflightRef.current.delete(passageId);
      // 방금/최근 문항 글로우 표식(§3.10.11-e v2) — ①ready→ready 전이 diff
      // (첫 조회 전체를 "신규"로 오인 금지) ∪ ②최근 30분 생성분(새로고침으로
      // diff 가 증발한 직후의 폴백). Date.now() 는 이 콜백(비-렌더)에서만 —
      // 표시부 렌더에서 부르면 React Compiler 순수성 위반(경고 실측).
      // updater 는 순수(새 Map/Set 생성만), 부작용은 여기서.
      if (state.status === "ready") {
        const prevState = dossierStatesRef.current.get(passageId);
        const prevIds =
          prevState?.status === "ready"
            ? new Set(prevState.dossier.questions.rows.map((r) => r.id))
            : null;
        const cutoff = Date.now() - FRESH_QUESTION_WINDOW_MS;
        const freshIds = state.dossier.questions.rows
          .filter(
            (r) =>
              (prevIds !== null && !prevIds.has(r.id)) ||
              Date.parse(r.createdAt) >= cutoff,
          )
          .map((r) => r.id);
        if (freshIds.length > 0) {
          setFreshQuestionIds((prev) => {
            const cur = prev.get(passageId);
            if (cur && freshIds.every((id) => cur.has(id))) return prev; // 무변 — 참조 유지
            const next = new Map(prev);
            const merged = new Set(cur ?? []);
            for (const id of freshIds) merged.add(id);
            next.set(passageId, merged);
            return next;
          });
        }
      }
      setDossierStates((prev) => new Map(prev).set(passageId, state));
    };
    // silent 실패는 기존 상태 유지(인플라이트만 정리) — 자동 재조회의 일시
    // 실패가 멀쩡한 카드를 에러로 뒤집지 않게 한다.
    const settleSilentFail = () => {
      if (dossierInflightRef.current.get(passageId) !== token) return;
      dossierInflightRef.current.delete(passageId);
    };
    getStudioPassageDossier({ passageId })
      .then((res) => {
        if (res.data) {
          // U1 실패 계약: data 있음 + error = 배정 파이프라인만 실패(§3.9.6)
          settle({
            status: "ready",
            dossier: res.data,
            assignmentsError: res.error ?? null,
          });
        } else if (opts?.silent) {
          settleSilentFail();
        } else {
          settle({
            status: "error",
            error: res.error ?? "지문을 찾을 수 없습니다.",
          });
        }
      })
      .catch(() => {
        if (opts?.silent) settleSilentFail();
        else settle({ status: "error", error: "지문 현황을 불러오지 못했습니다." });
      });
  }, []);

  // 발행 수신 — null 은 클리어, 배열은 그대로 저장. 펼침 규칙(26-08-11 검수
  // D-06 개정): 직전 펼침이 새 집합에 살아 있으면 유지하고, **새 id 가 추가된
  // 발행에서만** 마지막 항목(최근 선택)을 자동 펼침(+미조회면 즉시 조회).
  // 제거-only 발행은 펼침 불변 — 펼침 대상이 제거된 경우만 마지막 항목으로
  // 이동한다(전부 접힌 상태면 접힘 유지). 선택에서 빠진 지문의 캐시·인플라이트
  // 는 버린다 — "재선택이 곧 갱신"이라는 §3.9v2.1 캐시 계약의 구현.
  const expandedDossierIdRef = useRef(expandedDossierId);
  expandedDossierIdRef.current = expandedDossierId;
  // 직전 발행 집합 미러 — 추가/제거-only 판정용(안정 콜백 안에서 읽는다).
  const dossierIdsRef = useRef<ReadonlySet<string>>(new Set());
  const handleDossierPassages = useCallback(
    (items: DossierPassageRef[] | null) => {
      if (!items || items.length === 0) {
        setDossierPassages(null);
        setExpandedDossierId(null);
        dossierIdsRef.current = new Set();
        dossierInflightRef.current.clear();
        setDossierStates((prev) => (prev.size === 0 ? prev : new Map()));
        return;
      }
      setDossierPassages(items);
      const alive = new Set(items.map((i) => i.id));
      const prevIds = dossierIdsRef.current;
      dossierIdsRef.current = alive;
      setDossierStates((prev) => {
        if (![...prev.keys()].some((k) => !alive.has(k))) return prev;
        const next = new Map(prev);
        for (const k of prev.keys()) if (!alive.has(k)) next.delete(k);
        return next;
      });
      for (const k of [...dossierInflightRef.current.keys()]) {
        if (!alive.has(k)) dossierInflightRef.current.delete(k);
      }
      const hasNew = [...alive].some((id) => !prevIds.has(id));
      const prevExpanded = expandedDossierIdRef.current;
      const last = items[items.length - 1];
      // 신규 펼침은 「items 순서상 마지막 신규 id」(§3.10.11-a) — 마지막 항목이
      // 기존 id 인 발행(rebindToVariant: 행 중간의 passageId 교체)에서도 신규
      // 변형이 정확히 펼쳐진다. 일반 경로(신규가 항상 끝에 붙는 담기·선택)는
      // 동작 불변 — hasNew 일 때 lastNew 는 반드시 존재한다.
      const lastNew = [...items].reverse().find((i) => !prevIds.has(i.id));
      const nextExpanded = hasNew
        ? lastNew!.id
        : prevExpanded === null
          ? null
          : alive.has(prevExpanded)
            ? prevExpanded
            : last.id;
      setExpandedDossierId(nextExpanded);
      if (
        nextExpanded !== null &&
        !dossierStatesRef.current.has(nextExpanded) &&
        !dossierInflightRef.current.has(nextExpanded)
      ) {
        fetchDossier(nextExpanded);
      }
    },
    [fetchDossier],
  );
  // 해제 청산 ref 결선(선언 순서상 selectClass 가 먼저라 ref 경유 — 검수 L1-1).
  clearDossierRef.current = () => handleDossierPassages(null);

  // 아코디언 펼침 전환(null = 전부 접기) — 미조회 지문이면 그때 1회 조회.
  const handleDossierExpand = useCallback(
    (passageId: string | null) => {
      setExpandedDossierId(passageId);
      if (
        passageId &&
        !dossierStatesRef.current.has(passageId) &&
        !dossierInflightRef.current.has(passageId)
      ) {
        fetchDossier(passageId);
      }
    },
    [fetchDossier],
  );

  // 표시 = 발행 전체(§3.10.17-e — 절단 폐기). 이름은 기존 소비처(펼침 가드·
  // 프룬 ①)와의 계약 유지를 위해 존치 — 이제 "표시 집합 = 발행 집합"이다.
  const visibleDossierPassages = dossierPassages;
  // 표시(절단 후) id 집합 미러 — 발사 자동 펼침의 채택 가드(§3.10.11-d):
  // 절단분 펼침 지정은 아코디언에 카드가 없어 무의미하다. 소멸 재조회 가드는
  // 발행 전체(dossierIdsRef) 기준 — 절단분 완료도 회수 대상이라 둘을 분리한다.
  const visibleDossierIds = useMemo(
    () => new Set((visibleDossierPassages ?? []).map((r) => r.id)),
    [visibleDossierPassages],
  );
  const visibleIdsRef = useRef<ReadonlySet<string>>(new Set());
  visibleIdsRef.current = visibleDossierIds;

  // 도시에 「생성된 문제」 행 → 상세 모달(questionId 경로 — 지연 로드)
  const [dossierQuestionId, setDossierQuestionId] = useState<string | null>(null);
  const [dossierQuestionState, setDossierQuestionState] =
    useState<DossierQuestionState>({ status: "loading" });
  useEffect(() => {
    if (!dossierQuestionId) return;
    let cancelled = false;
    setDossierQuestionState({ status: "loading" });
    getStudioQuestionCard({ questionId: dossierQuestionId })
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          setDossierQuestionState({ status: "ready", card: res.data });
        } else {
          setDossierQuestionState({
            status: "error",
            error: res.error ?? "문항 정보를 불러오지 못했습니다.",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDossierQuestionState({
            status: "error",
            error: "문항 정보를 불러오지 못했습니다.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dossierQuestionId]);
  const closeDossierQuestion = useCallback(() => setDossierQuestionId(null), []);

  // ── 생성 큐 + 워크북 모달 + 도크 ──
  const queueApi = useStudioQueue({ academyId });
  const [sheetPassages, setSheetPassages] = useState<
    WorkbookModalPassage[] | null
  >(null);

  // ── 문항 세션 큐(§3.8.8) — useGenerationSessionQueue 는 여기 1곳에서만 호출
  //    (폴러 1개 규칙의 문항판 — 판마다 부르면 5초 ai-jobs 폴링이 배수로 는다) ──
  const [rawSessionQueue, setSessionQueue] = useGenerationSessionQueue();
  // 참조 안정화(함정 1 파생): 스토어의 병합 결과는 폴링 setDbQueue 가 내용 무변
  // 에도 매 틱 새 배열을 만들어 참조가 흔들린다(generation-session-store.ts:352
  // — 실측 확인). 시그니처(id·status·문항/ID 수)가 같으면 직전 배열을 재사용해
  // memo(LibraryPane) 방어선을 지킨다. streamPreview 는 시그니처에서 **제외**
  // (검수 L4-3): tail.length 는 420자 포화 후 동결되고 포화 전엔 델타당(~8회/초)
  // 진동해 지문 수백 행을 재렌더시키는데, 이 트리에는 tail 소비자가 없다 —
  // 라이브 tail 표시가 필요해지면 단조 tick 필드(use-passage-queue 선례)로.
  const sessionQueueSig = useMemo(
    () =>
      rawSessionQueue
        .map(
          (q) =>
            `${q.id}:${q.status}:${q.queued ? 1 : 0}:${q.questions.length}:${q.questionIds?.length ?? 0}`,
        )
        .join("|"),
    [rawSessionQueue],
  );
  // 시그니처가 같으면 직전 렌더가 메모한 배열을 그대로 반환한다(참조 안정) —
  // rawSessionQueue 를 deps 에서 의도적으로 제외한 시그니처 키 메모다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sessionQueue = useMemo(() => rawSessionQueue, [sessionQueueSig]);

  // ── 스트림 스토어(§3.10.11-b) — 오케스트레이터가 ref 지연 초기화로 정확히
  //    1개 소유(렌더마다 재생성하면 QueueStreamLine 키 구독이 전부 끊긴다).
  //    델타는 React 상태 트리 밖(이 스토어)으로만 흐르고, 아래 적재 effect 가
  //    유일한 공급자, QueueStreamLine 키 구독이 유일한 소비자다.
  const streamStoreRef = useRef<StreamTailStore | null>(null);
  if (streamStoreRef.current === null) {
    streamStoreRef.current = createStreamTailStore();
  }
  const streamStore = streamStoreRef.current;

  // 스냅샷 적재 — 오케스트레이터는 델타마다 이미 리렌더되므로(위 sessionQueueSig
  // 주석의 실측 그대로) 이 effect 의 신규 부담은 스토어 내부 문자열 비교뿐이다.
  // 표시 리렌더 반경은 QueueStreamLine 1개로 한정된다(§3.10.9 함정 1 방어선).
  useEffect(() => {
    const store = streamStoreRef.current;
    if (!store) return; // 렌더 지연 초기화가 선행되므로 실제 도달 불가(타입 가드)
    const alive = new Set<string>();
    // ① 모듈 분석 큐 — 활성(pending/analyzing) + 미리보기 보유분만 적재.
    for (const q of queueApi.queue) {
      if (
        (q.status === "pending" || q.status === "analyzing") &&
        q.streamPreview
      ) {
        const key = `wa:${q.id}`;
        alive.add(key);
        store.set(key, {
          tail: q.streamPreview.tail,
          phase: q.streamPreview.phase,
          stage: q.streamPreview.stage,
          startedAt: q.streamPreview.startedAt,
        });
      }
    }
    // ② 문항 세션 큐 — ⚠ 반드시 rawSessionQueue: 안정화본(sessionQueue)은
    //    시그니처가 streamPreview 를 제외해 델타 갱신이 참조에 실리지 않는다.
    for (const s of rawSessionQueue) {
      if (s.status === "generating" && s.streamPreview) {
        const key = `qg:${s.passageId}:${s.id}`;
        alive.add(key);
        store.set(key, {
          tail: s.streamPreview.tail,
          phase: s.streamPreview.phase,
          startedAt: s.streamPreview.startedAt,
        });
      }
    }
    // 종료 스트림 정리 — prune 이 구독자에 notify 해 라인이 스스로 사라진다.
    store.prune(alive);
  }, [queueApi.queue, rawSessionQueue]);

  // ── §M 조판 유도 넛지(26-08-22) — 생성 완료 전이 감지 ──────────────────────
  // 문항(세션 큐 generating→done/reviewed)·학습지(분석 큐 pending/analyzing→done
  // 중 sheet 스탬프 보유분 + 실전 잡 running→done)가 **이 세션 안에서** 완료로
  // 넘어가는 순간 해당 축을 켠다. 첫 관측(마운트 시 영속 복원분·이미 완료된
  // 잡)은 전이가 아니므로 켜지 않는다 — 새로고침으로 부활하지 않는다(세션
  // 메모리만, 영속 금지). 소등은 조판 표면 열림 전이가 담당(anyComposeVisible
  // 산식 바로 아래 블록). 소비처: 실행대 [조판] 버튼 펄스(nudge prop)·우측 빈
  // 상태 넛지 카드·뷰 필 펄스(LibraryPane 경유 SourceSwitcher).
  // "이전 렌더 정보 보관" 렌더 중 조건부 setState — 이 리포 공인 패턴. 시그니처
  // 문자열 비교라 5초 폴링 틱(내용 무변)에는 setState 가 일어나지 않는다.
  const [composeNudge, setComposeNudge] = useState({
    questions: false,
    sheets: false,
  });
  const genStatusSig = useMemo(() => {
    const parts: string[] = [];
    for (const s of sessionQueue) parts.push(`q:${s.id}=${s.status}`);
    for (const q of queueApi.queue) {
      if (queueApi.stamps.get(q.id)?.sheet) parts.push(`s:${q.id}=${q.status}`);
    }
    for (const j of queueApi.worksheetJobs)
      parts.push(`w:${j.passageId}=${j.status}`);
    return parts.sort().join("|");
  }, [sessionQueue, queueApi.queue, queueApi.stamps, queueApi.worksheetJobs]);
  const [prevGenStatusSig, setPrevGenStatusSig] = useState<string | null>(null);
  if (genStatusSig !== prevGenStatusSig) {
    setPrevGenStatusSig(genStatusSig);
    if (prevGenStatusSig !== null) {
      // 키·상태 토큰에 "="·"|" 가 등장하지 않는 것이 전제(cuid/fast:·상태 리터럴).
      const before = new Map(
        prevGenStatusSig
          .split("|")
          .filter(Boolean)
          .map((e) => e.split("=") as [string, string]),
      );
      let doneQuestions = false;
      let doneSheets = false;
      // fast 유닛 id 교체 감지 재료 — 완료 커밋이 temp id(fast:…)를 서버 jobId 로
      // **한 커밋에 갈아끼우므로**(use-workspace-generation.ts:805-810
      // replaceQueueItemInPlace([tempId, jobId]) · doneItem.id = jobId) 같은 키의
      // generating→done 전이가 존재하지 않는다. 「직전 틱에 generating 이던 q: 키
      // 소멸 + 직전에 없던 q: 키가 done/reviewed 로 신생」 조합을 같은 완료로
      // 인정한다(적대 검수 correctness-critical 수리, 26-08-22). 마운트 첫 관측은
      // 바깥 prevGenStatusSig !== null 가드가 이미 걸러 폴링 복원분 오발화가 없다.
      let newQuestionDone = false;
      const curKeys = new Set<string>();
      for (const entry of genStatusSig.split("|")) {
        if (!entry) continue;
        const [key, status] = entry.split("=") as [string, string];
        curKeys.add(key);
        const prev = before.get(key);
        if (key.startsWith("q:")) {
          if (status === "done" || status === "reviewed") {
            if (prev === "generating") doneQuestions = true;
            else if (prev === undefined) newQuestionDone = true;
          }
        } else if (key.startsWith("s:")) {
          if (status === "done" && (prev === "pending" || prev === "analyzing"))
            doneSheets = true;
        } else if (status === "done" && prev === "running") {
          doneSheets = true;
        }
      }
      if (!doneQuestions && newQuestionDone) {
        for (const [key, status] of before) {
          if (
            key.startsWith("q:") &&
            status === "generating" &&
            !curKeys.has(key)
          ) {
            doneQuestions = true;
            break;
          }
        }
      }
      if (doneQuestions || doneSheets) {
        setComposeNudge((cur) => ({
          questions: cur.questions || doneQuestions,
          sheets: cur.sheets || doneSheets,
        }));
      }
    }
  }

  // ── 문항판 도크 브리지(§3.8.9) — 스탬프 판정·재발사는 LibraryPane 안의
  //    useStudioQuestionGen 이 소유하므로 effect 업링크로 받는다. setState 세터
  //    자체가 안정 참조라 memo(LibraryPane) 에 그대로 내려도 된다. ──
  const [questionGenBridge, setQuestionGenBridge] =
    useState<QuestionGenBridge | null>(null);
  const openModuleSheet = useCallback((passages: WorkbookModalPassage[]) => {
    if (passages.length === 0) {
      toast.error("지문을 먼저 선택해 주세요.");
      return;
    }
    setSheetPassages(passages);
  }, []);
  // Esc 1중(§3.8.7·§3.10.18 E18-c ④) — LibraryPane 이 실전 직행 진입에서
  // 워크북 모달을 먼저 닫는 채널. 세터가 안정 참조라 memo 방어선 무손상.
  const closeModuleSheet = useCallback(() => setSheetPassages(null), []);

  // 문항 발사 직후 후처리 — 진행·완료는 도시에 「생성 중」 스트립(§3.10.6)과
  // 조용한 재조회가 보여주므로 별도 후처리가 없다.
  const handleQuestionLaunched = useCallback(() => {}, []);

  // 자료 변동 후 갱신 — 클래스 등록 지문만 다시 읽는다. refreshClasses 는
  // 지문 변동으로 바뀌는 렌더 필드가 없어 뺐다(위 registerToClass 주석 ①).
  const refreshAfterLibraryChange = useCallback(() => {
    if (selectedClassId) void loadChildren(selectedClassId, true);
  }, [loadChildren, selectedClassId]);

  const openDossierQuestion = useCallback((questionId: string) => {
    setDossierQuestionId(questionId);
  }, []);

  // ── 도시에 카드 「선택 해제」(26-08-22 사용자 지시) — 선택 상태는 LibraryPane
  //    (usePassageLibrary)이 단독 소유하므로 registerComposeViewControl 과 같은
  //    ref 등록 관용구로 해제 콜백을 빌려 온다. LibraryPane 언마운트(클래스
  //    해제) 시 null 로 되돌아와 removeDossierPassage 는 자연 무음이 된다.
  const dossierDeselectRef = useRef<((passageId: string) => void) | null>(null);
  const registerDossierDeselect = useCallback(
    (control: ((passageId: string) => void) | null) => {
      dossierDeselectRef.current = control;
    },
    [],
  );
  const removeDossierPassage = useCallback((passageId: string) => {
    dossierDeselectRef.current?.(passageId);
  }, []);

  // ── 배포 대상(§3.10.3·§3.10.9) — 레일 체크 상태를 도시에 인라인 폼이 소비할
  //    형태로 접는다. 로스터 미로드면 loading(선택 즉시 자동 로드라 짧다) —
  //    deployStudioModules 가 studentIds 명시를 요구하므로 로드 전 배포는 막는다.
  const deployTargetResolved = useMemo<StudioDeployTarget | null>(() => {
    if (!selectedClass) return null;
    const roster = studentsByClass[selectedClass.id];
    if (!Array.isArray(roster)) {
      return {
        classId: selectedClass.id,
        className: selectedClass.name,
        studentIds: [],
        count: selectedClass.studentCount,
        total: selectedClass.studentCount,
        partial: false,
        loading: true,
      };
    }
    const checked = checkedByClass[selectedClass.id];
    const ids = (checked
      ? roster.filter((s) => checked.has(s.studentId))
      : roster
    ).map((s) => s.studentId);
    return {
      classId: selectedClass.id,
      className: selectedClass.name,
      studentIds: ids,
      count: ids.length,
      total: roster.length,
      partial: ids.length < roster.length,
      loading: false,
    };
  }, [checkedByClass, selectedClass, studentsByClass]);

  // ── 생성 중 스트립 조립(§3.10.6·§3.10.9) — 3원천을 지문별로 접는다.
  //    ①모듈 분석 큐(queue.id === passageId) ②실전 워크북 잡 ③문항 세션 큐
  //    (스탬프 필터 필수 — 무필터 = 학원 소음 89건 실측). 폴링 틱마다 새 Map 이
  //    되지 않게 시그니처 키 메모로 참조를 안정화한다(sessionQueue 선례).
  const builtQueueItems = useMemo(() => {
    const map = new Map<string, DossierQueueItem[]>();
    const refs = visibleDossierPassages ?? [];
    for (const ref of refs) {
      const items: DossierQueueItem[] = [];
      const q = queueApi.queue.find((x) => x.id === ref.id);
      if (q && (q.status === "pending" || q.status === "analyzing")) {
        // 자구는 analysisRunningLabel 이 정본(행 활동 표식과 공유 — §3.10.20).
        const label = analysisRunningLabel(queueApi.stamps.get(ref.id));
        items.push({
          id: `wa:${ref.id}`,
          kind: "modules",
          label,
          status: "running",
          streamKey: `wa:${ref.id}`,
          // 폴링 복원 잡의 createdAt 은 지문 생성 시각이라 경과가 수천 분으로
          // 오표시된다 — 시계는 로컬 SSE 보유분(streamPreview)만 싣는다(부재 =
          // 경과 미표시). 라이브 stage 는 QueueStreamLine 전담이라 detail 미적재.
          startedAt: q.streamPreview?.startedAt,
        });
      } else if (q && q.status === "error" && queueApi.stamps.has(ref.id)) {
        // 오류는 스튜디오 발사분(스탬프)만 — 학원 전체 큐의 과거 실패 소음 차단
        const failStamp = queueApi.stamps.get(ref.id);
        items.push({
          id: `wa:${ref.id}`,
          kind: "modules",
          label: failStamp?.sheet
            ? `${sheetProductLabel(failStamp.sheet)} 생성 실패`
            : "학습지 생성 실패",
          status: "error",
          detail: q.error ?? undefined,
        });
      }
      for (const j of queueApi.worksheetJobs) {
        if (j.passageId !== ref.id) continue;
        if (j.status === "running") {
          items.push({
            id: `ex:${ref.id}`,
            kind: "exam",
            label: "실전 워크북 생성 중",
            status: "running",
            // 실전 워크북은 스트림 없음(§3.10.11-c) — 스피너+경과만.
            startedAt: j.startedAt,
          });
        } else if (j.status === "error") {
          items.push({
            id: `ex:${ref.id}`,
            kind: "exam",
            label: "실전 워크북 생성 실패",
            status: "error",
            detail: j.error,
          });
        }
      }
      for (const s of sessionQueue) {
        if (s.passageId !== ref.id || s.status !== "generating") continue;
        // 스탬프 필터 필수(§3.10.9 함정 5) — 브리지 부재 = **제외**가 자구다
        // (검수 L2: `bridge && !stamped` 는 브리지 null 에서 무필터로 역전).
        if (!questionGenBridge?.isStamped(s)) continue;
        const badge = questionQueueBadge(s.config);
        // createdAt 은 문자열(부재 가능) — 파싱 실패(NaN)는 경과 미표시로 강등.
        const startedMs = s.createdAt ? Date.parse(s.createdAt) : NaN;
        items.push({
          id: `qg:${ref.id}:${s.id}`,
          kind: "questions",
          label: questionQueueLabel(s.config, s.queued),
          status: "running",
          // 대기분은 스트림 자체가 아직 없다 — 키를 싣지 않아야 라인이
          // 「생성 진행 중…」(스냅샷 부재 중립 문구)으로 오해를 부르지 않는다.
          ...(s.queued ? {} : { streamKey: `qg:${ref.id}:${s.id}` }),
          startedAt: Number.isFinite(startedMs) ? startedMs : undefined,
          badges: {
            type: badge?.type,
            count: badge?.count,
            // 실효값(유형별 설정 우선 — questionQueueBadge 도출) — 전역값 직결은
            // 킬러·프리미엄 발사를 중급·일반으로 오표시한다(26-08-12 실측).
            difficulty: badge?.difficulty,
            plan: badge?.plan,
          },
        });
      }
      if (items.length > 0) map.set(ref.id, items);
    }
    return map as ReadonlyMap<string, readonly DossierQueueItem[]>;
  }, [
    queueApi.queue,
    queueApi.stamps,
    queueApi.worksheetJobs,
    questionGenBridge,
    sessionQueue,
    visibleDossierPassages,
  ]);
  // 직렬화 대상은 전부 **항목 생멸 시에만 변하는 정적 값**(streamKey·startedAt·
  // badges 포함) — 라이브 값(스트림 tail 등 틱마다 변하는 것)은 절대 넣지 않는다.
  // 델타는 스트림 스토어 구독으로만 흐른다(§3.10.11-b·c).
  const queueItemsSig = useMemo(
    () =>
      [...builtQueueItems.entries()]
        .map(
          ([pid, items]) =>
            `${pid}=${items
              .map(
                (i) =>
                  `${i.id}.${i.status}.${i.detail ?? ""}.${i.streamKey ?? ""}.${i.startedAt ?? ""}.${i.badges?.type ?? ""}.${i.badges?.count ?? ""}.${i.badges?.difficulty ?? ""}.${i.badges?.plan ?? ""}`,
              )
              .join(",")}`,
        )
        .sort()
        .join("|"),
    [builtQueueItems],
  );
  // 시그니처가 같으면 직전 Map 참조를 재사용한다(참조 안정 — memo 방어선).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queueItemsByPassage = useMemo(() => builtQueueItems, [queueItemsSig]);

  // ── 지문 행 「생성 중」 활동 표식(§3.10.20) ────────────────────────────────
  // 위 스트립과 **원천은 같고 커버리지가 다르다**: 스트립은 도시에 발행 지문만
  // 그리지만, 지문관리 행은 선택되지 않은 지문까지 전부 그린다. 그래서 여기서는
  // 지문을 돌며 잡을 find 하지 않고 **잡을 1패스로 펼친다** — O(잡)이라 목록이
  // 몇 백 행이든 비용이 늘지 않는다(스트립의 O(지문×잡) find 루프와 대비).
  //
  // ⚠ running 만 싣는다(실패 제외). 행에는 실패를 해제할 수단이 없어서
  //   「해제 수단 없는 경고색만 남기지 않는다」는 이 표면의 기존 판정(§3.10.15
  //   미검수 붉은 테두리 소등 · 영속 error 복원 폐기 L1-6)과 정면으로 부딪힌다.
  //   실패 자구·상세·재시도는 도시에 스트립이 정본으로 갖는다.
  const builtPassageActivity = useMemo(() => {
    const entries: PassageActivityEntry[] = [];
    // ① 분석 큐(학습지 계열) — 큐 항목 id 가 곧 passageId.
    //    스탬프 필터 없음: 스트립의 running 분기와 같은 자구다. 다른 표면에서
    //    쏜 잡도 "이 지문은 지금 묶여 있다"는 사실이라 행에 보이는 편이 맞다
    //    (발사부도 pending|analyzing 지문을 걸러낸다 — use-studio-queue).
    for (const q of queueApi.queue) {
      if (q.status !== "pending" && q.status !== "analyzing") continue;
      entries.push({
        passageId: q.id,
        kind: "sheet",
        label: analysisRunningLabel(queueApi.stamps.get(q.id)),
      });
    }
    // ② 실전 워크북 — 로컬 전용 잡이라 필터 불필요.
    for (const j of queueApi.worksheetJobs) {
      if (j.status !== "running") continue;
      entries.push({
        passageId: j.passageId,
        kind: "exam",
        label: "실전 워크북 생성 중",
      });
    }
    // ③ 문항 세션 큐 — 스탬프 필터 필수(§3.10.9 함정 5, 무필터 = 학원 소음 89건
    //    실측). 브리지 부재 = **제외**가 자구다(`bridge && !stamped` 는 브리지
    //    null 에서 무필터로 역전한다 — 스트립 검수 L2 와 동일 함정).
    for (const s of sessionQueue) {
      if (s.status !== "generating") continue;
      if (!questionGenBridge?.isStamped(s)) continue;
      entries.push({
        passageId: s.passageId,
        kind: "questions",
        label: questionQueueLabel(s.config),
      });
    }
    return collectPassageActivity(entries);
  }, [
    queueApi.queue,
    queueApi.stamps,
    queueApi.worksheetJobs,
    questionGenBridge,
    sessionQueue,
  ]);
  // 참조 고정 — 값 객체까지 통째로 재사용해야 memo(PassageListRow) 가 산다
  // (행마다 activity 를 prop 으로 받으므로, 5초 폴링이 새 객체를 만들면 진행
  // 중이 아닌 행까지 포함해 목록이 매 틱 다시 그려진다).
  const passageActivitySig = useMemo(
    () => passageActivitySignature(builtPassageActivity),
    [builtPassageActivity],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const passageActivity = useMemo(() => builtPassageActivity, [passageActivitySig]);

  // ── 완료 → 조용한 재조회(§3.10.9·§3.10.11-d) — **발행 전체 집합** 기준의
  //    활성 토큰(pid 인코딩)이 직전 틱에 있다가 사라지면 그 지문 도시에를
  //    silent 재조회한다(절단분 완료도 회수 — 완료물이 이름 유지한 채 문항
  //    스트립·모듈 칩에 착지). 폴링은 onJobsChanged 를 발화하지 않으므로
  //    (정찰 확정) 이 전이 감지가 정본 회수선.
  const activitySig = useMemo(() => {
    const refs = dossierPassages ?? [];
    const parts: string[] = [];
    for (const ref of refs) {
      const q = queueApi.queue.find((x) => x.id === ref.id);
      if (q && (q.status === "pending" || q.status === "analyzing")) {
        parts.push(`wa:${ref.id}`);
      }
      if (
        queueApi.worksheetJobs.some(
          (j) => j.passageId === ref.id && j.status === "running",
        )
      ) {
        parts.push(`ex:${ref.id}`);
      }
      for (const s of sessionQueue) {
        if (s.passageId === ref.id && s.status === "generating") {
          parts.push(`qg:${ref.id}:${s.id}`);
        }
      }
    }
    return parts.sort().join("|");
  }, [dossierPassages, queueApi.queue, queueApi.worksheetJobs, sessionQueue]);
  // 펼침용 발사 시그니처(§3.10.11-d 개정) — 큐 원천이 학원 전역 폴링이라
  // 「토큰 신규 등장 ≠ 이 표면의 발사」다. 재조회용 activitySig(무필터)와 달리
  // wa 는 스탬프 보유분만, qg 는 스트립과 동일 자구의 스탬프 필터(브리지 부재
  // = 제외 — §3.10.9 함정 5)만, ex 는 launchWorksheet 로컬 전용이라 그대로
  // 싣는다 — 다른 기기·표면 발사분이 수동 접기를 재펼침으로 뒤엎지 않는다.
  const launchSig = useMemo(() => {
    const refs = dossierPassages ?? [];
    const parts: string[] = [];
    for (const ref of refs) {
      const q = queueApi.queue.find((x) => x.id === ref.id);
      if (
        q &&
        (q.status === "pending" || q.status === "analyzing") &&
        queueApi.stamps.has(ref.id)
      ) {
        parts.push(`wa:${ref.id}`);
      }
      if (
        queueApi.worksheetJobs.some(
          (j) => j.passageId === ref.id && j.status === "running",
        )
      ) {
        parts.push(`ex:${ref.id}`);
      }
      for (const s of sessionQueue) {
        if (s.passageId !== ref.id || s.status !== "generating") continue;
        if (!questionGenBridge?.isStamped(s)) continue;
        parts.push(`qg:${ref.id}:${s.id}`);
      }
    }
    return parts.sort().join("|");
  }, [
    dossierPassages,
    queueApi.queue,
    queueApi.stamps,
    queueApi.worksheetJobs,
    questionGenBridge,
    sessionQueue,
  ]);
  // ① 신규 등장 전이(launchSig) = 이 표면의 발사 → 자동 펼침(§3.10.11-d).
  //    발사 순간 1회 전이에서만 발화하므로 이후 수동 접기를 재펼침으로 뒤엎지
  //    않는다(같은 토큰이 유지되는 동안은 prev 에도 있어 침묵). prev="" 첫
  //    전이도 포함 — 유휴 상태에서의 첫 발사가 가장 흔한 경로다.
  const prevLaunchRef = useRef("");
  useEffect(() => {
    const prev = prevLaunchRef.current;
    prevLaunchRef.current = launchSig;
    if (prev === launchSig) return;
    const prevTokens = new Set(prev ? prev.split("|") : []);
    let launchedPid: string | null = null;
    for (const token of launchSig ? launchSig.split("|") : []) {
      if (!token || prevTokens.has(token)) continue;
      const pid = token.split(":")[1];
      // 마지막 신규 토큰 채택 — 표시(절단 후) 집합에 있는 지문만 펼친다
      // (절단분 펼침 지정은 아코디언에 카드가 없어 무의미).
      if (pid && visibleIdsRef.current.has(pid)) launchedPid = pid;
    }
    if (!launchedPid) return;
    setExpandedDossierId(launchedPid);
    if (
      !dossierStatesRef.current.has(launchedPid) &&
      !dossierInflightRef.current.has(launchedPid)
    ) {
      fetchDossier(launchedPid);
    }
  }, [launchSig, fetchDossier]);
  // ② 소멸 전이(activitySig 무필터) = 완료 후보 → 조용한 재조회(§3.10.9 기존
  //    계약 무회귀 — prev="" 이면 소멸이 있을 수 없어 건너뛴다).
  const prevActivityRef = useRef("");
  useEffect(() => {
    const prev = prevActivityRef.current;
    prevActivityRef.current = activitySig;
    if (prev === activitySig || !prev) return;
    const cur = new Set(activitySig ? activitySig.split("|") : []);
    const donePids = new Set<string>();
    for (const token of prev.split("|")) {
      if (!token || cur.has(token)) continue;
      const pid = token.split(":")[1];
      // 토큰 소멸 ≠ 완료 — 지문이 발행 집합에서 빠져도 소멸한다. 현재 발행
      // 집합에 살아 있는 지문만 재조회한다(검수 L4-2/L1-4 — 아니면 방금 청산한
      // 캐시에 고아 엔트리가 재유입돼 재선택 시 신규 조회가 억제된다).
      if (pid && dossierIdsRef.current.has(pid)) donePids.add(pid);
    }
    for (const pid of donePids) fetchDossier(pid, { silent: true });
  }, [activitySig, fetchDossier]);

  // 인라인 배포 성공 업링크(§3.10.5) — 해당 지문 조용한 재조회(배정 현황 반영)
  // + 트리·스코프 리프레시(멱등 선등록으로 등록 수가 변했을 수 있다).
  const handleInlineDeployed = useCallback(
    (passageId: string) => {
      fetchDossier(passageId, { silent: true });
      refreshAfterLibraryChange();
    },
    [fetchDossier, refreshAfterLibraryChange],
  );

  // ── 문항 체크 상태(26-08-14 — §3.10.13) — 하단 실행 바(모바일 배포·시험지
  // 조판) 재료. **오케스트레이터 소유가 계약**: rightPanelBody 는 aside(xl+)와
  // 슬라이드오버(xl 미만) 두 트리 위치에 렌더돼 별개 인스턴스가 되므로, 패널
  // 로컬 상태면 드로어 닫기/패널 접기 한 번에 선택이 전량 소실된다(적대 검수
  // 확정). 키 = 문항 id, 값 = 표시·배포 메타 스냅샷. Map 삽입 순서 = 체크
  // 순서 = 시험지 조판(시드) 순서 — 빌더가 이 순서대로 미리보기에 올린다.
  const [pickedQuestions, setPickedQuestions] = useState<
    ReadonlyMap<string, PickedQuestionMeta>
  >(() => new Map());
  const togglePickedQuestion = useCallback(
    (questionId: string, meta: PickedQuestionMeta) => {
      setPickedQuestions((prev) => {
        const next = new Map(prev);
        if (next.has(questionId)) next.delete(questionId);
        else next.set(questionId, meta);
        return next;
      });
    },
    [],
  );
  const pickQuestionRows = useCallback(
    (
      entries: readonly (readonly [string, PickedQuestionMeta])[],
      pick: boolean,
    ) => {
      setPickedQuestions((prev) => {
        const next = new Map(prev);
        for (const [id, meta] of entries) {
          if (pick) next.set(id, meta);
          else next.delete(id);
        }
        return next;
      });
    },
    [],
  );
  const clearPickedQuestions = useCallback(
    () => setPickedQuestions(new Map()),
    [],
  );
  // 바 배포 성공 — 선택 비움 + 지문별 조용한 재조회 + 목록 리프레시 **1회**
  // (지문별 onDeployed 반복이면 refreshAfterLibraryChange 가 지문 수만큼
  // 중복 발사 — 최대 5×2 왕복, 적대 검수 minor).
  const handlePickBarDeployed = useCallback(
    (passageIds: string[]) => {
      setPickedQuestions(new Map());
      for (const pid of passageIds) fetchDossier(pid, { silent: true });
      refreshAfterLibraryChange();
    },
    [fetchDossier, refreshAfterLibraryChange],
  );

  // ── 평면 문항 선택(§3.10.17-b) — 우측 실행대(aside/슬라이드오버 이원
  // 렌더)가 소비하므로 오케스트레이터 소유(§3.10.13 과 동일 근거). Set→Map
  // 재조립은 rows 를 아는 LibraryPane 담당(controlled). ──
  const [flatPicked, setFlatPicked] = useState<
    ReadonlyMap<string, PickedQuestionMeta>
  >(() => new Map());
  const handleFlatPickedChange = useCallback(
    (next: ReadonlyMap<string, PickedQuestionMeta>) => setFlatPicked(next),
    [],
  );
  const clearFlatPicked = useCallback(() => setFlatPicked(new Map()), []);
  // 실행대 배포 성공 — 선택 비움 + 목록 리프레시 1회(문항 목록은 배포로 불변)
  const handleFlatRailDeployed = useCallback(() => {
    setFlatPicked(new Map());
    refreshAfterLibraryChange();
  }, [refreshAfterLibraryChange]);
  // 현재 대기열(pickedSheets)이 **어느 클래스에서 만들어졌는가**. 해제 가드
  // (guardSheetPickRemoval — 선언은 :1787 계열, 여기보다 뒤다)가 "클래스 전환 직후의
  // 청산"과 "사용자의 실제 해제"를 가르는 유일한 재료라, 청산과 같은 자리에서
  // 갱신되도록 **이 effect 보다 앞에** 선언해 둔다(선언 순서 역전 방지 —
  // sheetComposeOpenRef :549 와 같은 이유).
  const sheetPickClassIdRef = useRef<string | null>(null);
  // 클래스 전환 청산 — LibraryPane 의 평면 데이터 리셋과 한 쌍. 조판 표면도
  // 닫는다(타 클래스 선택 위에서 옛 조판이 이어지는 혼선 차단).
  // ⚠ 학습지 축 3상태도 **전부** 합류한다(§3.10.21 E21-5 마지막 항). 문항 축만
  //   청산하는 비대칭을 그대로 복제하면 A 클래스에서 고른 학습지가 B 클래스
  //   조판에 그대로 남고, 문서 로더(getStudioWorksheetDocs)는 새 classId 로
  //   소유 검증을 하므로 **체크는 보이는데 본문은 안 뜨는** 유령이 된다.
  useEffect(() => {
    setFlatPicked(new Map());
    setExamStudioOpen(false);
    setSheetComposeOpen(false);
    setPickedSheets(new Map());
    setActiveSheetId(null);
    // §3.10.23 E24: 구 `setComposeMode(null)` 은 여기서 **삭제**됐다. 두 open
    // 플래그를 내리는 것으로 충분하다 — 가시 산식이 이제 open ∧ 뷰 값이라
    // 남길 「모드」 자체가 없다. (클래스 전환은 centerAssetView 를 건드리지
    // 않는다. 뷰 리셋은 library-pane 이 classId effect 에서 "passages" 로
    // 되돌리고, 그 뷰에서는 두 가시 산식이 모두 거짓이라 조판이 새 클래스로
    // 새어 들어오지 않는다.)
    // 이 시점 이후의 대기열은 **새 클래스 소유**다. 해제 가드가 "전환 직후의
    // 청산"과 "사용자의 실제 해제"를 가르는 유일한 재료라(guardSheetPickRemoval
    // 주석), 청산과 같은 자리에서 한 번만 갱신한다. 자식(LibraryPane) effect 가
    // 부모보다 먼저 도는 순서 덕에, 그쪽 청산 업링크는 아직 옛 클래스로 읽혀
    // confirm 없이 통과한다 — 이미 selectClass 진입부(:558)가 물었으므로 두 번
    // 묻지 않는다.
    sheetPickClassIdRef.current = selectedClassId;
    // 미소비 배포 의도도 함께 청산 — 남겨 두면 새 클래스에서 다른 학습지를
    // 1건 고른 순간 폼이 저 혼자 펼쳐진다(id 는 이미 옛 클래스 것이라 매칭이
    // 어긋나 있어도, 의도가 살아 있는 것 자체가 오해의 원천이다).
    setPendingSheetDeployId(null);
  }, [selectedClassId]);
  // (선조회 폐기 — §3.10.17-e (m): 조판 재료가 반·학교 2건짜리 경량 질의가
  //  되면서 데워둘 이유가 사라졌다. 캐시가 없으니 반 목록도 항상 최신이다.)

  // 중앙 자산 뷰 미러(§3.10.17-b) — 생성 문제 뷰 = 우측 패널이 실행대.
  const [centerAssetView, setCenterAssetView] =
    useState<StudioAssetView>("passages");
  const handleAssetViewChange = useCallback(
    (v: StudioAssetView) => setCenterAssetView(v),
    [],
  );

  // ── 시험지 조판(§3.10.17-a v2 → (k) 단일화) — **우측 실행대 그 자리**에
  // 내장(페이지·모드 전환 0, 중앙 목록 상시 활성). 구 주석의 「보내기」 패널은
  // E24 가 지운 rightPanelLabel 분기 이름이라 더는 인용하지 않는다. 초기·이후 내용은
  // 전부 syncQuestionIds 라이브 동기화(체크 = 즉시 조판, 해제 = 즉시 제거) —
  // sessionStorage 시드는 이 경로에서 폐기(이중 주입 방지).
  // (k) 사용자 지시 "조판 버튼은 무조건 문제관리에서 누른 것과 똑같이": 발사
  // 소스 2계(flat/dossier)를 폐기 — 도시에 픽바 발사는 도시에 선택을 평면
  // 선택으로 승계(순서 보존)하고 **「시험지 조판」 뷰**로 강제 전환한 뒤, 언제나
  // flatPicked 단일 경로로 라이브 동기화한다. (지시 원문의 「문제관리」는 E24 가
  // 걷어낸 **구 필 이름**이다 — 사용자 자구라 인용은 남기되, 지금 이 배선이
  // 강제하는 뷰 값은 "exam" 이다. 새 이름으로 고쳐 인용하면 원문 추적이 끊긴다.) ──
  // ── 【E24】 구 `composeMode` state 는 **여기서 소멸했다** ────────────────────
  // E22-3 이 이 자리에 `useState<ComposeMode>(null)` 을 두었던 유일한 근거는
  // 「두 조판이 같은 뷰("studio") 소속이라 뷰 값이 상호배제를 못 준다」였다.
  // E24 가 조판실을 2필로 해체해 그 전제를 소멸시켰으므로 state 와 세터 호출
  // 11곳이 전부 사라졌다. **다시 만들지 마라** — 뷰와 모드 두 축이 공존하면
  // 「open 은 true 인데 mode 가 옛 축」이라는 도달 불가 조합이 되살아난다.
  // 상호배제의 현재 근거는 파일 상단 【E24 최상위 불변식】 주석이다.
  const [examStudioOpen, setExamStudioOpen] = useState(false);
  // LibraryPane 이 올리는 「**시험지 조판 뷰** 강제」 명령 채널(§3.10.17-e (k) →
  // §3.10.22 U12-4 → **§3.10.23 E24** 로 인자가 "questions" → "studio" → `"exam"`
  // 재조준) — handleSelectView(…) 경로라 오버레이 닫기·fetch 불변식 공유.
  // ⚠ 채널이 **2개인 것이 계약**이다(sheetComposeViewControlRef 와 한 쌍). 두
  // 채널이 서로 **다른 뷰 값**을 넘기는 것이 곧 「어느 조판을 켜려고 뷰를
  // 옮기는가」라는 정보이고, E22 처럼 둘 다 같은 값("studio")을 넘기면 그
  // 정보가 소실돼 composeMode 같은 보조 축을 다시 만들어야 한다.
  // (선언을 openComposeFromFlat **앞**으로 올렸다 — 그 경로가 이 ref 를 읽는다.)
  const composeViewControlRef = useRef<(() => void) | null>(null);
  const registerComposeViewControl = useCallback(
    (control: (() => void) | null) => {
      composeViewControlRef.current = control;
    },
    [],
  );
  const openComposeFromFlat = useCallback((_ids: string[]) => {
    // 【E24 최상위 불변식】 (a) open + (b) 자기 뷰 강제를 **한 커밋에**.
    // 구 `setComposeMode("exam")` 이 있던 자리 — 이제 **뷰가 곧 모드다**.
    // (b) 를 빼면 이 CTA 는 시험지 조판 뷰 밖(학습지 조판·지문관리)에서 눌렸을 때
    // 표면이 열렸는데 `centerAssetView !== "exam"` 이라 **영원히 보이지 않는다**.
    setExamStudioOpen(true);
    composeViewControlRef.current?.();
  }, []);
  const openComposeFromDossier = useCallback(
    (_ids: string[]) => {
      // 도시에 선택 → 평면 선택 승계(Map 삽입 순서 = 체크 순서 = 조판 순서
      // 보존) 후 도시에 픽은 비운다(선택의 거처가 시험지 조판 뷰의 목록으로 이동).
      if (pickedQuestions.size > 0) {
        setFlatPicked(new Map(pickedQuestions));
        setPickedQuestions(new Map());
      }
      // 【E24 최상위 불변식】 (b) 자기 뷰 강제 + (a) open — 구 setComposeMode("exam")
      // 자리. 이 경로는 **지문관리 뷰**에서 발사되므로 (b) 가 없으면 100% 안 보인다.
      composeViewControlRef.current?.();
      setExamStudioOpen(true);
    },
    [pickedQuestions],
  );
  // 닫기 = 자기 open 플래그만 내린다. 구 `setComposeMode(cur => …)` 은 **삭제**
  // 됐다(E24 §1②) — 모드 축이 없으니 「open 인데 mode 는 남의 축」이라는 도달
  // 불가 조합 자체가 만들어지지 않는다. 이 뷰(exam)의 우측은 곧바로 실행대로
  // 복귀한다(anyComposeVisible 이 false 가 되면 rightPanelView 가 다시 뜬다).
  const closeExamStudio = useCallback(() => {
    setExamStudioOpen(false);
  }, []);
  const composeSyncIds = useMemo(() => [...flatPicked.keys()], [flatPicked]);
  // §3.10.22 U13-4: 합본에서 **문항 구간의 러닝헤더 제목**. 값이 없으면
  // pages.tsx 폴백이 **활성 학습지 제목**을 문항 페이지 머리글에 찍어 오귀속이
  // 인쇄물에 남는다(sheet-compose-surface.tsx 의 questionsTitle 주석). 개수를
  // 섞지 않는 이유: 이 문자열은 표면에서 docHeader 객체 **1개**로 접혀 전 조각이
  // 공유하므로, 체크할 때마다 값이 바뀌면 그 객체 참조가 매번 갈려 전량 재합성·
  // 재측정이 돈다(R4 실측 489ms).
  const questionsComposeTitle = useMemo(
    () => (selectedClass ? `${selectedClass.name} 문항` : "문항"),
    [selectedClass],
  );

  // ── 학습지 조판(§3.10.21 E21-5) — 문항 축 배선의 **동형 복제**다.
  // 상태 3개(sheetComposeOpen · pickedSheets · activeSheetId)가 전부
  // **오케스트레이터 소유**인 근거는 :1409-1414 주석과 한 글자도 다르지 않다:
  // 우측 본문(rightPanelView)이 aside(xl+)와 슬라이드오버(xl 미만) 두 트리
  // 위치에 렌더돼 별개 인스턴스가 되므로, 아래에 두면 드로어를 한 번 여닫는
  // 것만으로 체크가 갈라진다. pickedSheets 의 **Map 삽입 순서 = 체크 순서 =
  // 조판(부착 문서 배열) 순서**이며, 조판 표면은 참조가 바뀔 때만 재조회하므로
  // **내용이 같으면 같은 Map 참조를 유지**해야 한다(체크 변동에서만 새 Map).
  const [sheetComposeOpen, setSheetComposeOpen] = useState(false);
  const [pickedSheets, setPickedSheets] = useState<
    ReadonlyMap<string, SheetPickMeta>
  >(() => new Map());
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  // 안정 콜백([] deps) 안에서 최신 선택을 읽는 미러(dossierStatesRef 동일 관용구).
  const pickedSheetsRef = useRef(pickedSheets);
  pickedSheetsRef.current = pickedSheets;
  // ── 학습지 픽 **출처 원장**(reportId → "dossier" | "list") ────────────────
  // 아래 「체크 프룬 ①-b」가 이 값을 읽는다. 실측 근거
  // (.tmp-worksheet-compose/_a22-i.log · 클래스 「2학년」): 병합 목록(당시 이름
  // 「조판실」 = 지금의 **「학습지 조판」 뷰**)에서 학습지 8건을 체크한 뒤
  // 지문관리 탭에서 지문 1행을 클릭하고 돌아오면
  // "P1 복귀 후: 0 w / 3 q" — 학습지 8건 전부가 confirm·토스트·콘솔 에러
  // 0건으로 증발했다(문항 3개는 무손상 = 축 비대칭).
  // 원인: 프룬의 keep 집합은 **도시에 발행 집합**(visibleDossierPassages)인데
  // 「학습지 조판」 뷰의 학습지 목록은 listStudioClassWorksheets = **클래스
  // 전역**이라 두 집합이 거의 겹치지 않는다. 문항 축(pickedQuestions)은 애초에 도시에 전용
  // 상태라 이 성질을 공짜로 갖고 있었고, 학습지 축만 **두 표면 공용 상태**에
  // 같은 규칙을 얹은 것이 뿌리였다.
  // → 출처를 실어 「도시에에서 담은 픽」만 프룬 대상으로 되돌린다. U13-6 의
  //   목적(도시에 하단 바의 유령 칩 청소)은 그대로 달성되고, 학습지 대기열은
  //   살아남는다. 미기록(unknown)은 **자르지 않는다** — 조용한 소실보다
  //   유령 칩이 싸다(E21-6-4 가 정한 실수 방향과 같은 쪽이다).
  const sheetPickOriginRef = useRef(new Map<string, "dossier" | "list">());
  const noteSheetPickOrigin = useCallback(
    (
      next: ReadonlyMap<string, SheetPickMeta>,
      prev: ReadonlyMap<string, SheetPickMeta>,
      origin: "dossier" | "list",
    ) => {
      // **신규 키만** 기록한다. 전량 덮어쓰면 도시에에서 담은 항목이 목록 표면
      // 토글 한 번에 "list" 로 승격돼 유령 칩 청소가 영영 돌지 않는다.
      for (const id of next.keys()) {
        if (!prev.has(id)) sheetPickOriginRef.current.set(id, origin);
      }
    },
    [],
  );
  // 위 confirmSheetComposeDiscard 가 읽는 미러 2개 — 선언 순서상 selectClass 가
  // 먼저라 ref 경유다(clearDossierRef/collapseTreeRef 와 같은 이유).
  sheetComposeOpenRef.current = sheetComposeOpen;
  sheetPickCountRef.current = pickedSheets.size;

  // ── 【필수】 대기열 축소 = 미저장 편집 소실 가드(§3.10.21 E21-6 4) ──────────
  // 조판 표면은 닫기·활성 전환 두 경로에만 confirm 을 갖고 있었고
  // (`sheet-compose-surface.tsx:417-427`·`:429-443`), **체크 해제 경로에는 없었다.**
  // 그래서 편집 중인 학습지를 목록에서 해제하면 표면의 활성 자동 수렴(:308-314)이
  // 다음 문서로 넘어가고 `key={activeDoc.reportId}`(:706)가 편집기를 재마운트해
  // 수십 분의 편집이 경고 없이 증발했다 — 실측(`.tmp-worksheet-compose/_audit-l3-b.mjs`):
  // 타이핑 후 `dirty: 2` → 해제 → `dialogs: []`(confirm 0건) → `dirty: 0` ·
  // `ZQX still in canvas: false`, 재체크해도 복구 불가.
  // dirty 는 표면 로컬 상태라 여기서 보이지 않으므로, 표면이 등록한 프로브를
  // 싱글턴에서 읽는다(`lib/studio/sheet-compose-dirty-guard.ts` 머리주석 = 왜 prop
  // 사슬이 아닌가). **대기열을 줄이는 모든 커밋 지점**이 이 함수를 지나야 한다.
  //
  // 클래스 전환 청산만 예외다: `library-pane.tsx:1036-1055` 가 classId effect 에서
  // 빈 Map 을 올리고(그 직후 :1653 계열 리셋 effect 가 3상태를 청산한다) 자식
  // effect 가 부모 effect 보다 먼저 도는 구조라, 여기서 confirm 을 띄우면 사용자가
  // "취소"를 눌러도 뒤이어 오는 리셋이 어차피 비운다 — **막지 못하는 경고**는
  // 경고가 아니라 잡음이다. 픽이 만들어진 클래스와 현재 선택 클래스가 다르면
  // (= 전환 직후 청산) 조용히 통과시킨다 — 그 전환 자체는 진입부 confirm
  // (`selectClass` :558 · `selectClassQuiet` :580)이 이미 물으므로 고지가 비지 않는다.
  // (sheetPickClassIdRef 선언은 클래스 리셋 effect 바로 앞 :1673 — 갱신 자리와 붙여 뒀다.)
  const guardSheetPickRemoval = useCallback(
    (next: ReadonlyMap<string, SheetPickMeta>) => {
      if (sheetPickClassIdRef.current !== selectedClassIdRef.current) return true;
      return confirmSheetPickRemoval(pickedSheetsRef.current, next);
    },
    [],
  );

  // §3.10.22 U13-5: **6장 상한 클램프 폐기**(클램프 4지점 중 ①). 구 코드는
  // 초과분을 잘라 내고 「먼저 고른 6장을 유지합니다」 토스트를 띄웠다 — 상한이
  // 사라졌으므로 자르지도 알리지도 않는다. **가드(guardSheetPickRemoval)는
  // 그대로 남긴다**: 상한과 dirty confirm 은 같은 함수에 얽혀 있었을 뿐 완전히
  // 다른 계약이고(지시서 U13-5 명시), 가드를 함께 걷으면 E21-6-4 의 편집 증발이
  // 그대로 재발한다.
  const applySheetPicked = useCallback(
    (next: ReadonlyMap<string, SheetPickMeta>) => {
      // 평면 목록(체크박스·마키 해제·전체 해제)이 Map 을 통째로 올리는 경로 —
      // **실측 소실이 난 바로 그 경로**다. 취소면 이전 Map 참조를 그대로 둔다
      // (참조 유지 = 조판 재조회 0 · 편집기 재마운트 0).
      if (!guardSheetPickRemoval(next)) return;
      // 이 경로는 **목록 표면 전용**이다(library-pane.tsx 의 학습지 체크·마키·
      // 전체 해제 업링크). 그 픽은 클래스 전역 목록에서 만들어졌으므로 도시에
      // 표시 집합 변동으로 잘려서는 안 된다(출처 "list").
      noteSheetPickOrigin(next, pickedSheetsRef.current, "list");
      setPickedSheets(next);
    },
    [guardSheetPickRemoval, noteSheetPickOrigin],
  );
  // ── §3.10.22 E22-4 보강: **2축 원자 커밋용 분리 채널 2개**(적대 검수 major) ──
  // 「학습지 조판」 뷰의 병합 목록(학습지 + 문항 — E24 §④)은 단일 DragSelect 가
  // 두 축을 **한 제스처로** 훑는다. (시험지 조판 뷰는 lockedKind="question" 이라
  //  문항만 보여 2축이 섞이지 않는다. 그래도 이 채널 쌍은 sheet 뷰에서 그대로
  //  필요하므로 걷어내지 마라.)
  // 그런데 커밋이 축별로 순차라, 문항 축을 먼저 무조건 커밋한 뒤 학습지 축에서
  // 가드가 뜨는 구조였다 — 사용자가 confirm 을 「취소」해도 문항 대기열은 이미
  // 갈아치워진 뒤였다. 실측(.tmp-worksheet-compose/_a22-f-dirty.mjs ·
  // _a22-verify-16.mjs): 학습지 2 + 문항 3 체크 → 활성 문서 타이핑(dirty 2) →
  // 미체크 3행 마키 → confirm **dismiss** → 문항 q#1~#3 이
  // cmsypvnf/vec/ulr → cmsypsr2/sdz/sdx 로 통째 교체(체크 순번 = 인쇄 순서까지
  // 소멸), 학습지 축만 정상 롤백.
  // ※ 2026-08-20 마키 누적 개편으로 폭발 반경이 좁아졌다 — 그때는 base 가 빈
  //   집합이라 「가시 체크 전량이 removed 후보」가 **기본 동작**이었지만, 이제
  //   담기 드래그는 순수 추가라 removed 를 아예 만들지 않는다. removed 는 해제
  //   드래그(담긴 행에서 시작)에서만 나온다. 구조는 그대로 필요하다.
  // → 해법은 **선(先) 질의 → 후(後) 2축 커밋**. 가드는 이미 (prev,next) 순수
  //   판정 함수(sheet-compose-dirty-guard.ts:79)라 커밋과 분리 호출이 가능하다.
  //   여기서 「묻기만 하는」 채널과 「이미 물었으니 두 번 묻지 않는」 원자 세터를
  //   각각 노출한다. ⚠ 이 둘은 **한 쌍**이다 — 한쪽만 내리면 물음 없이 커밋되거나
  //   두 번 묻는다. applySheetPicked(가드 포함)는 기존 경로 전용으로 그대로 둔다.
  const canRemovePickedSheets = useCallback(
    (next: ReadonlyMap<string, SheetPickMeta>) => guardSheetPickRemoval(next),
    [guardSheetPickRemoval],
  );
  const commitPickedSheetsUnchecked = useCallback(
    (next: ReadonlyMap<string, SheetPickMeta>) => {
      // 「학습지 조판」 뷰 병합 목록(2축 원자 커밋)도 **목록 표면**이다 — 출처 기록을
      // 빠뜨리면 그 경로로 담은 픽이 unknown 으로 남는다. unknown 은 안전
      // 기본값(자르지 않음)이지만, 기록이 있어야 유령 칩 청소가 「도시에에서
      // 담은 것만」이라는 규칙대로 정확히 돈다.
      noteSheetPickOrigin(next, pickedSheetsRef.current, "list");
      setPickedSheets(next);
    },
    [noteSheetPickOrigin],
  );
  // 반환 boolean = 「실제로 비웠는가」. 하단 실행 바의 「선택 해제」가 두 축을
  // 원자적으로 걷기 위해 필요하다(dossier-pick-bar.tsx clearAll 주석 참조) —
  // 취소를 false 로 알리지 않으면 바가 문항 축을 이미 비운 뒤라 「취소했는데
  // 문항만 증발」이 된다. 기존 호출부(SheetsActionRail onClear 등)는 값을
  // 무시하므로 무회귀다.
  const clearPickedSheets = useCallback(() => {
    // 실행대 「전체 해제」 — 활성 문서까지 함께 빠지므로 같은 가드를 지난다.
    const empty = new Map<string, SheetPickMeta>();
    if (!guardSheetPickRemoval(empty)) return false;
    setPickedSheets(empty);
    return true;
  }, [guardSheetPickRemoval]);
  // 도시에 행 체크 토글 — 평면 목록은 rows 를 아는 LibraryPane 이 Map 을 통째로
  // 올리므로(controlled) 이 경로는 도시에 전용이다.
  const toggleSheetPick = useCallback(
    (reportId: string, meta: SheetPickMeta) => {
      const prev = pickedSheetsRef.current;
      const next = new Map(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        // (클램프 4지점 중 ② 폐기 — 담기는 이제 개수로 막지 않는다.)
        next.set(reportId, meta);
      }
      // 도시에 행 체크 해제도 평면과 같은 소실 경로다(같은 pickedSheets 를 줄인다).
      if (!guardSheetPickRemoval(next)) return;
      // 도시에 전용 경로 = 유령 칩의 유일한 발원지. 이 픽만 프룬 대상이다.
      noteSheetPickOrigin(next, prev, "dossier");
      setPickedSheets(next);
    },
    [guardSheetPickRemoval, noteSheetPickOrigin],
  );
  // 활성 문서 프룬 — 체크 해제로 활성이 사라지면 대기열 첫 문서로 내린다.
  // (조판 표면도 자체 수렴 후 onActiveReportIdChange 로 되돌려 주지만, 표면이
  //  숨김 마운트이거나 아예 닫혀 있는 동안에도 상태가 정직해야 한다.)
  // 그리고 **조판 순서 동기화** — [E27] 여기서 도는 축은 **학습지 대기열 하나뿐**
  // 이다: 학습지를 지문 그룹 단위로 묶고 그 그룹 안에서 활성 문서를 선두로 올린다.
  // (문항 대기열은 손대지 않는다 — 아래 「교차축 정정」 절이 그 이유의 정본이다.)
  // 활성이 바뀌는 경로가 4개(칩 클릭 →
  // onActiveReportIdChange · 행 [학습지 조판] prefer · 도시에 발사 · 표면 자동 수렴)
  // 이고 대기열 커밋 지점은 10곳이라(클래스 리셋 · applySheetPicked ·
  // commitPickedSheetsUnchecked · clearPickedSheets · toggleSheetPick · 이 effect ·
  // composeSheetFromRow · composeSheetsFromDossier · deploySheetFromRow · 유령칩
  // 프룬 — 원장은 E27-RECON 축 D. ⚠ 줄번호로 인용하지 마라, E27 이 전량 밀었다),
  // 각 지점에서 따로 정렬하면 한 곳만 빠져도 다시
  // 어긋난다. 여기 **한 곳**이 활성/대기열 두 상태의 합류점이라
  // 「선두 = 활성 = 인쇄 첫 문서」 + 「같은 지문끼리 붙는다」 두 불변식을 한 번에
  // 세운다. **개별 커밋 지점에 정렬을 흩뿌리지 마라** — 무음 결함의 정확한 제조법이다.
  // (근거·실측은 withPassageGroupedOrder 주석 — compose-flow.ts:207 이 활성을 항상
  //  스트림 선두에 두는데 순번 숫자는 이 Map 삽입 순서 파생이라 3,1,2 로 갈렸다.)
  // 여기서는 **재정렬만** 한다 — 제거가 없으므로 guardSheetPickRemoval(조판 소실
  // 가드) 대상이 아니다(가드는 「대기열이 줄어드는」 경로 전용).
  //
  // ⚠ §3.10.22 U13-8 은 **되살아났다**(E27 초판이 잠시 완화했다가 적대검수로 복원).
  //   「이 정렬 규칙을 문항 축(flatPicked)에 적용하지 마라」 — 활성-선두 규칙이든
  //   그룹 정렬이든 **여기서는** 문항 Map 을 건드리지 않는다. E27 초판은 「활성
  //   개념이 없으니 그룹 정렬만은 안전하다」고 판단해 문항 축까지 정렬했는데, 그
  //   판단이 놓친 것은 활성이 아니라 **소비처**였다(아래 교차축 정정 절).
  //   다만 구 주석이 덧붙였던 근거(「문항은 compose-flow 가 companions 루프 직후에
  //   한 덩어리로 push 하므로 언제나 맨 뒤」)는 E27 R1-3 이 buildComposedView 에
  //   `questionsAfterDoc` 을 뚫으면서 **더는 참이 아니다**: 문항은 자기 지문 문서
  //   **직후**에 끼고, 꼬리에 남는 것은 정답표와 「학습지 없는 지문의 문항」뿐이다.
  //   그 순서를 만드는 자리가 이제 **학습지 조판 표면**으로 옮겨졌을 뿐이다.
  //
  // ══ ⚠ 【교차축 정정 — E27 적대검수 확정】 문항 그룹 정렬은 **여기서 하지 않는다** ══
  //
  //   초판 E27 은 이 effect 안에서 `withPassageGroupedQuestionOrder(flatPicked, …)`
  //   까지 돌리고 「시험지 조판에도 같은 순서가 흐른다 — 의도된 동작」이라고 적었다.
  //   **그 단언은 거짓이었고, 그 코드는 걷어냈다.** 근거는 소비처 한 곳이다:
  //
  //     `exam-paper-builder-client.tsx:1182-1191` (외부 선택 라이브 동기화)
  //       const toAdd    = syncQuestionIds.filter(id => !prev.has(id));
  //       const toRemove = [...prev].filter(id => !next.has(id));
  //       if (toAdd.length > 0) …;  for (const id of toRemove) …;
  //
  //   **집합 diff 전용**이다. 순수 재정렬 커밋은 `toAdd=[] · toRemove=[]` 라
  //   `paperItems` 가 한 글자도 안 바뀐다 — 순서 동기 호출 자체가 없다.
  //   반면 순번 배지는 같은 Map 파생이라 **즉시** 바뀐다
  //   (`composer-list-pane.tsx:553-558` questionOrder ·
  //    `passage-dossier-pane.tsx:1548` 툴팁 「체크 순서 N번 — 시험지 조판 순서」).
  //   ⇒ 학습지를 한 장 체크하는 것만으로 **문항 배지만 바뀌고 시험지 인쇄 순서는
  //     그대로**가 된다. 이 파일이 이미 한 번 수리한 「배지 1,2,3 인데 인쇄는 3,1,2」
  //     (withPassageGroupedOrder 주석 원장)의 **정확한 재발**이다.
  //
  //   그래서 `flatPicked` 는 다시 **체크 순서 = 배지 = 시험지 인쇄 순서** 하나뿐이고,
  //   **문항 그룹 순서는 「학습지 조판 표면 안에서만」 만든다**
  //   (`workbench/sheet-compose-surface.tsx` — 그 표면이 `questionIds` 를 만들 때
  //    withPassageGroupedQuestionOrder 를 import 해 지문 그룹 순서로 정렬한다.
  //    그래서 이 함수는 여기 남아 **export** 돼 있다 — 지우지 마라).
  //
  //   ⚠ **다음 사람에게**: 「일관성 있게 오케스트레이터에서 한 번에 정렬하자」고
  //     되돌리지 마라. 되돌리는 순간 위 갈림이 그대로 재발한다. 시험지 축까지
  //     정렬을 전파하려면 **공용 빌더의 sync effect 에 「순서만 바뀐」 분기를
  //     additive 로 여는 것이 유일한 길**인데, 그건 `:1167-1170` 이 경계한
  //     「사용자 수동 정렬을 되돌리는 싸움」을 다시 여는 일이라 기각됐다.
  //
  //   ⚠ 학습지 축(`withPassageGroupedOrder`)은 **그대로 둔다.** 학습지는 배지도
  //     인쇄도 둘 다 이 Map 파생이라(`composer-list-pane.tsx:552` sheetOrder ·
  //     `passage-dossier-pane.tsx:983` · 표면 칩 index+1 · compose-flow 스트림)
  //     여기서 정렬해야 세 표면이 동시에 정합한다. 두 축의 사정이 다르다.
  //
  // ── 【수렴 증명】 setState 가 자기 deps 를 다시 때리는데 왜 유한한가 ──────────
  // deps 는 `[pickedSheets, activeSheetId]` 이고 이 effect 는 그중 하나
  // (pickedSheets)를 스스로 갱신한다 = 「자기가 만든 새 Map 이 다시 들어오는」
  // 구조다. 그래도 멈추는 이유는 정렬 함수가 **멱등 + 무동작 수렴**이기 때문이다
  // (withPassageGroupedOrder 규칙 ④).
  //   P1: 입력 (S0, a) → S1 = withPassageGroupedOrder(S0, a) → S1 !== S0 이면 커밋
  //   P2: 입력 (S1, a)  ← P1 이 커밋한 값 그대로
  //       withPassageGroupedOrder(S1, a) 는 **S1 자신**을 돌려준다: S1 은 이미
  //       「활성 그룹 → 나머지 그룹(첫 등장 순)」으로 뭉쳐 있어 다시 그룹핑해도
  //       버킷 구성·버킷 순서·버킷 내부 순서가 전부 같고, 활성 문서도 이미 자기
  //       그룹의 선두다 → nextKeys 시퀀스가 S1 의 키 시퀀스와 글자 그대로 일치
  //       → 규칙 ④ 발화 → setPickedSheets **미호출**.
  //   ⇒ P2 에서 커밋 0 → 재렌더 0 → P3 없음. **정렬은 최대 2패스에서 정지**한다.
  //   (활성 프룬 조기 반환이 발화한 프레임은 그 앞에 1패스가 더 붙지만, 그 패스는
  //    activeSheetId 를 한 번 바꾸고 끝나므로 총 3패스가 상한이다.)
  // ⚠ 이 증명은 **전적으로** 「시퀀스 전체 비교 후 원본 참조 반환」에 의존한다.
  //   「항상 새 Map 반환」으로 바꾸는 순간 P2 가 커밋을 내고 P3·P4… 가 무한히 돈다
  //   — 타입 에러 0 · 콘솔 0 · 화면만 멈춘다.
  //   순수 로직 게이트: `node .tmp-worksheet-compose/_e27-u3-order.mjs`
  //   (두 함수를 타입만 지워 복제 · 정렬 8케이스 + 퍼즈 5000케이스 전원 **2패스**
  //    수렴 확인. 위 증명이 깨지면 그 하네스가 「수렴 실패(무한루프)」로 죽는다.)
  // ⚠ **`flatPicked` 를 이 effect 의 deps 에 다시 넣지 마라.** 문항 축은 이제 여기서
  //   손대지 않는다(위 교차축 정정 절). deps 에 넣으면 문항을 체크할 때마다 학습지
  //   정렬이 헛돌기만 한다.
  useEffect(() => {
    // 활성이 대기열에서 사라진 프레임 — 활성만 수렴시키고 물러난다. 여기서 정렬까지
    // 하면 곧 바뀔 activeId 로 그룹 선두를 잘못 잡는다(다음 패스에서 정상 정렬된다).
    if (activeSheetId !== null && !pickedSheets.has(activeSheetId)) {
      setActiveSheetId(pickActiveSheetId(pickedSheets, null));
      return;
    }
    // ⚠ [E27] `activeSheetId === null` 이어도 **그룹 정렬은 돈다**(구 코드의
    //   `if (activeSheetId === null) return;` 조기 반환을 걷어냈다). 활성이 없어도
    //   지문 묶음은 유지돼야 한다 — 활성은 「어느 그룹이 맨 앞인가」만 정한다.
    const orderedSheets = withPassageGroupedOrder(pickedSheets, activeSheetId);
    // 참조가 그대로면 setState 자체를 하지 않는다 → 재렌더·재조회 0, 루프 없음.
    if (orderedSheets !== pickedSheets) setPickedSheets(orderedSheets);
  }, [pickedSheets, activeSheetId]);

  // 「**학습지 조판 뷰** 강제」 명령 채널(§3.10.21 E21-5 → §3.10.22 U12-4 →
  // **§3.10.23 E24** 로 인자가 "worksheets" → "studio" → `"sheet"` 재조준됨) —
  // 문항 축 onComposeViewControl 의 동형 복제. handleSelectView(…) 경로라
  // 오버레이 닫기·인테이크 복귀 불변식을 그대로 공유한다.
  // **채널은 2개를 유지한다** — 「어느 조판을 켜려고 뷰를 옮기는가」가 정보이고,
  // 합치면 그 정보가 소실된다(E22-4 / U12-4). E24 에서 그 정보는 곧 **뷰 값**이라
  // 두 채널이 서로 다른 값을 넘기는 것이 상호배제의 유일한 근거가 됐다.
  // 이 채널은 §⑥ 요약 스트립의 「학습지 조판 →」(뷰 전환만)도 재사용한다 —
  // 새 채널을 뚫지 마라(뚫으면 handleSelectView 의 오버레이·fetch 불변식이 갈린다).
  const sheetComposeViewControlRef = useRef<(() => void) | null>(null);
  const registerSheetComposeViewControl = useCallback(
    (control: (() => void) | null) => {
      sheetComposeViewControlRef.current = control;
    },
    [],
  );

  // ⑩ 조판 발사 경로 단일화 — 어디서 눌러도 「**학습지 조판 뷰** + 우측 조판」
  // 한 화면으로 수렴한다(문항 축 openComposeFromDossier 와 동형).
  // **문항 축과 다른 점 1가지**: 문항은 도시에 픽(pickedQuestions)과 평면 픽
  // (flatPicked) **2계**를 승계해야 했지만(:1517-1522), 학습지는 두 표면이
  // 처음부터 **같은 축(reportId)** 을 쓰고 같은 pickedSheets 를 controlled 로
  // 공유하므로 승계 자체가 존재하지 않는다 — 대기열은 그대로 두고 뷰만 옮긴다.
  const openSheetComposeFromRail = useCallback((_ids: string[]) => {
    // 【E24 최상위 불변식】 (a) open + (b) 자기 뷰 강제. 구 setComposeMode("sheet")
    // 자리 — **뷰가 곧 모드다**. (E25 개정) 이 CTA 의 현재 역할은 **재개방
    // 어포던스**다: 자동 개방(제7 경로) 이후 실행대는 「픽 0 · 수동 폐쇄 직후 ·
    // 배포 인텐트」에서만 보이고, 그중 CTA 가 눌리는 상태는 수동 폐쇄 직후와
    // <xl(억제 ③ 로 자동 개방이 없는 화면) 두 가지다. 특히 <xl 드로어에서는 이
    // CTA 가 유일한 개방 수단인데 그 화면의 뷰 값은 이미 sheet 라도, (b) 를 빼면
    // xl+ 로 넓힌 재진입·타 뷰 발사 조합에서 표면이 열렸는데 보이지 않는 사고
    // (에러 0 · "버튼이 안 먹는다")가 그대로 재개한다 — (b) 존치.
    setSheetComposeOpen(true);
    sheetComposeViewControlRef.current?.();
  }, []);
  // 평면 목록 행 [학습지 조판] — 체크 없이 눌러도 1장 조판이 성립해야 하므로
  // 대기열에 없으면 뒤에 덧붙인다(도시에 composeIdsWith :917-926 와 같은 정책).
  // (클램프 4지점 중 ③ 폐기 — 덧붙이기를 개수로 막지 않는다.)
  const composeSheetFromRow = useCallback(
    (meta: SheetPickMeta) => {
      const prev = pickedSheetsRef.current;
      let next = prev;
      if (!prev.has(meta.reportId)) {
        next = new Map(prev).set(meta.reportId, meta);
        // 목록 행에서 덧붙인 픽 — 도시에 표시 집합과 무관하다(출처 "list").
        noteSheetPickOrigin(next, prev, "list");
        setPickedSheets(next);
      }
      setActiveSheetId((cur) => pickActiveSheetId(next, cur, meta.reportId));
      // 【E24 최상위 불변식】 (b) 자기 뷰 강제 + (a) open — 구 setComposeMode("sheet")
      // 자리. 이 행은 **시험지 조판 뷰의 병합 목록에서도** 눌릴 수 있으므로
      // (sheet 뷰 목록은 학습지+문항 병합) 뷰 강제가 빠지면 그쪽에서 표면이
      // 열렸는데 보이지 않는다.
      sheetComposeViewControlRef.current?.();
      setSheetComposeOpen(true);
    },
    [noteSheetPickOrigin],
  );
  // 도시에 행 [학습지 조판] — 인자는 「대기열 ∪ 이 행」 순서 배열(id 만).
  // 메타 복원 실패분은 조용히 빼지 않고 건수를 고지한다(E21-0).
  const composeSheetsFromDossier = useCallback((reportIds: string[]) => {
    const picked = pickedSheetsRef.current;
    const states = dossierStatesRef.current;
    const next = new Map<string, SheetPickMeta>();
    let dropped = 0;
    // (클램프 4지점 중 ④ 폐기 — `over` 카운터와 상한 토스트가 함께 사라졌다.
    //  메타 복원 실패분 `dropped` 고지는 **상한과 무관한 별개 계약**이라 유지한다.)
    for (const id of reportIds) {
      if (next.has(id)) continue;
      const meta = resolveSheetPickMeta(id, picked, states);
      if (meta) next.set(id, meta);
      else dropped += 1;
    }
    if (next.size === 0) {
      toast.error("조판할 학습지를 찾지 못했습니다. 목록을 새로고침해 주세요.");
      return;
    }
    // 이 경로는 대기열을 **통째로 교체**한다(도시에 지문 스코프 목록으로). 편집 중인
    // 문서가 그 목록에 없으면 체크 해제와 똑같이 증발하므로 같은 가드를 지난다.
    // 토스트보다 **먼저** 물어본다 — 취소하면 드롭 고지도 나가지 않아야 한다.
    if (!guardSheetPickRemoval(next)) return;
    if (dropped > 0) {
      toast.error(`${dropped}건은 정보를 찾지 못해 조판에서 빠졌습니다.`);
    }
    // 도시에 발사로 **새로** 합류한 항목만 출처가 도시에다. 이미 대기열에
    // 있던(목록에서 담은) 항목의 출처는 그대로 둔다.
    noteSheetPickOrigin(next, picked, "dossier");
    setPickedSheets(next);
    setActiveSheetId((cur) => pickActiveSheetId(next, cur));
    // 【E24 최상위 불변식】 (b) 자기 뷰 강제 + (a) open — 구 setComposeMode("sheet")
    // 자리. 이 경로는 **지문관리 뷰**에서 발사되므로 (b) 가 없으면 100% 안 보인다.
    sheetComposeViewControlRef.current?.();
    setSheetComposeOpen(true);
  }, [guardSheetPickRemoval, noteSheetPickOrigin]);
  // 닫기 = 자기 open 플래그만 내린다(closeExamStudio 와 대칭 — 같은 근거).
  // 구 `setComposeMode(cur => …)` 은 E24 §1② 로 **삭제**됐다.
  const closeSheetCompose = useCallback(() => {
    setSheetComposeOpen(false);
  }, []);
  // 【E25-1 3】 <xl 드로어 탈출구 — 조판 가시 고지에는 닫을 수단이 0 이었다(표면의
  // [돌아가기]는 hidden aside 안이라 좁은 화면에서 도달 불가·Escape 도 offsetParent
  // 판정으로 불활성). 억제 ③ 이후 <xl 자동 개방은 없지만, 명시 경로(행 액션·CTA)로
  // 연 뒤 창을 좁힌 상태가 여전히 남아 탈출구는 필요하다.
  // 자구는 **접기 전용**(confirmSheetComposeCollapse — 「조판을 접으면 사라집니다」)
  // 이다. 구현 초판이 재사용한 REMOVE 자구(「조판에서 빼면」)는 대기열이 통째로
  // 보존되는 이 동작에서 거짓 경고였다(적대검수 minor 확정 — 거짓인 경고는 confirm
  // 자체를 불신하게 만든다는 이 파일 자구 2벌 원칙 그대로). 잃는 것은 미저장 편집
  // 뿐이므로 dirty 아니면 조용히 통과한다.
  // exam 축은 IndexedDB 초안 계열(신규 작성 자동 보존)이라 즉시 접는다.
  const collapseSheetComposeFromDrawer = useCallback(() => {
    if (!confirmSheetComposeCollapse()) return;
    setSheetComposeOpen(false);
  }, []);

  // §3.10.22 U13-3 → §3.10.23 E24 §⑥: **합본 조판 CTA** — 학습지 ≥1 **그리고**
  // 문항 ≥1 일 때만 노출된다(노출 판정은 렌더부). 합본 표면은 학습지 조판 표면
  // 그 자체이고(문항은 그 표면이 additive prop 으로 받아 A4 묶음 뒤에 이어 붙인다),
  // 그래서 **학습지 축**이다. 문항만 고른 경로는 이 CTA 가 아니라
  // QuestionsActionRail 의 [시험지 조판]이 담당한다 — 문항이 ReportPages 호스트로
  // 오면 시험지 빌더의 IntersectionObserver 페이지 가상화를 잃기 때문이다
  // (E22-6: 51페이지 1,311노드 → 약 12,800노드).
  //
  // ⚠ **이 CTA 의 집은 「학습지 조판」 뷰다**(E24 §⑥). 학습지 축 채널로 뷰를
  // 강제하므로 그 뷰에서 누르면 **같은 뷰에 머문다(튕김 0)** — 시험지 조판 뷰에
  // 이 CTA 를 복제하면 누르는 순간 사용자가 방금 고른 탭 밖으로 튕겨 나가고,
  // 그것이 바로 이번 개편이 없애려는 「내가 어디 있는지 모르겠다」이다.
  const openCombinedCompose = useCallback(() => {
    // 【E24 최상위 불변식】 (a) open + (b) 자기 뷰(sheet) 강제.
    setSheetComposeOpen(true);
    sheetComposeViewControlRef.current?.();
  }, []);

  // ⑫ 행 [모바일 배포] — **새 배포 경로를 만들지 않는다.** 정본은
  // DossierDeployInline → deployStudioModules(dossier-deploy-inline.tsx:236)이고,
  // 그 폼은 우측 실행대(SheetsActionRail)가 소유한다. 그래서 행 클릭은
  // 「그 행 1건만 선택 + **학습지 조판 뷰** + 조판 접기 + 폼 펼침 신호」로 번역된다.
  // 조판을 접는 이유: 조판 표면이 보이는 동안에는 실행대가 렌더되지 않는다
  // (rightPanelBody 가 조판 가시 시 rightPanelView 를 내리므로).
  //
  // ⚠ **nonce 카운터는 폐기했다**(감사 L3-interaction #1, 26-08-18). 신호를 단조
  // 증가 카운터로 보내면 조판이 **열려 있는 동안** 누른 클릭이 통째로 증발했다:
  // 이 배치가 `setSheetComposeOpen(false)` 와 `nonce+1` 을 함께 커밋하는데,
  // 조판 가시 중에는 `{anyComposeVisible ? null : rightPanelView}`(:2050 계열)가
  // 실행대를 **언마운트**해 두므로, 커밋 뒤 갓 마운트된 실행대의
  // `useState(openDeployNonce)` 가 **이미 증가된 값으로 초기화**되어 전이가
  // 사라진다(실측 `_audit-l3-f.mjs`: 조판 닫힘 `A form expanded:"true"` vs
  // 조판 열림 `B form expanded:"false" gridRows:"0px" inert:true`, 한 번 더
  // 눌러야 `B2 expanded:"true"`). 즉 조판·선택·미저장 편집만 파괴하고 정작
  // 목적인 배포 폼은 열리지 않는 최악의 조합이었다.
  // → 카운터(전이) 대신 **의도(상태)** 를 보낸다: `pendingSheetDeployId` 는
  //   마운트 시점에도 그대로 읽히므로 언마운트/재마운트를 타지 않는다. 소비는
  //   실행대가 `onDeployIntentConsumed()` 로 비워 준다(같은 행 재클릭 = 재발화).
  const [pendingSheetDeployId, setPendingSheetDeployId] = useState<
    string | null
  >(null);
  const consumeSheetDeployIntent = useCallback(
    () => setPendingSheetDeployId(null),
    [],
  );
  const deploySheetFromRow = useCallback(
    (meta: SheetPickMeta) => {
      // 파괴 전 고지(감사 L3-interaction #1 ②) — 이 경로는 표면의 자체 닫기
      // 가드(sheet-compose-surface.tsx:417-427)를 **밖에서 우회**한다.
      if (!confirmSheetComposeDiscard(SHEET_DISCARD_ON_DEPLOY)) return;
      setPickedSheets(new Map([[meta.reportId, meta]]));
      setActiveSheetId(meta.reportId);
      // ── 【E24 수리, 적대 검수 critical】 조판을 **반드시 접는다** ────────────
      // 이 경로의 목적은 위 :2166-2183 이 규정한 대로 「1건 선택 + 학습지 조판 뷰
      // + **조판 접기** + 폼 펼침 신호」이고, 접기가 빠지면 목적 자체가 달성되지
      // 않는다: 조판이 가시인 동안 `{anyComposeVisible ? null : rightPanelView}`
      // 가 실행대(SheetsActionRail)를 **언마운트**해 두므로, `pendingSheetDeployId`
      // 를 **소비할 주체가 아예 없다** → 배포 폼이 끝내 열리지 않는다.
      //
      // ⚠ 개편 중 실제로 뚫렸던 자리다. 구 코드는 `setComposeMode(null)` 이
      //   이 접기를 수행했는데(구 산식 `sheetComposeVisible = open ∧ 뷰 ∧ mode`),
      //   E24-SPEC 초안이 그것을 「이 함수가 이미 하는 setSheetComposeOpen(false)
      //   와 동치」라고 **잘못 단언**해 대체 없이 삭제됐다. 그런 호출은 이 함수에
      //   없었다. 새 산식(`open ∧ 뷰`)에서 접기의 유일한 수단은 **open 플래그**다.
      //   증상은 「편집·선택만 파괴되고 정작 배포 폼은 안 열린다」 —
      //   :2172-2181 이 nonce 폐기 사유로 기록해 둔 **바로 그 최악의 조합**이며,
      //   에러 0·토스트 0 이라 게이트 없이는 영원히 안 드러난다.
      setSheetComposeOpen(false);
      // 시험지 축은 따로 내릴 필요가 없다 — 아래 뷰 강제가 "sheet" 로 옮기므로
      // `composeVisible = examStudioOpen ∧ 뷰==="exam"` 이 거짓이 된다. 즉 시험지
      // 조판은 **열린 채 보존**되고(사용자가 돌아오면 그대로), 가시만 꺼진다.
      sheetComposeViewControlRef.current?.();
      setPendingSheetDeployId(meta.reportId);
    },
    [confirmSheetComposeDiscard],
  );

  // ── 【E25】 선택 즉시 조판 — 제7 개방 경로(효과), §3.10.24 ────────────────────
  // 두 조판 뷰의 「체크 → 실행대 CTA」 2단계를 「체크 = 개방」 1단계로 줄인다.
  // 판정은 **상태가 아니라 전이**다: ①뷰 진입 전이(그 시점 자기 축 픽 ≥1)
  // ②그 뷰에 머무는 동안 자기 축 픽 **증가** 전이. 상태(view ∧ 픽>0)로 보면
  // [돌아가기] 직후를 매 렌더 되열어 닫기가 죽은 버튼이 된다(억제 ②).
  // · (a) open 만 켠다 — E24 최상위 불변식의 (b) 뷰 강제는 「이미 그 뷰에 있다」는
  //   발화 전제조건으로 충족된다. 뷰 강제 ref 를 부르면 안 되는 게 아니라 부를
  //   이유가 없다(같은 값 재강제).
  // · 픽 Map·activeSheetId 는 **절대 건드리지 않는다** — 건드리는 순간 E24 ⑥ ⚠ 이
  //   금지한 「이동 + 편집 중이던 것 위에 다른 문서 개방」이 실제가 된다.
  // · sheet 축은 pendingSheetDeployId 동안 **억제**(억제 ①): 행 [모바일 배포]는
  //   「조판 접기 + 실행대 폼 펼침」(⑫)이 목적인데, 여기서 되열면 폼을 소비할
  //   실행대가 다시 언마운트된다 — deploySheetFromRow 위 「⚠ nonce 카운터는
  //   폐기했다」 주석(감사 L3-interaction #1)이 기록한 그 최악 조합과 같은 모양이다
  //   (줄번호 포인터 금지 — 이 파일은 삽입마다 밀린다, 적대검수 minor 실측).
  //   인텐트 소비(pending→null) 재실행 시점에는 ref 가 이미 갱신돼 전이가
  //   아니므로 되열지 않는다.
  // · 픽 감소·0 은 개방 상태에 영향 없음 — 빈 상태는 표면 자신이 담당한다.
  const autoComposePrevRef = useRef<{
    view: StudioAssetView;
    sheets: number;
    questions: number;
  } | null>(null);
  useEffect(() => {
    const prev = autoComposePrevRef.current;
    autoComposePrevRef.current = {
      view: centerAssetView,
      sheets: pickedSheets.size,
      questions: flatPicked.size,
    };
    if (!prev) return; // 마운트 직후는 전이가 아니다(StrictMode 2회째도 무발화)
    // 억제 ④(E26 §3.10.25, 적대검수 확정 major): 온보딩 투어가 만드는 필 실클릭
    // 전이는 사용자 의사가 아니다 — 픽 보유 세션에서 투어 뷰 순회가 조판 표면을
    // 되열고(수동 폐쇄 억제 ② 우회) 딤 뒤에 잔류시킨다. ref 는 위에서 이미
    // 전진했으므로 투어 중 쌓인 전이가 종료 후 소급 발화하지 않는다(억제 ③ 관용구).
    if (document.body.dataset.studioTourActive === "1") return;
    // 억제 ③(§3.10.24 E25-0, 적대검수 확정 major): 조판 표면의 유일한 거처인 우측
    // aside 는 xl+ 전용이다(`hidden … xl:flex`). xl 미만에서 발화하면 「보이지 않는
    // 조판」이 열리고 중앙 목록만 420px 로 접힌다 — 체크가 곧 화면 붕괴가 된다
    // (스모크 S8 실측: region:1 · listW 846→420). 여기서 막으면 <xl 은 E25 이전
    // 동작(행 액션·실행대 CTA 명시 개방)으로 그대로 회귀한다. ref 는 위에서 이미
    // 전진했으므로, 좁은 화면에서 쌓인 전이가 창을 넓힌 순간 소급 발화하지 않는다.
    // 1280px = Tailwind 기본 xl(80rem) — 이 리포는 브레이크포인트 오버라이드 0.
    if (!window.matchMedia("(min-width: 1280px)").matches) return;
    if (
      centerAssetView === "sheet" &&
      pickedSheets.size > 0 &&
      pendingSheetDeployId === null &&
      (prev.view !== "sheet" || pickedSheets.size > prev.sheets)
    ) {
      setSheetComposeOpen(true);
    }
    if (
      centerAssetView === "exam" &&
      flatPicked.size > 0 &&
      (prev.view !== "exam" || flatPicked.size > prev.questions)
    ) {
      setExamStudioOpen(true);
    }
  }, [centerAssetView, pickedSheets, flatPicked, pendingSheetDeployId]);

  // ── 【E24 수리, 적대 검수 major】 가시 산식은 여기서 **한 번만** 만든다 ───────
  // 원래 이 두 줄은 아래 rail 파생 옆에 있었는데(선언 순서상 프룬보다 뒤), 프룬
  // ①-b 가 렌더 중 학습지 조판의 가시 여부를 알아야 해서 이 자리로 올렸다.
  // 소비처: 프룬 ①-b · anyComposeVisible · 표면 2개의 `active` prop · 숨김 래퍼
  // className · 드로어 고지 · rightPanelLabel · §②-b DOM 감시 계기.
  //
  // ── 【E24 §1②】 조판 상호배제를 다시 **뷰 값**으로 환원(composeMode 폐지) ────
  // E22-3 이 명시 상태 `composeMode` 를 신설한 유일한 근거는 「두 조판이 같은
  // 뷰("studio") 소속이 되어 뷰 값이 더 이상 상호배제를 못 준다」였다. 3필 해체가
  // 그 전제를 소멸시켰으므로 산식은 다시 두 줄이다 — **뷰가 곧 모드다**.
  const composeVisible = examStudioOpen && centerAssetView === "exam";
  const sheetComposeVisible = sheetComposeOpen && centerAssetView === "sheet";
  // examStudioOpen 과 sheetComposeOpen 은 여전히 **동시에 켜져 있을 수 있고**(각자
  // 숨김 마운트로 보존), 그때 DOM 에는 두 조판 루트가 공존한다. 둘 중 **가시**는
  // `centerAssetView` 가 값을 하나만 갖는다는 사실이 정확히 하나로 고른다.
  //
  // ⚠⚠ **표면의 `active` prop 을 이 파생값 대신 raw open 으로 바꾸지 마라**(§②-c).
  //   「뷰가 갈렸으니 open 만 보면 된다」는 단순화는 곧장 **인쇄 백지**다:
  //   인쇄 판정은 report-styles.ts:1884 의
  //     body:where(:has(.par-root:not(.par-cover-preview):not(.par-print-exclude))) * {visibility:hidden}
  //   인데 **`:has()` 는 `display:none` 요소도 매칭**한다. 즉 `hidden` 래퍼로 감춘
  //   숨김 마운트는 인쇄 안전을 **전혀** 주지 않는다. 인쇄 대상에서 실제로 빼 주는
  //   것은 표면이 `active === false` 일 때 붙이는 `printExclude`(= `.par-print-exclude`)
  //   **하나뿐**이고, `sheet-compose-surface.tsx` 의 `active` 는 옵셔널 +
  //   **기본값 `true`** 라 배선을 빠뜨려도 타입 에러 0 · 화면 이상 0 · 콘솔 0 인 채
  //   인쇄만 백지가 된다. `active={composeVisible}` / `active={sheetComposeVisible}`
  //   는 최적화 여지가 아니라 **계약**이다.
  // 체크 프룬 ①: 표시 집합(최근 5 절단) 이탈 지문의 체크 제거 — 하단 바에
  // 유령 선택이 남아 배포·시드에 섞이지 않게. 렌더 중 조건부 setState =
  // "이전 렌더 정보 보관" 공인 패턴(도시에 openForm 프룬 동형).
  const [prevVisibleForPick, setPrevVisibleForPick] = useState(
    visibleDossierPassages,
  );
  if (visibleDossierPassages !== prevVisibleForPick) {
    setPrevVisibleForPick(visibleDossierPassages);
    const keep = new Set((visibleDossierPassages ?? []).map((p) => p.id));
    if (pickedQuestions.size > 0) {
      const next = new Map(
        [...pickedQuestions].filter(([, m]) => keep.has(m.passageId)),
      );
      if (next.size !== pickedQuestions.size) setPickedQuestions(next);
    }
  }

  // 체크 프룬 ①-b(학습지 축, §3.10.22 U13-6 **정정**): 도시에 하단 실행 바의
  // 유령 칩만 걷는다. **문항 축과 같은 블록에 얹으면 안 된다** — 학습지 픽은
  // 도시에·클래스 전역 목록 **두 표면 공용 상태**라 도시에 발행 집합으로
  // 자르면 학습지 대기열이 통째로 증발했다(실측 _a22-i.log: 8 w → 0 w,
  // confirm·토스트·콘솔 에러 0건 · 문항 3개는 무손상). 그래서 세 가지를
  // 문항 축과 다르게 한다:
  //
  //  ⓐ **출처가 도시에인 픽만** 자른다(sheetPickOriginRef). 목록에서 담은 픽과
  //     출처 미기록(unknown)은 대상이 아니다 — 도시에 표시 집합은 그 픽들의
  //     생사와 아무 관계가 없다.
  //  ⓑ 표시 집합이 null 이면 **판정 보류**. 이 값은 지문관리 선택을 모두
  //     해제하면 null 이 되는데(handleDossierPassages), 문항 축처럼 빈 배열로
  //     떨어뜨리면 keep 이 빈 집합이 되어 도시에 픽까지 통째로 증발한다.
  //     「모른다」와 「없다」를 가르는 것이 여기서는 편집물의 생사다.
  //  ⓒ 조판이 **보이는** 동안에는 미룬다. 렌더 중 실행이라 confirm 을 띄울
  //     수 없고(guardSheetPickRemoval 을 부를 수 없다), 대기열이 말없이 줄면
  //     활성 문서가 바뀌며 편집기가 재마운트돼 미저장 편집이 증발한다(E21-6-4).
  //     조판이 보이는 동안에는 우측이 조판 표면이라 유령 칩이 애초에 보이지도
  //     않으므로 미루는 비용이 0이다.
  //     ⚠⚠ 【E24 수리, 적대 검수 major】 판정축은 raw `sheetComposeOpen` 이
  //     **아니라** 가시 파생 `sheetComposeVisible` 이다. E24 가 「조판을 열어 둔
  //     채 지문관리 탭」을 **기본 동선**으로 만들면서 open 과 visible 이 갈렸고
  //     (§1⑨ 가 hasRightPanel 에서 고친 것과 같은 오류), open 으로 재면
  //     `open=true · view="passages"` — 즉 **조판이 안 보이는데** 프룬이 통째로
  //     보류된다. 그러면 위 ⓒ 의 「미루는 비용이 0」 근거가 통째로 거짓이 된다:
  //     지문 A 의 학습지를 담고 조판을 연 뒤 지문관리로 돌아와 A 를 해제하고
  //     B 를 골라도, B 의 픽바에 **A 소속 학습지 칩이 유령으로 남는다**.
  //     그 칩은 표시 전용이 아니다 — 바의 조판 CTA 가 `sheetAxis`(= size>0)로
  //     갈려 「합본 조판」으로 뒤바뀌므로(dossier-pick-bar.tsx composeLabel),
  //     B 의 문항을 담아 누르면 **A 의 학습지 + B 의 문항**이 조판된다.
  //     ⚠ 남는 위험(다음 개발자에게 고지): 조판이 **열린 채 숨김 마운트**인
  //     동안에도 이제 프룬이 돈다. 도시에 출처 픽이 활성 문서였다면 렌더 중
  //     컷이라 confirm 없이 편집기가 재마운트된다(E21-6-4 잔여 노출).
  //     근원 해소는 「프룬을 effect 로 내려 confirmSheetPickRemoval 을 태운다」
  //     또는 「sheet-compose-dirty-guard 에 읽기 전용 peek 을 뚫는다」인데 둘 다
  //     이 유닛의 소유 범위 밖이라 **고지만** 남긴다.
  //     ⚠ 그래서 prev 도 **따로** 들고 있어야 한다. 구 코드는 프룬 ①의 공용
  //     prev(prevVisibleForPick)를 조건 밖에서 무조건 갱신했으므로 ⓒ 의 보류가
  //     지연이 아니라 **영구 스킵**이었다(실측 _a22-j.log: 조판을 닫아도 P2 에서
  //     4 w 그대로 — 「닫는 순간 밀린 청소를 한다」는 구 주석은 사실이 아니었다).
  //     여기서는 프룬이 실제로 돈 렌더에서만 prev 가 전진하므로, 조판이 **가시에서
  //     빠지는** 렌더(다른 탭으로 나가거나 조판을 닫는 렌더)에서 밀린 청소가
  //     정말로 실행된다.
  const [prevVisibleForSheetPick, setPrevVisibleForSheetPick] = useState(
    visibleDossierPassages,
  );
  if (
    !sheetComposeVisible &&
    visibleDossierPassages !== prevVisibleForSheetPick
  ) {
    setPrevVisibleForSheetPick(visibleDossierPassages);
    if (visibleDossierPassages !== null && pickedSheets.size > 0) {
      const keepSheet = new Set(visibleDossierPassages.map((p) => p.id));
      const origins = sheetPickOriginRef.current;
      const nextSheets = new Map(
        [...pickedSheets].filter(
          ([id, m]) =>
            origins.get(id) !== "dossier" || keepSheet.has(m.passageId),
        ),
      );
      if (nextSheets.size !== pickedSheets.size) setPickedSheets(nextSheets);
    }
  }

  // 체크 프룬 ②: 도시에 재조회에서 실제로 사라진 문항(삭제 등)의 체크 제거.
  // **rows 는 최신순 50 절단본** — total 이 rows 를 넘는 지문에서는 "rows 부재"
  // 가 창 이탈일 뿐 삭제 증거가 아니므로 판정을 보류한다(적대 검수 major:
  // 생성 완료 silent 재조회가 멀쩡한 체크를 걷어가던 경로). 미조회·로딩·오류도
  // 보류(행이 없다는 증거가 아니다).
  const [prevStatesForPick, setPrevStatesForPick] = useState(dossierStates);
  if (dossierStates !== prevStatesForPick) {
    setPrevStatesForPick(dossierStates);
    if (pickedQuestions.size > 0) {
      let changed = false;
      const next = new Map(pickedQuestions);
      for (const [qid, meta] of pickedQuestions) {
        const st = dossierStates.get(meta.passageId);
        if (
          st?.status === "ready" &&
          st.dossier.questions.total <= st.dossier.questions.rows.length &&
          !st.dossier.questions.rows.some((r) => r.id === qid)
        ) {
          next.delete(qid);
          changed = true;
        }
      }
      if (changed) setPickedQuestions(next);
    }
  }

  // ── 패널 폭·접기 ──
  const { containerRef, widths, collapsed, startResize, toggleCollapsed, expand } =
    useResizablePanels({
      panels: PANEL_SPECS,
      minCenter: 560,
      storageKey: "studio-workbench-panels",
    });

  // §3.10.12(26-08-13 지시): 접힘은 **명시적 선택**(selectClass — 레일 이름
  // 클릭·가이드 퀵선택·생성 모달)에서만 발화한다 — quiet 경로(레일 내부 조작)
  // 와 분리해 rename 입력·체크 진입이 레일을 소멸시키지 않는다. 접힘 실행은
  // toggleCollapsed 경유(훅에 collapse 원자 API 없음) — 직전 드래그의
  // suppressClick 가드에 1회 삼켜질 수 있으나 레일이 열린 채 남는 무해 방향.
  collapseTreeRef.current = () => {
    if (!collapsed.tree) toggleCollapsed("tree");
  };
  // 해제·첫 마운트 정렬 — 미선택인데 접힘(영속 잔존값 포함) = 가이드에서 클래스
  // 관리 동선 고아이므로 자동 펼침. 수동 재펼침은 선택 유지 중 되접지 않는다
  // (접힘은 위 selectClass 전이에서만).
  useEffect(() => {
    if (!selectedClassId && collapsed.tree) expand("tree");
  }, [selectedClassId, collapsed.tree, expand]);

  // ① 칩 클릭 = 레일 토글(§3.10.12 재진입) — memo(StepStrip) 방어선용 안정 참조.
  const toggleTreePanel = useCallback(
    () => toggleCollapsed("tree"),
    [toggleCollapsed],
  );

  // memo(ClassTree) 를 살리려면 콜백 참조가 안정이어야 한다(인라인 화살표 금지).
  const openCreate = useCallback(() => setCreateOpen(true), []);

  const treeBody = (
    <ClassTree
      classes={classes}
      selectedClassId={selectedClassId}
      onSelect={selectClass}
      onSelectQuiet={selectClassQuiet}
      onCreate={openCreate}
      onRename={handleRename}
      onArchive={handleArchive}
      onAddStudents={openAddStudents}
      expanded={expanded}
      onToggleExpand={toggleExpand}
      studentsByClass={studentsByClass}
      // setInviteStudentId 세터 자체가 안정 참조 — memo(ClassTree)에 그대로 내린다
      onInviteStudent={setInviteStudentId}
      onRetryStudents={retryStudents}
      checkedByClass={checkedByClass}
      onToggleStudent={toggleStudent}
      onToggleClassAll={toggleClassAll}
    />
  );

  // ── 우측 패널 위계 v3(§3.10.5) — ①도시에 아코디언(=배포 실행대) ②빈 상태
  //    1줄. ClassPanel(E5)·BatchGeneratePane(E6)은 폐기 — 워크스페이스가 열려
  //    있어도 우측은 도시에 그대로다. aside·드로어 공용.
  // 우측 위계(§3.10.17-e — 사용자 정정 "탭마다 우측에 필요한 정보가 다 다르다"):
  // **§3.10.23 E24** 에서 자산 뷰가 [지문관리 | 학습지 조판 | 시험지 조판] 3필로
  // 갈리면서 두 조판 표면은 각자 **자기 뷰 소속**이 됐다(sheet / exam). 다른 탭으로
  // 나가면 조판은 숨김 마운트로 보존되고(재진입 시 조판하던 문서 그대로 — 언마운트
  // 하면 시험지는 초안 복구 경합에, 학습지는 **미저장 편집 소실**에 노출된다),
  // 그 뷰의 원래 패널(지문관리 = 도시에)이 우측을 갖는다.
  //
  // ── 【E24 §⑥】 rail 파생은 **뷰당 1개, 총 2개**다 ───────────────────────────
  // 구 3파생(questionsRailActive · sheetsRailActive · studioRailActive)은 소멸했다.
  // 앞 둘을 남겨 두었던 유일한 근거는 「이행기 레거시 필(문제관리·학습지 관리)이
  // 아직 화면에 살아 있다」였는데 E24 가 그 두 필을 걷어내 **사실이 아니게 됐고**,
  // 셋째는 뷰 값 "studio" 자체가 소멸해 도달 불가다. 그대로 남기면 **영원히 false 인
  // 죽은 분기**가 되어 다음 개발자를 속인다 — 그리고 TS 는 이것을 못 잡는다.
  // (`view === "studio"` 는 TS2367 로 잡히지만, 그 결과를 담은 boolean 을 소비하는
  //  삼항 사슬·라벨 문자열·OR 체인은 타입상 완벽히 정상이다. E24-SPEC §1① 참조.)
  const sheetRailActive = Boolean(selectedClass && centerAssetView === "sheet");
  const examRailActive = Boolean(selectedClass && centerAssetView === "exam");
  // ── 【E24 §1②】 조판 가시 산식 2줄은 **위(체크 프룬 ① 직전)로 끌어올렸다** ──
  // 옮긴 이유: 체크 프룬 ①-b 가 **렌더 중** `sheetComposeVisible` 을 읽는다. 여기서
  // 선언하면 그 참조가 TDZ 라 `ReferenceError` 로 화면이 통째로 죽는다.
  // ⚠ **여기에 같은 산식을 다시 쓰지 마라.** 두 벌이 되면 한쪽만 고쳐지는 사고가
  //   나고, 그것이 정확히 이번 적대 검수가 잡아낸 결함이다(프룬만 raw open 을
  //   읽고 있었다). 파생은 **한 곳**에서만 만든다.
  const anyComposeVisible = composeVisible || sheetComposeVisible;
  // §M 넛지 소등 — 조판 표면이 **열리는 전이**에 두 축 모두 끈다(유도 임무 완수).
  // 축별 소등으로 쪼개지 않는다: 합본 조판(학습지 채널)이 문항도 함께 싣는 데다,
  // 사용자가 조판 표면에 도달한 순간 "조판으로 가라"는 안내는 소임을 다했다.
  const [prevAnyComposeVisible, setPrevAnyComposeVisible] =
    useState(anyComposeVisible);
  if (anyComposeVisible !== prevAnyComposeVisible) {
    setPrevAnyComposeVisible(anyComposeVisible);
    if (anyComposeVisible && (composeNudge.questions || composeNudge.sheets)) {
      setComposeNudge({ questions: false, sheets: false });
    }
  }
  // ── 【E24 §⑨】 hasRightPanel 은 **가시 파생값**으로 잰다 ────────────────────
  // 구 산식은 raw open(`examStudioOpen || sheetComposeOpen`)을 OR 로 물고 있었다.
  // 3필 체제에서는 「조판을 열어 둔 채 지문관리 탭으로 나가는 것」이 **기본 동선**이
  // 되는데, 그때 구 산식은 계속 참이라 StepStrip 의 ③배포 칩이 점등한 채로 남고
  // `<xl` 드로어 버튼도 계속 뜬다 — 지문관리 뷰의 우측에는 배포 실행대가 없는데도
  // 「배포 단계에 와 있다」고 말하는 셈이다. 두 조판 뷰에서는 sheetRailActive /
  // examRailActive 가 `selectedClass && 뷰` 로 이미 참이므로 **잃는 것이 없다**
  // (조판이 보인다 = 그 뷰에 있다 = 해당 rail 파생이 참).
  // ⚠ **담긴 것(픽)도 반드시 포함한다**(완전성 비평 major). 지문관리 뷰 + 픽 있음
  //   + 도시에 미선택이면 `sheetRailActive`·`examRailActive`·`visibleDossierPassages`
  //   가 **전부 거짓**이라, 그 상태에서 §⑦ 담김 고지(요약 스트립)는 `rightPanelView`
  //   안에만 사는데 `<xl` 에서는 드로어 버튼(:2988 `hasRightPanel && … xl:hidden`)과
  //   슬라이드오버 렌더 게이트가 둘 다 이 값에 묶여 있어 **우측을 열 방법 자체가
  //   없다**. 그러면 「시험지 조판 탭에서 담은 문항 5개」가 화면 어디에도 없는 채로
  //   합본 인쇄에 붙는다 — §③(뷰 전환이 선택을 지우지 않는다)의 대가를 §⑦ 이
  //   갚기로 한 바로 그 부채가 좁은 화면에서만 미지급이 된다.
  //   ⚠⚠ 이 항을 넣어도 §⑨ 의 「③배포 칩 소등」은 **무손상**이다 — StepStrip 은
  //     이제 `hasRightPanel` 이 아니라 `stepAdvanced`(바로 아래)를 먹고, 픽이 있으면
  //     배포할 것이 실제로 있으므로 점등이 정답이다. 두 값을 다시 하나로 합치지 마라.
  const hasRightPanel =
    sheetRailActive ||
    examRailActive ||
    Boolean(visibleDossierPassages) ||
    flatPicked.size > 0 ||
    pickedSheets.size > 0;
  // ── 【E24 수리, 적대 검수 minor】 StepStrip 은 `hasRightPanel` 을 먹지 않는다 ──
  // 두 값은 **묻는 질문이 다르다**:
  //  · `hasRightPanel` = 「우측에 보여 줄 판이 있는가」 — 패널 존재 · `<xl` 드로어
  //    버튼의 게이트. 조판 탭을 **한 번 클릭만 해도** 참이다
  //    (sheetRailActive = `selectedClass && view === "sheet"`).
  //  · StepStrip ②③ = 「자료를 실제로 골랐는가 / 배포 단계에 왔는가」.
  // 이 둘을 같은 값으로 먹이면 클래스만 고르고 조판 탭을 눌렀을 뿐인데 상단이
  // 「②자료 완료 · ③배포 진행」으로 점등하고, **같은 화면 우측은** 빈 상태 문구
  // (「②에서 학습지나 문항을 고르면 여기서 조판·배포합니다」)를 띄운다 — 정면
  // 모순이고, 처음 쓰는 원장은 있지도 않은 ③단계 배포 버튼을 찾아 헤맨다.
  // → StepStrip 전용 파생으로 **분리**한다. 판정은 「담긴 것 / 펼친 도시에」다.
  // ⚠ `hasRightPanel` 산식은 §⑨ 그대로 둔다 — 조판을 연 채 지문관리로 나갔을 때
  //   ③칩을 소등시키는 §⑨ 의 효과는 여기서도 유지된다(그때 픽이 0이면 stepAdvanced
  //   도 0, 픽이 있으면 **배포할 것이 실제로 있으므로** 점등이 맞다).
  const stepAdvanced =
    flatPicked.size > 0 ||
    pickedSheets.size > 0 ||
    Boolean(visibleDossierPassages);
  // ── 【E24 §②-b 불변식 감시】 인쇄 대상 루트 개수를 **DOM 에서 직접 잰다** ────
  // 구 계기는 `composeVisible && sheetComposeVisible` 를 봤다. 뷰 분할 후 그 조건은
  // **구조적으로 불가능**해져 감시자가 *vacuous* 가 된다 — probe-compose-room.mjs
  // R6(「상호배제 위반 경고 0건」)이 **계기가 죽었는데 초록**이 되는, 게이트로서
  // 최악의 상태다. 그래서 파생값 비교가 아니라 **실측**으로 승격했다. 이 계기는 구
  // 계기가 원리적으로 못 잡던 **`active` prop 누락**(§②-c)까지 잡는다 — 파생값은
  // 맞는데 표면까지 안 내려간 경우가 정확히 그 사고다.
  //
  // 판정식이 왜 이 모양인가:
  //  · 선택자는 use-print-portal.ts:17 · report-styles.ts:1884 와 **한 글자도 같다**.
  //    다르면 「계기는 조용한데 인쇄는 백지」가 되어 계기가 거짓말을 한다.
  //  · `.par-measure`(pages.tsx:171) 안의 측정 프로브는 `.par-sheet` 만 갖고
  //    `.par-root` 는 갖지 않아 **지금은** 매칭되지 않는다. 그래도 closest 로 명시
  //    배제한다 — 프로브에 루트가 하나 생기는 날 계기가 **영구 가짜 RED** 로 죽어
  //    아무도 안 믿게 되는 쪽이 훨씬 비싸고, 인쇄에서도 그 서브트리는 report-styles
  //    :1849(`.par-measure{display:none}`)로 이미 빠져 있어 판정이 정확해진다.
  //  · 시험지 루트는 `.par-root` 가 아니라 DOM id 다. 숨김이 `hidden` 래퍼
  //    (display:none)이므로 `offsetParent` 로 가시를 판정한다 — 이 루트는 어디서도
  //    position:fixed 가 아니라 오탐이 없다(use-print-portal.ts:50-52 가 같은 근거로
  //    같은 관용구를 쓴다).
  //  · 렌더 중이 아니라 **effect 안**에서 잰다 — React Compiler 가 렌더 중 부수효과를
  //    에러 수준으로 금지하고, DOM 은 커밋 후에만 실측 가능하다.
  //  · deps 에 전이 재료를 전부 넣어 **탭을 왕복할 때마다** 다시 재게 한다(게이트 G6).
  //    (다섯 값 모두 본문에서 진단 문자열로 실제 소비된다 — exhaustive-deps 가
  //     「불필요한 deps」로 지우자고 하지 못하게 하는 것도 계기 존치의 일부다.)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const parRoots = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".par-root:not(.par-cover-preview):not(.par-print-exclude)",
      ),
    ).filter((el) => !el.closest(".par-measure"));
    const examRoot = document.getElementById("exam-paper-print-root");
    const total = parRoots.length + (examRoot?.offsetParent ? 1 : 0);
    if (total <= 1) return;
    console.error(
      `[E24] 인쇄 대상 루트가 ${total}개입니다 — 인쇄가 백지로 나옵니다.` +
        ` (view=${centerAssetView} · exam open=${examStudioOpen}/visible=${composeVisible}` +
        ` · sheet open=${sheetComposeOpen}/visible=${sheetComposeVisible})` +
        ` 조판 개방 경로의 뷰 강제(【E24 최상위 불변식】)와 표면 active prop 배선을 확인하세요.`,
    );
  }, [
    composeVisible,
    sheetComposeVisible,
    centerAssetView,
    examStudioOpen,
    sheetComposeOpen,
  ]);
  // ── 【E24 §⑥】 우측 실행대 = **자기 축 실행대 + 반대 축 요약 스트립**(대칭) ──
  // 구 조판실의 우측은 두 실행대를 통째로 쌓은 스택 하나였다(§3.10.22 U13-2).
  // 3필 해체와 함께 **뷰마다 다른 실행대**로 갈린다.
  //
  // 핵심 설계 판단: **반대 축의 full 실행대를 상대 뷰에 두지 않는다.** 두면 그
  // 실행대의 CTA(「시험지 조판」)가 사용자를 방금 고른 탭 **밖으로 튕겨 내고**,
  // 그것이 이번 개편의 지시 원문 —「지금 내가 시험지 조판에 있는지 학습지 조판에
  // 있는지 구분이 안 돼」— 를 그대로 재생산한다. 대신 반대 축에는 **요약 스트립**만
  // 둔다: 담긴 건수를 고지하고(선택은 두 뷰가 **공유**하므로 — E24 §③ — 고지가
  // 없으면 「A4 3장인 줄 알았는데 7장이 나왔다」를 인쇄 후에야 발견한다), 청산과
  // **뷰 전환**만 제공한다.
  //
  // ⚠ 요약 스트립의 「→」 버튼은 **뷰 전환만** 한다 — 조판을 열지 않는다. 열어
  //   버리면 「고지 → 이동」이 「고지 → 이동 + 내가 편집 중이던 것 위에 다른 문서
  //   개방」이 되어, 정작 확인하러 간 상태를 손대는 꼴이다. 그래서 아래 두 콜백은
  //   setSheetComposeOpen / setExamStudioOpen 을 **부르지 않는다**(개방 6경로가
  //   지키는 【E24 최상위 불변식】의 (a) 를 일부러 빼는 유일한 자리다).
  //   (E25 각주) 착지 뷰에서 자동 개방 효과(발화 ①)가 돌므로 **사용자 체감**은
  //   「점프 = 조판 도착」이다. 그래도 이 콜백에 (a) 를 넣지 마라 — 위 ⚠ 의 실해
  //   (픽·활성 문서 변경)는 효과에 없고, 여기 (a) 를 넣는 순간 「효과의 억제 ②
  //   (수동 폐쇄 존중)」를 이 버튼만 우회하는 비대칭이 생긴다(§3.10.24 E25-1 4).
  //
  // ⚠ 뷰 전환 수단은 **기존 force 채널 2개를 그대로 재사용**한다
  //   (composeViewControlRef → exam · sheetComposeViewControlRef → sheet).
  //   이 파일에는 centerAssetView **세터가 없다** — 그 값의 주인은 library-pane 이고
  //   여기 있는 것은 미러다. 새 채널을 뚫으면 handleSelectView 가 한 자리에서 지키는
  //   오버레이 닫기·fetch 게이트 불변식이 갈려 「뷰는 바뀌었는데 목록이 안 온다」가
  //   열린다.
  //
  // ⚠ 두 실행대 CTA 를 하나로 합치지 않는 이유는 E22 때와 같다: 배포 서버 계약이
  //   원리적으로 다르다 — `deployStudioQuestions` 는 다지문 1과제(50문항 상한),
  //   `deployStudioModules` 는 passageId 단수 + 클래스 링크 필수 + PRIME 한정
  //   (actions/studio/deploy.ts:219-250,346-356). 합치면 「눌렀는데 절반만 갔다」다.
  //
  // ⚠ 각 실행대 루트가 `h-full min-h-0 … overflow-y-auto` 라(questions-action-rail
  //   :193 · sheets-action-rail :275) 그대로 쌓으면 각자 전체 높이를 먹는다. 높이
  //   auto 인 래퍼(`shrink-0`) 안에 넣으면 `h-full`(= height:100%)이 auto 부모에 대해
  //   auto 로 풀려 **내용 높이**가 되고, 스크롤은 바깥 스택 하나가 갖는다. 요약
  //   스트립도 **같은 이유로** shrink-0 래퍼 안에 둔다 — 빼먹으면 스트립 한 줄이
  //   실행대를 화면 밖으로 밀어낸다.
  const goExamView = useCallback(() => {
    composeViewControlRef.current?.();
  }, []);
  const goSheetView = useCallback(() => {
    sheetComposeViewControlRef.current?.();
  }, []);
  // 반대 축 요약 스트립 2종. 배지 색 문법(**문항 blue / 학습지 violet**, 무회귀 계약
  // §2-4)을 여기서도 지킨다 — 목록의 순번 배지와 다른 색을 쓰면 「이 스트립이 그
  // 선택을 말하는 것인가」가 흔들린다.
  //
  // ⚠ `data-summary-strip` / `data-summary-jump` 는 **QA 계약 속성**이다(E24 §⑦ (a)
  //   와 같은 처방). **두 속성의 값 어휘는 뷰 축(`"sheet"` | `"exam"`) 하나뿐**이다 —
  //   값은 「축」이자 「점프 착지 뷰」로 항상 같다(구 `"questions"`/`"worksheets"`/`"studio"` 는 E24 §①이 삭제 선언).
  //   점프 버튼 라벨은 실행대 CTA(「시험지 조판」·「학습지 조판」)와 **부분매칭으로
  //   구분되지 않는다**(한 뷰에 하나만 렌더되는 §⑥ 배치는 우연일 뿐) — 프로브가
  //   `button:has-text(…)` 로 집으면 G8 이 **가짜 GREEN** 이 된다. 속성으로 잡아라.
  const questionsSummaryStrip = (
    <div className="shrink-0 px-3" data-summary-strip="exam">
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-blue-700 break-keep">
          <ClipboardList className="size-3.5 shrink-0" aria-hidden="true" />
          문항 {flatPicked.size}개 담김
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-blue-600/80 break-keep">
          합본 시 학습지 뒤에 이어붙습니다
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={clearFlatPicked}
            className="flex h-7 items-center rounded-md border border-blue-200 bg-white px-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
          >
            선택 해제
          </button>
          <button
            type="button"
            onClick={goExamView}
            data-summary-jump="exam"
            className="flex h-7 items-center rounded-md border border-blue-300 bg-white px-2 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            시험지 조판 →
          </button>
        </div>
      </div>
    </div>
  );
  const sheetsSummaryStrip = (
    <div className="shrink-0 px-3" data-summary-strip="sheet">
      <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-violet-700 break-keep">
          <LayoutTemplate className="size-3.5 shrink-0" aria-hidden="true" />
          학습지 {pickedSheets.size}건 담김
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={clearPickedSheets}
            className="flex h-7 items-center rounded-md border border-violet-200 bg-white px-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
          >
            선택 해제
          </button>
          <button
            type="button"
            onClick={goSheetView}
            data-summary-jump="sheet"
            className="flex h-7 items-center rounded-md border border-violet-300 bg-white px-2 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            학습지 조판 →
          </button>
        </div>
      </div>
    </div>
  );
  // 【학습지 조판 뷰의 우측】 **순서가 계약이다 — 학습지 실행대가 문항보다 위.**
  // 구 studioRailBody 는 문항 실행대가 위였다(조판실은 문항 축에서 자란 화면이었다).
  // 이 뷰의 주인공은 학습지이고, 자기 축이 아래로 밀리면 사용자는 방금 고른 탭이
  // 맞는지 다시 의심한다 — 그 의심이 이번 개편이 없애려는 바로 그 증상이다.
  const sheetRailBody = (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto py-3">
      {/* 합본 CTA — 학습지 ≥1 **그리고** 문항 ≥1 일 때만. 문항만 고른 경로는
          시험지 조판 뷰의 QuestionsActionRail [시험지 조판]이 담당한다(E22-6:
          순수 문항 조판은 IntersectionObserver 가상화가 있는 기존 빌더에 남긴다).
          ⚠ **이 CTA 의 집이 여기(sheet 뷰)인 것이 E24 §⑥ 의 결론**이다 —
          openCombinedCompose 가 학습지 축 채널로 뷰를 강제하므로 이 뷰에서 누르면
          **같은 뷰에 머문다(튕김 0)**. 시험지 조판 뷰에 이 CTA 를 복제하지 마라. */}
      {pickedSheets.size > 0 && flatPicked.size > 0 && (
        <div className="shrink-0 px-3">
          <button
            type="button"
            onClick={openCombinedCompose}
            className="flex w-full flex-col items-start gap-0.5 rounded-lg bg-blue-600 px-3 py-2.5 text-left text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-blue-700"
          >
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
              <LayoutTemplate className="size-3.5 shrink-0" aria-hidden="true" />
              합본 조판
            </span>
            <span className="text-[11px] leading-relaxed text-blue-100 break-keep">
              학습지 {pickedSheets.size}건 + 문항 {flatPicked.size}개를 A4 한
              묶음으로
            </span>
          </button>
        </div>
      )}
      {pickedSheets.size > 0 && (
        <div className="shrink-0">
          <SheetsActionRail
            picked={pickedSheets}
            deployTarget={deployTargetResolved}
            onClear={clearPickedSheets}
            // 배포 성공 후처리는 인라인 배포 업링크와 **같은 핸들러 1개**를 쓴다 —
            // 해당 지문 조용한 재조회 + refreshAfterLibraryChange **1회**(⑫).
            onDeployed={handleInlineDeployed}
            onCompose={openSheetComposeFromRail}
            // 행 [모바일 배포] 의도 — **값 전이가 아니라 값 자체**가 신호다(위
            // deploySheetFromRow 주석: 조판이 열려 있으면 이 실행대가 갓 마운트
            // 되므로 전이 기반 nonce 는 초기화에서 소실된다).
            pendingDeployReportId={pendingSheetDeployId}
            onDeployIntentConsumed={consumeSheetDeployIntent}
            // §M 조판 유도 — 학습지 생성 완료 축(소등은 조판 열림 전이).
            nudge={composeNudge.sheets}
          />
        </div>
      )}
      {flatPicked.size > 0 && questionsSummaryStrip}
      {flatPicked.size === 0 && pickedSheets.size === 0 && (
        <div className="flex h-full items-center justify-center px-6">
          {composeNudge.sheets ? (
            /* §M 넛지 카드 — 생성은 끝났는데 아직 체크 전(실행대 미마운트). */
            <div className="studio-pulse-soft rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-center">
              <p className="text-[12.5px] font-bold text-blue-700">
                학습지 생성이 끝났어요
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-blue-600/80 break-keep">
                왼쪽 목록에서 학습지를 체크하면 바로 학습지 조판으로 이어집니다
              </p>
            </div>
          ) : (
            <p className="text-center text-[12.5px] text-slate-400 break-keep">
              {SHOW_MOBILE
                ? "②에서 학습지나 문항을 고르면 여기서 조판·배포합니다"
                : "②에서 학습지나 문항을 고르면 여기서 조판합니다"}
            </p>
          )}
        </div>
      )}
    </div>
  );
  // 【시험지 조판 뷰의 우측】 학습지 뷰의 거울상. 여기엔 합본 CTA 를 두지 않는다
  // (위 ⚠ — 누르는 순간 학습지 뷰로 튕긴다). 학습지도 담은 사용자는 아래 요약
  // 스트립의 [학습지 조판 →] 로 **한 클릭**에 합본 CTA 앞에 선다.
  const examRailBody = (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto py-3">
      {flatPicked.size > 0 && (
        <div className="shrink-0">
          <QuestionsActionRail
            picked={flatPicked}
            deployTarget={deployTargetResolved}
            onClear={clearFlatPicked}
            onDeployed={handleFlatRailDeployed}
            onComposeExam={openComposeFromFlat}
            // §M 조판 유도 — 문항 생성 완료 축(소등은 조판 열림 전이).
            nudge={composeNudge.questions}
          />
        </div>
      )}
      {pickedSheets.size > 0 && sheetsSummaryStrip}
      {flatPicked.size === 0 && pickedSheets.size === 0 && (
        <div className="flex h-full items-center justify-center px-6">
          {composeNudge.questions ? (
            /* §M 넛지 카드 — 생성은 끝났는데 아직 체크 전(실행대 미마운트). */
            <div className="studio-pulse-soft rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-center">
              <p className="text-[12.5px] font-bold text-blue-700">
                문항 생성이 끝났어요
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-blue-600/80 break-keep">
                왼쪽 목록에서 문항을 체크하면 바로 시험지 조판으로 이어집니다
              </p>
            </div>
          ) : (
            <p className="text-center text-[12.5px] text-slate-400 break-keep">
              {SHOW_MOBILE
                ? "②에서 문항을 고르면 여기서 조판·배포합니다"
                : "②에서 문항을 고르면 여기서 조판합니다"}
            </p>
          )}
        </div>
      )}
    </div>
  );
  // ── 【E24 수리, 적대 검수 minor】 지문관리 탭에도 **담김 고지**를 얹는다 ─────
  // §③ 이 「뷰 전환이 선택을 지우지 않는다」를 확정하면서 생긴 빚을 §⑦(요약 스트립)
  // 이 갚는데, 그 지불이 **세 탭 중 두 탭에서만** 이뤄지고 있었다. 시험지 조판
  // 탭에서 문항 5개를 담고 지문관리 탭으로 오면 그 5개는 화면 어디에도 없다
  // (도시에 하단 픽바는 `pickedQuestions` — **도시에 축 전용 Map** 이라 목록에서
  // 담은 `flatPicked` 를 한 건도 표시하지 않는다). 살아 있는데 안 보이는 상태는
  // 나중에 학습지를 담는 순간 「합본 — 학습지 3건 + 문항 5개」로 튀어나오고,
  // 사용자는 **예상 밖 5문항이 붙은 묶음을 인쇄**한 뒤에야 알아챈다 — 이번 개편이
  // 없애려던 「A4 3장인 줄 알았는데 7장이 나왔다」 그 자체다.
  // → 지문관리 뷰의 **도시에 분기 위와 폴백 양쪽 모두**에 같은 스트립을 얹는다.
  //
  // ⚠ 판정은 `hasRightPanel` 이 아니라 **픽 개수**다. hasRightPanel 로 재면 §⑨ 가
  //   지문관리 뷰에서 일부러 꺼 둔 값에 스트립이 묶여 「담긴 게 있는데 고지가 없다」
  //   가 되고, 반대로 §⑨ 의 ③배포 소등을 되살리려는 다음 수정과 서로를 물어뜯는다.
  // ⚠ 스트립 JSX 는 **위 두 실행대와 같은 상수를 재사용**한다(새로 만들지 마라 —
  //   세 벌이 되는 순간 한 벌만 고쳐지고, 그게 지금 고치고 있는 결함의 정체다).
  // ⚠ 도시에를 **가리지 않는다**: 스트립은 shrink-0(상수 자체가 갖고 있다)로 위에
  //   얹고, 아코디언은 `min-h-0 flex-1` 래퍼가 잔여 높이를 전부 준다. 래퍼를
  //   빼면 아코디언 루트의 `h-full` 이 부모 높이를 통째로 먹어 스트립이 화면
  //   밖으로 밀려난다(실행대 스택이 shrink-0 을 쓰는 것과 정확히 같은 이유).
  // 순서: 문항 스트립이 **위**다. 학습지 축은 도시에 하단 픽바가 이미 칩으로
  //   고지하지만, 문항(flatPicked)은 이 스트립이 화면상 **유일한** 고지다.
  const passagesPanelBody = visibleDossierPassages ? (
    <PassageDossierAccordion
      passages={visibleDossierPassages}
      totalCount={dossierPassages?.length ?? visibleDossierPassages.length}
      states={dossierStates}
      expandedId={expandedDossierId}
      onExpand={handleDossierExpand}
      onRetry={fetchDossier}
      onOpenQuestion={openDossierQuestion}
      deployTarget={deployTargetResolved}
      queueItemsByPassage={queueItemsByPassage}
      streamStore={streamStore}
      freshQuestionIds={freshQuestionIds}
      onDeployed={handleInlineDeployed}
      picked={pickedQuestions}
      onTogglePick={togglePickedQuestion}
      onPickRows={pickQuestionRows}
      onClearPicked={clearPickedQuestions}
      onPickBarDeployed={handlePickBarDeployed}
      onComposeExam={openComposeFromDossier}
      // 학습지(문서) 축 4종(§3.10.21 E21-5) — onToggleSheetPick 이 곧 스위치라
      // 이 4개가 함께 내려가야 도시에 Sec「학습지」행이 <Link> 에서 무롤 div +
      // 체크 + 2액션으로 승격된다(passage-dossier-pane.tsx:190-207 계약).
      pickedSheets={pickedSheets}
      onToggleSheetPick={toggleSheetPick}
      // §M off 면 채널 자체를 내리지 않는다 — 도시에 학습지 행의 [모바일 배포]
      // 버튼이 prop 부재로 소멸한다(행 축 중앙 차단 지점 ①).
      onDeploySheet={SHOW_MOBILE ? deploySheetFromRow : undefined}
      onComposeSheets={composeSheetsFromDossier}
      // §3.10.22 U13-7: 하단 실행 바의 「선택 해제」가 두 축을 함께 걷도록
      // 학습지 축 청산 채널을 내린다(U14 가 바에 뚫어 둔 onClearSheets).
      // 미전달이면 바가 문항 축만 비우고 학습지 픽이 남아, 방금 「선택 해제」를
      // 누른 사용자 눈앞에 학습지 칩이 그대로 남는다.
      onClearSheets={clearPickedSheets}
      // §M 조판 유도 — 픽바 조판 버튼 펄스(두 축 합성, 검수 correctness-major 수리).
      pickBarNudge={composeNudge.questions || composeNudge.sheets}
      // 카드 「선택 해제」(26-08-22) — LibraryPane 선택 상태로 흐르는 해제 채널.
      onRemovePassage={removeDossierPassage}
    />
  ) : (
    <div className="flex h-full items-center justify-center px-6">
      {/* 미선택 시 ②는 잠긴 단계 — 도달 불가 안내 자기모순 방지(검수 L3) */}
      <p className="text-center text-[12.5px] text-slate-400 break-keep">
        {selectedClass
          ? SHOW_MOBILE
            ? "②에서 지문을 선택하면 여기서 배포합니다"
            : "②에서 지문을 선택하면 문항·학습지 현황을 보고 조판으로 보냅니다"
          : "①에서 클래스를 먼저 선택하세요"}
      </p>
    </div>
  );
  // ⚠ **두 rail 조건은 순서에 무관하다** — 둘 다 `centerAssetView` 에서 파생되고
  //   그 값은 하나뿐이라 **동시에 참이 될 수 없다**(구조적 상호배타). 구 조판실
  //   구조에서는 이 사슬의 순서가 의미를 가졌고(§3.10.22 U13-2 가 삼항 사슬을
  //   거부한 이유가 정확히 그것이다 — 통합 뷰에서는 두 축이 동시에 비지 않을 수
  //   있어 앞선 축이 뒤 축을 **영구 선점**해 「한 축의 실행대가 도달 불가」가
  //   된다), E24 에서는 그 위험이 소멸했다. 그러니 여기 새 분기를 끼울 때 「앞
  //   분기가 먹어 버리나」를 따질 대상은 rail 둘이 아니라 **지문관리 분기**다
  //   (passagesPanelBody 는 뷰와 무관하게 참이라 반드시 뒤에 온다).
  const rightPanelView = sheetRailActive ? (
    sheetRailBody
  ) : examRailActive ? (
    examRailBody
  ) : flatPicked.size > 0 || pickedSheets.size > 0 ? (
    <div className="flex h-full min-h-0 flex-col gap-2 pt-3">
      {flatPicked.size > 0 && questionsSummaryStrip}
      {pickedSheets.size > 0 && sheetsSummaryStrip}
      <div className="min-h-0 flex-1">{passagesPanelBody}</div>
    </div>
  ) : (
    passagesPanelBody
  );
  // 조판 표면은 examStudioOpen 동안 상시 마운트(숨김 보존) — 가시성만 뷰가
  // 결정한다. 숨김 중엔 Escape·포커스도 표면이 비활성(active) 처리.
  // 조판 표면은 **aside 한 곳에서만** 마운트한다(§3.10.17-e (m), 비용 감사
  // 적발): rightPanelBody 를 aside·슬라이드오버 두 트리에 그대로 렌더하면
  // xl 미만에서 ExamComposeSurface 가 2인스턴스가 되고 — 서버 액션 2배 발사는
  // 물론 IndexedDB 초안 동시 2 writer, DOM id(#exam-builder-shell·
  // #exam-paper-print-root) 중복까지 낳는다(인쇄 포털이 getElementById 로 첫
  // 노드만 잡아 서로의 노드를 옮긴다). 드로어에는 조판 대신 안내를 둔다.
  const composeSurface = examStudioOpen ? (
    <div className={composeVisible ? "flex h-full min-h-0 flex-col" : "hidden"}>
      <ExamComposeSurface
        academyId={academyId}
        classId={selectedClassId}
        className={selectedClass?.name ?? null}
        syncQuestionIds={composeSyncIds}
        active={composeVisible}
        onClose={closeExamStudio}
      />
    </div>
  ) : null;
  // 학습지 조판 표면 — 시험지 조판과 **완전히 같은 숨김 마운트 규약**이다
  // (§3.10.21 E21-5). aside 한 곳에서만 마운트하는 근거도 위 :1683-1688 주석
  // 그대로다: 두 트리에 렌더하면 xl 미만에서 2인스턴스가 되어 서버 액션 2배
  // 발사 + 전역 DOM id(#sheet-compose-print-root·.par-root) 중복이 난다.
  // 특히 학습지 조판은 par-root 중복이 **인쇄 백지**로 직결된다
  // (report-styles.ts:1878-1885 — 다중 루트가 같은 좌표에 겹친다).
  const sheetComposeSurface = sheetComposeOpen ? (
    <div
      className={sheetComposeVisible ? "flex h-full min-h-0 flex-col" : "hidden"}
    >
      <SheetComposeSurface
        classId={selectedClassId}
        className={selectedClass?.name ?? null}
        picked={pickedSheets}
        activeReportId={activeSheetId}
        onActiveReportIdChange={setActiveSheetId}
        active={sheetComposeVisible}
        onClose={closeSheetCompose}
        // ── §3.10.22 U13-4 → **§3.10.26(E27) 개정**: 문항 축 3종(합본) ────
        // 이 표면이 곧 **합본 표면**이다 — 문항은 저장되는 문서가 아니라
        // in-memory FlowItem 이다(E22-0 1번: schema.ts:660 questions.max(8)·
        // :815-826 activityItem 에 선지 필드 없음 — 리포트 문서에는 애초에
        // 담길 수 없다).
        //
        // ⚠ 구 자구 「A4 묶음 **뒤에** 이어 붙는다」는 E27 이후 **거짓**이다.
        //   문항은 자기 지문 학습지 **직후**에 끼고(`questionsAfterDoc`),
        //   맨 뒤에 남는 것은 통합 정답표와 「학습지 없는 지문의 문항」뿐이다.
        //
        // ⚠ **의도된 갈림**(E27 적대검수 확정): `flatPicked` 의 Map 삽입 순서는
        //   **체크 순서 = 순번 배지 = 시험지 조판 인쇄 순서**다. 이 표면(학습지
        //   조판)은 그것을 그대로 인쇄하지 **않는다** — 표면 안에서 지문 그룹
        //   순서로 다시 세운다. 두 조판이 서로 다른 순서로 인쇄하므로 배지 숫자
        //   하나가 둘 다를 만족할 수 없고, 학습지 조판의 순서는 **조판 목차 트리**
        //   (composeOutline)가 눈으로 보여 준다. 여기서 flatPicked 자체를
        //   재정렬해 「하나로 맞추려」 들면 시험지 축이 조용히 어긋난다
        //   (정렬 effect 위 「교차축 정정」 절이 그 실측 근거의 정본).
        academyId={academyId}
        pickedQuestions={flatPicked}
        questionsTitle={questionsComposeTitle}
      />
    </div>
  ) : null;
  const rightPanelBody = (
    <>
      {composeSurface}
      {sheetComposeSurface}
      {anyComposeVisible ? null : rightPanelView}
    </>
  );
  // 드로어(<xl) 전용 본문 — 조판 인스턴스를 제외한 같은 위계. 조판 중이면
  // 그 조판이 넓은 화면 전용임을 1줄로 고지한다(빈 화면 금지).
  // ⚠ 학습지 쪽 자구는 시험지 쪽을 그대로 베끼면 **거짓말**이 된다 — 시험지
  //   빌더에는 IndexedDB 초안 보관이 있지만 학습지 편집기에는 없다. 여기서는
  //   "보관돼 있다"가 아니라 "체크와 편집 중인 문서가 그대로 있다"까지만 말한다
  //   (미저장 편집은 표면이 언마운트되면 사라지고, 표면은 지금 마운트돼 있다).
  const drawerPanelBody = composeVisible ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
      <ClipboardList className="size-7 text-slate-300" aria-hidden="true" />
      <p className="text-center text-[12.5px] font-semibold text-slate-500 break-keep">
        시험지 조판은 넓은 화면에서 표시됩니다
      </p>
      <p className="text-center text-[11px] leading-relaxed text-slate-400 break-keep">
        조판 중인 시험지는 그대로 보관돼 있습니다 — 창을 넓히면 이어서 편집할
        수 있습니다
      </p>
      <button
        type="button"
        onClick={closeExamStudio}
        className="mt-1 flex h-8 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        조판 접기
      </button>
    </div>
  ) : sheetComposeVisible ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
      <LayoutTemplate className="size-7 text-slate-300" aria-hidden="true" />
      <p className="text-center text-[12.5px] font-semibold text-slate-500 break-keep">
        학습지 조판은 넓은 화면에서 표시됩니다
      </p>
      <p className="text-center text-[11px] leading-relaxed text-slate-400 break-keep">
        조판 중인 학습지는 그대로 열려 있습니다 — 창을 넓히면 이어서 편집할 수
        있습니다
      </p>
      <button
        type="button"
        onClick={collapseSheetComposeFromDrawer}
        className="mt-1 flex h-8 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        조판 접기
      </button>
    </div>
  ) : (
    rightPanelView
  );
  // 접기 핸들 세로 라벨 — 표시 중인 판을 따라간다. PanelHandle 이 aria-label 을
  // `${label} 패널 …` 로 조립하므로 폴백은 「정보」.
  // 【E24 §⑧】 구 `"조판실"` 분기는 **삭제**됐다 — 가리키던 뷰가 없어졌다. 구
  // `questionsRailActive → "보내기"` 도 함께 소멸했다(그 필이 사라졌고, 지금 그
  // 자리의 뷰 이름은 「시험지 조판」이다).
  // 앞 두 분기(가시 산식)는 오늘의 rail 분기와 **같은 문자열을 내지만** 남긴다:
  // 이 라벨의 계약은 「지금 우측에 **보이는 판**을 따라간다」이고, 조판이 보일 때
  // 그 근거가 rail 파생이 아니라 가시 산식이라는 사실을 코드가 말해야 한다.
  const rightPanelLabel = composeVisible
    ? "시험지"
    : sheetComposeVisible
      ? "학습지"
      : sheetRailActive
        ? "학습지"
        : examRailActive
          ? "시험지"
          : visibleDossierPassages
            ? "지문 현황"
            : "정보";

  return (
    <div className="-mx-3 -mt-3 -mb-3 flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col overflow-hidden bg-white text-slate-800 md:-m-6 md:h-dvh">
      {/* ── 상단바 (§3.1.0 — pr-16: 전역 우상단 플로팅 회피) ── */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 pl-3 pr-16">
        <button
          type="button"
          aria-label="클래스 목록 열기"
          onClick={() => setTreeDrawerOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 lg:hidden"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        {/* 폰(<md)에선 ERP 셸 헤더가 이미 「클래스 스튜디오」를 표기 — h1 중복
            제거(감사 D3), 선택 클래스명 조각·트리 토글만 남긴다. */}
        <div className="flex min-w-0 items-center gap-2">
          <GraduationCap className="hidden size-[18px] shrink-0 text-blue-600 md:block" />
          <h1 className="hidden shrink-0 text-[14px] font-bold tracking-tight md:block">
            클래스 스튜디오
          </h1>
          {selectedClass && (
            <span className="min-w-0 truncate text-[12px] font-medium text-slate-400 max-md:font-semibold max-md:text-slate-700">
              <span className="hidden md:inline">› </span>
              {selectedClass.name}
            </span>
          )}
        </div>
        {/* 단계 스트립(§3.10.1) — ①대상 ②자료 ③배포. 프레젠테이션 전용 */}
        <StepStrip
          step1Done={Boolean(selectedClass)}
          step1Label={
            selectedClass && deployTargetResolved
              ? `${selectedClass.name} · ${deployTargetResolved.partial ? `${deployTargetResolved.count}/${deployTargetResolved.total}` : deployTargetResolved.count}명`
              : null
          }
          // 【E24 수리】 패널 존재(hasRightPanel)가 아니라 **자료 진척**으로 잰다
          // — 위 stepAdvanced 선언부 주석(탭 클릭만으로 ②③ 점등하던 오점등).
          step2Done={stepAdvanced}
          step3Active={stepAdvanced}
          onStep1Click={toggleTreePanel}
        />
        {/* 온보딩 투어 재진입(E26) — 필 스트립(div.h-11) 밖 헤더 소속이라
            G1·G15 프로브 계약 무접촉. data-tour-launcher = ch7-relaunch 앵커. */}
        <button
          type="button"
          data-tour-launcher
          onClick={() => window.dispatchEvent(new CustomEvent(TOUR_OPEN_EVENT))}
          title="화면 사용법을 처음부터 안내합니다"
          className="ml-auto hidden h-8 shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/60 px-2.5 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-100/70 md:flex"
        >
          <GraduationCap className="h-3.5 w-3.5" />
          튜토리얼
        </button>
        {hasRightPanel && (
          <button
            type="button"
            onClick={() => setPanelDrawerOpen(true)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 max-md:ml-auto xl:hidden"
          >
            <PanelRight className="h-3.5 w-3.5 text-slate-400" />
            지문 현황
          </button>
        )}
        <div className="hidden min-w-0 items-center gap-2 text-[11px] tabular-nums text-slate-400 xl:flex">
          <span>클래스 {totals.classCount}개</span>
          <span className="h-3 w-px bg-slate-200" />
          <span>학생 {totals.studentCount}명</span>
        </div>
      </header>

      {/* ── 3분할 본문 — 조판 모드(§3.10.17-a)에선 중앙+우측 자리를 인-플로우
          조판 표면이 채운다(좌측 레일·헤더 불변, LibraryPane 은 hidden 유지
          마운트로 인테이크·선택 보존) ── */}
      <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
        {/* 좌: 클래스 레일 — 관리 전용 §3.1.1v2 (lg+ — md~lg 는 ERP 사이드바와
            병존 시 중앙 열이 ~300px 로 붕괴하므로 드로어로 강등, RC1 시각 검수) */}
        {widths.tree > 0 && (
          <aside
            // data-panel-key: 리사이즈 고속 경로 앵커 — 드래그 중 훅이 이 요소의
            // style.width 에 직접 쓴다(프레임당 전체 리렌더 방지, 커밋은 1회).
            data-panel-key="tree"
            className="hidden shrink-0 border-r border-slate-200 lg:block"
            style={{ width: widths.tree }}
          >
            {treeBody}
          </aside>
        )}
        <PanelHandle
          label="클래스"
          panelKey="tree"
          collapsed={Boolean(collapsed.tree)}
          side="left"
          startResize={startResize}
          toggleCollapsed={toggleCollapsed}
          expand={expand}
          // 접힘 상태(트리 aside 언마운트)에서는 핸들이 ERP 사이드바 경계에
          // 밀착해 좌측 탭과 겹쳐 보인다 — 접힘일 때만 살짝 우측으로(ml-2,
          // twMerge 가 기본 mx-0.5 의 좌측만 대체). 2026-08-11 사용자 지적.
          className={
            collapsed.tree ? "hidden lg:flex ml-2" : "hidden lg:flex"
          }
        />

        {/* 중앙: 클래스 미선택 = 단계 가이드(§3.10.1 — 클래스-우선 구조 강제),
            선택 = 클래스 스코프 지문함(§3.10.4). 조판 중에도 **상시 활성**
            (§3.10.17-a v2 — 체크가 곧 실시간 조판이라 목록이 조판의 입력면).
            조판이 **보이는 동안만** 목록을 고정 폭으로 접고 시험지가 잔여
            전폭을 갖는다 — 다른 탭(조판 숨김)에서는 원 레이아웃(§3.10.17-e). */}
        <div
          className={
            // anyComposeVisible: 시험지·학습지 두 조판이 **같은 뒤집기**를 쓴다
            // (§3.10.21 E21-5 — 요구「좌측 컴팩트」가 신규 레이아웃 코드 0줄로
            // 성립한다). 둘은 centerAssetView 로 상호배제라 겹칠 수 없다.
            anyComposeVisible
              ? "flex h-full w-[420px] min-w-0 shrink-0 flex-col"
              : "flex min-h-0 min-w-0 flex-1 flex-col"
          }
        >
          {selectedClass ? (
            <LibraryPane
              academyId={academyId}
              classCtx={libraryClassCtx}
              onRegisterToClass={registerToClass}
              onUnregisterFromClass={unregisterFromClass}
              onOpenModuleSheet={openModuleSheet}
              // Esc 1중(§3.8.7) 양방향 — 실전 직행 진입 시 워크북 모달을 먼저
              // 닫는다(모달 상태는 오케스트레이터 소유라 채널이 필요하다).
              onCloseWorkbookModal={closeModuleSheet}
              onLibraryChanged={refreshAfterLibraryChange}
              setSessionQueue={setSessionQueue}
              onQuestionGenBridge={setQuestionGenBridge}
              onQuestionLaunched={handleQuestionLaunched}
              onDossierPassages={handleDossierPassages}
              flatPicked={flatPicked}
              onFlatPickedChange={handleFlatPickedChange}
              onAssetViewChange={handleAssetViewChange}
              onOpenQuestionById={openDossierQuestion}
              onComposeViewControl={registerComposeViewControl}
              // 학습지 축 5종(§3.10.21 E21-5) — sheetPicked/onSheetPickedChange
              // 는 **한 쌍**이다(library-pane.tsx 의 두 prop 선언): 후자가 없으면
              // 평면 행이 구 <Link> 그대로 남는다.
              // ⚠ 구 6번째 `sheetComposeActive`(중앙 420px 압박 고지)는 §3.10.23
              //   E24 에서 **수신부와 같은 커밋에** 삭제됐다 — 유일 소비처였던
              //   ClassWorksheetsPane 이 사라져 소비처가 0이었다. 되살리지 마라.
              sheetPicked={pickedSheets}
              onSheetPickedChange={applySheetPicked}
              // §3.10.22 E22-4 보강 — 「학습지 조판」 뷰 병합 목록의 **2축 원자
              // 커밋** 한 쌍.
              // 위 :1897 계열 주석의 실측(취소했는데 문항 3개 통째 교체)이 근거다.
              onSheetPickCanRemove={canRemovePickedSheets}
              onSheetPickedCommit={commitPickedSheetsUnchecked}
              // §M off 면 채널 자체를 내리지 않는다 — 병합 목록 행의 [모바일
              // 배포] 버튼이 prop 부재로 소멸한다(행 축 중앙 차단 지점 ②).
              onSheetDeploy={SHOW_MOBILE ? deploySheetFromRow : undefined}
              onSheetCompose={composeSheetFromRow}
              onSheetComposeViewControl={registerSheetComposeViewControl}
              // 지문 행 「생성 중」 활동 표식(§3.10.20) — 시그니처 메모로 참조
              // 고정된 맵(위 passageActivity 주석). memo(LibraryPane) 무손상.
              passageActivity={passageActivity}
              // §M 조판 유도 — SourceSwitcher 뷰 필 펄스 중계(원시 boolean).
              nudgeSheet={composeNudge.sheets}
              nudgeExam={composeNudge.questions}
              // 도시에 카드 「선택 해제」 컨트롤 등록(26-08-22) — 안정 참조.
              onDossierDeselectControl={registerDossierDeselect}
            />
          ) : (
            <StepGuidePane
              classes={classes}
              onSelectClass={selectClass}
              onCreateClass={openCreate}
            />
          )}
        </div>

        {/* 우: 조판 표면(내장) > 실행대(생성 문제 뷰) > 지문 도시에 > 빈 상태
            (§3.10.17-b v2 — 조판은 이 패널 "그 자리"에서 일어난다). */}
        <PanelHandle
          label={rightPanelLabel}
          panelKey="dossier"
          collapsed={Boolean(collapsed.dossier)}
          side="right"
          startResize={startResize}
          toggleCollapsed={toggleCollapsed}
          expand={expand}
          // 접힘 상태에서 핸들이 창 우측 경계에 밀착하지 않게 살짝 안쪽으로
          // (트리 핸들 ml-2 와 대칭 — twMerge 가 기본 mx-0.5 의 우측만 대체).
          className={
            collapsed.dossier ? "hidden xl:flex mr-2" : "hidden xl:flex"
          }
        />
        {widths.dossier > 0 && (
          <aside
            // data-panel-key: 리사이즈 고속 경로 앵커(트리와 동일 계약).
            data-panel-key="dossier"
            // 조판이 보이는 동안만 잔여 전폭(flex-1) — 시험지가 주 표면
            // (§3.10.17-a v2, 중앙 목록은 고정 420px 입력면으로 접힌다).
            // 닫거나 다른 탭으로 가면(조판 숨김) 원 폭 복귀(§3.10.17-e).
            className={
              anyComposeVisible
                ? "hidden min-w-0 flex-1 flex-col border-l border-slate-200 xl:flex"
                : "hidden shrink-0 flex-col border-l border-slate-200 xl:flex"
            }
            style={anyComposeVisible ? undefined : { width: widths.dossier }}
          >
            {rightPanelBody}
          </aside>
        )}
      </div>

      {/* 하단 생성 현황 도크는 §3.8.9v4 로 전면 폐기 — 진행·완료 표시는 지문함
          행 생성 이력(5초 폴링)·일괄 생성 패널 재견적·문제 생성 페이지가 맡는다. */}

      {/* ── 트리 드로어 (<lg — 폰+태블릿 공용, filter-rail 이중표면 패턴).
          z-50: 전역 작업 목록 플로팅(z-40, fixed right-0 top-0)이 닫기 X 를
          가리는 겹침 방지(검수 L3-1 — 우측 슬라이드오버와 대칭). ── */}
      {treeDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setTreeDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/25"
          />
          <div className="relative flex h-full w-[264px] flex-col bg-white shadow-xl">
            {/* 제목 없음 — 트리 섹션 라벨 「클래스」와 중복(감사 D5), 닫기만 */}
            <div className="flex h-10 shrink-0 items-center justify-end border-b border-slate-100 px-1.5">
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setTreeDrawerOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{treeBody}</div>
          </div>
        </div>
      )}

      {/* ── 우측 패널 슬라이드오버 (xl 미만 — 감사 D1, 트리 드로어 동형.
          aside 와 동일 위계(rightPanelBody)를 그대로 렌더한다. 게이트는
          hasRightPanel 파생 1개 — 헤더 버튼과 중복 기술 금지(§3.10.9). ── */}
      {panelDrawerOpen && hasRightPanel && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setPanelDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/25"
          />
          <div className="absolute inset-y-0 right-0 flex w-[360px] max-w-[85vw] flex-col bg-white shadow-xl">
            {/* 제목 없음 — 패널 헤더가 클래스명·지문 제목을 이미 표기, 닫기만 */}
            <div className="flex h-10 shrink-0 items-center justify-end border-b border-slate-100 px-1.5">
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setPanelDrawerOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{drawerPanelBody}</div>
          </div>
        </div>
      )}

      {/* ── 학습지 만들기 모달 (§3.10.19 E19-3 — 구 7모듈 체크박스 워크북 모달을
          학습지 3상품 라디오로 전환. props 8개 시그니처는 무접촉이라 이 배선은
          개편 전후 바이트 동일하다) ── */}
      <WorkbookGenerateModal
        open={sheetPassages !== null}
        onClose={() => setSheetPassages(null)}
        passages={sheetPassages ?? []}
        classes={classes}
        selectedClassId={selectedClassId}
        onSelectClass={selectClass}
        queueApi={queueApi}
        onLaunched={() => {
          setSheetPassages(null);
          refreshAfterLibraryChange();
        }}
      />

      {/* ── 도시에 문제 상세 모달 (§3.9.5① questionId 경로 — U1 로더) ── */}
      <DossierQuestionModal
        open={dossierQuestionId !== null}
        state={dossierQuestionState}
        onClose={closeDossierQuestion}
      />

      {/* 배포 다이얼로그·과제 컴포저 경유는 §3.10(E4)로 폐기 — 배포는 도시에
          카드의 인라인 실행대(DossierDeployInline)가 담당한다. */}

      <CreateClassModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          void refreshClasses().then(() => selectClass(id));
        }}
      />

      {/* ── 레일 「학생 추가」(§3.1.1v2) — 학생 탭 §3.2 모달·§5 초대 키트 재사용.
          신규 등록 성공 시 초대 시트(z-90)가 모달(z-70) 위에 자동 오픈되고,
          모달은 열린 채 Enter 연속 등록을 지원한다(학생 탭 동선 그대로). ── */}
      {studentTarget && (
        <StudentAddModal
          open
          classId={studentTarget.id}
          onClose={closeAddStudents}
          onAdded={handleStudentAdded}
          onAttached={handleRosterChanged}
        />
      )}
      {/* §M off 면 시트째 미렌더 — 여는 손잡이(레일 초대장 버튼·등록 후 자동
          오픈)도 같은 플래그로 봉인돼 있어 상태가 남아도 무해하다. */}
      {SHOW_MOBILE ? (
        <InviteKitSheet
          open={inviteStudentId !== null}
          studentId={inviteStudentId}
          onClose={closeInviteKit}
        />
      ) : null}

      {/* 코치마크 1번 — 트리 하단 「+ 새 클래스」 앵커(§4 개정) */}
      <CoachMark
        stepId="create-class"
        when={classes.length === 0 && !createOpen}
        text="먼저 클래스를 만들어 주세요. 이름 하나면 됩니다 — 예: 한영고 1학년 내신 심화반"
      />

      {/* 온보딩 투어(E26) — 프롭 0 자립 계층. idle 이면 DOM 기여 0.
          첫 방문 자동 환영은 webdriver 에서 억제(기존 프로브 12종 보호). */}
      <StudioTour />

    </div>
  );
}
