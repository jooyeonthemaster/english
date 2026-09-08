"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 중앙 소스 보드 임베드 (스펙 §3.8 통합 워크벤치)
//
// 학습지/문제 생성의 인테이크 표면을 그대로 재호스팅한다. 조립 정본:
//   · custom-type-generate-panel(IntakeSurface+PassageCardGrid 최단 배선)
//   · generate-page-client 슬롯 구성(library/upload/examBrowser/overlay)
//   · 상태 훅 = passage-registration 판 usePassageLibrary(폴더 CRUD 완전판)
// 중앙 = 자산 3뷰(§3.10.16-a): 지문관리(기본 — §3.10.14 E13, 구 "기출 지문
// 기본 진입" 폐기) · 생성 문제 전체보기(평면 리스트+픽바) · 학습지 전체보기.
// 들여오기 3방법(기출 compactBrowser · 직접 입력 · 파일업로드)은 「지문 추가」
// 팝오버에서 갈라지는 집중 모드 + 워크스페이스(overlay — AI 변형 포함).
//
// AuthoringBoard visible 게이트: IntakeSurface 가 pasteVisible(=탭 활성 &&
// !overlay)을 MultiPassagePaste.boardVisible 로 내려보낸다 — §3.10.18 E18-a 로
// overlay 를 아예 넘기지 않으므로 이 판정은 항상 참이다(오버레이 소멸).
//
// 생성 동선(§3.10.18 E18 — 26-08-15 사용자 지시로 §3.8.5·§3.8.6 폐기):
// 「워크스페이스」 표면은 스튜디오에서 **전량 제거**됐다(하단 담기 CTA · 열기
// 보조 버튼 · 스위처 필 · IntakeSurface overlay 오버레이 4종 모두). 생성 진입은
// 지문관리 하단 전폭 2버튼 직행 — [학습지 생성](§3.10.19 E19-8 개명, 구
// 「학습 워크북 생성」)(onOpenModuleSheet → WorkbookGenerateModal,
// 오케스트레이터 소유) + [실전 문제 생성]
// (useStudioQuestionGen → StudioQuestionGenModal, 이 파일이 호스팅).
// 두 모달은 Esc 1중이라 동시 오픈을 만들지 않는다(§3.8.7 — 이제 양방향).
//
// ⚠ useWorkspaceRows 는 **화면에서만** 사라진다 — 실전 모달이 openForRow(localId)
//   / activeRow: WorkspaceRow 로 행에 묶여 있어(훅 계약 불변) 이 판은 그것을
//   **헤드리스 스테이징 스토어**로 계속 든다: 렌더되지 않고, 발사 직전에만
//   clear() → loadPassages(선택분) 로 채워진다. 그래서 rows ≡ 선택 집합이
//   불변식이고, workspaceVisible 는 launchHostOpen(직행 호스트 열림)에 물린다 —
//   이 한 줄이 없으면 activeRow 가 self-null 되어 모달이 즉시 닫힌다.
//
// 행 액션(§3.10.18 E18-d): 행 우측 아이콘은 「상세보기」가 아니라 「지문 수정」이며,
// 클릭하면 모달이 아니라 행 **바로 아래**에 인라인 편집기가 펼쳐진다
// (LibraryInlinePassageEditor — WorkspacePassageRow embedded 어댑터).
// 컨테이너: 부모가 flex min-h-0 flex-1 flex-col 보장 — 내부 min-h-0 스크롤
// 체인은 이 파일이 소유한다(PassageCardGrid 는 flex-1 min-h-0 overflow-hidden
// 부모 전제, 자체 크롬 내장이라 FolderSection sticky/-mx-6 크롬 문제 없음).
// §3.9v2 추가: 지문 도시에 업링크(onDossierPassages — 발행 집합은 §3.10.18
// E18-c ⑤ 로 **지문함 선택뿐**으로 축소됐다. 구 「행 ⊕ 선택」 합집합은 행이
// 헤드리스가 되면서 사용자가 끌 수 없는 유령 항목을 남겨 폐기)·이력
// 팝오버 행선지 수복(문제 행=상세 모달·학습자료 행=분석 모달)도 이 판 소유.
// 하단 「전체 학습 워크북 생성」(당시 명칭 — 현존하지 않는 CTA라 §3.10.19 E19-8
// 개명 대상이 아니다. 지금 살아 있는 하단 CTA 는 위의 [학습지 생성] 뿐)
// 일괄 CTA 는 D6 로, 일괄 생성 패널(구 BatchGeneratePane·onWorkspaceBridge
// 업링크)은 §3.10(E6)으로 각각 폐기 — 생성 진행 표시는 우측 도시에 「생성 중」
// 스트립(§3.10.6, 오케스트레이터가 조립해 내린다)이 담당한다.
//
// ── U11 배선: 학습지 조판 픽 통과(§3.10.21 E21-5) ─────────────────────────
// 목록 행의 2버튼([모바일 배포][학습지 조판])과 체크 선택을 위해 픽 계열
// 옵셔널 prop 7종을 이 판이 중계한다(초판 수신자는 구 「학습지 관리」 필의
// ClassWorksheetsPane 이었고, §3.10.23 E24 로 ComposerListPane 이 승계했다).
// 이 판이 **소유하지 않는 것**과 **소유하는 것**을 분명히 갈랐다:
//  · 선택 상태(pickedSheets Map)는 오케스트레이터 소유 = controlled 다.
//    근거는 문항 축 flatPicked 와 완전히 같다(studio-home-client.tsx:1409-1414
//    주석): 우측 본문이 aside/드로어 **2트리**에 렌더돼 별개 인스턴스가 되므로,
//    선택을 아래에 두면 두 트리의 체크가 갈라진다. 그래서 `sheetPicked` /
//    `onSheetPickedChange` 를 flatPicked/onFlatPickedChange 와 **동형**으로 뚫고
//    그대로 흘려보낸다.
//  · 이 판이 소유하는 것은 딱 하나, **rows 를 아는 자만 할 수 있는 일** —
//    reportId → row 미러(ref)와 SheetPickMeta 조립, 그리고 담기/빼기 Map 전이.
// 조판 발사([학습지 조판])는 **「학습지 조판」 뷰** 강제 전환이 필요하므로 문항
// 축의 onComposeViewControl 과 같은 문법으로 `onSheetComposeViewControl` 를
// 올린다(도시에에서 발사해도 같은 화면으로 수렴 — §3.10.21 E21-5).
// ⚠ 픽 계열 prop 은 전부 옵셔널이지만, 목록이 ComposerListPane 단일 인스턴스로
//   수렴한 뒤(§3.10.23 E24)로는 「미전달 = 구 <Link> 행이 바이트 동일하게
//   유지된다」는 이행기 폴백이 **소멸**했다. 지금 미전달의 의미는 하나뿐이다 —
//   handleComposerCommit 의 학습지 갈래가 옵셔널 호출로 조용히 무동작이 된다.
//
// ── U2 배선: 자산 3필 「지문관리 | 학습지 조판 | 시험지 조판」(§3.10.23 E24) ──
// 구 4필 동거(문제관리·학습지 관리·조판실)가 **소멸**했다. 뷰 유니온은
// "passages" | "sheet" | "exam" 3값이고(source-switcher.tsx), 목록은 두 조판
// 뷰가 **같은 ComposerListPane 인스턴스**를 공유하며 `lockedKind` 로만 갈린다.
// 이 판이 지는 책임은 정확히 4개다:
//  ① fetch 게이트 `listActive = assetView !== "passages"` — **두 축 모두** 켠다.
//     ⚠⚠ **좁히지 마라**(E24 §1⑤ critical). 「학습지 조판 뷰니까 학습지만
//       불러오면 된다」가 정확히 사고를 낸다: 문항 fetch 가 꺼지면
//       handleFlatSelectionChange 가 rows 미러에 없는 id 를 **말없이 건너뛰어**
//       사용자가 극찬한 합본이 토스트 0·콘솔 0 으로 무음 파괴되고, 학습지
//       fetch 가 꺼지면 문항이 128건 있어도 판이 전면 스켈레톤으로 뜬다.
//       게다가 재조회 트리거가 「뷰 최초 진입」뿐이라 **새로고침으로도 안
//       풀린다**(영구 고착). 음성 판정(`!== "passages"`)으로 쓰는 이유도 같다 —
//       뷰가 늘어도 새 뷰가 자동으로 「목록 활성」에 포함돼, 축을 하나 빠뜨리는
//       사고가 구조적으로 불가능해진다. 두 seq/key ref 는 분리 유지(병렬 독립
//       취소·축별 재시도).
//  ② 타입별 델타 커밋 라우터(handleComposerCommit) — 단일 DragSelect 가 두
//     축을 함께 훑으므로 「Set 전량 교체」 금지(E22-4). 문항은 Set 재구성 →
//     handleFlatSelectionChange, 학습지는 Map 단일 패스 → onSheetPickedChange.
//  ③ 뷰 강제 채널 2개를 **서로 다른 값**으로 재조준: 문항 축 → "exam",
//     학습지 축 → "sheet". E22 구조에서는 두 채널이 **같은** "studio" 를 넘기고
//     composeMode 가 「어느 조판인가」를 들었지만, E24 는 composeMode 를 폐지하고
//     가시 판정을 뷰 값으로 되돌렸다 — 즉 **채널 자체가 정보**다(분리 근거가 E22
//     때보다 오히려 강해졌다). 두 자리는 바이트 동일에 가까워 검색·치환의 기본
//     결과가 「둘 다 같은 값」인데, 그러면 한쪽 조판이 **영원히 안 보인다**
//     (에러 0·경고 0. 사용자에겐 "버튼이 안 먹는다").
//  ④ 스위처 카운트는 questionCount(시험지 조판 필)·worksheetCount(학습지 조판
//     필) **2개뿐**이다. 구 studioCount(두 축 합)는 조판실 필과 함께 소멸했다 —
//     되살리면 문항이 **양쪽 필에 계상**돼 두 숫자가 겹쳐 보이고, 사용자가 알고
//     싶은 「어느 쪽에 뭐가 있나」가 오히려 흐려진다.
// 레거시 2판(ClassQuestionsPane·ClassWorksheetsPane)은 **파일째 삭제**됐다.
// 존치 근거였던 「뷰 강제 채널의 착지점 + 기존 프로브 셀렉터의 상태 도메인」이
// ③(새 값 재조준)과 프로브 이행(`data-asset-view` 셀렉터)으로 동시에 소멸했고,
// hidden 공존 3판 → 1판으로 DOM 비용을 회수한다 — 사용자가 말한 「복잡함」의
// 물리적 해소가 정확히 이것이다. 두 판이 export 하던 조회 상태 2타입은
// `@/lib/studio/list-states` 로 이사했다(판을 지워도 타입은 살아야 한다).
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// 지문관리 빈 상태 카피가 배포 없는 자구(조판·인쇄)로 갈린다. 목록 행의
// [모바일 배포]는 이 파일의 분기가 아니라 **prop 부재로** 소멸한다 —
// 오케스트레이터(studio-home-client, 감독 소관)가 off 에서 onSheetDeploy 를
// 내리지 않으면 아래 ComposerListPane 배선(`onDeploySheet={onSheetDeploy ?
// handleSheetDeployRow : undefined}`)이 undefined 를 전달해 행 버튼이 활성·
// 비활 분기째 사라진다. 픽 계열 prop·핸들러 코드는 전부 존치 — 복구는 env
// 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowRight,
  BookOpen,
  ClipboardPaste,
  Cpu,
  FileText,
  FolderMinus,
  FolderPlus,
  GraduationCap,
  ImageUp,
  ListChecks,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getStudioPassageAnalysis,
  type StudioPassageAnalysisData,
} from "@/actions/studio/dossier";
import { listStudioClassQuestions } from "@/actions/studio/questions";
// 기출 **문항** 반입(docs/gichul-question-bank-spec.md §5·§11.4) — 지문 축의
// intake.handleImportExamPassages 와는 다른 액션이다(아래 flushExamBankBuffer 주석).
import {
  importExamQuestionsToStudioClass,
  listStudioClassExamBankIds,
} from "@/actions/studio/exam-questions";
// 인라인 기출 브라우저(§11.2, 구 모달 폐기) — 패널↔호스트 계약은 inline/types.ts 정본.
import { ExamBankInlinePanel } from "@/components/workbench/exam-question-bank/inline";
import type {
  ExamBankImportMappingEntry,
  ExamBankPickMeta,
} from "@/components/workbench/exam-question-bank/inline/types";
import { EXAM_BANK_IMPORT_MAX } from "@/lib/exam-passages/question-bank-types";
// 「체크 즉시 조판」(§11.13.1) — 은행 항목을 클라이언트에서 BuilderQuestion 으로 조립해 임시 id
// 로 레지스트리에 올리고, 조판기가 서버 대신 거기서 찾는다. 반입 착지는 alias 로 제자리 개명.
import {
  CLIENT_QUESTION_ID_PREFIX,
  clientQuestionIdFor,
  isClientQuestionId,
  peekQuestionIdAlias,
  registerClientQuestion,
  registerQuestionIdAlias,
  unregisterClientQuestion,
} from "@/components/exams/paper-builder/client-question-registry";
import type { BuilderQuestion } from "@/components/exams/paper-builder/types";
import { fetchBankItemAsBuilderQuestion } from "@/lib/exam-passages/question-bank-client-builder";
// facet 은 헤더 보조 문구·진입 버튼 카운트용 원시값(§11.2) — 8.5MB 본문 JSON 이 아니라
// 작은 facets 만이다(본문은 서버 전용 question-bank.ts 가 적재한다).
import examBankFacets from "@/data/exam-passages/questions-facets.json";
import {
  listStudioClassWorksheets,
  type StudioClassWorksheetRow,
} from "@/actions/studio/worksheets";
import type { StudioClassQuestionRow } from "@/lib/studio/dossier-types";
// 조회 상태 2타입은 원래 삭제된 레거시 2판이 각자 export 하던 것이다(§3.10.23
// E24). lib 정본으로 이사시킨 근거는 그 파일 헤더에 있다 — 요지는 「fetch 소유자
// (이 파일)와 렌더 소비자(composer-list-pane)의 유일한 접점이라, 어느 한쪽에
// 로컬 사본을 두면 모양이 갈리는 순간 『스켈레톤이 안 걷힌다』류 결함이 조용히
// 열린다」. 여기에 다시 로컬 interface 를 만들지 마라.
import type {
  ClassQuestionsState,
  ClassWorksheetsState,
} from "@/lib/studio/list-states";
import type { SheetPickMeta } from "@/lib/studio/sheet-pick-types";
import { WideModal } from "@/components/layout/wide-modal";
import { usePassageLibrary } from "@/components/workbench/passage-registration/use-passage-library";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { PassageContentModal } from "@/components/workbench/passage-content-modal";
import { ExamPassageLibrary } from "@/components/workbench/exam-passage-library";
import {
  QuestionCard,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  IntakeSurface,
  type IntakeTab,
  type IntakeView,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import { GenerateUploadPanel } from "@/app/(director)/director/workbench/generate/intake/generate-upload-panel";
import { ExtractionLoadingCards } from "@/app/(director)/director/workbench/generate/intake/extraction-loading-cards";
import { ExtractionDetailModal } from "@/app/(director)/director/workbench/generate/intake/extraction-detail-modal";
import { PassageCardGrid } from "@/app/(director)/director/workbench/generate/passage-card-grid";
import { useWorkspaceRows } from "@/app/(director)/director/workbench/generate/workspace/use-workspace-rows";
import type {
  PassageItem,
  QueueItem,
} from "@/app/(director)/director/workbench/generate/generate-page-types";
import { createQuestionGenerationJobSmart } from "@/app/(director)/director/workbench/generate/use-generation-handlers";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import { resolveSelectionToPassageIds } from "@/lib/extraction/resolve-draft-selection";
import { triggerHintGlow } from "@/lib/hint-glow";
import type { PassageActivityMap } from "@/lib/passage-activity";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type {
  BatchQuestionLaunchResult,
  BatchQuestionSettings,
} from "./batch-types";
// 구 `./class-questions-pane` · `./class-worksheets-pane` import 2블록은
// §3.10.23 E24 로 **소멸**했다(두 파일 자체가 삭제됐다 — 위 헤더 U2 근거).
import {
  ComposerListPane,
  type ComposerRow,
} from "./composer-list-pane";
import type { PickedQuestionMeta } from "./dossier-pick-bar";
import { LibraryInlinePassageEditor } from "./library-inline-passage-editor";
import { useLibraryPaneIntake } from "./library-pane-intake";
import { questionRowTypeLabel } from "./passage-dossier-pane";
import {
  SourceSwitcher,
  type IntakeMethodKey,
  type StudioAssetView,
} from "./source-switcher";
import { AddPassageLauncher } from "./add-passage-launcher";
import { StudioAnalysisPane } from "./analysis-pane";
import { StudioStudentsPane } from "./students-pane";
import type {
  ExamCandidateRow,
  ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";
import type { StudioStudentExamRow } from "@/actions/studio/student-exams";
import { StudioQuestionGenModal } from "./studio-question-gen-modal";
import { useStudioQuestionGen } from "./use-studio-question-gen";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

export interface LibraryClassCtx {
  classId: string;
  className: string;
  /** 이 클래스에 등록된 지문 id — 「이 클래스」 스코프·담기/빼기·「담김」 배지 */
  registeredIds: ReadonlySet<string>;
  /**
   * 등록 지문 목록 로딩 중(§3.10.4, additive) — 기본 스코프(이 클래스)의 첫
   * 프레임에 registeredIds 가 아직 비어 "0개" 빈 그리드가 깜빡이는 것을
   * 스켈레톤으로 가린다. 오케스트레이터가 childrenByClass 로 파생.
   * 미전달 = false 취급(기존 호스트 무회귀).
   */
  registeredLoading?: boolean;
}

/**
 * 문항판 도크 브리지(§3.8.9) — 스탬프 판정·재발사는 useStudioQuestionGen 이
 * 이 판 안에 살므로, effect 로 오케스트레이터에 안정 참조를 올려보낸다.
 * 오케스트레이터는 useState 로 받아 GenerationDock 에 필드 단위로 내린다.
 */
export interface QuestionGenBridge {
  /** 큐 항목이 이 스튜디오 발사분인지(studio-qgen-stamps) — 도크 종결 필터 */
  isStamped: (item: QueueItem) => boolean;
  /** 실패 문항 「같은 조건으로 다시 생성하기」 — 카드 신원 보존 재발사 */
  retry: (item: QueueItem) => void;
  /**
   * 일괄 실전 발사(§3.9v2.5) — 전 행 override 덮어쓰기 후 무인자 발사.
   * use-studio-question-gen 의 additive 반환 필드 패스스루라 옵셔널. 구 소비처
   * 일괄 생성 패널은 §3.10(E6)으로 폐기돼 현재 소비처 없는 잔존 계약이다 —
   * 생성 진행 표시는 도시에 「생성 중」 스트립(§3.10.6)이 담당한다.
   */
  batchGenerateQuestions?: (s: BatchQuestionSettings) => BatchQuestionLaunchResult;
  /** 일괄 실전 크레딧 견적(§3.9v2.5) — 구 일괄 생성 패널 폐기(E6) 후 잔존 */
  batchQuestionCost?: (s: BatchQuestionSettings, rowCount: number) => number;
}

export interface LibraryPaneProps {
  academyId: string;
  /** null = 전체 자료(클래스 미선택) */
  classCtx: LibraryClassCtx | null;
  /**
   * 선택 지문을 현재 클래스에 등록(멱등) — 반환 = 실제 추가 수.
   * `skipRefresh` = 등록 후 클래스 지문 재조회를 생략한다(26-08-15 지연 수술).
   * 뒤이어 onLibraryChanged 로 한 번에 갱신하거나 50개 청크 루프를 도는
   * 호출자가 쓴다 — **서버 액션은 직렬 처리**라 중복 갱신 1건이 곧 1.5~2.5초다.
   */
  onRegisterToClass: (
    passageIds: string[],
    opts?: { skipRefresh?: boolean },
  ) => Promise<number>;
  /**
   * 선택 지문을 현재 클래스에서 빼기(§3.10.4, additive) — 링크만 해제하고
   * 지문·생성물은 보존한다. 반환 = 실제 해제 수(토스트는 이 판이 띄운다).
   * 오케스트레이터 구현 = removePassagesFromStudioClass + loadChildren(force).
   * `skipRefresh` 계약은 onRegisterToClass 와 동일. 참조 안정 전제
   * (memo(LibraryPane) 방어선 유지).
   */
  onUnregisterFromClass?: (
    passageIds: string[],
    opts?: { skipRefresh?: boolean },
  ) => Promise<number>;
  /** 「학습지 생성」 — 학습지 모달 오픈(§3.10.19) */
  onOpenModuleSheet: (
    passages: { id: string; title: string; content: string }[],
  ) => void;
  /**
   * 워크북 모달 닫기(§3.10.18 E18-c ④, additive) — Esc 1중(§3.8.7)을 **양방향**
   * 으로 만든다. 워크북 모달은 오케스트레이터 소유라 이 판이 직접 닫을 수 없어,
   * 「실전 문제 생성」 직행 진입 초입에서 이 채널로 먼저 닫는다(반대 방향은
   * qgen.closeGenModal 이 이미 담당). 미전달 = 기존 단방향(무회귀).
   * 참조 안정 전제(memo(LibraryPane) 방어선).
   */
  onCloseWorkbookModal?: () => void;
  /** 등록·삭제·신규 지문 등 라이브러리 변동 — 트리 카운트 리프레시 훅 */
  onLibraryChanged: () => void;
  // 구 sessionQueue(표시용 큐)는 §3.10.18 E18-a 로 소비처가 사라졌다 —
  // 유일 소비처가 워크스페이스 행의 생성 이력 팝오버였다. 세터만 남는다.
  /** 문항 세션 큐 세터 — useStudioQuestionGen 이 스탬프 래퍼를 씌워 쓴다 */
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  /** 도크 브리지 업링크 — 마운트 시 1회 올리고 언마운트 시 null */
  onQuestionGenBridge: (bridge: QuestionGenBridge | null) => void;
  /** 문항 발사 직후(모달 닫힘과 동시) — 도크 펼침 후처리 */
  onQuestionLaunched: () => void;
  /**
   * 지문 도시에 업링크(§3.10.11-a, additive) — 발행 집합 = **워크스페이스 행
   * ⊕ 내 지문함 선택** 합집합. 행(passageId 중복 제거, 행 순서)이 앞, 선택 중
   * 행에 없는 id(draft 의사 id 제외)가 선택 순서(Set 삽입 순서)로 뒤 —
   * 수신부 자동 펼침 규칙이 "마지막 항목 = 최신"을 전제하므로 이 순서가
   * 계약이다. 빈 합집합 = null. 상세 열람은 발행하지 않는다(행·선택만이
   * 트리거 — v1 단건 발행 폐기). 발행 배열은 매번 새로 만들지만 prop
   * 자체는 안정 참조 전제(memo 방어선 — QuestionGenBridge 선례).
   */
  onDossierPassages?: (items: { id: string; title: string }[] | null) => void;
  /**
   * 평면 문항 선택(§3.10.17-b) — **오케스트레이터 소유**(우측 실행대가
   * aside/슬라이드오버 이원 렌더라 §3.10.13 과 동일 근거). 이 판은 rows 를
   * 알고 있으므로 Set→Map(메타) 재조립만 담당해 onFlatPickedChange 로 올린다.
   * Map 삽입 순서 = 체크 순서 = 조판 순서. 클래스 전환 청산도 오케스트레이터.
   */
  flatPicked: ReadonlyMap<string, PickedQuestionMeta>;
  onFlatPickedChange: (next: ReadonlyMap<string, PickedQuestionMeta>) => void;
  /**
   * 함수형 갱신 채널(additive, 기출 호스트 §11.13.1 전용). 기출 블록의 착지·해제·개명·
   * 메타 보정은 이 판이 읽는 미러(flatPickedRef, effect 갱신)가 한 발 늦을 수 있어 Map 통째
   * 제출로는 stale base 덮어쓰기(해제한 임시 항목 부활·픽 유실)가 남는다 — updater 는 React
   * 가 최신 prev 를 넘기므로 커밋 순서와 무관하다. 미전달이면 미러 base 로 계산해 통째 제출
   * 하는 종전 경로로 폴백한다. 안정 참조 전제(memo 계약).
   */
  onFlatPickedUpdate?: (fn: FlatPickedUpdater) => void;
  /**
   * 자산 뷰 업링크(§3.10.17-b) — 생성 문제 뷰에서 우측 패널이 실행대로
   * 바뀌는 판정 재료. 참조 안정 전제.
   */
  onAssetViewChange?: (view: StudioAssetView) => void;
  /**
   * [R1] 새로고침 위치 복원 — **초기 뷰 시드**(세터가 아니다).
   *
   * 이 판이 자산 뷰의 주인이라(호스트의 centerAssetView 는 업링크로 먹는 미러다)
   * 복원값도 여기로 들어와야 한다. 서버가 이미 검증했고(page.tsx →
   * studio-location.ts), 클래스가 없으면 항상 "passages" 로 접혀서 온다.
   *
   * ⚠ 이것은 setAssetView 의 **4번째 작성자가 아니다** — useState 초기값 1회
   *   시드일 뿐이라 :526 「setAssetView 금지」 인구조사(작성자 3인: handleSelectView ·
   *   handleSelectIntake · [classId] 리셋)는 그대로 유효하다.
   */
  initialAssetView?: StudioAssetView;
  /**
   * 문항 상세(questionId 경로) — 오케스트레이터 DossierQuestionModal 재사용
   * (§3.9.5① U1 로더). 생성 문제 전체보기 행의 상세 버튼이 쓴다.
   */
  onOpenQuestionById?: (questionId: string) => void;
  /**
   * 시험지 조판 발사 뷰 강제 명령 채널(§3.10.17-e (k), additive) — 마운트 시
   * 「**「시험지 조판」 뷰**로 전환(인테이크 복귀 포함)」 함수를 1회 올리고
   * 언마운트 시 null(§3.10.23 E24 로 착지 뷰가 구 "questions"/"studio" →
   * "exam" 으로 재조준됐다). 도시에 픽바의 「시험지 조판」이 목록 행 발사와
   * 완전히 **같은 화면**이 되게 하는 훅(사용자 지시). 아래 학습지 축
   * onSheetComposeViewControl 과 **짝이되 인자가 다르다** — 두 채널이 같은 값을
   * 넘기면 한쪽 조판이 영원히 안 보인다(발사부 주석의 ⚠⚠ 참조).
   * 참조 안정 전제(memo 방어선).
   */
  onComposeViewControl?: (control: (() => void) | null) => void;
  // 구 composeActive(조판 중 워크스페이스 필 숨김 §3.10.17-e (k))는
  // §3.10.18 E18-a 로 소멸 — 숨길 필 자체가 없다.
  /**
   * 학습지 조판 픽(§3.10.21 E21-5) — **오케스트레이터 소유**(controlled).
   * 근거는 flatPicked 와 한 글자도 다르지 않다: 우측 본문이 aside/드로어 2트리에
   * 렌더돼 별개 인스턴스가 되므로 선택을 아래에 두면 두 트리가 갈라진다.
   * Map 삽입 순서 = 체크 순서 = **조판 순서**(부착 문서 배열 순서 그대로).
   * 이 판은 rows 를 알고 있으므로 담기/빼기 → Map 전이 + SheetPickMeta 조립만
   * 담당해 onSheetPickedChange 로 통째 올린다. 참조 안정 전제(memo 방어선).
   *
   * ⚠ 두 prop 이 **한 쌍**이다 — onSheetPickedChange 가 없으면 pane 에 픽 계열
   *   prop 을 하나도 내리지 않아 행이 구 <Link> 그대로 남는다(무회귀 게이트).
   */
  sheetPicked?: ReadonlyMap<string, SheetPickMeta>;
  onSheetPickedChange?: (next: ReadonlyMap<string, SheetPickMeta>) => void;
  /**
   * 병합 목록(ComposerListPane, §3.10.22 E22-4) 전용 **2축 원자 커밋 채널 한 쌍**.
   * (구 「조판실」 필은 §3.10.23 E24 로 소멸했지만 판과 이 계약은 그대로 산다 —
   *  이제 「학습지 조판」·「시험지 조판」 두 뷰가 그 판을 공유한다.)
   * `onSheetPickCanRemove` 는 dirty confirm 만 물어 boolean 을 돌려주고,
   * `onSheetPickedCommit` 은 **다시 묻지 않고** 커밋한다(가드 없는 세터).
   *
   * ⚠ 반드시 **함께** 내려야 한다 — 하나만 오면 handleComposerCommit 이
   *   구경로(onSheetPickedChange, 가드 포함)로 폴백한다. 둘 다 미전달이면
   *   기존 동작 그대로라 무회귀(additive).
   *
   * 왜 필요한가(실측 `.tmp-worksheet-compose/_a22-f-dirty.mjs`): 병합 목록은
   * 단일 DragSelect 가 문항·학습지를 한 제스처로 훑는데 커밋이 축별 순차라,
   * 문항 축을 먼저 커밋한 뒤 학습지 축에서 confirm 이 떴다. 「취소」를 눌러도
   * 문항 대기열은 이미 교체된 뒤였다(q#1~#3 cmsypvnf/vec/ulr → cmsypsr2/sdz/sdx,
   * 체크 순번 = 인쇄 순서까지 소멸). 「취소는 아무 일도 일어나지 않는다」를
   * 지키려면 **선(先) 질의 → 후(後) 2축 커밋** 밖에 없다.
   */
  onSheetPickCanRemove?: (next: ReadonlyMap<string, SheetPickMeta>) => boolean;
  onSheetPickedCommit?: (next: ReadonlyMap<string, SheetPickMeta>) => void;
  /**
   * 행 [모바일 배포](§3.10.21 E21-5·E21-6-1) — PRIME 행만 활성이라는 판정은
   * pane 이 sheet-deploy-eligibility 정본으로 이미 끝냈다(여기까지 올라오는 건
   * 배포 가능 행뿐). 페이로드를 행 원형이 아니라 SheetPickMeta 로 좁히는 이유:
   * 두 발사 표면(이 목록·도시에)이 오케스트레이터의 **같은 핸들러 1개**로
   * 수렴해야 하고, StudioClassWorksheetRow 는 서버 액션 모듈 타입이라 상위
   * prop 계약에 끌고 올라갈 이유가 없다.
   */
  onSheetDeploy?: (meta: SheetPickMeta) => void;
  /**
   * 행 [학습지 조판](§3.10.21 E21-5) — **의도 발신만** 한다. 대기열 삽입·
   * activeSheetId·sheetComposeOpen 3전이는 오케스트레이터가 한 곳에서 한다
   * (여기서 미리 sheetPicked 를 건드리면 같은 정책이 두 파일로 갈린다).
   * 뷰 전환은 아래 onSheetComposeViewControl 채널이 담당한다.
   */
  onSheetCompose?: (meta: SheetPickMeta) => void;
  /**
   * [E31] 「조판 중인 학습지의 지문」 되짚기 3종(26-08-24 사용자 지시) — 이 판은
   * **패스스루만** 한다(ComposerListPane 으로 그대로 내려간다).
   *
   * 왜 이 판이 소유하지 않는가: 활성 문서(activeSheetId)와 개방 여부는 조판 표면과
   * 한 몸이고 그 상태의 소유자는 오케스트레이터다(studio-home-client :2199-2210
   * 「상태 3개」 주석). 여기서 복제하면 좌측 목록과 우측 조판 헤더가 서로 다른
   * 「활성」을 말하는 날이 온다.
   *
   * ⚠ 세 값 다 **원시값**이다. `{passageId, seq}` 객체로 묶어 받으면 호스트 렌더마다
   *   새 참조가 되어 memo(LibraryPane)·memo(ComposerListPane) 두 방어선이 함께
   *   무너진다(위 EMPTY_SHEET_PICKED 주석과 같은 계통).
   * 미전달 = 표시·스크롤 둘 다 없음(기존 픽셀 동일 · additive).
   */
  sheetActiveId?: string | null;
  sheetRevealPassageId?: string | null;
  sheetRevealSeq?: number;
  // 구 `sheetComposeActive?: boolean`(중앙 420px 압박 고지, §3.10.21 E21-5)은
  // **발신부(studio-home-client)와 같은 커밋에서** 삭제됐다 — 유일 소비처였던
  // ClassWorksheetsPane(컴팩트 행 판정)이 §3.10.23 E24 로 사라져 소비처가 0이었고,
  // 후신 ComposerListPane 은 좁은 열을 자체 문법으로 처리한다. 되살리지 마라 —
  // 문항 축 조판이 억제하는 것이 0이라 한 축만 억제하면 두 축의 대칭이 깨진다.
  /**
   * 학습지 조판 발사 뷰 강제 명령 채널(§3.10.21 E21-5, additive) — 마운트 시
   * 「**「학습지 조판」 뷰**로 전환」 함수를 1회 올리고 언마운트 시 null
   * (§3.10.23 E24 로 착지 뷰가 구 "worksheets"/"studio" → "sheet" 로 재조준됐다).
   * onComposeViewControl(문항 축, 착지 뷰 "exam")의 동형 복제이며, 도시에
   * Sec「학습지」에서 [학습지 조판]을 눌러도 목록 행 발사와 **같은 화면**으로
   * 수렴하게 한다. 참조 안정 전제(memo 방어선).
   */
  onSheetComposeViewControl?: (control: (() => void) | null) => void;
  /**
   * 지문별 「생성 중」 활동 표식(§3.10.20, additive) — 지문관리 행 테두리에
   * 흐르는 링 + 메타줄 라벨. 오케스트레이터가 3원천(분석 큐·실전 워크북 잡·
   * 문항 세션 큐)을 **잡 기준 1패스**로 접어 내린다(도시에 스트립의
   * queueItemsByPassage 와 원천은 같지만 **커버리지가 다르다**: 저쪽은 발행
   * 지문만, 이쪽은 학원 전체 — 행은 선택되지 않은 지문도 그리기 때문).
   *
   * 미전달 = 링·라벨 미렌더(기존 픽셀 불변). 참조 안정 전제(memo 방어선) —
   * 조립부가 passageActivitySignature 시그니처 메모로 고정한다.
   */
  passageActivity?: PassageActivityMap;
  /**
   * §M(26-08-22) 조판 유도 넛지 — 오케스트레이터 composeNudge 를 SourceSwitcher
   * 뷰 필 펄스로 중계한다(이 판은 패스스루만). 원시 boolean — memo 무해.
   */
  nudgeSheet?: boolean;
  nudgeExam?: boolean;
  /**
   * 도시에 카드 「선택 해제」 컨트롤 업링크(26-08-22 사용자 지시) — 마운트 시
   * 지문함 선택(selectedIds)에서 id 하나를 빼는 안정 콜백을 올리고 언마운트 시
   * null. registerComposeViewControl(오케스트레이터 ref 등록)과 같은 관용구다 —
   * 선택 상태는 이 판(usePassageLibrary)이 단독 소유하므로 도시에 X 버튼의
   * 해제 요청이 이 채널로만 들어온다(공급원 밖 상태 복제 금지 §3.10.11-a).
   */
  onDossierDeselectControl?: (
    control: ((passageId: string) => void) | null,
  ) => void;
  /**
   * 시험 분석 채널 2종(26-09-01 §3.10.28, additive) — 카드 선택 업링크(우측
   * 콘솔 레일)·선택 하이라이트. 전부 참조 안정 전제. 구 모달 오픈 채널은
   * 콘솔 대개편으로 소멸(레일 인라인 처리 + 새 탭 위임).
   */
  onAnalysisSelect?: (row: ExamReportSummaryRow | null) => void;
  analysisActiveRowId?: string | null;
  /**
   * 시험 분석 v4 채널(26-09-02, docs/exam-analysis-v4-spec.md §2.5 U4 행) —
   * 후보(미분석 자체 시험지) 선택 업링크·하이라이트, 학생 관리에서 건너올 때의
   * 포커스 행 id(판이 boardRows 에서 행을 찾아 onSelect 후 소비 통지). 전부
   * 참조 안정·원시값 전제(memo 방어선). 판(analysis-pane, U4)이 같은 이름으로
   * 받는다 — 이 판은 패스스루만.
   */
  onAnalysisSelectCandidate?: (c: ExamCandidateRow | null) => void;
  analysisActiveCandidateId?: string | null;
  analysisFocusId?: string | null;
  onAnalysisFocusConsumed?: () => void;
  /**
   * 뷰 강제 명령 채널 **범용판**(v4 §2.5 U6 — `openStudentsView` /
   * `openAnalysisForStudent`): 마운트 시 `handleSelectView` 자체를 올리고
   * 언마운트 시 null. onComposeViewControl(착지 "exam")·onSheetComposeViewControl
   * (착지 "sheet")과 같은 관용구이되 **착지 뷰를 인자로 받는다** — 셸이
   * "students"/"analysis" 두 착지를 새로 필요로 해 채널을 둘 더 파는 대신 하나로
   * 접었다(두 조판 채널은 「채널 자체가 정보」라는 근거로 그대로 둔다 — :1723
   * 계열 주석). 수신부는 ref 보관 필수(useState 로 받으면 업데이터 오인).
   */
  onAssetViewControl?: (
    control: ((v: StudioAssetView) => void) | null,
  ) => void;
  /**
   * 「학생 관리」 5번째 뷰(v4 §3 U6, additive) — 필 건수 + 판 데이터·선택·추가.
   * 데이터는 셸 훅 useStudioStudents 1인스턴스 산출(aside·드로어 2중 마운트
   * 규칙 §5)이며 이 판은 패스스루만. 전부 상태 참조·원시값·useCallback 전제.
   */
  studentCount?: number | null;
  studentsRows?: StudioStudentExamRow[];
  studentsAcademyCode?: string | null;
  studentsLoading?: boolean;
  studentsError?: string | null;
  onStudentsReload?: () => void;
  studentsActiveId?: string | null;
  onStudentSelect?: (id: string | null) => void;
  onStudentsRequestAdd?: () => void;
}

// 학생 관리 판 rows 기본값 — 렌더마다 `[]` 리터럴을 만들면 memo(StudioStudentsPane)
// 계열 하류가 매번 깨진다(EMPTY_SHEET_PICKED 와 같은 계통의 모듈 상수).
const EMPTY_STUDENT_ROWS: StudioStudentExamRow[] = [];
const NOOP = () => {};

// ── 인라인 기출 브라우저 상수(docs/gichul-question-bank-spec.md §11.2·§11.4) ──
// 은행 총 문항 수·연도 범위는 facets 에서 **원시값**으로 뽑아 모듈 상수로 둔다 —
// 헤더 문구를 렌더마다 조립하면 memo(ComposerListPane) 에 매번 새 문자열이 내려간다
// (원시 문자열이라 값이 같으면 통과하지만, 계산 자체를 렌더 밖으로 빼 두는 편이
// 「왜 여기서 계산하나」를 다음 사람이 묻지 않게 한다). 연도 범위를 리터럴로 박지
// 않는 이유: 코퍼스가 한 해 늘 때마다 이 문구가 조용히 썩는다.
const EXAM_BANK_TOTAL: number = examBankFacets.total;
const EXAM_BANK_YEAR_MIN = Math.min(...examBankFacets.years);
const EXAM_BANK_YEAR_MAX = Math.max(...examBankFacets.years);
const EXAM_BANK_SUMMARY = `평가원·교육청 ${EXAM_BANK_TOTAL.toLocaleString("ko-KR")}문항 · ${EXAM_BANK_YEAR_MIN}~${EXAM_BANK_YEAR_MAX}`;
// 좁은 폭용 짧은 문구(§11.2 「34rem 미만이면 「3,076문항」만」) — 분기는 버튼이 @container 로 한다.
const EXAM_BANK_SUMMARY_SHORT = `${EXAM_BANK_TOTAL.toLocaleString("ko-KR")}문항`;
// 코얼레싱 디바운스(§11.4 A′-1 「400~600ms」의 하한) — 버스트 중 체크마다 연장된다.
const EXAM_BANK_COALESCE_MS = 400;
// 「체크 즉시 조판」 대기열 항목(§11.13.1). pickId 는 임시 id(`bank:<bankId>`, 단건 GET 으로
// 조립을 마치면 ready) 또는 실제 Question.id(이미 반입돼 목록 미러에 실재 — 즉시 ready).
// 대기열은 **머리부터 ready 인 것만** 순서대로 조판 픽에 넣는다 — 단건 GET 은 병렬이라
// 늦게 누른 항목이 먼저 돌아올 수 있는데, 「체크 순서 = 조판 순서 = 인쇄 순서」(§11.4-3 ·
// E27)는 이 판이 지켜야 할 불변식이다. meta 는 패널(P3)이 행 데이터로 준 것 또는 GET 결과.
type BankInsertEntry = {
  bankId: string;
  pickId: string;
  meta: PickedQuestionMeta | null;
  ready: boolean;
};
// 조판 픽 함수형 갱신(onFlatPickedUpdate 프롭). 규약: **순수** — prev 만 읽고 새 Map 을 돌려주며
// 변화가 없으면 prev 를 그대로 돌려준다(헛렌더·memo 관통 방지). React 가 updater 를 두 번
// 부를 수 있으므로(StrictMode) 부수효과는 updater 밖에서.
type FlatPickedUpdater = (
  prev: ReadonlyMap<string, PickedQuestionMeta>,
) => ReadonlyMap<string, PickedQuestionMeta>;
/** 픽 메타 5필드 동치 — 착지 메타 보정이 같은 값을 다시 set 해 새 Map 을 내리는 것을 막는다 */
function samePickMeta(a: PickedQuestionMeta, b: PickedQuestionMeta): boolean {
  return (
    a.passageId === b.passageId &&
    a.passageTitle === b.passageTitle &&
    a.typeLabel === b.typeLabel &&
    a.difficulty === b.difficulty &&
    a.premium === b.premium
  );
}
// 클라이언트 조립 BuilderQuestion 의 passage.id 접두(question-bank-client-builder.ts 와 동일
// 문자열) — 코퍼스 지문 id 를 되찾는 용도. 바뀌면 거기와 같이 바꾼다.
const BANK_PASSAGE_ID_PREFIX = "bankpassage:";
/** 목록 행 → 조판 픽 메타. handleFlatSelectionChange 의 미러 메타와 같은 5필드(착지 메타 보정·제출본 예측용) */
function rowPickMeta(
  row: StudioClassQuestionRow | undefined,
): PickedQuestionMeta | null {
  if (!row) return null;
  return {
    passageId: row.passageId,
    passageTitle: row.passageTitle,
    typeLabel: questionRowTypeLabel(row.type, row.subType),
    difficulty: row.difficulty,
    premium: row.premium,
  };
}
/** 패널이 행 데이터로 준 메타(§11.13.1 P3) → 조판 픽 메타. 난이도는 반입 매핑과 같은 규칙(3점 = KILLER) */
function bankPickMeta(m: ExamBankPickMeta): PickedQuestionMeta {
  return {
    passageId: m.passageId,
    passageTitle: m.passageTitle,
    typeLabel: m.typeGroup,
    difficulty: m.points === 3 ? "KILLER" : "MEDIUM",
    premium: false,
  };
}
/** 단건 GET 으로 조립한 BuilderQuestion → 조판 픽 메타(패널 메타가 없을 때의 폴백) */
function builderQuestionPickMeta(q: BuilderQuestion): PickedQuestionMeta {
  const pid = q.passage?.id ?? "";
  return {
    passageId: pid.startsWith(BANK_PASSAGE_ID_PREFIX)
      ? pid.slice(BANK_PASSAGE_ID_PREFIX.length)
      : pid,
    passageTitle: q.passage?.title ?? "",
    typeLabel: questionRowTypeLabel(q.type, q.subType),
    difficulty: q.difficulty || null,
    premium: false,
  };
}

// 구 NOOP_OPEN_QUESTION(문항 판의 **필수** onOpenQuestion 폴백)은 §3.10.23 E24 로
// 삭제했다 — 유일 소비처였던 ClassQuestionsPane 이 사라졌고, 후신 ComposerListPane
// 의 onOpenQuestion 은 **옵셔널**이라 미전달이면 상세 버튼 자체를 그리지 않는다.
// 여기서 no-op 을 되살리면 「눌러도 아무 일이 없는 죽은 버튼」이 생긴다.
// 툴바 일괄 생성은 §3.8.5 로 폐기됐지만 prop 은 필수라 no-op 을 넘긴다 —
// 인라인 화살표로 두면 memo(PassageCardGrid) 방어선이 매 렌더 깨진다.
const NOOP_BATCH_GENERATE: () => void = () => {};

// 학습지 조판 픽 폴백·청산용 빈 Map(§3.10.21 E21-5) — **모듈 상수**다.
// 렌더마다 new Map() 을 만들면 memo(ComposerListPane) 이 매번 깨져 병합 목록
// 전량이 호스트 리렌더마다 재렌더된다(구 memo(ClassWorksheetsPane) 계약을 그대로
// 승계 — 판이 3개에서 1개로 접혔을 뿐 참조 안정 요구는 한 글자도 안 바뀌었다).
// ReadonlyMap 타입이라 소비처가 이 인스턴스를 변형할 길은 없다.
const EMPTY_SHEET_PICKED: ReadonlyMap<string, SheetPickMeta> = new Map();

/**
 * 학습지 행 → 조판 픽 메타(§3.10.21 E21-5). 6필드 부분집합 복사 — 신규 질의 0.
 * 구 class-worksheets-pane 안에도 같은 변환(toPickMeta)이 모듈 로컬로 복제돼
 * 있었지만, 그 판이 §3.10.23 E24 로 삭제되면서 **이 함수가 유일 정본**이 됐다.
 * 새 사본을 만들지 마라 — 값이 갈리면 조판 헤더 칩과 문서 로더가 서로 다른
 * 물건을 가리킨다.
 * `pages`(수 MB)는 절대 싣지 않는다(sheet-pick-types.ts:27-29 슬림 계약).
 */
function rowToSheetPickMeta(r: StudioClassWorksheetRow): SheetPickMeta {
  return {
    reportId: r.reportId,
    passageId: r.passageId,
    title: r.title,
    passageTitle: r.passageTitle,
    planMarker: r.planMarker,
    status: r.status,
  };
}

function LibraryPaneInner({
  academyId,
  classCtx,
  onRegisterToClass,
  onUnregisterFromClass,
  onOpenModuleSheet,
  onCloseWorkbookModal,
  onLibraryChanged,
  setSessionQueue,
  onQuestionGenBridge,
  onQuestionLaunched,
  onDossierPassages,
  flatPicked,
  onFlatPickedChange,
  onFlatPickedUpdate,
  onAssetViewChange,
  initialAssetView = "passages",
  onOpenQuestionById,
  onComposeViewControl,
  sheetPicked,
  onSheetPickedChange,
  onSheetPickCanRemove,
  onSheetPickedCommit,
  onSheetDeploy,
  onSheetCompose,
  onSheetComposeViewControl,
  sheetActiveId = null,
  sheetRevealPassageId = null,
  sheetRevealSeq = 0,
  passageActivity,
  nudgeSheet = false,
  nudgeExam = false,
  onDossierDeselectControl,
  onAnalysisSelect,
  analysisActiveRowId = null,
  onAnalysisSelectCandidate,
  analysisActiveCandidateId = null,
  analysisFocusId = null,
  onAnalysisFocusConsumed,
  onAssetViewControl,
  studentCount = null,
  studentsRows = EMPTY_STUDENT_ROWS,
  studentsAcademyCode = null,
  studentsLoading = false,
  studentsError = null,
  onStudentsReload = NOOP,
  studentsActiveId = null,
  onStudentSelect = NOOP,
  onStudentsRequestAdd = NOOP,
}: LibraryPaneProps) {
  // ── 중앙 자산 3뷰(§3.10.16-a) — 지문관리·생성 문제·학습지 ──
  // [R1] 초기값 = 복원 시드(위 prop 주석). 평시엔 "passages" 그대로다.
  const [assetView, setAssetView] = useState<StudioAssetView>(initialAssetView);

  // ── 인테이크 표면 2축(intakeView/intakeTab — intake-surface 계약) ──
  // 기본 화면 = 지문관리(§3.10.14 E13 — 구 기출 지문 기본 진입 폐기: 클래스를
  // 고르면 그 클래스의 지문이 먼저 보인다). 들여오기는 「지문 추가」 경유.
  const [intakeView, setIntakeView] = useState<IntakeView>("library");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("exam");
  // 인테이크 성공 경로들의 복귀 훅. ⚠ setAssetView 금지(적대 감사 minor):
  // 비동기 추출 완료가 이 훅을 발화하므로, 자산 뷰까지 건드리면 사용자가
  // 보던 생성 문제/학습지 뷰를 백그라운드 이벤트가 탈취한다. 동기 인테이크
  // 경로는 전부 passages 뷰 안에서만 호출돼 intakeView 정렬만으로 충분하다.
  const showLibrary = useCallback(() => {
    setIntakeView("library");
  }, []);

  // ── 내 지문함 상태 — passage-registration 완전판 훅 ──
  const lib = usePassageLibrary({ academyId, onShowLibrary: showLibrary });
  const {
    loadPassages,
    setPassages,
    setSelectedIds,
    selectedIds,
    passages,
    filteredPassages,
  } = lib;
  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  // ── 상세/원문 모달 (questions 판 배선 미러 — §12: 미스코프 액션 미사용) ──
  const [contentModalPassage, setContentModalPassage] =
    useState<PassageItem | null>(null);
  const [detailPassage, setDetailPassage] = useState<PassageItem | null>(null);
  const [lastViewedPassageId, setLastViewedPassageId] = useState<string | null>(
    null,
  );
  const handleViewPassageContent = useCallback((passage: PassageItem) => {
    // 상세 열람은 도시에를 건드리지 않는다(§3.10.11-a — 워크스페이스 행·선택
    // 합집합만이 트리거, 열람만으로 도시에가 바뀌던 v1 발행 폐기).
    setDetailPassage(passage);
    setLastViewedPassageId(passage.id);
  }, []);

  // ── 문제 상세 모달(§3.9.5①) — 이력 팝오버·워크스페이스 행의 문제 클릭 ──
  // 기존 router.push 이탈(죽은 동선)을 모달로 수복한다. 세터 자체가 안정 참조.
  const [detailQuestion, setDetailQuestion] = useState<QuestionCardItem | null>(
    null,
  );

  // ── 학습자료 행 수복(§3.9.5②) — 분석 보유 시 분석 모달, 없으면 본문 폴백 ──
  // getStudioPassageAnalysis(U1, academyId 스코프) 경유. 이중 클릭은 ref 로
  // 가드하고, 조회 중에는 간소화 오버레이 1장만 띄운다(§3.9.5② 간소화 허용).
  const [analysisModal, setAnalysisModal] = useState<{
    passage: StudioPassageAnalysisData["passage"];
    initialAnalysis: PassageAnalysisData;
  } | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const analysisBusyRef = useRef(false);
  const handleOpenAnalysisModal = useCallback(
    (passageId: string) => {
      if (analysisBusyRef.current) return;
      const local = passages.find((pp) => pp.id === passageId) ?? null;
      // draft 의사 id 는 서버 지문이 아니다 — 기존 본문 모달로 즉시 폴백.
      if (isDraftPseudoId(passageId)) {
        if (local) setContentModalPassage(local);
        return;
      }
      analysisBusyRef.current = true;
      setAnalysisLoading(true);
      void (async () => {
        try {
          const res = await getStudioPassageAnalysis({ passageId });
          const data = res.data;
          if (data?.analysisData) {
            // generate-page-client.tsx:2044-2057 배선 정본 — analysisData 는
            // 문자열/객체 양쪽을 파스한다. 파스 실패는 본문 폴백으로 강등.
            let parsed: PassageAnalysisData | null = null;
            try {
              parsed =
                typeof data.analysisData === "string"
                  ? (JSON.parse(data.analysisData) as PassageAnalysisData)
                  : (data.analysisData as PassageAnalysisData);
            } catch {
              parsed = null;
            }
            if (parsed) {
              setAnalysisModal({ passage: data.passage, initialAnalysis: parsed });
              return;
            }
          }
          if (local) {
            setContentModalPassage(local);
          } else {
            toast.error(res.error ?? "지문 정보를 불러오지 못했습니다.");
          }
        } finally {
          analysisBusyRef.current = false;
          setAnalysisLoading(false);
        }
      })();
    },
    [passages],
  );

  // ── 문항 이력 배선(§3.8.4 수복 v2 — 26-08-20 지연 로드 전환) ──
  // 구 일괄 로드(getWorkbenchQuestionsGroupedByPassage page1×limit100·진입 1회·
  // aiGenerated:true)는 updatedAt 상위 100지문 밖·세션 중 생성분·플래그 미표기
  // 문항이 영영 안 보이는 구조였다 — 학습자료 토글(지문 행에 실려 오는 reports)
  // 만 뜨고 문제 토글은 침묵하던 비대칭의 원인. 이제 토글 노출·라벨은 지문 행의
  // 서버 집계(_count.questions — /api/passages/list, 살아있는 문항만)로 판정하고,
  // 목록은 팝오버 최초 오픈 시 지문 단위로 실조회한다(상한·신선도 동시 해소).
  // ⚠ 참조 안정([academyId] 고정) — memo(PassageListRow) 의 prop 으로 내려간다.
  const handleLazyLoadQuestions = useCallback(
    async (passageId: string): Promise<QuestionCardItem[]> => {
      // draft 의사 id 는 서버 지문이 아니다 — 조회 없이 빈 목록.
      if (isDraftPseudoId(passageId)) return [];
      const { getWorkbenchQuestionsGroupedByPassage } = await import(
        "@/actions/workbench"
      );
      const res = await getWorkbenchQuestionsGroupedByPassage(academyId, {
        passageId,
        limit: 1,
      });
      return (res.passages[0]?.questions ?? []) as unknown as QuestionCardItem[];
    },
    [academyId],
  );

  // ── 인테이크 클러스터(붙여넣기·AI 생성·기출·추출·폴더 보조·검수) ──
  const intake = useLibraryPaneIntake({
    classCtx,
    onRegisterToClass,
    onLibraryChanged,
    showLibrary,
    loadPassages,
    applyExtractionPromotion: lib.applyExtractionPromotion,
    setCollections: lib.setCollections,
    setSelectedIds,
    setPassageSearch: lib.setPassageSearch,
    setSelectedCollectionId: lib.setSelectedCollectionId,
    setAnalysisStatusFilter: lib.setAnalysisStatusFilter,
  });

  // ── 기출 담김 배지(2026-08-11 지시, 2026-08-15 클래스 스코프화) ──
  // 마운트 1회 + 기출 담기 성공 후에만 갱신(무폴링 — 참조는 갱신 시 교체).
  // entries = examId ↔ 지문함 지문 id. examId 집합만으로는 "학원에 있는가"만
  // 알 수 있어, 클래스를 고른 상태에서도 그 클래스에 없는 기출이 「담음」으로
  // 보였다(사용자 보고 결함). 클래스 등록 집합(registeredIds)과 교집합을 내려면
  // passageId 대응이 필요하다.
  const [importedExamEntries, setImportedExamEntries] = useState<
    { examId: string; passageId: string }[] | null
  >(null);
  const refreshImportedExamIds = useCallback(() => {
    void import("@/actions/workbench").then(({ listImportedExamIds }) =>
      listImportedExamIds().then((res) => {
        if (res.success) setImportedExamEntries(res.entries);
      }),
    );
  }, []);
  useEffect(() => {
    refreshImportedExamIds();
  }, [refreshImportedExamIds]);

  // 배지 3상태 파생 —
  //  · 클래스 선택 중: 담김 = 이 클래스에 등록된 지문의 기출 / 지문함만 = 나머지
  //  · 전체 자료(클래스 미선택): 기존대로 지문함 전역 1상태(「담음」)
  //  · 등록 목록 로딩 중: 오판(전건 「지문함」 → 「담김」 깜빡임) 방지로 무배지
  // ⚠ registeredIds 는 listStudioClassPassages 의 take 300 결과다 — 스코프
  //   세그먼트·「담김」 배지와 같은 재료라 화면 간 표기는 항상 일치한다.
  const examBadgeSets = useMemo(() => {
    if (!importedExamEntries) return { imported: undefined, libraryOnly: undefined };
    if (!classCtx) {
      return {
        imported: new Set(importedExamEntries.map((e) => e.examId)),
        libraryOnly: undefined,
      };
    }
    if (classCtx.registeredLoading) {
      return { imported: undefined, libraryOnly: undefined };
    }
    const imported = new Set<string>();
    const inBank = new Set<string>();
    for (const e of importedExamEntries) {
      inBank.add(e.examId);
      if (classCtx.registeredIds.has(e.passageId)) imported.add(e.examId);
    }
    const libraryOnly = new Set<string>();
    for (const examId of inBank) {
      if (!imported.has(examId)) libraryOnly.add(examId);
    }
    return { imported, libraryOnly };
  }, [importedExamEntries, classCtx]);
  const handleImportExamPicksWithBadge = useCallback(
    async (picks: Parameters<typeof intake.handleImportExamPassages>[0]) => {
      const ok = await intake.handleImportExamPassages(picks);
      // 재담기(전건 기존)도 날짜 최신화가 일어나므로 성공이면 항상 갱신.
      if (ok !== false) refreshImportedExamIds();
      return ok;
    },
    [intake.handleImportExamPassages, refreshImportedExamIds],
  );

  // ── 클래스 스코프(스펙 §3.10.4 — E7) — 세그먼트 [이 클래스|전체 자료] + 담기/빼기 ──
  // 기본 = 이 클래스(구 「이 클래스 지문만」 칩 기본 OFF 를 §3.10.4 가 반전).
  const [scopeOnly, setScopeOnly] = useState(true);
  const classId = classCtx?.classId ?? null;
  useEffect(() => {
    // 클래스 전환·해제 시 스코프는 기본(이 클래스)으로 리셋한다(§3.10.4 —
    // 다른 클래스에서 넓혀 둔 「전체 자료」 상태 잔존 방지).
    setScopeOnly(true);
  }, [classId]);

  // ── 생성 문제·학습지 전체보기 데이터(§3.10.16-b/d) — 이 판이 fetch 소유,
  // 판 2종은 controlled 렌더 전용. 트리거 = 뷰 최초 진입(클래스당 1회) +
  // 명시 새로고침(reload 카운터). ⚠ status 를 deps 로 두고 effect 안에서
  // loading 전이시키는 설계 금지 — 그 전이가 자기 cleanup 을 발화시켜
  // 진행 중 fetch 를 취소하는 자기유발 취소가 된다(초판 실측 결함: 응답이
  // 영원히 버려져 스켈레톤 고착). 중복·스테일은 키 ref(발사 1회) + 시퀀스
  // ref(최신 응답만 반영)로 가드한다. 재조회 중에는 기존 rows 유지. ──
  const [questionsState, setQuestionsState] = useState<ClassQuestionsState>({
    status: "idle",
    rows: [],
  });
  const [worksheetsState, setWorksheetsState] = useState<ClassWorksheetsState>({
    status: "idle",
    rows: [],
  });
  const [questionsReload, setQuestionsReload] = useState(0);
  const [worksheetsReload, setWorksheetsReload] = useState(0);
  const refreshQuestions = useCallback(() => {
    setQuestionsState((s) => ({ ...s, status: "idle" }));
    setQuestionsReload((n) => n + 1);
  }, []);
  const refreshWorksheets = useCallback(() => {
    setWorksheetsState((s) => ({ ...s, status: "idle" }));
    setWorksheetsReload((n) => n + 1);
  }, []);
  // ── 조회 활성 뷰(§3.10.23 E24 §1⑤ · 구 §3.10.22 U12-1) ──────────────────
  // 두 조판 뷰는 **둘 다** 문항 축·학습지 축을 함께 필요로 한다. 학습지 조판은
  // 「학습지 뒤에 문항을 이어 붙인다」는 합본의 재료 창구라 목록 자체가 두 축
  // 병합이고(composer-list-pane 의 ComposerRow 가 두 축의 합집합), 시험지 조판은
  // 목록은 문항 축만 그리지만 **선택 상태를 두 뷰가 공유**한다(E24 §1③).
  //
  // ⚠⚠ **두 축을 좁히지 마라**(E24 §1⑤ critical). 「이 뷰니까 이 축만 불러오면
  //   된다」는 치명적 최적화이고, 실패 3종이 전부 조용하다:
  //   ① 학습지 뷰에서 문항 fetch 를 끄면 → handleFlatSelectionChange 가 rows
  //      미러(questionRowByIdRef)에 없는 id 를 **말없이 건너뛴다**(`if (!row)
  //      continue`). 사용자가 체크한 문항이 flatPicked 에 한 건도 안 들어가는데
  //      토스트 0 · 콘솔 0 이다. 사용자가 극찬한 합본이 정확히 이 방식으로
  //      **무음 파괴**된다.
  //   ② 시험지 뷰에서 학습지 fetch 를 끄면 → worksheetsState.status 가 "idle" 로
  //      남아 판의 loading 분기가 걸린다. 문항이 128건 있어도 **전면 스켈레톤**
  //      이다(lockedKind="question" 이 wIncluded=false 로 막아 주긴 하지만,
  //      두 방어를 일부러 겹친다 — 한쪽이 무너져도 화면이 죽지 않게).
  //   ③ 재조회 트리거가 「뷰 최초 진입」뿐이라(아래 키 ref = 발사 1회 가드) 한
  //      번 고착되면 **새로고침으로도 안 풀린다**. E22 시절엔 사용자가 구
  //      「학습지 관리」 필을 따로 눌러 푸는 우회로가 있었지만 3필 체제에는 그
  //      필이 없다 — 탈출구가 사라졌으므로 고착은 곧 영구 고착이다.
  //
  // 왜 양성 OR 체인이 아니라 **음성 판정**(`!== "passages"`)인가:
  //   뷰가 늘어도 새 뷰가 자동으로 「목록 활성」에 포함된다. 양성 열거는 뷰를
  //   추가할 때마다 축을 하나 빠뜨릴 기회를 주는데, TS 는 OR 체인이 짧아진 것을
  //   **잡아 주지 않는다**(E24 §1① 「못 잡음」 목록: 음성 판정·boolean 소비 사슬).
  //   안전 기본값이 「목록 활성」 쪽이어야 위 ①②가 구조적으로 불가능해진다.
  //
  // deps 를 assetView 대신 이 boolean 으로 두는 이유: sheet↔exam 처럼 활성 여부가
  // 그대로인 전이에서 effect 를 헛돌리지 않는다(키 ref 가 어차피 막지만, 판정
  // 축을 하나로 모아 두 게이트가 갈라지는 것을 구조적으로 막는다).
  const listActive = assetView !== "passages";
  const questionsFetchKeyRef = useRef<string | null>(null);
  const questionsFetchSeqRef = useRef(0);
  useEffect(() => {
    if (!listActive || !classId) return;
    const key = `${classId}:${questionsReload}`;
    if (questionsFetchKeyRef.current === key) return;
    questionsFetchKeyRef.current = key;
    const seq = ++questionsFetchSeqRef.current;
    setQuestionsState((s) => ({ ...s, status: "loading" }));
    void (async () => {
      const res = await listStudioClassQuestions({ classId }).catch(() => null);
      if (seq !== questionsFetchSeqRef.current) return;
      if (res?.success && res.data) {
        setQuestionsState({
          status: "ready",
          rows: res.data.rows,
          truncated: res.data.truncated,
        });
      } else {
        setQuestionsState((s) => ({
          ...s,
          status: "error",
          error: res?.error ?? "문제 목록을 불러오지 못했습니다.",
        }));
      }
    })();
  }, [listActive, classId, questionsReload]);
  // 두 seq/key ref 는 **분리 유지**한다(U12-1 명시) — 병렬 독립 취소가 필요하고
  // (한 축 재조회가 다른 축 인플라이트를 기각하면 안 된다), 부분 실패 재시도도
  // 축별이다(composer-list-pane 의 amber 배너 = 그 축만 refresh).
  const worksheetsFetchKeyRef = useRef<string | null>(null);
  const worksheetsFetchSeqRef = useRef(0);
  useEffect(() => {
    if (!listActive || !classId) return;
    const key = `${classId}:${worksheetsReload}`;
    if (worksheetsFetchKeyRef.current === key) return;
    worksheetsFetchKeyRef.current = key;
    const seq = ++worksheetsFetchSeqRef.current;
    setWorksheetsState((s) => ({ ...s, status: "loading" }));
    void (async () => {
      const res = await listStudioClassWorksheets({ classId }).catch(
        () => null,
      );
      if (seq !== worksheetsFetchSeqRef.current) return;
      if (res?.success && res.data) {
        // `truncated` 는 §3.10.23 E24 §1⑩ 신설 **additive** 필드다
        // (actions/studio/worksheets.ts 의 CLASS_LINK_TAKE / REPORT_TAKE 절단).
        // `?? false` 로 방어적으로 흡수한다: 이 필드를 아직 안 싣던 시절의 응답
        // (구 배포·캐시)을 만나면 undefined 가 되고 판의 각주 분기가 조용히
        // 죽는다. 「학습지 조판」이라는 전용 방을 만들어 놓고 목록이 무고지로
        // 잘리면 사용자는 절단이 아니라 **유실/버그로 해석**한다(문항 축은 이미
        // 같은 계약을 갖고 있다 — 두 축의 모양을 갈라 두지 마라).
        setWorksheetsState({
          status: "ready",
          rows: res.data.rows,
          truncated: res.data.truncated ?? false,
        });
      } else {
        setWorksheetsState((s) => ({
          ...s,
          status: "error",
          error: res?.error ?? "학습지 목록을 불러오지 못했습니다.",
        }));
      }
    })();
  }, [listActive, classId, worksheetsReload]);

  // ── 평면 문항 선택(§3.10.17-b) — 상태는 오케스트레이터 소유(controlled).
  // 이 판은 rows 를 알고 있으므로 Set(DragSelect/토글)→Map(메타) 재조립만
  // 담당한다. Map 삽입 순서 = 체크 순서 = 조판 순서. rows 재조회 프룬은
  // 하지 않는다(1000 절단 창 — "부재 ≠ 삭제", 배포는 서버 검증 최종 방어).
  const flatPickedIds = useMemo(
    () => new Set(flatPicked.keys()),
    [flatPicked],
  );
  // 참조 안정용 ref 미러 2종 — 콜백이 rows·현재 선택을 읽어도 identity 유지.
  const questionRowByIdRef = useRef<Map<string, StudioClassQuestionRow>>(
    new Map(),
  );
  // ⚠ 이 미러를 채우는 effect 는 **handleFlatSelectionChange 선언 뒤**로 내려가 있다
  //   (아래 「미러 갱신 + 기출 반입 자동 체크」). 선언 순서 = effect 실행 순서이고,
  //   자동 체크가 그 콜백을 미러 대입 **직후** 같은 커밋에서 불러야 하기 때문이다.
  const flatPickedRef = useRef(flatPicked);
  useEffect(() => {
    flatPickedRef.current = flatPicked;
  }, [flatPicked]);
  // extraMeta(additive, §11.13.1): 미러에 없는 id 라도 여기 있으면 그 메타로 넣는다 — 「체크
  // 즉시 조판」의 임시 id(bank:<bankId>)는 목록 rows 가 아니라서 미러에서 되찾을 수 없다.
  // 미러 행이 있으면 행이 정본(먼저 본다). 기존 호출부는 인자를 안 주므로 동작 무변경.
  const handleFlatSelectionChange = useCallback(
    (next: Set<string>, extraMeta?: ReadonlyMap<string, PickedQuestionMeta>) => {
      const prev = flatPickedRef.current;
      const map = new Map<string, PickedQuestionMeta>();
      // 기존 순서 보존 → 신규는 next 순서(DragSelect enteredOrder)로 append.
      for (const [id, meta] of prev) if (next.has(id)) map.set(id, meta);
      for (const id of next) {
        if (map.has(id)) continue;
        const row = questionRowByIdRef.current.get(id);
        if (!row) {
          const extra = extraMeta?.get(id);
          if (extra) map.set(id, extra);
          continue;
        }
        map.set(id, {
          passageId: row.passageId,
          passageTitle: row.passageTitle,
          typeLabel: questionRowTypeLabel(row.type, row.subType),
          difficulty: row.difficulty,
          premium: row.premium,
        });
      }
      onFlatPickedChange(map);
    },
    [onFlatPickedChange],
  );

  // (구 「기출 문항 반입 자동 체크 대기열」 pendingAutoPickRef 는 §11.13.1 로 폐지됐다 —
  //  체크는 임시 id 로 즉시 조판에 들어가고, 착지는 flush 가 제자리 개명으로 끝낸다.
  //  「액션 직후의 미러는 옛 rows 라 handleFlatSelectionChange 가 새 id 를 버린다」는
  //  함정은 그대로 유효하다. 기출 블록은 이 Set 경로를 더 이상 타지 않고(26-09-08 채널 수리)
  //  메타를 스스로 확정해 함수형 갱신(onFlatPickedUpdate)으로 올린다 — extraMeta 인자는
  //  additive 로 남겨 둔다(기존 호출부 무변경).)

  // ── 인라인 기출 브라우저 호스트(docs/gichul-question-bank-spec.md §11.4·§11.8) ──
  // 모달(구 §8.3)은 **폐기**됐다(§11.0 F-1). 패널은 components/workbench/exam-question-
  // bank/inline 의 공유 컴포넌트이고 필터·페이지·fetch·미리보기는 패널 소유다. **이 판**이
  // 소유하는 것은 §11.8 그대로 — 기출 모드 on/off · bankMap(bankId↔Question.id) ·
  // 코얼레싱 버퍼(400ms, 상한 EXAM_BANK_IMPORT_MAX/콜) · pending/failed 집합 ·
  // flatPicked 파생 pickedBankIds. 서버 액션·토스트·목록 재조회·자동 체크도 여기다
  // (패널은 서버 액션을 직접 부르지 않는다 — inline/types.ts 원칙).
  //
  // 체크 상태의 유일한 정의 = 「지금 조판(flatPicked)에 들어 있음」(§11.4-3). 「담김」·
  // 「이미 담김」·중복 토스트·importedBankIds 차단·성공 토스트는 **전부 삭제**됐다 —
  // 되살리지 마라(§11.1 RCA: 배지는 클래스 스코프, 서버 멱등은 학원 스코프라 둘이
  // 어긋나 「내가 담은 적도 없는데 이미 담김」이 됐다. 체크가 곧 결과다).
  const [examBankMode, setExamBankMode] = useState(false);
  // 패널을 한 번이라도 열었으면 hidden 유지 마운트한다(§11.3 「필터 상태는 세션 내
  // 유지」 — 언마운트하면 「← 내 문항으로」 한 번에 필터·페이지가 날아간다). 열기 전에는
  // 마운트하지 않는다 — 패널은 마운트 즉시 목록을 fetch 하므로 시험지 조판 진입만으로
  // 은행 요청이 나가면 안 된다(§11.6 G-lag 「페이지 요청 수 = 조작 수」).
  const [examBankMounted, setExamBankMounted] = useState(false);
  // ⚠ useCallback([]) 안정 참조 · **0인자** — ComposerListPane 은 memo 라 새 함수가
  //   내려가면 지문 수백 장이 매 렌더 재조립된다(§8.1 memo 계약). onOpenExamBank 프롭
  //   모양은 §11.2 그대로다(진입 버튼만 전폭 1줄로 바뀌었다).
  const openExamBank = useCallback(() => {
    setExamBankMode(true);
    setExamBankMounted(true);
  }, []);
  const closeExamBank = useCallback(() => setExamBankMode(false), []);
  // 포커스 관리(26-09-08 적대 검수 major) — 진입 버튼을 누르면 그 버튼이 hidden 으로
  // 내려가 포커스가 body 로 떨어진다(키보드·스크린리더 사용자는 자기 위치를 잃는다).
  // 모드 **전이**에 맞춰 on 이면 패널의 「← 내 문항으로」, off 면 진입 버튼으로 옮긴다.
  // 두 래퍼 ref 로 좁혀 찾는다(document 전역 질의는 다른 판의 같은 셀렉터를 집을 수 있다).
  // ⚠ 첫 마운트 스킵은 boolean 래치가 아니라 **이전 값 대조**다 — StrictMode 가 effect 를
  //   두 번 돌려 래치를 소진한다(위 R1 주석 실측). 이전 값과 같으면 두 번 다 무동작.
  // getClientRects().length 0 = 아직 레이아웃에 없다(hidden·미마운트) → 포커스 스킵.
  const examBankPanelHostRef = useRef<HTMLDivElement | null>(null);
  const composerListHostRef = useRef<HTMLDivElement | null>(null);
  const examBankModePrevRef = useRef(examBankMode);
  useEffect(() => {
    if (examBankModePrevRef.current === examBankMode) return;
    examBankModePrevRef.current = examBankMode;
    const host = examBankMode
      ? examBankPanelHostRef.current
      : composerListHostRef.current;
    const target = host?.querySelector<HTMLElement>(
      examBankMode ? "[data-exam-bank-back]" : '[data-tour="composer-exam-bank"]',
    );
    if (!target || target.getClientRects().length === 0) return;
    target.focus();
  }, [examBankMode]);
  // 학습지 조판 뷰(카드 모드)에는 진입구가 없다(§11.2) — 기출 모드는 시험지 조판 뷰
  // 안에서만 산다. 뷰가 떠나면 **렌더 중 전이 판정**으로 끈다.
  // ⚠ boolean 래치(ref)가 아니라 state 대조여야 한다 — 아래 R1 주석의 함정 그대로
  //   (StrictMode 가 ref 래치를 소진한다). state 는 마운트 2회 모두 같은 값이라 구조적
  //   으로 안전하고, effect 가 아니라 렌더 중이라 「뷰는 바뀌었는데 기출 판이 한 프레임
  //   남는」 플래시도 없다(React 공식 「렌더 중 이전 props 로 state 조정」 관용구).
  const [examBankSeenView, setExamBankSeenView] = useState(assetView);
  if (examBankSeenView !== assetView) {
    setExamBankSeenView(assetView);
    if (assetView !== "exam" && examBankMode) setExamBankMode(false);
  }
  // 클래스 축에도 같은 렌더 중 전이 판정(검수 확정 결함 3 의 올바른 수리 — 단위 H2 반박 채택):
  // R1 리셋 effect 가 뷰를 passages 로 내리는 것은 **다음 렌더**라, 그 커밋의 매핑 조회 effect 는
  // [mode=true, 새 classId] 로 헛발사됐다(직렬 액션 큐 1칸 + 새 클래스 위에 기출 판 1프레임 플래시).
  // 클래스가 바뀐 렌더에서 즉시 끄면 같은 커밋의 effect 가 mode=false 를 보고 조회를 건너뛴다.
  const [examBankSeenClassId, setExamBankSeenClassId] = useState(classId);
  if (examBankSeenClassId !== classId) {
    setExamBankSeenClassId(classId);
    if (examBankMode) setExamBankMode(false);
  }

  // bankId → Question.id(이 학원에 반입된 행). 진입 시 listStudioClassExamBankIds 1회 +
  // 반입 응답 mapping 으로 증분(§11.8). state 로 들어 갱신 시점에만 새 Map 이 내려가고,
  // 콜백은 아래 ref 미러로 읽어 identity 를 지킨다(flatPickedRef 와 같은 관용구).
  const [bankMap, setBankMap] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const bankMapRef = useRef(bankMap);
  useEffect(() => {
    bankMapRef.current = bankMap;
  }, [bankMap]);
  // 역맵(Question.id → bankId) — pickedBankIds 파생 재료. bankMap 갱신 시에만 재계산.
  const bankIdByQuestionId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [bankId, qid] of bankMap) m.set(qid, bankId);
    return m;
  }, [bankMap]);
  // 조판에 들어 있는 은행 항목 — flatPicked **state** 파생(ref 아님: ref 는 렌더를 안
  // 깨우므로 체크 해제가 패널에 안 비친다). flatPickedIds 와 같은 소스라 좌측 목록판과
  // 기출 판의 「체크」가 서로 어긋날 수 없다.
  // 「체크 즉시 조판」(§11.13.1) 뒤로 조판 픽의 키는 두 종류다 — 임시 id(`bank:<bankId>`,
  // 반입 착지 전)는 접두를 벗기면 곧 bankId 이고, 실제 Question.id 는 역맵으로 푼다. 그래서
  // 체크 직후부터 picked(+pending 스피너)이고 「응답~재조회 사이 idle 창」이 없다 — 구
  // §11.12-1 의 착지 대기(bankAwaitingPickRef)·미러 소진은 이 파생이 대체했다.
  const pickedBankIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of flatPickedIds) {
      if (isClientQuestionId(id)) {
        s.add(id.slice(CLIENT_QUESTION_ID_PREFIX.length));
        continue;
      }
      const bankId = bankIdByQuestionId.get(id);
      if (bankId) s.add(bankId);
    }
    return s;
  }, [flatPickedIds, bankIdByQuestionId]);
  // 갱신은 항상 **새 Set** — ReadonlySet 을 그대로 내리므로 in-place 변경은 패널 memo 를
  // 통과하지 못한다(체크가 안 그려진다).
  // pending 의 뜻(§11.13.0 G-4): 「DB 동기화 중」 표시다 — 체크 자체는 임시 id 로 이미
  // 조판에 들어 있다(picked). 단건 GET 대기·반입 버퍼·반입 인플라이트 동안 켜지고
  // 착지(개명)·실패·해제에서 꺼진다.
  const [pendingBankIds, setPendingBankIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [failedBankIds, setFailedBankIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // 코얼레싱 버퍼(§11.4 A′-1) — 체크 1개당 1콜을 쏘면 서버 액션 **직렬 큐**를 체크 20개
  // = 60~100초 점유한다(앱 전체 액션이 뒤에 줄 선다). 버스트 동안 추가 체크는 같은
  // 버퍼에 합류(타이머 연장). 버퍼에 있는 동안의 해제는 버퍼에서 빼는 것으로 끝(콜 전
  // 취소, A′-2). §11.13.1: 버퍼 합류는 단건 GET 이 끝나 임시 항목이 **조판에 든 뒤**다 —
  // 조판에 안 보이는데 DB 에만 행이 생기는 것을 막는다(GET 실패분은 버퍼에 넣지 않는다).
  const bankBufferRef = useRef<Set<string>>(new Set());
  const bankBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 전송 뒤(버퍼에서 빠진 뒤) 사용자가 해제한 id — 착지 시 실패 표시에서 뺀다(해제한 행에
  // 「넣지 못했습니다」를 띄우지 않는다). 개명 자체는 「임시 id 가 아직 조판 픽에 있는가」로
  // 판정하므로 표식이 개명을 막을 일은 없다. Question 행은 남는다(삭제 경로 없음 · 다른
  // 시험지가 참조 가능, A′-2).
  const bankCancelledRef = useRef<Set<string>>(new Set());
  // 인플라이트 코얼레싱(26-09-08 프로브 실측: 클릭 간격이 400ms 를 넘으면 버스트가 2콜로 갈라졌다) —
  // 반입이 진행 중이면 새 체크는 버퍼에만 쌓고, 착지한 뒤 한 번 더 비운다. 느린 클릭 N개 = 최대 2콜.
  const bankFlushInFlightRef = useRef(false);
  // 클래스 전환 seq — 늦게 오는 이전 클래스의 반입 응답·단건 GET 결과를 기각한다
  // (questionsFetchSeqRef 관용구). 매핑 조회는 모드 진입마다 1회라 **별도 seq** — 진입 seq 로
  // 반입까지 가드하면 「← 내 문항으로」 후 재진입이 인플라이트 반입 결과를 죽인다.
  const bankClassSeqRef = useRef(0);
  const bankMapFetchSeqRef = useRef(0);
  const examBankClassIdRef = useRef(classId);
  useEffect(() => {
    examBankClassIdRef.current = classId;
  }, [classId]);
  // 서버 액션 직렬 큐 회피(26-09-08 취소 레이스 규명, 프로브 I12): 이 호스트의 목록 재조회
  // (listStudioClassQuestions — 착지마다 1회·뷰 진입 1회)가 큐에 있으면 반입 액션은 어차피 그 뒤에
  // 줄 선다(실측 flush 호출 → 실제 POST 2.3~3.7초). 그런데 액션은 **호출 순간 인자가 굳는다** —
  // 큐에서 기다리는 사이 사용자가 해제해도 이미 호출된 요청은 못 거둔다(「최종 해제 뒤 POST 1회」).
  // 그래서 재조회가 큐에 있는 동안은 flush 를 **미루고**(버퍼 유지 = 해제가 버퍼에서 빼면 끝) 재조회가
  // 끝나는 커밋에서 한 번 흘린다. 체감 지연 0 — 큐에서 기다리던 시간을 버퍼에서 기다리는 것뿐이다.
  // idle 도 busy 로 본다: refreshQuestions 는 idle 을 거쳐 다음 커밋에야 loading 이 되는데 그 사이
  // 커밋이 「끝났다」로 오판돼 흘리면 안 된다. 목록이 비활성(passages 뷰)·클래스 없음이면 재조회가
  // 없으므로 busy 아님. ref 는 착지에서 refreshQuestions 직후 **동기**로도 세운다(effect 미러는 한
  // 커밋 늦어 꼬리 flush 가 그 창으로 빠져나간다).
  const questionsBusy =
    listActive &&
    !!classId &&
    (questionsState.status === "idle" || questionsState.status === "loading");
  const questionsBusyRef = useRef(questionsBusy);

  // ── 「체크 즉시 조판」 상태(§11.13.1) ──
  // 은행 항목은 체크 순간 DB 행이 없다. 반입(서버 액션, 직렬 큐 1.5~3초)을 기다리지 않고
  // 시험지에 바로 그리려고, 단건 GET(API 라우트 — 직렬 큐를 타지 않는다, 실측 수십 ms)으로
  // BuilderQuestion 을 조립해 클라이언트 레지스트리에 임시 id 로 등록한 **뒤** 그 임시 id 를
  // 조판 픽에 넣는다(조판기 resolveQuestionsForPaperInsertion 이 서버보다 레지스트리를 먼저
  // 본다). 반입이 착지하면 alias 를 등록하고 픽의 키만 같은 자리에서 실제 id 로 바꾼다 —
  // 조판기의 동기화 effect 는 alias 를 보고 제거+추가가 아니라 **제자리 개명**한다.
  // bankId → 인플라이트 단건 GET 의 AbortController. 해제·클래스 전환·언마운트가 abort 한다.
  const bankFetchCtrlRef = useRef<Map<string, AbortController>>(new Map());
  // 체크 순서 대기열(BankInsertEntry 주석) — 머리부터 ready 인 것만 순서대로 착지한다.
  const bankInsertQueueRef = useRef<BankInsertEntry[]>([]);
  // 이 호스트가 레지스트리에 올린 임시 id — 클래스 전환·언마운트 청산용. 레지스트리는 모듈
  // 스코프라 호스트는 **자기 몫만** 지운다. 착지 뒤에도 남겨 둔다: 조판기가 alias 를 소비하며
  // 함께 지우지만, 조판기가 떠 있지 않던 경우의 잔여까지 청산 때 같이 지우기 위해서다
  // (이미 지워졌으면 무동작). 같은 bankId 의 재체크는 같은 tempId 라 Set 이 중복을 막는다.
  const bankClientIdsRef = useRef<Set<string>>(new Set());
  // 착지(개명)한 실제 id — 임시 항목의 메타는 행 정본이 아니다(passageId 가 코퍼스 지문 id).
  // 배포(dossier-pick-bar 의 passageIds)·지문 묶음이 meta.passageId 를 먹으므로 목록 rows 가
  // 도착하면 아래 미러 effect 가 행 메타로 **같은 자리에서** 교체한다.
  const bankMetaStaleRef = useRef<Set<string>>(new Set());
  // 이 블록의 조판 픽 갱신은 전부 **함수형**(onFlatPickedUpdate, 26-09-08 채널 수리). 미러
  // (flatPickedRef)는 effect 로 따라오므로 렌더가 끼기 전에 두 번째 제출이 오면(단건 GET 2개
  // 연달아 착지 · 해제 직후 다른 GET 착지 · 착지 직후 GET 착지 · 반입 응답과 클릭의 교차) Map
  // 통째 제출은 stale base 를 덮어써 해제한 임시 항목이 되살아나거나 픽이 유실됐다(프로브 I12
  // 「행은 idle 인데 조판에 +1」). 「제출 shadow」(마지막 제출을 base 와 함께 기억)로 메우던
  // 기구는 폐기 — 네트워크 태스크와 React 커밋 순서에 따라 창이 남았다. updater 는 React 가
  // 최신 prev 를 넘기므로 순서와 무관하게 정합이다.
  // 규약(FlatPickedUpdater 주석): updater 는 순수 · 부수효과(레지스트리·ref)는 밖에서. 「지금
  // 픽에 있는가」 류 판정은 미러로 읽되 한 발 늦어도 되게 짜고, 정합은 updater 안의 prev.has()
  // 재확인이 보장한다. 채널 미전달(구 호스트)이면 미러를 base 로 계산해 통째 제출(종전 경로).
  const applyFlatPickedUpdate = useCallback(
    (fn: FlatPickedUpdater) => {
      if (onFlatPickedUpdate) {
        onFlatPickedUpdate(fn);
        return;
      }
      const prev = flatPickedRef.current;
      const next = fn(prev);
      if (next !== prev) onFlatPickedChange(next);
    },
    [onFlatPickedUpdate, onFlatPickedChange],
  );
  // 「같은 bankId 의 새 시도가 살아 있는가」 — 대기열(단건 GET 진행·착지 순서 대기) 또는
  // 버퍼(다음 flush 대기). 이전 시도의 실패·착지가 새 시도의 표시(pending·failed)를 덮지 않게.
  const isBankRetrying = useCallback(
    (bankId: string) =>
      bankBufferRef.current.has(bankId) ||
      bankInsertQueueRef.current.some((e) => e.bankId === bankId),
    [],
  );
  // 클래스 전환 = 매핑·pending·failed·버퍼·인플라이트 GET·대기열·레지스트리 청산(이전 클래스의
  // 매핑이 새 클래스에서 「체크됨」으로 남지 않게 · 이전 클래스의 임시 항목이 레지스트리에
  // 남지 않게 — 조판 픽 자체는 오케스트레이터가 자기 리셋에서 비운다). 필터는 패널 소유라
  // 무관(§11.3 — 클래스와 무관). 마운트 첫 발화는 전부 이미 빈 값이라 무동작(size 가드 =
  // 참조 유지). 기출 모드 자체는 위 R1 리셋이 뷰를 passages 로 내리면 렌더 중 전이 판정이 끈다.
  // ⚠ 아래 매핑 조회 effect 보다 **먼저** 선언 — 같은 커밋에서 이 청산이 seq 를 올린 뒤
  //   조회가 새 seq 로 나가야 한다(순서가 뒤집히면 조회 자신의 응답이 기각된다).
  useEffect(() => {
    bankClassSeqRef.current += 1;
    bankMapFetchSeqRef.current += 1;
    if (bankBufferTimerRef.current) {
      clearTimeout(bankBufferTimerRef.current);
      bankBufferTimerRef.current = null;
    }
    bankBufferRef.current = new Set();
    bankCancelledRef.current = new Set();
    for (const ctrl of bankFetchCtrlRef.current.values()) ctrl.abort();
    bankFetchCtrlRef.current = new Map();
    bankInsertQueueRef.current = [];
    for (const id of bankClientIdsRef.current) unregisterClientQuestion(id);
    bankClientIdsRef.current = new Set();
    bankMetaStaleRef.current = new Set();
    setBankMap((prev) => (prev.size === 0 ? prev : new Map()));
    setPendingBankIds((prev) => (prev.size === 0 ? prev : new Set()));
    setFailedBankIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [classId]);
  // 언마운트 시 타이머·인플라이트 GET·레지스트리 정리 — 버퍼는 버려진다(전송 전 취소와 같은
  // 의미). 레지스트리는 모듈 스코프라 호스트가 죽어도 남는다 — 자기 몫은 지우고 나간다.
  // (StrictMode 의 마운트 직후 모의 언마운트에서는 전부 빈 값이라 무동작.)
  useEffect(
    () => () => {
      if (bankBufferTimerRef.current) clearTimeout(bankBufferTimerRef.current);
      for (const ctrl of bankFetchCtrlRef.current.values()) ctrl.abort();
      bankFetchCtrlRef.current = new Map();
      bankInsertQueueRef.current = [];
      for (const id of bankClientIdsRef.current) unregisterClientQuestion(id);
      bankClientIdsRef.current = new Set();
    },
    [],
  );

  // ── 미러 갱신 + 착지 메타 보정(§11.13.1) ──
  // 구 「자동 체크 대기열(pendingAutoPickRef) 소진」은 폐지됐다 — 체크는 임시 id 로 이미
  // 조판에 들어 있고 착지는 flush 가 제자리 개명으로 끝낸다(rows 도착을 기다리는 착지가
  // 없다 = 「목록에 도착하지 않았습니다」 실패도 없다). 여기 남은 일은 둘: ① rows 미러 대입
  // ② 개명된 실제 id 의 메타를 행 정본으로 교체(bankMetaStaleRef 주석). 행이 아직 안 왔으면
  // (재조회 실패·절단 창 밖) 다음 재조회를 기다리고, 조판에서 빠졌으면 표식만 지운다.
  // 교체는 Map.set 의 기존 키 = 자리 유지라 순서가 움직이지 않는다.
  useEffect(() => {
    questionRowByIdRef.current = new Map(
      questionsState.rows.map((r) => [r.id, r]),
    );
    const stale = bankMetaStaleRef.current;
    if (stale.size === 0) return;
    // 「조판에서 빠졌는가」는 미러로 판정한다(같은 커밋의 미러 effect 가 먼저 돌아 최신). 표식
    // 정리(ref 변경)는 updater 밖 — updater 는 행 정본 메타를 prev 의 같은 키에 set 만 한다.
    const mirror = flatPickedRef.current;
    const fixes = new Map<string, PickedQuestionMeta>();
    for (const qid of stale) {
      if (!mirror.has(qid)) {
        stale.delete(qid);
        continue;
      }
      const meta = rowPickMeta(questionRowByIdRef.current.get(qid));
      if (!meta) continue;
      stale.delete(qid);
      fixes.set(qid, meta);
    }
    if (fixes.size === 0) return;
    applyFlatPickedUpdate((prev) => {
      let next: Map<string, PickedQuestionMeta> | null = null;
      for (const [qid, meta] of fixes) {
        const cur = prev.get(qid);
        if (!cur || samePickMeta(cur, meta)) continue;
        if (!next) next = new Map(prev);
        next.set(qid, meta);
      }
      return next ?? prev;
    });
  }, [questionsState.rows, applyFlatPickedUpdate]);

  useEffect(() => {
    if (!examBankMode || !classId) return;
    const seq = ++bankMapFetchSeqRef.current;
    void listStudioClassExamBankIds({ classId })
      .then((res) => {
        if (seq !== bankMapFetchSeqRef.current) return;
        if (!res.success) return;
        // 합집합(서버 값 우선) — 조회가 나간 사이 착지한 반입 매핑을 덮어 지우지 않는다.
        setBankMap((prev) => {
          const next = new Map(prev);
          for (const e of res.entries) next.set(e.bankId, e.questionId);
          return next;
        });
      })
      .catch(() => {
        /* 매핑은 보조 정보 — 실패해도 체크는 반입 경로(매핑 부재 → 버퍼)로 착지한다. */
      });
  }, [examBankMode, classId]);

  // 버퍼 → 1콜 반입(§11.4 A′-1). 상한 EXAM_BANK_IMPORT_MAX 씩 **순차**(서버 액션은
  // 어차피 직렬 큐 — 병렬로 쏴도 줄만 선다).
  // ⚠ 지문 축의 intake.handleImportExamPassages 를 재사용하지 마라 — 그 경로는 지문
  //   전용 후처리(컬렉션 이동·검색 리셋·지문 목록 재조회, library-pane-intake.ts)를 끌고
  //   온다. 문항 반입은 Passage 등록을 액션 안에서 스스로 끝내므로(exam-questions.ts ①)
  //   클라이언트 후처리는 문항 목록 재조회 + 트리 카운트 갱신 둘뿐이다.
  const flushExamBankBuffer = useCallback(async () => {
    bankBufferTimerRef.current = null;
    if (bankFlushInFlightRef.current) return; // 착지 뒤 꼬리 flush 가 버퍼를 비운다
    if (questionsBusyRef.current) {
      // 목록 재조회가 직렬 큐에 있다(questionsBusy 주석) — 버퍼를 그대로 두고 재조회 완료 effect 가 흘린다.
      return;
    }
    const requested = Array.from(bankBufferRef.current);
    bankBufferRef.current = new Set();
    if (requested.length === 0) return;
    bankFlushInFlightRef.current = true;
    const flushClassId = examBankClassIdRef.current;
    const seq = bankClassSeqRef.current;
    const failed = new Set<string>();
    const mapping: ExamBankImportMappingEntry[] = [];
    let lastError: string | null = null;
    if (!flushClassId) {
      for (const id of requested) failed.add(id);
      lastError = "클래스를 먼저 선택하세요";
    } else {
      for (let i = 0; i < requested.length; i += EXAM_BANK_IMPORT_MAX) {
        const chunk = requested.slice(i, i + EXAM_BANK_IMPORT_MAX);
        try {
          // mode:"pick" = 픽 경로(§11.4-6c) — revalidatePath 생략(스튜디오 전체 RSC
          // 리프레시가 체크마다 도는 것이 §11.1 「랙」의 한 축이었다) + createdAt 무터치.
          const result = await importExamQuestionsToStudioClass({
            bankIds: chunk,
            classId: flushClassId,
            mode: "pick",
          });
          // 클래스가 바뀌었다 — 이전 클래스 응답은 전부 폐기(매핑·개명 둘 다. 임시 항목은
          // 클래스 리셋이 레지스트리에서 지웠고 조판 픽은 오케스트레이터가 비웠다).
          if (seq !== bankClassSeqRef.current) {
            bankFlushInFlightRef.current = false; // 클래스 전환 폐기 경로에서도 플래그를 풀어야 다음 반입이 산다
            return;
          }
          if (!result.success) {
            for (const id of chunk) failed.add(id);
            lastError = result.error ?? null;
            continue;
          }
          const skipped = new Set(result.skippedBankIds);
          for (const id of skipped) failed.add(id);
          // 매핑 재료는 응답 `mapping`(§11.8). 구 응답(필드 부재)엔 questionIdsInOrder
          // 폴백 — 그 배열은 「요청 순서에서 skipped 만 빠진 것」이라(액션 계약) skipped
          // 를 뺀 요청 배열과 인덱스가 맞는다. ⚠ 빈 배열은 「없음」이 아니다(전건 skipped).
          const served: ExamBankImportMappingEntry[] | undefined = result.mapping;
          if (served) {
            mapping.push(...served);
          } else {
            const kept = chunk.filter((id) => !skipped.has(id));
            result.questionIdsInOrder.forEach((questionId, idx) => {
              const bankId = kept[idx];
              if (bankId) mapping.push({ bankId, questionId });
            });
          }
        } catch (err) {
          // 서버 액션 **전송** 실패(네트워크·타임아웃·5xx) — 서버 쪽 try/catch 는 핸들러
          // 안 예외만 잡고 전송 reject 는 이 await 에서 던져진다(150문항 반입은 $transaction
          // 60s + 지문 반입 직렬이라 타임아웃이 실재한다).
          if (seq !== bankClassSeqRef.current) {
            bankFlushInFlightRef.current = false; // 클래스 전환 폐기 경로에서도 플래그를 풀어야 다음 반입이 산다
            return;
          }
          console.error("[flushExamBankBuffer] request failed", err);
          for (const id of chunk) failed.add(id);
        }
      }
    }
    const cancelled = bankCancelledRef.current;
    // 취소 표식은 **요청분만** 소거 — 해제 분기가 표식을 항상 남기므로(applyExamBankToggle
    // 주석) 다른 배치의 표식을 여기서 지우면 그 배치가 착지할 때 취소가 풀린다. 해제한 행과
    // 새 시도가 살아 있는 행(해제→재체크)은 이 배치의 실패로 표시하지 않는다 — 새 시도가 스스로
    // 결과를 낸다.
    for (const id of requested) {
      if (cancelled.delete(id) || isBankRetrying(id)) failed.delete(id);
    }
    // 착지 = 제자리 개명(§11.13.1). 조판 픽의 임시 id(bank:<bankId>)에 alias(실제 id)를 등록
    // 하고 **같은 자리**의 키만 실제 id 로 바꿔 한 번의 갱신으로 올린다 — 조판기의 동기화
    // effect 가 alias 를 보고 개명한다(제거+추가 아님 · 순서·편집 보존 · 서버 재조회 0).
    // 임시 id 가 픽에 없으면(해제됐다 · 재체크의 단건 GET 이 아직 조판 전) 개명할 것이 없고
    // bankMap 만 갱신한다 — 재체크분은 다음 착지에서 개명되거나 미러 도착 뒤 실제 id 체크가 된다.
    // 실제 id 가 이미 픽에 있으면(내 문항 목록에서 같은 행을 따로 체크) 임시 항목은 alias 없이
    // 빠진다(조판기가 제거) — 두 벌을 남기면 같은 문항이 두 번 인쇄된다.
    // 실패·skipped 의 임시 항목은 조판에서 빼고 레지스트리를 정리한다(체크 되돌림, A′-4).
    //
    // 픽 집합의 정답은 아래 **순수 updater(prev)** 가 낸다(applyFlatPickedUpdate 주석). 부수효과
    // (alias 등록·레지스트리 정리·ref)는 updater 밖에서 **미러**로 판정하는데, 미러가 한 발 늦어도
    // 갈리는 것은 조판기의 전이 방식(제자리 개명 vs 제거+서버 추가)뿐이고 픽 내용은 아니다.
    // alias 는 교체 직전에 등록 — 임시 id 가 미러에 없어도(해제됐다 · 재체크 착지가 아직 렌더 전)
    // 등록한다: 렌더 전 착지분이 있으면 updater 가 개명하고 조판기가 그 alias 로 제자리 개명한다.
    // 남는 alias 는 무해(조판기는 실제 id 가 들어오는 전이에서만 쓴다)하고 청산 목록에 올려 둔다.
    const realIdByTemp = new Map<string, string>();
    for (const m of mapping) realIdByTemp.set(clientQuestionIdFor(m.bankId), m.questionId);
    const failedTemps = new Set<string>();
    for (const id of failed) failedTemps.add(clientQuestionIdFor(id));
    const mirror = flatPickedRef.current;
    for (const [temp, real] of realIdByTemp) {
      if (mirror.has(real)) {
        unregisterClientQuestion(temp);
        bankClientIdsRef.current.delete(temp);
        continue;
      }
      registerQuestionIdAlias(temp, real);
      bankClientIdsRef.current.add(temp);
      bankMetaStaleRef.current.add(real);
    }
    for (const temp of failedTemps) {
      unregisterClientQuestion(temp);
      bankClientIdsRef.current.delete(temp);
    }
    if (realIdByTemp.size > 0 || failedTemps.size > 0) {
      applyFlatPickedUpdate((prev) => {
        const out = new Map<string, PickedQuestionMeta>();
        let changed = false;
        for (const [id, meta] of prev) {
          if (!isClientQuestionId(id)) {
            out.set(id, meta);
            continue;
          }
          const real = realIdByTemp.get(id);
          if (real !== undefined) {
            changed = true;
            // 같은 자리에서 temp → real. real 이 이미 있으면(앞이든 뒤든) temp 만 뺀다.
            if (!prev.has(real) && !out.has(real)) out.set(real, meta);
            continue;
          }
          if (failedTemps.has(id)) {
            changed = true;
            continue;
          }
          out.set(id, meta);
        }
        return changed ? out : prev;
      });
    }
    if (mapping.length > 0) {
      setBankMap((prev) => {
        const next = new Map(prev);
        for (const m of mapping) next.set(m.bankId, m.questionId);
        return next;
      });
      // 행은 목록에 생겼으므로 재조회·트리 카운트 갱신 — 착지를 막지 않는다(개명은 위에서
      // 이미 끝났다). rows 도착은 미러 effect 의 메타 보정 재료다.
      refreshQuestions();
      onLibraryChanged();
      // 아래 꼬리 flush 가 방금 넣은 재조회 뒤에 줄 서지 않게 동기로 busy 를 세운다(questionsBusy 주석).
      questionsBusyRef.current = true;
    }
    // pending 은 착지(개명)·실패·취소 전부 지금 내린다 — 재체크로 새 시도가 살아 있는 행만
    // 남긴다(그 시도가 자기 착지에서 내린다). 임시 id 가 픽에 남아 있어 idle 창은 없다.
    setPendingBankIds((prev) => {
      let next: Set<string> | null = null;
      for (const id of requested) {
        if (!prev.has(id) || isBankRetrying(id)) continue;
        if (!next) next = new Set(prev);
        next.delete(id);
      }
      return next ?? prev;
    });
    setFailedBankIds((prev) => {
      let next: Set<string> | null = null;
      for (const id of requested) {
        const should = failed.has(id);
        if (should === prev.has(id)) continue;
        if (!next) next = new Set(prev);
        if (should) next.add(id);
        else next.delete(id);
      }
      return next ?? prev;
    });
    // 토스트는 실패에만 **1개**(§11.4 A′-4). 성공 토스트 없음 — 체크가 곧 결과다.
    if (failed.size > 0) {
      toast.error(`기출 문항 ${failed.size}개를 시험지에 넣지 못했습니다`, {
        description:
          lastError ?? "네트워크를 확인하고 다시 체크해 주세요.",
      });
    }
    bankFlushInFlightRef.current = false;
    // 진행 중에 쌓인 체크가 있으면 즉시 한 번 더(타이머 없이) — 클래스 전환으로 버퍼가 비워졌으면 무동작.
    if (bankBufferRef.current.size > 0 && seq === bankClassSeqRef.current) void flushExamBankBuffer();
  }, [refreshQuestions, onLibraryChanged, applyFlatPickedUpdate, isBankRetrying]);
  const scheduleExamBankFlush = useCallback(() => {
    if (bankBufferTimerRef.current) clearTimeout(bankBufferTimerRef.current);
    bankBufferTimerRef.current = setTimeout(() => {
      void flushExamBankBuffer();
    }, EXAM_BANK_COALESCE_MS);
  }, [flushExamBankBuffer]);
  // 재조회가 끝난 커밋에서 미뤄 둔 버퍼를 흘린다(questionsBusy 주석). 타이머가 이미 걸려 있으면 그
  // 타이머가 곧 흘리고, 인플라이트면 착지 꼬리가 흘린다 — 여기서는 어느 쪽도 아닐 때만.
  useEffect(() => {
    questionsBusyRef.current = questionsBusy;
    if (questionsBusy) return;
    if (
      bankBufferRef.current.size > 0 &&
      !bankFlushInFlightRef.current &&
      !bankBufferTimerRef.current
    ) {
      void flushExamBankBuffer();
    }
  }, [questionsBusy, flushExamBankBuffer]);

  // 대기열 착지 — 머리부터 ready 인 항목을 **한 번의** 픽 제출로 조판에 넣고, 임시 항목은
  // 코얼레싱 버퍼에 합류시킨다(flush 1회 예약). 실제 id 항목(이미 반입·미러 실재)은 버퍼에
  // 안 넣고 pending 만 내린다(콜 0). 머리가 아직 조립 중이면 뒤는 기다린다(순서 불변식).
  const drainBankInsertQueue = useCallback(() => {
    const queue = bankInsertQueueRef.current;
    let n = 0;
    while (n < queue.length && queue[n]?.ready) n += 1;
    if (n === 0) return;
    const landed = queue.splice(0, n);
    // 메타는 여기서 확정한다(미러 행이 정본, 없으면 항목이 들고 온 것 — updater 는 prev 만 읽는다).
    // 픽 전이는 순수 updater: prev 순서 보존 + 신규만 뒤에 append(체크 순서 = 조판 순서), 이미
    // 있으면 무시 — 미러가 늦어 「이미 픽에 있다」를 놓친 재체크도 여기서 중복이 걸러진다.
    const additions: [string, PickedQuestionMeta][] = [];
    const settled: string[] = [];
    let buffered = false;
    for (const e of landed) {
      const meta = rowPickMeta(questionRowByIdRef.current.get(e.pickId)) ?? e.meta;
      if (!meta) {
        // ready 항목은 항상 메타를 가진다(GET 결과·미러 행) — 방어: 픽에 못 넣는 항목을 버퍼에
        // 넣으면 「조판에 안 보이는데 DB 에만 행」이 된다. pending 만 내린다.
        settled.push(e.bankId);
        continue;
      }
      additions.push([e.pickId, meta]);
      if (isClientQuestionId(e.pickId)) {
        bankBufferRef.current.add(e.bankId);
        buffered = true;
      } else {
        settled.push(e.bankId);
      }
    }
    if (additions.length > 0) {
      applyFlatPickedUpdate((prev) => {
        let next: Map<string, PickedQuestionMeta> | null = null;
        for (const [id, meta] of additions) {
          if ((next ?? prev).has(id)) continue;
          if (!next) next = new Map(prev);
          next.set(id, meta);
        }
        return next ?? prev;
      });
    }
    if (settled.length > 0) {
      setPendingBankIds((prev) => {
        let next: Set<string> | null = null;
        for (const id of settled) {
          if (!prev.has(id)) continue;
          if (!next) next = new Set(prev);
          next.delete(id);
        }
        return next ?? prev;
      });
    }
    if (buffered) scheduleExamBankFlush();
  }, [applyFlatPickedUpdate, scheduleExamBankFlush]);
  // 단건 GET 병렬 조립 → 레지스트리 등록 → ready → 대기열 착지. 항목별 독립(allSettled):
  // 하나가 실패해도 나머지는 조판된다. 실패는 대기열에서 빼고 failed + 토스트 1개 — 버퍼에는
  // 넣지 않는다(조판에 안 보이는데 DB 에만 생기는 것 방지, §11.13.1). abort(해제·클래스 전환)
  // 는 실패가 아니라 무관 — 지금의 컨트롤러가 아니면 결과를 버린다.
  const materializeBankPicks = useCallback(
    async (
      jobs: { entry: BankInsertEntry; ctrl: AbortController }[],
      seq: number,
    ) => {
      const results = await Promise.allSettled(
        jobs.map((j) =>
          fetchBankItemAsBuilderQuestion(j.entry.bankId, j.ctrl.signal),
        ),
      );
      // 클래스 전환 — 리셋이 abort·대기열·레지스트리를 이미 청산했다.
      if (seq !== bankClassSeqRef.current) return;
      const failed: string[] = [];
      results.forEach((r, i) => {
        const job = jobs[i];
        if (!job) return;
        const { entry, ctrl } = job;
        if (bankFetchCtrlRef.current.get(entry.bankId) !== ctrl) return;
        bankFetchCtrlRef.current.delete(entry.bankId);
        if (r.status === "fulfilled") {
          registerClientQuestion(entry.pickId, r.value);
          bankClientIdsRef.current.add(entry.pickId);
          if (!entry.meta) entry.meta = builderQuestionPickMeta(r.value);
          entry.ready = true;
          return;
        }
        console.error("[materializeBankPicks] fetch failed", entry.bankId, r.reason);
        const idx = bankInsertQueueRef.current.indexOf(entry);
        if (idx >= 0) bankInsertQueueRef.current.splice(idx, 1);
        failed.push(entry.bankId);
      });
      if (failed.length > 0) {
        setPendingBankIds((prev) => {
          let next: Set<string> | null = null;
          for (const id of failed) {
            if (!prev.has(id)) continue;
            if (!next) next = new Set(prev);
            next.delete(id);
          }
          return next ?? prev;
        });
        setFailedBankIds((prev) => {
          let next: Set<string> | null = null;
          for (const id of failed) {
            if (prev.has(id)) continue;
            if (!next) next = new Set(prev);
            next.add(id);
          }
          return next ?? prev;
        });
        toast.error(`기출 문항 ${failed.length}개를 시험지에 넣지 못했습니다`, {
          description: "네트워크를 확인하고 다시 체크해 주세요.",
        });
      }
      // 실패로 머리가 비었거나 ready 가 생겼다 — 어느 쪽이든 한 번 흘려 본다.
      drainBankInsertQueue();
    },
    [drainBankInsertQueue],
  );

  // 체크/해제 단일 통로 — 행 1개(onTogglePick)와 「이 페이지 전체」·마키(onTogglePickMany)가
  // 같은 코드를 탄다(단건 GET 은 항목별 병렬 · 픽 제출 1회 · 버퍼 합류 1회). 콜백은 ref 미러만
  // 읽어 안정 참조(패널 memo 계약).
  // 체크(next=true) 3갈래:
  //   ① 이미 조판에 있다(임시 또는 실제 id) · 대기열에 있다 → 무동작.
  //   ② bankMap 에 실제 id 가 있고 목록 미러에 행이 실재 → 실제 id 로 즉시 체크(콜 0). 앞에
  //      조립 중인 항목이 있으면 순서 불변식 때문에 대기열을 거친다(그 동안만 pending).
  //   ③ 그 밖(미반입 · bankMap 엔 있지만 미러엔 없는 링크 없는 학원 스코프 행) → 즉시 조판
  //      경로: pending 낙관 → 단건 GET → 레지스트리 → 임시 id 픽 → 버퍼 합류. 서버가 학원
  //      스코프 멱등이라 재반입은 기존 행을 돌려준다(행 중복 생성 없음).
  // 해제(next=false): 임시·실제 id 를 픽에서 빼고(임시면 레지스트리도) 인플라이트 GET abort ·
  //   대기열·버퍼에서 제거 · 취소 표식(항상 — 인플라이트 중 체크→해제→재체크→해제 에서 2번째
  //   해제가 버퍼 삭제에 성공해 표식을 안 남기면 착지가 그 행을 실패로 표시한다, 26-09-08
  //   적대 검수 major 의 후신) · pending 즉시 내림.
  const applyExamBankToggle = useCallback(
    (
      bankIds: readonly string[],
      next: boolean,
      metas?: ReadonlyMap<string, ExamBankPickMeta>,
    ) => {
      if (bankIds.length === 0) return;
      const map = bankMapRef.current;
      const mirror = questionRowByIdRef.current;
      const queue = bankInsertQueueRef.current;
      // 「이미 픽에 있는가」는 미러(effect 갱신)로 읽는다 — 한 발 늦어 놓친 재체크는 대기열 판정
      // 과 착지 updater 의 prev.has() 가 거른다. 해제는 지울 키만 모아 순수 updater 로 뺀다.
      const picked = flatPickedRef.current;
      const removeIds: string[] = [];
      let queueTouched = false;
      const toPending: string[] = [];
      const fromPending: string[] = [];
      const jobs: { entry: BankInsertEntry; ctrl: AbortController }[] = [];
      for (const bankId of bankIds) {
        const qid = map.get(bankId);
        const tempId = clientQuestionIdFor(bankId);
        if (next) {
          bankCancelledRef.current.delete(bankId);
          if (
            picked.has(tempId) ||
            (qid !== undefined && picked.has(qid)) ||
            queue.some((e) => e.bankId === bankId)
          ) {
            continue;
          }
          if (qid !== undefined && mirror.has(qid) && !/#\d+$/.test(bankId)) {
            const blocked = queue.some((e) => !e.ready);
            queue.push({ bankId, pickId: qid, meta: rowPickMeta(mirror.get(qid)), ready: true });
            queueTouched = true;
            if (blocked) toPending.push(bankId);
            continue;
          }
          const ctrl = new AbortController();
          bankFetchCtrlRef.current.set(bankId, ctrl);
          const supplied = metas?.get(bankId);
          const entry: BankInsertEntry = {
            bankId,
            pickId: tempId,
            meta: supplied ? bankPickMeta(supplied) : null,
            ready: false,
          };
          queue.push(entry);
          jobs.push({ entry, ctrl });
          toPending.push(bankId);
        } else {
          // 임시·실제 id 둘 다 지운다(픽에 없으면 updater 가 무시). 레지스트리 정리는 무조건 —
          // 이 bankId 의 살아 있는 등록은 전부 지금 취소하는 시도의 것이다. 단, 착지가 이미 alias
          // 를 등록했으면(개명 갱신이 렌더 전) 남긴다 — 조판기가 그 alias 로 temp 를 제자리
          // 개명한 뒤 실제 id 제거로 끝내야 「제거 + 서버 추가(비동기) + 제거」 경합이 없다.
          // alias 는 조판기가 소비(take)하며 등록 문항도 함께 지운다.
          removeIds.push(tempId);
          if (qid !== undefined) removeIds.push(qid);
          if (peekQuestionIdAlias(tempId) === undefined) {
            unregisterClientQuestion(tempId);
            bankClientIdsRef.current.delete(tempId);
          }
          const ctrl = bankFetchCtrlRef.current.get(bankId);
          if (ctrl) {
            bankFetchCtrlRef.current.delete(bankId);
            ctrl.abort();
          }
          const idx = queue.findIndex((e) => e.bankId === bankId);
          if (idx >= 0) {
            queue.splice(idx, 1);
            queueTouched = true;
          }
          bankBufferRef.current.delete(bankId);
          bankCancelledRef.current.add(bankId);
          fromPending.push(bankId);
        }
      }
      if (removeIds.length > 0) {
        applyFlatPickedUpdate((prev) => {
          let nextMap: Map<string, PickedQuestionMeta> | null = null;
          for (const id of removeIds) {
            if (!(nextMap ?? prev).has(id)) continue;
            if (!nextMap) nextMap = new Map(prev);
            nextMap.delete(id);
          }
          return nextMap ?? prev;
        });
      }
      if (toPending.length > 0 || fromPending.length > 0) {
        // 변화 없으면 prev 반환(setFailedBankIds 와 동형) — 해제마다 새 Set 을 내리면
        // 패널 memo 가 뚫려 40행이 헛렌더된다.
        setPendingBankIds((prev) => {
          let nextSet: Set<string> | null = null;
          for (const id of fromPending) {
            if (!prev.has(id)) continue;
            if (!nextSet) nextSet = new Set(prev);
            nextSet.delete(id);
          }
          for (const id of toPending) {
            if ((nextSet ?? prev).has(id)) continue;
            if (!nextSet) nextSet = new Set(prev);
            nextSet.add(id);
          }
          return nextSet ?? prev;
        });
      }
      // 사용자가 다시 만진 행은 실패 표시를 지운다(재시도가 곧 재체크).
      setFailedBankIds((prev) => {
        if (prev.size === 0) return prev;
        let nextSet: Set<string> | null = null;
        for (const id of bankIds) {
          if (!prev.has(id)) continue;
          if (!nextSet) nextSet = new Set(prev);
          nextSet.delete(id);
        }
        return nextSet ?? prev;
      });
      // 단건 GET 은 항목별 병렬(API 라우트 — 상한 없음), 착지는 대기열이 순서대로.
      if (jobs.length > 0) void materializeBankPicks(jobs, bankClassSeqRef.current);
      // 해제가 조립 중이던 머리를 치웠거나 실제 id 항목이 ready 로 들어왔다 — 지금 흘려 본다.
      if (queueTouched) drainBankInsertQueue();
    },
    [applyFlatPickedUpdate, materializeBankPicks, drainBankInsertQueue],
  );
  const handleExamBankTogglePick = useCallback(
    (bankId: string, next: boolean, meta?: ExamBankPickMeta) =>
      applyExamBankToggle(
        [bankId],
        next,
        meta ? new Map([[bankId, meta]]) : undefined,
      ),
    [applyExamBankToggle],
  );
  const handleExamBankTogglePickMany = useCallback(
    (
      bankIds: string[],
      next: boolean,
      metas?: ReadonlyMap<string, ExamBankPickMeta>,
    ) => applyExamBankToggle(bankIds, next, metas),
    [applyExamBankToggle],
  );

  // ── 학습지 조판 픽(§3.10.21 E21-5) — 위 문항 축 배선의 **동형 복제** ──
  // 상태는 오케스트레이터 소유(controlled). 이 판이 담당하는 것은 rows 를 아는
  // 자만 할 수 있는 두 가지뿐이다: ① reportId → row 미러에서 SheetPickMeta 조립
  // ② 담기/빼기 Map 전이(삽입 순서 = 조판 순서 보존). rows 재조회 프룬은 문항
  // 축과 같은 이유로 하지 않는다(take 300 절단 창 — "부재 ≠ 삭제").
  const sheetPickedRef = useRef(sheetPicked);
  useEffect(() => {
    sheetPickedRef.current = sheetPicked;
  }, [sheetPicked]);
  // 업링크 **자체**의 ref 미러 — 아래 클래스 리셋 effect 의 deps 를 [classId] 로
  // 유지하기 위해서다. 콜백을 deps 에 얹으면 오케스트레이터가 참조를 한 번이라도
  // 불안정하게 주는 순간 리셋 전체(setAssetView("passages")·setIntakeView 등)가
  // 매 렌더 재발화해 사용자가 보던 화면이 홈으로 튀는 회귀가 된다.
  const onSheetPickedChangeRef = useRef(onSheetPickedChange);
  useEffect(() => {
    onSheetPickedChangeRef.current = onSheetPickedChange;
  }, [onSheetPickedChange]);
  // reportId → row 미러(문항 축 questionRowByIdRef 복제). 키는 id 가 아니라
  // **reportId** 다 — 학습지 행의 신원은 PassageReport.id 이고, save-as 사본은
  // passageId 까지 갈리므로(sheet-pick-types.ts:36-38) 지문 축으로 묶으면 안 된다.
  const worksheetRowByIdRef = useRef<Map<string, StudioClassWorksheetRow>>(
    new Map(),
  );
  useEffect(() => {
    worksheetRowByIdRef.current = new Map(
      worksheetsState.rows.map((r) => [r.reportId, r]),
    );
  }, [worksheetsState.rows]);
  // 메타 정본은 **rows** 다. pane 이 편의상 메타를 함께 올려 주지만(U10 계약)
  // 그 값은 같은 렌더의 rows 파생분이라 항상 일치하고, 이 목록에 없는 행
  // (take 300 절단 밖·타 표면 발사분)에서 올라온 메타만 폴백으로 살린다.
  const sheetMetaOf = useCallback(
    (reportId: string, fallback: SheetPickMeta): SheetPickMeta => {
      const row = worksheetRowByIdRef.current.get(reportId);
      return row ? rowToSheetPickMeta(row) : fallback;
    },
    [],
  );
  // ⚠ 구 학습지 판 전용 콜백 3종(handleSheetTogglePick · handleSheetPickRows ·
  //   handleSheetClearPicked)은 §3.10.23 E24 로 **삭제**했다 — 유일 소비처였던
  //   ClassWorksheetsPane 이 파일째 사라져 dead code 가 됐기 때문이다.
  //   그 3종이 들고 있던 담기/빼기 Map 전이 규칙은 소멸한 게 아니라 아래
  //   handleComposerCommit 의 ⓪ 로 **흡수**됐다: 빼기는 delete(나머지 삽입 순서
  //   무손상), 담기는 「이미 있으면 건너뛰고 맨 뒤 append」 — 그 순서가 그대로
  //   조판 순서다. 되살리지 마라. 규칙이 두 벌이 되는 순간 한쪽만 고쳐져
  //   「마키 한 번에 조판 순서가 뒤집힌다」가 재발한다.
  // 행 액션 2종 — 행 원형을 메타로 좁혀 올린다(위 prop 주석의 근거).
  const handleSheetDeployRow = useCallback(
    (row: StudioClassWorksheetRow) => {
      onSheetDeploy?.(rowToSheetPickMeta(row));
    },
    [onSheetDeploy],
  );
  const handleSheetComposeRow = useCallback(
    (row: StudioClassWorksheetRow) => {
      onSheetCompose?.(rowToSheetPickMeta(row));
    },
    [onSheetCompose],
  );

  // ── 병합 목록의 **타입별 델타 커밋**(§3.10.22 E22-4 · §3.10.23 E24) ──────
  // ComposerListPane 은 단일 DragSelect 가 두 축을 함께 훑으므로 「Set 전량
  // 교체」를 올릴 수 없다. 올리면 (a) 학습지 축의 dirty confirm
  // (studio-home-client.tsx:1786-1817 guardSheetPickRemoval → applySheetPicked)
  // 을 우회해 E21 의 편집 증발이 재발하고 (b) 이미 담긴 항목이 재삽입돼 조판
  // 순서가 마키 한 번에 뒤집힌다. 그래서 판은 **델타(added/removed)** 만 주고
  // 이 판이 kind 로 갈라 축별 정본 전이에 태운다.
  //
  // ⚠ **커밋 순서가 계약이다**(적대 검수 major · 실측
  //   `.tmp-worksheet-compose/_a22-f-dirty.mjs` · `_a22-verify-16.mjs`).
  //   구 코드는 문항 축을 **먼저 무조건 커밋**한 뒤 학습지 축에서 dirty confirm 을
  //   띄웠다. 그래서 사용자가 「취소」를 눌러도 되돌아가는 건 학습지 축뿐이고
  //   문항 대기열은 이미 갈아치워진 뒤였다 — 실측: 학습지 2 + 문항 3 체크 →
  //   활성 문서 타이핑(dirty 2) → 미체크 3행을 마키로 훑고 confirm **dismiss** →
  //   문항 q#1~#3 이 cmsypvnf/vec/ulr → cmsypsr2/sdz/sdx 로 통째 교체(체크 순번
  //   = 인쇄 순서까지 소멸), 학습지 축만 정상 롤백(VERDICT q=true / w=false).
  //   당시엔 base 가 빈 집합이라 **히트하지 않은 가시 체크 전량이 removed 후보**
  //   였다 — 병합 목록에서는 「마키 한 번 = 두 축 동시 교체」가 기본 동작이었고,
  //   상한 폐기 후 문항 40개를 담는 것이 정상 사용법이므로(E22-G3) 실수 한 번 +
  //   취소가 40개 선택과 인쇄 순서를 복구 불가능하게 날렸다.
  //   ※ 2026-08-20 누적 개편으로 담기 드래그는 removed 를 만들지 않는다 — 이
  //     폭발 반경은 해제 드래그로 좁아졌다. 아래 구조는 그대로 유지한다.
  //   → **선(先) 질의 → 후(後) 2축 커밋**으로 뒤집는다: 학습지 전이 Map 을 먼저
  //     계산하고, 제거가 있으면 가드를 **커밋 전에** 물어 거부되면 두 축 모두
  //     손대지 않고 반환한다. 취소 롤백(문항 축 되감기)은 채택하지 않았다 —
  //     handleFlatSelectionChange 가 rows 미러 의존이라 순서 복원이 보장되지 않는다.
  const handleComposerCommit = useCallback(
    (added: ComposerRow[], removed: ComposerRow[]) => {
      // ⓪ 학습지 축 전이 **선계산**(커밋 아님). 전이 규칙은 아래 ② 주석과 동일.
      let wTouched = false;
      let wRemoved = false;
      const prevSheets = sheetPickedRef.current ?? EMPTY_SHEET_PICKED;
      const nextSheets = new Map(prevSheets);
      for (const r of removed) {
        if (r.kind !== "worksheet") continue;
        if (nextSheets.delete(r.row.reportId)) {
          wTouched = true;
          wRemoved = true;
        }
      }
      for (const r of added) {
        if (r.kind !== "worksheet") continue;
        if (nextSheets.has(r.row.reportId)) continue;
        // 메타 정본은 rows 다(:779-788 sheetMetaOf 와 같은 근거). 병합 목록의
        // 행은 worksheetsState.rows 그 자체라 미러 적중이 보장되지만, 절단 창
        // 밖에서 올라온 행을 대비해 같은 폴백 함수를 태운다.
        nextSheets.set(
          r.row.reportId,
          sheetMetaOf(r.row.reportId, rowToSheetPickMeta(r.row)),
        );
        wTouched = true;
      }

      // ⓪-b **선(先) 질의**. 원자 채널 한 쌍이 다 있을 때만 이 경로를 쓴다.
      //   제거가 없으면 가드는 어차피 true 이므로 묻지 않는다(공연한 confirm 금지 —
      //   sheet-compose-dirty-guard.ts:79-93 통과 조건과 같은 판정).
      //   (한 쌍을 **객체 1개로 좁혀** 잡는다 — 두 옵셔널을 따로 두면 TS 가
      //    boolean 플래그로는 좁히지 못해 호출부가 possibly-undefined 가 된다.
      //    이 객체는 콜백 로컬이라 prop 참조 안정성과 무관하다.)
      const atomic =
        onSheetPickCanRemove && onSheetPickedCommit
          ? { ask: onSheetPickCanRemove, commit: onSheetPickedCommit }
          : null;
      if (atomic && wRemoved && !atomic.ask(nextSheets)) {
        // 「취소는 아무 일도 일어나지 않는다」 — 문항 축도 손대지 않고 반환한다.
        return;
      }

      // ① 문항 축 — Set 재구성 후 기존 정본(handleFlatSelectionChange)에 위임.
      //    그 함수가 prev Map 순서를 먼저 흘려 넣고 신규만 append 하므로
      //    (:733-745) 여기서 Set 삽입 위치를 신경 쓸 필요가 없다. 이미 담긴
      //    id 에 add 를 다시 불러도 Set 은 위치를 유지한다(재삽입 아님).
      let qTouched = false;
      const nextIds = new Set(flatPickedRef.current.keys());
      for (const r of removed) {
        if (r.kind !== "question") continue;
        if (nextIds.delete(r.row.id)) qTouched = true;
      }
      for (const r of added) {
        if (r.kind !== "question") continue;
        if (!nextIds.has(r.row.id)) {
          nextIds.add(r.row.id);
          qTouched = true;
        }
      }
      if (qTouched) handleFlatSelectionChange(nextIds);

      // ② 학습지 축 — ⓪에서 **단일 패스**로 전이해 둔 Map 을 한 번만 업링크한다.
      //    ⚠ 담기와 빼기를 **두 번의 업링크로 나눠 부르지 마라**(구 코드의
      //      handleSheetPickRows(entries,true) → (entries,false) 패턴. 그 함수는
      //      E24 로 삭제됐다). 그런 헬퍼는 sheetPickedRef 를 읽는데 ref 동기화가
      //      effect 라 **같은 커밋 안 두 번째 호출이 첫 호출을 못 본다** —
      //      마키 한 번이 add 와 remove 를 동시에 내는 경우(행이 들어오고 다른
      //      행이 빠지는 드래그)에 뒤 호출이 앞 호출을 통째로 덮어쓴다.
      //    전이 규칙(위 ⓪)은 이제 **여기가 유일 정본**이다 — 빼기는 delete(나머지
      //    삽입 순서 무손상), 담기는 「이미 있으면 건너뛰고」 맨 뒤 append.
      //    원자 경로에서는 ⓪-b 에서 **이미 물었으므로** 가드 없는 세터로 커밋한다
      //    (같은 제스처에 confirm 이 두 번 뜨는 것을 막는다). 원자 채널이 없는
      //    호스트는 기존 onSheetPickedChange(=applySheetPicked, 가드 포함)로
      //    폴백 — 동작이 구 코드와 완전히 같다(무회귀).
      if (wTouched) {
        if (atomic) atomic.commit(nextSheets);
        else onSheetPickedChange?.(nextSheets);
      }
    },
    [
      handleFlatSelectionChange,
      onSheetPickedChange,
      onSheetPickCanRemove,
      onSheetPickedCommit,
      sheetMetaOf,
    ],
  );

  // 클래스 전환 — 평면 데이터·선택·뷰 전부 초기화(스코프 리셋과 동일 근거).
  // 키 ref 도 함께 비운다: A→B→A 재선택(판은 클래스 전환에도 마운트 유지)에서
  // 옛 키가 남으면 발사 1회 가드가 재조회를 영영 막는다(idle 스켈레톤 고착).
  // 시퀀스 ref 도 올린다(적대 감사 major): fetch effect 가 이 리셋보다 앞서
  // 선언돼 같은 커밋에서 먼저 도는데, 인플라이트 응답을 기각하지 않으면
  // 늦게 도착한 타 클래스 rows 가 현재 클래스 상태로 ready 커밋된다.
  // intakeView 도 홈으로 정렬(적대 감사 minor): 이전 클래스의 들여오기 집중
  // 모드가 새 클래스 첫 화면을 탈취하지 않게 — hidden 유지 마운트라 작성
  // 중인 보드 내용은 보존된다.
  // §3.10.23 E24: 두 조판 뷰("sheet"·"exam")도 이 리셋에 **그대로 포함**된다 —
  // setAssetView("passages") 가 뷰 도메인 전체를 홈으로 되돌리고(G10), 두 key ref
  // 청산이 A→B→A 재조회 경로를 살린다(두 조판 뷰는 두 축을 함께 켜므로 key 가
  // 한 쪽만 남아 있으면 병합 목록이 반쪽으로 뜬다). 여기에 뷰별 전용
  // 분기를 새로 만들지 마라 — 리셋 경로가 갈리는 순간 위 「idle 스켈레톤
  // 고착」이 클래스 전환 축에서 재발한다.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // 【R1 개정 26-08-27】 **마운트 1회는 통째로 건너뛴다**(뷰별 분기가 아니다).
  //
  // 위 「뷰별 전용 분기를 새로 만들지 마라」는 그대로 유효하다 — 이 래치는 분기가
  // 아니라 **effect 전체의 첫 발화 스킵**이다. 리셋 경로는 여전히 한 갈래다.
  //
  // 왜 필요한가: 새로고침 위치 복원이 `assetView` 를 "sheet"/"exam" 으로 시드하는데
  // (:519), 이 effect 는 클래스 전환뿐 아니라 **마운트에서도 발화**한다. 스킵이
  // 없으면 순서가 이렇게 된다 —
  //     ① fetch effect(:804·:834, 선언이 앞이라 먼저 돈다)가 listActive=true 를
  //        보고 발화 + key 를 심는다
  //     ② 이 리셋이 돌며 setAssetView("passages") + key null + seq++
  //     ③ ①의 응답이 돌아오지만 seq 가 어긋나 **기각**된다
  //   결과: 복원값은 지워지고, 목록은 조회조차 안 된 채 idle 이다. 조용히.
  //
  // 왜 안전한가: **차가운 마운트에서 이 effect 의 리셋 대상은 전부 이미 리셋된
  // 값이다.** 하나씩 대조하면 —
  //   · setAssetView("passages")      → 복원 없으면 초기값이 이미 "passages"
  //   · setIntakeView("library")      → 초기값이 이미 "library"
  //   · 두 목록 상태 → 초기값이 이미 {status:"idle", rows:[]}
  //   · 두 key ref  → 초기값이 이미 null
  //   · worksheetRowByIdRef → 초기값이 이미 빈 Map
  //   · 두 seq ref  → 올리지 **않는 것이 곧 수정**이다. 마운트 시점엔 기각할
  //     인플라이트가 없고, 올리면 위 ③처럼 자기 자신의 첫 조회를 죽인다.
  //   · 픽 청산 업링크 → 이미 `size > 0` 가드로 마운트에서 스킵된다(아래 주석).
  // 즉 스킵은 **동작을 바꾸지 않는다**. 바꾸는 것은 seq 하나뿐이고 그게 목적이다.
  //
  // ⚠ deps 를 넓히지 마라 — 판정은 ref 이지 dep 이 아니다. [classId] 유지가 계약.
  // ⚠ 이 스킵을 「복원일 때만」으로 좁히지 마라. 조건이 붙는 순간 평시 마운트와
  //   복원 마운트가 **서로 다른 코드 경로**가 되어, 위 대조표가 한쪽에서만 참인
  //   상태로 썩는다(그게 정확히 이 파일이 경계하는 「리셋 경로가 갈린다」이다).
  //
  // ⚠⚠ **판정은 「첫 발화인가」(boolean 래치)가 아니라 「classId 가 실제로 바뀌었나」
  //    (전이)여야 한다.** 실측으로 확인한 함정이다(26-08-27):
  //    boolean 래치는 **StrictMode 에서 소진된다** — dev 의 effect 는
  //    mount → cleanup → mount 로 두 번 도는데 ref 는 그 사이 살아남으므로
  //    ① 1회차가 래치를 소비하고 ② 2회차가 리셋을 **실제로 실행**한다. 결과는
  //    "복원값이 조용히 지워지고 프로덕션에서만 동작하는" 최악의 형태다
  //    (첫 실측: 클래스는 복원되는데 뷰만 passages 로 되돌아가고, 주소창의
  //     view= 파라미터까지 미러 effect 가 지워 흔적조차 남지 않았다).
  //    전이 판정은 마운트 2회 모두 `prev === classId` 라 구조적으로 안전하고,
  //    무엇보다 이 effect 가 **원래 표현하려던 의미**("클래스가 바뀌면 청산")를
  //    그대로 적는다.
  // ══════════════════════════════════════════════════════════════════════════
  const lastResetClassIdRef = useRef<string | null>(classId);
  useEffect(() => {
    if (lastResetClassIdRef.current === classId) return;
    lastResetClassIdRef.current = classId;
    setAssetView("passages");
    setIntakeView("library");
    setQuestionsState({ status: "idle", rows: [] });
    setWorksheetsState({ status: "idle", rows: [] });
    questionsFetchKeyRef.current = null;
    worksheetsFetchKeyRef.current = null;
    questionsFetchSeqRef.current += 1;
    worksheetsFetchSeqRef.current += 1;
    worksheetRowByIdRef.current = new Map();
    // 학습지 조판 픽 청산 업링크(§3.10.21 E21-5 — "비대칭이면 A 클래스 학습지가
    // B 클래스 조판에 남는다"). 오케스트레이터도 자기 리셋 effect 에서 3상태를
    // 청산하지만(같은 절), 그쪽은 sheetComposeOpen·activeSheetId 까지 함께
    // 내려야 하므로 여기 한 줄은 **중복이 아니라 이중 방어**다(빈 Map 재적용은
    // 멱등). deps 를 [classId] 로 유지하려고 콜백은 ref 미러로 읽는다(위 근거).
    // size 가드: 마운트 첫 발화에서 이미 빈 대기열에 빈 Map 을 올려 상위
    // setState 를 헛돌리지 않게 한다.
    if ((sheetPickedRef.current?.size ?? 0) > 0) {
      onSheetPickedChangeRef.current?.(EMPTY_SHEET_PICKED);
    }
  }, [classId]);

  // 자산 뷰 업링크(§3.10.17-b) — 우측 패널(실행대↔도시에) 스왑 판정 재료.
  useEffect(() => {
    onAssetViewChange?.(assetView);
  }, [assetView, onAssetViewChange]);

  const classScopeCount = useMemo(() => {
    if (!classCtx) return 0;
    let n = 0;
    for (const p of passages) if (classCtx.registeredIds.has(p.id)) n += 1;
    return n;
  }, [classCtx, passages]);

  const scopedFilteredPassages = useMemo(() => {
    if (!classCtx || !scopeOnly) return filteredPassages;
    return filteredPassages.filter((p) => classCtx.registeredIds.has(p.id));
  }, [classCtx, filteredPassages, scopeOnly]);

  // 전체선택은 "지금 보이는 것"(스코프 반영) 기준 — 훅 제공분은 스코프를 모른다.
  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(scopedFilteredPassages.map((p) => p.id)));
  }, [scopedFilteredPassages, setSelectedIds]);

  const [registerBusy, setRegisterBusy] = useState(false);
  const handleRegisterSelected = useCallback(async () => {
    if (!classCtx || registerBusy) return;
    setRegisterBusy(true);
    try {
      // AI 추출 draft 는 실제 지문으로 자동 승격 후 담는다(§3.10.15 —
      // 워크스페이스 담기 관문과 동일 정본 resolveSelectionToPassageIds,
      // markReviewed:false 유지). 구 "검수 완료된 지문만" 안내는 실조건과
      // 어긋나는 오문구라 폐기(검수 축 자체가 스튜디오에서 사라졌다 — E14).
      let ids = [...selectedIds];
      if (ids.some((id) => isDraftPseudoId(id))) {
        const { resolvedById, failedCount } =
          await resolveSelectionToPassageIds(ids);
        ids = ids
          .map((id) => resolvedById[id])
          .filter((v): v is string => Boolean(v));
        // 선택을 실지문 id 로 재바인딩(적대 감사 minor) — 승격으로 목록에서
        // 소멸한 draft 의사 id 가 selectedIds 에 유령 잔존하면 카운트만 남는
        // 죽은 CTA 가 된다(handleLoadSelectedToWorkspace 의 :782 청산과 대칭).
        setSelectedIds(new Set(ids));
        if (failedCount > 0) {
          toast.warning(
            `${failedCount}개 자료는 지문으로 준비하지 못해 제외했습니다.`,
          );
        }
        void loadPassages();
      }
      if (ids.length === 0) {
        toast.error("담을 수 있는 지문이 없습니다.");
        return;
      }
      // 서버 addPassagesToStudioClass 는 호출당 50개 캡(§3.10.9) — 50개 초과
      // 선택은 50개 청크로 잘라 순차 호출하고 합산 결과를 한 번만 토스트한다.
      // 갱신(loadChildren)은 **마지막 청크에서 1회만** — 청크마다 갱신하면
      // 직렬 서버 액션이 청크 수만큼 왕복을 더 탄다(26-08-15 지연 수술).
      let added = 0;
      for (let i = 0; i < ids.length; i += 50) {
        const isLast = i + 50 >= ids.length;
        added += await onRegisterToClass(ids.slice(i, i + 50), {
          skipRefresh: !isLast,
        });
      }
      if (added > 0) {
        toast.success(`${added}개 지문을 「${classCtx.className}」에 담았습니다.`);
      } else {
        toast.info("선택한 지문은 이미 클래스에 담겨 있습니다.");
      }
    } finally {
      setRegisterBusy(false);
    }
  }, [
    classCtx,
    loadPassages,
    onRegisterToClass,
    registerBusy,
    selectedIds,
    setSelectedIds,
  ]);

  // ── 클래스에서 빼기(§3.10.4) — 선택 중 등록 지문만 대상, 링크만 해제 ──
  const selectedRegisteredIds = useMemo(() => {
    if (!classCtx) return [] as string[];
    const out: string[] = [];
    for (const id of selectedIds) {
      if (classCtx.registeredIds.has(id)) out.push(id);
    }
    return out;
  }, [classCtx, selectedIds]);
  const [unregisterBusy, setUnregisterBusy] = useState(false);
  const handleUnregisterSelected = useCallback(async () => {
    if (!classCtx || !onUnregisterFromClass || unregisterBusy) return;
    const ids = selectedRegisteredIds;
    if (ids.length === 0) return;
    // 확인 1회(클래스 홈 관용구 승계) — 링크만 해제·자료 보존을 명시한다.
    const ok = window.confirm(
      `선택한 지문 ${ids.length}개를 「${classCtx.className}」에서 뺄까요?\n클래스 연결만 해제되며 지문과 생성물은 지워지지 않습니다.`,
    );
    if (!ok) return;
    setUnregisterBusy(true);
    try {
      // 서버 removePassagesFromStudioClass 는 호출당 50개 캡(§3.10.9) — 50개 초과
      // 선택은 50개 청크로 잘라 순차 호출하고 합산 결과를 한 번만 토스트한다.
      // 갱신은 마지막 청크 1회만(담기 루프와 동일 정책 — 26-08-15).
      let removed = 0;
      for (let i = 0; i < ids.length; i += 50) {
        const isLast = i + 50 >= ids.length;
        removed += await onUnregisterFromClass(ids.slice(i, i + 50), {
          skipRefresh: !isLast,
        });
      }
      if (removed > 0) {
        toast.success(`${removed}개 지문을 클래스에서 뺐습니다`);
      } else {
        toast.info("선택한 지문은 이미 클래스에서 빠져 있습니다.");
      }
    } finally {
      setUnregisterBusy(false);
    }
  }, [classCtx, onUnregisterFromClass, selectedRegisteredIds, unregisterBusy]);

  // ── 헤드리스 스테이징 스토어(§3.10.18 E18-a) ─────────────────────────────
  // 구 「워크스페이스」 오버레이는 폐기됐다. 이 행 스토어는 **렌더되지 않고**,
  // 실전 모달이 행에 묶여 있다는 훅 계약(openForRow(localId)) 하나 때문에
  // 남는다 — 직행 발사 직전에만 clear() → loadPassages(선택분) 로 채워지므로
  // **rows ≡ 선택 집합**이 불변식이다.
  const workspaceApi = useWorkspaceRows();
  // 직행 발사 호스트 열림 — qgen 의 workspaceVisible 게이트를 대체한다.
  // false 가 되면 훅이 activeRow 를 self-null 하고 모달을 자동으로 닫는다.
  const [launchHostOpen, setLaunchHostOpen] = useState(false);
  // 이번 직행이 겨냥한 행(§3.10.18 E18-e) — 길이 2 이상이면 모달 푸터 발사가
  // batch 경로로 간다. 발사·취소 시 비운다.
  const [directTargetLocalIds, setDirectTargetLocalIds] = useState<string[]>([]);

  // qgen 은 아래에서 선언되므로(훅 선언 순서) 위 핸들러들이 읽을 수 있게
  // ref 미러로 잇는다 — 클릭 시점(커밋 후) 읽기라 항상 최신본이다.
  const qgenModalOpenRef = useRef(false);
  const qgenCloseModalRef = useRef<(() => void) | null>(null);
  const qgenOpenForRowRef = useRef<((localId: string) => void) | null>(null);

  // ── 행 인라인 지문 수정(§3.10.18 E18-d) — 동시 확장은 최대 1행 ──
  const [expandedPassageId, setExpandedPassageId] = useState<string | null>(
    null,
  );

  // ── 도시에 업링크(§3.10.11-a) — 워크스페이스 행 ⊕ 내 지문함 선택 합집합 ──
  // E9: 「워크스페이스에 담기」는 선택 청산+행 추가라, 선택만 공급원이던 구
  // 계약(§3.9v2.1)에선 담는 순간 우측 도시에가 빈 문구로 무너졌다. 행이 앞·
  // 선택이 뒤 — 수신부 자동 펼침 규칙이 "마지막 항목 = 최신"을 전제하므로 이
  // 순서 배치가 계약의 핵심이다(§3.10.11-a): 담기 = 합집합 불변 → 시그니처
  // 동일 → 발행 0 → 수신부 펼침·캐시 자동 보존, 신규 선택·신규 행은 모두
  // "마지막 항목"이 되어 기존 자동 펼침 규칙이 그대로 맞는다. 행은 담기 관문
  // (handleLoadSelectedToWorkspace)이 draft 를 이미 승격한 실지문이라 draft
  // 의사 id 제외는 선택분에만 적용한다. 제목은 byId(지문함 원본) 우선 — 지문
  // 개명도 재발행해 아코디언 헤더 제목 스테일을 막는다(동일 id 재발행은
  // 수신부 캐시 가드로 질의 0건 실측). 빈 합집합 = null. 행 편집(setContent
  // 매 키스트로크)마다 rows 참조가 바뀌어 이 effect 가 재실행되지만 id:제목
  // 시그니처는 동일 → 발행 0(비용은 문자열 join 비교뿐 — 성능 수용 근거).
  // ⚠ deps 는 rows 배열만 — workspaceApi 객체 통째 의존 금지(렌더마다 새
  // 참조, use-studio-question-gen.ts:564 주석 참조).
  const prevDossierSigRef = useRef("");
  useEffect(() => {
    if (!onDossierPassages) return;
    const byId = new Map(passages.map((p) => [p.id, p]));
    const items: { id: string; title: string }[] = [];
    const seen = new Set<string>();
    // ⚠ 공급원은 **선택뿐**이다(§3.10.18 E18-c ⑤ 개정). 구 계약의 「행 ⊕ 선택」
    //   합집합에서 행 절반을 뺀 이유: 행은 이제 화면에 없는 헤드리스 스테이징
    //   이고 발사 후에도 남는다. 그대로 두면 사용자가 체크를 풀어도 직전 발사
    //   지문이 우측 도시에에 계속 살아 있고, 지울 수단이 아예 없다(워크스페이스
    //   UI 가 사라졌으므로 — 적대 검수 확정 major). 선택은 사용자가 언제든
    //   끌 수 있는 유일한 조작면이라 도시에의 정직한 공급원이다.
    for (const id of selectedIds) {
      if (seen.has(id) || isDraftPseudoId(id)) continue;
      const p = byId.get(id);
      if (p) {
        seen.add(id);
        items.push({ id, title: p.title });
      }
    }
    const sig = items.map((i) => `${i.id}:${i.title}`).join("|");
    if (sig === prevDossierSigRef.current) return;
    prevDossierSigRef.current = sig;
    onDossierPassages(items.length > 0 ? items : null);
  }, [onDossierPassages, passages, selectedIds]);

  // ── 도시에 카드 「선택 해제」 컨트롤(26-08-22) — 위 발행 이펙트의 공급원
  //    (selectedIds)에서 id 하나만 뺀다. 카드 소멸·시그니처 재발행은 위 이펙트가
  //    자동 수행하므로 여기는 선택 변이 하나로 끝난다(도시에 상태 직접 조작 금지).
  const deselectDossierPassage = useCallback(
    (passageId: string) => {
      setSelectedIds((prev) => {
        if (!prev.has(passageId)) return prev;
        const next = new Set(prev);
        next.delete(passageId);
        return next;
      });
    },
    [setSelectedIds],
  );
  useEffect(() => {
    if (!onDossierDeselectControl) return;
    onDossierDeselectControl(deselectDossierPassage);
    return () => onDossierDeselectControl(null);
  }, [onDossierDeselectControl, deselectDossierPassage]);

  // 언마운트 2차 방어선 — LibraryPane 이 사라질 때(클래스 해제 등) 우측 도시에
  // 잔존을 차단한다(1차는 오케스트레이터의 클래스 전환 청산). onDossierPassages
  // 는 ref 로 미러해 **언마운트 전용** cleanup 에서만 null 을 발행한다 — 위
  // 발행 이펙트에 합치면 deps 변경마다 cleanup 이 돌아 null 이 새는 오염.
  const onDossierPassagesRef = useRef(onDossierPassages);
  useEffect(() => {
    onDossierPassagesRef.current = onDossierPassages;
  }, [onDossierPassages]);
  useEffect(
    () => () => {
      onDossierPassagesRef.current?.(null);
    },
    [],
  );

  // ── 직행 관문(§3.10.18 E18-c ①) — draft 승격 ─────────────────────────────
  // AI 추출 의사 id 는 실제 Passage 가 아니다. 승격하지 않으면 존재하지 않는
  // passageId 가 생성 액션에 나간다. 선택 자체도 실 id 로 재바인딩해 유령
  // 잔존(카운트만 남는 죽은 CTA)을 막는다. 실패분은 토스트 후 제외.
  const resolveSelectedPassages = useCallback(async (): Promise<
    PassageItem[]
  > => {
    const selected = passages.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) return [];
    if (!selected.some((p) => isDraftPseudoId(p.id))) return selected;
    const { resolvedById, failedCount } = await resolveSelectionToPassageIds(
      selected.map((p) => p.id),
    );
    const resolved = selected
      .map((p) => {
        const realId = resolvedById[p.id];
        if (!realId) return null;
        return isDraftPseudoId(p.id)
          ? { ...p, id: realId, source: null, extractionReviewDraft: null }
          : p;
      })
      .filter((p): p is PassageItem => Boolean(p));
    setSelectedIds(new Set(resolved.map((p) => p.id)));
    if (failedCount > 0) {
      toast.warning(
        `${failedCount}개 자료는 지문으로 준비하지 못해 제외했습니다.`,
      );
    }
    void loadPassages();
    return resolved;
  }, [loadPassages, passages, selectedIds, setSelectedIds]);

  // ── [학습지 생성] 직행(§3.10.18 E18-c ② · §3.10.19 E19-8 개명) ───────────
  // 학습지 모달은 원래 다지문 계약이라 선택 전량을 그대로 넘긴다 —
  // 이 판은 표면 문구만 개명하고 배선(onOpenModuleSheet 시그니처·핸들러/상태
  // 식별자)은 한 바이트도 건드리지 않는다(§3.10.19 E19-3 props 불변 계약).
  // 워크스페이스 왕복 0.
  const [workbookBusy, setWorkbookBusy] = useState(false);
  const handleOpenWorkbookFromSelection = useCallback(async () => {
    if (workbookBusy) return;
    setWorkbookBusy(true);
    try {
      const resolved = await resolveSelectedPassages();
      if (resolved.length === 0) {
        toast.error("학습지를 만들 지문이 없습니다.");
        return;
      }
      // Esc 1중(§3.8.7) — 실전 모달이 열려 있으면 먼저 닫는다.
      if (qgenModalOpenRef.current) qgenCloseModalRef.current?.();
      onOpenModuleSheet(
        resolved.map((p) => ({
          id: p.id,
          title: p.title,
          content: p.content,
        })),
      );
    } finally {
      setWorkbookBusy(false);
    }
  }, [onOpenModuleSheet, resolveSelectedPassages, workbookBusy]);

  // ── [실전 문제 생성] 직행(§3.10.18 E18-c ③) ──────────────────────────────
  // 실전 모달은 행(localId)에 묶여 있다. 오버레이를 열지 않고 모달만 띄우려면
  // ① 스테이징을 비우고(rows ≡ 선택 불변식) ② 선택분만 행으로 적재하고
  // ③ passageId→localId 역조회(loadPassages 가 localId 를 돌려주지 않는다)
  // ④ launchHostOpen 을 세워 workspaceVisible 게이트를 통과시킨 뒤 openForRow.
  const [questionGenBusy, setQuestionGenBusy] = useState(false);
  const handleOpenQuestionGenFromSelection = useCallback(async () => {
    if (questionGenBusy) return;
    setQuestionGenBusy(true);
    try {
      const resolved = await resolveSelectedPassages();
      if (resolved.length === 0) {
        toast.error("문제를 만들 지문이 없습니다.");
        return;
      }
      // Esc 1중(§3.8.7) 반대 방향 — 워크북 모달이 열려 있으면 먼저 닫는다.
      onCloseWorkbookModal?.();
      // 행 전체 교체 + localId 동기 수신(§3.10.18 E18-c ③).
      // ⚠ clear()+loadPassages() 조합 금지 — loadPassages 는 직전 커밋 rows
      //   클로저로 중복 제거를 해서, 같은 지문 재발사 때 전건 skip → setRows
      //   미호출 → 행이 빈 채로 남아 CTA 가 조용히 죽는다(적대 검수 확정
      //   critical). replaceWithPassages 는 이전 rows 를 읽지 않는다.
      const localIds = workspaceApi.replaceWithPassages(resolved);
      if (localIds.length === 0) return;
      setDirectTargetLocalIds(localIds);
      setLaunchHostOpen(true);
      qgenOpenForRowRef.current?.(localIds[0]);
    } finally {
      setQuestionGenBusy(false);
    }
  }, [
    onCloseWorkbookModal,
    questionGenBusy,
    resolveSelectedPassages,
    workspaceApi,
  ]);

  // ── 실전 문제 생성 스택(§3.8.8) — useStudioQuestionGen 조립 ──
  // useGenerationSessionQueue 훅 자체는 오케스트레이터가 1곳에서 호출하고(폴러
  // 1개 규칙) 이 판은 세터만 받아 스탬프 래퍼를 씌운다. api 객체는 렌더마다 새
  // 참조라 memo 컴포넌트에 통째로 내리지 않는다(필드 단위 안정 전달 — 함정 1).
  const qgen = useStudioQuestionGen({
    academyId,
    passages,
    loadPassages,
    workspaceApi,
    setSessionQueue,
    // §3.10.18 E18-a: 오버레이가 없으므로 직행 호스트 열림이 곧 가시성이다.
    // 이 한 줄이 없으면 훅이 activeRow 를 self-null 해 모달이 즉시 닫힌다.
    workspaceVisible: launchHostOpen,
    onAfterLaunch: onQuestionLaunched,
    directTargetLocalIds,
  });

  // ── 학습지 생성(§3.8.6·§3.8.7, §3.10.19 E19-8 개명) — 워크스페이스 행 단위 전용 동선 ──
  // §3.8.5 로 그리드 「학습 만들기」 직행이, §3.9v2.5(D6)로 하단 「전체 학습
  // 워크북 생성」(당시 명칭 — 지금은 존재하지 않는 CTA라 기록으로만 남긴다)
  // 일괄 CTA 가, §3.10(E6)으로 일괄 생성 패널이 각각 폐기돼 학습지 모달 진입은
  // 행 CTA 하나뿐이다(진행 표시는 우측 도시에 「생성 중」 스트립 §3.10.6).
  // 행은 이미 draft 승격 관문(handleLoadSelectedToWorkspace)을 지난 실
  // 지문이라 재승격이 필요 없다. 편집 내용은 분석에 반영되지 않으므로
  // 등록본(라이브러리 원본 또는 savedContent)을 그대로 넘긴다(스펙 확정 동작).
  // Esc 1중(§3.8.7): 실전 모달이 열려 있으면 먼저 닫아 동시 오픈을 막는다.
  const { genModalOpen: qgenModalOpen, closeGenModal: qgenCloseModal } = qgen;

  // 위 직행 핸들러가 읽는 ref 미러 결선(선언 순서 우회).
  // ⚠ 렌더 중 대입 금지(react-hooks/refs) — 커밋 후 effect(deps 없음 = 매 렌더).
  //   세 값 모두 클릭 핸들러·발사 effect 에서만 읽히므로 커밋 후면 충분하다.
  const qgenOpenForRow = qgen.openForRow;
  useEffect(() => {
    qgenModalOpenRef.current = qgenModalOpen;
    qgenCloseModalRef.current = qgenCloseModal;
    qgenOpenForRowRef.current = qgenOpenForRow;
  });

  // 구 「적재 → rows 반영 대기 → localId 역조회」 핸드셰이크는 폐기했다 —
  // replaceWithPassages 가 localId 를 동기 반환하므로 대기 자체가 없다(그
  // 핸드셰이크가 재발사 교착의 원인이었다 — 적대 검수 확정 critical).

  // 모달이 닫히면 직행 호스트를 내린다(취소·발사 공통). 선택은 **청산하지
  // 않는다**(§3.10.18 E18-c ⑤ — 취소 후 재시도가 가능해야 한다).
  //
  // ⚠ 여기서 workspaceApi.clear() 를 부르면 안 된다(실측 확인된 경합):
  //   다중 발사(E18-e)는 batchGenerateQuestions 가 **큐잉만** 하고 실제 발사는
  //   다음 커밋의 effect 다. 그 발사 effect 보다 이 effect 가 나중에 돌더라도,
  //   행을 비우는 순간 아직 읽히지 않은 스테이징이 사라질 위험이 남는다.
  //   rows ≡ 선택 불변식은 **다음 직행 진입 시점의 clear()**
  //   (handleOpenQuestionGenFromSelection 초입)가 이미 보장하므로, 여기서
  //   비울 이유가 없다. 잔존 행은 렌더되지 않으므로 화면에도 새지 않는다.
  useEffect(() => {
    if (qgenModalOpen || !launchHostOpen) return;
    setLaunchHostOpen(false);
    setDirectTargetLocalIds([]);
  }, [qgenModalOpen, launchHostOpen]);
  // 구 openWorkbookFromRow(워크스페이스 행 CTA 진입)는 §3.10.18 E18-a 로 폐기 —
  // 워크북 진입은 하단 직행 CTA(handleOpenWorkbookFromSelection) 하나뿐이다.

  // ── 실패 문항 「같은 조건으로 다시 생성하기」(§3.8.9 도크 브리지) ──
  // 카드의 스탬프 신원(clientTempId ?? id)을 로컬 카드 id 로 되살려 재발사한다:
  //  · 그 id 는 이미 스탬프 보유분(도크 종결 필터를 통과해 보였던 카드)이라 새
  //    스탬프 기록 없이 진행·완료·실패 카드가 계속 필터를 통과한다.
  //  · fast: nonce 를 되살리면 낙관↔DB 병합(dbItemMatchesTemp)이 옛 실패 잡과
  //    새 잡을 모두 이 카드로 흡수한다(유령 중복 카드 방지). id 는 그대로 쓰고
  //    절대 재작성하지 않는다(함정 10).
  //  · createdAt 은 지금으로 갱신 — 과거 실패 잡 first-seen 게이트가 재발사 중
  //    카드를 실패로 되돌리는 오염을 막는다(generation-session-store 게이트).
  const retryQuestionItem = useCallback(
    (item: QueueItem) => {
      const config = item.config;
      const typeId = Object.keys(config.typeCounts).find(
        (t) => Number(config.typeCounts[t]) > 0,
      );
      // 세트(장문·국어 세트) 낙관 카드 등 유형 지정이 없는 작업은 이 경로로
      // 재현할 수 없다 — 오발사 대신 안내(§3.8.9 재발사는 fast 계보 전용).
      if (!typeId || config.mode !== "manual") {
        toast.error("이 작업은 같은 조건으로 다시 생성할 수 없습니다.");
        return;
      }
      const progressKey = typeId;
      const localId = item.clientTempId ?? item.id;
      const runningItem: QueueItem = {
        ...item,
        id: localId,
        clientTempId: undefined,
        createdAt: new Date().toISOString(),
        status: "generating",
        progress: { [progressKey]: "pending" },
        questions: [],
        questionIds: [],
        error: undefined,
        streamPreview: undefined,
      };
      setSessionQueue((prev) => [
        runningItem,
        ...prev.filter((q) => q.id !== item.id && q.id !== localId),
      ]);
      void (async () => {
        try {
          const result = await createQuestionGenerationJobSmart({
            passageId: item.passageId,
            mode: "MANUAL",
            count: 1,
            questionType: typeId,
            questionTypeSettings: (
              config.questionTypeSettings as
                | Record<string, unknown>
                | undefined
            )?.[typeId],
            difficulty: config.difficulty,
            customPrompt: config.prompt?.trim() || undefined,
            generationPlan:
              config.generationPlan === "PREMIUM" ? "PREMIUM" : "STANDARD",
            clientTempId: localId,
            onPreview: (preview) =>
              setSessionQueue((prev) =>
                prev.map((q) =>
                  q.id === localId ? { ...q, streamPreview: preview } : q,
                ),
              ),
          });
          setSessionQueue((prev) =>
            prev.map((q) =>
              q.id === localId
                ? {
                    ...q,
                    status: "done",
                    progress: { [progressKey]: "done" },
                    questions: Array.isArray(result.questions)
                      ? result.questions
                      : [],
                    questionIds: Array.isArray(result.questionIds)
                      ? result.questionIds
                      : [],
                    error: undefined,
                    streamPreview: undefined,
                  }
                : q,
            ),
          );
          toast.success("다시 생성했습니다.");
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "문제 생성에 실패했습니다.";
          setSessionQueue((prev) =>
            prev.map((q) =>
              q.id === localId
                ? {
                    ...q,
                    status: "error",
                    progress: { [progressKey]: "error" },
                    error: message,
                    streamPreview: undefined,
                  }
                : q,
            ),
          );
          toast.error("다시 생성에 실패했습니다.");
        }
      })();
    },
    [setSessionQueue],
  );

  // ── 도크 브리지 업링크 — 필드 전부 안정 참조(useCallback)라 마운트 시
  //    1회만 올라간다. 언마운트 시 null 로 회수. §3.9v2.5 로 일괄 실전
  //    발사·견적(use-studio-question-gen additive 필드)도 패스스루한다. ──
  const questionGenBridge = useMemo<QuestionGenBridge>(
    () => ({
      isStamped: qgen.isStampedQueueItem,
      retry: retryQuestionItem,
      batchGenerateQuestions: qgen.batchGenerateQuestions,
      batchQuestionCost: qgen.batchQuestionCost,
    }),
    [
      qgen.isStampedQueueItem,
      retryQuestionItem,
      qgen.batchGenerateQuestions,
      qgen.batchQuestionCost,
    ],
  );
  useEffect(() => {
    onQuestionGenBridge(questionGenBridge);
    return () => onQuestionGenBridge(null);
  }, [onQuestionGenBridge, questionGenBridge]);

  // 일괄 생성 패널 업링크(구 §3.9v2.5 onWorkspaceBridge)는 §3.10(E6)으로 폐기 —
  // 워크스페이스가 열려 있어도 우측은 지문별 도시에가 유지된다.

  // ── 자산 헤더(§3.10.14·§3.10.16-a) — intakeActive 는 intakeView 파생 ──
  const handleSelectView = useCallback((v: StudioAssetView) => {
    // 구 setWorkspaceOpen(false)(오버레이 닫기)는 §3.10.18 E18-a 로 소멸 —
    // 오버레이 자체가 없다.
    if (v !== "passages") {
      // 인테이크 집중 모드를 조용히 접는다 — IntakeSurface 의 pasteVisible
      // (탭 활성 && !overlay) 판정은 자산 뷰를 모르므로, 숨긴 래퍼 뒤에서
      // AI 지문 생성 포털 모달이 새는 것을 여기서 차단한다(함정 6 계열).
      // 보드 내용은 hidden 유지 마운트라 보존된다.
      setIntakeView("library");
    }
    setAssetView(v);
  }, []);
  const handleSelectIntake = useCallback((k: IntakeMethodKey) => {
    setAssetView("passages");
    setIntakeView("intake");
    setIntakeTab(k);
  }, []);
  // 지문 목록 툴바(정렬·검색 옆) 「지문 추가」 런처 — 참조 안정 엘리먼트.
  const addPassageAction = useMemo(
    () => <AddPassageLauncher onSelectIntake={handleSelectIntake} />,
    [handleSelectIntake],
  );
  const handleBackToLibrary = useCallback(() => {
    setIntakeView("library");
  }, []);

  // ── 조판 발사 뷰 강제(§3.10.17-e (k) → §3.10.23 E24 §1⑤) ────────────────
  // 반드시 handleSelectView(…) 경로를 **그대로 태운다**(별도 setState 조합 금지).
  // 뷰 전환의 부수 계약 두 가지가 그 함수 하나에 모여 있기 때문이다:
  //   · 인테이크 집중 모드 접기 — AI 지문 생성 포털 모달이 숨긴 래퍼 뒤에서
  //     새는 것을 차단한다.
  //   · 목록 최초 진입 fetch 발화 — assetView **전이**에서만 발화한다.
  // setAssetView 를 직접 부르는 우회 조합은 이 둘을 조용히 건너뛴다.
  //
  // ⚠⚠ **두 채널은 서로 다른 값을 넘긴다** — 문항 축 "exam", 학습지 축 "sheet".
  //   E22 구조에서는 두 채널이 **같은** "studio" 를 넘기고 composeMode 가 「어느
  //   조판을 켜려고 왔는가」를 들었다. E24 는 composeMode 를 폐지하고 가시 판정을
  //   뷰 값으로 되돌렸다:
  //       composeVisible      = examStudioOpen   && centerAssetView === "exam"
  //       sheetComposeVisible = sheetComposeOpen && centerAssetView === "sheet"
  //   즉 이제는 **채널 자체가 정보**다(분리 근거가 E22 때보다 오히려 강해졌다).
  //   아래 두 useEffect 는 인자 한 낱말만 다른 바이트 쌍둥이라, 검색·치환의 기본
  //   결과가 「둘 다 같은 값」이 되기 쉽다. 그러면 그 조판은 표면이 열려 있는데도
  //   **영원히 안 보인다**: 타입 에러 0 · 경고 0 · 콘솔 0 이고 화면만 안 바뀐다
  //   (사용자에겐 "버튼이 안 먹는다"). 두 채널을 하나로 합치는 것도 같은 이유로
  //   금지 — 정보가 소실돼 한쪽 조판이 죽는다.
  //
  // ⚠ 수신부는 **ref 보관**이어야 한다 — 문항 축 정본이 그렇다
  //   (studio-home-client.tsx registerComposeViewControl). useState 로 받으면
  //   올라간 화살표가 setState **업데이터**로 오인돼 control 대신
  //   handleSelectView 의 반환값(undefined)이 저장된다.
  useEffect(() => {
    if (!onComposeViewControl) return;
    onComposeViewControl(() => handleSelectView("exam"));
    return () => onComposeViewControl(null);
  }, [onComposeViewControl, handleSelectView]);

  // 학습지 조판 발사 뷰 강제(§3.10.21 E21-5) — 위 문항 축의 동형 복제이되
  // **착지 뷰만 다르다**("sheet"). 도시에 Sec「학습지」의 [학습지 조판]을 눌렀을
  // 때 오케스트레이터가 이 채널로 「학습지 조판」 뷰를 강제한다(G9: 도시에 행
  // 액션 2종이 각각 올바른 탭에 착지). 합본 조판 CTA 도 이 채널을 타므로
  // 사용자는 **같은 뷰에 머문다**(E24 §1⑥ 「튕김 0」).
  useEffect(() => {
    if (!onSheetComposeViewControl) return;
    onSheetComposeViewControl(() => handleSelectView("sheet"));
    return () => onSheetComposeViewControl(null);
  }, [onSheetComposeViewControl, handleSelectView]);

  // 범용 뷰 강제 채널(v4 §2.5 U6) — 셸의 openStudentsView("students") /
  // openAnalysisForStudent("analysis") 가 탄다. 위 두 조판 채널과 같은 이유로
  // handleSelectView 를 **그대로** 올린다(인테이크 접기·전이 fetch 부수 계약).
  useEffect(() => {
    if (!onAssetViewControl) return;
    onAssetViewControl(handleSelectView);
    return () => onAssetViewControl(null);
  }, [onAssetViewControl, handleSelectView]);

  // 선택 0에서 CTA 를 누르면 카드 글로우로 선택을 유도한다(그리드 하단 CTA 관용구).
  const gridBoxRef = useRef<HTMLDivElement>(null);
  const hintSelectCards = useCallback(() => {
    const root = gridBoxRef.current;
    const cards = root
      ? Array.from(
          root.querySelectorAll<HTMLElement>("[data-drag-item-id]"),
        ).slice(0, 24)
      : [];
    triggerHintGlow(cards);
  }, []);

  // 벌크 삭제 래퍼는 §3.10.15(E14)로 폐기 — 파괴적 삭제는 지문 등록·문제
  // 생성 화면에 남는다(스튜디오 벌크 툴바 자체가 사라졌다).

  // 구 워크스페이스 판(PassageWorkspace overlay)은 §3.10.18 E18-a 로 통째 폐기.
  // 그 판이 소유하던 편집 기능은 행 인라인 편집기가 승계했고, 행 CTA 2분기는
  // 하단 직행 CTA 2버튼이 승계했다.

  // ── 행 인라인 지문 수정 확장 슬롯(§3.10.18 E18-d/h) ──────────────────────
  // 참조 안정 필수(memo 방어선 + 그리드가 렌더마다 이 함수를 호출한다).
  // 확장 노드는 펼친 행 1개에서만 생성된다 — 미확장 행의 렌더 비용 0.
  // 편집기가 올려주는 미저장 플래그 — 부모가 몰고 가는 접기 경로의 확인 관문
  // 재료(적대 검수 확정 critical: 아이콘 재클릭·다른 행 펼침·행 더블클릭/Enter
  // 는 편집기 내부 handleClose 를 지나지 않아 편집분이 조용히 사라졌다).
  const editorDirtyRef = useRef(false);
  const handleEditorDirtyChange = useCallback((d: boolean) => {
    editorDirtyRef.current = d;
  }, []);
  const handleEditPassageInline = useCallback((p: PassageItem) => {
    // AI 추출 미승격 draft 는 아직 Passage 가 아니다 — 인라인 편집기의 저장
    // (updatePassageBody)이 academyId 스코프 updateMany 에서 count 0 으로 떨어져
    // **항상 실패**한다(적대 검수 확정 major). 승격 관문이 있는 상세 모달로
    // 보내 원문 확인·검수를 먼저 하게 한다.
    if (isDraftPseudoId(p.id)) {
      toast.info("검수 전 자료입니다 — 상세에서 원문을 확인해 주세요.");
      setDetailPassage(p);
      setLastViewedPassageId(p.id);
      return;
    }
    setExpandedPassageId((prev) => {
      if (prev === null) return p.id;
      // 같은 행 재클릭(접기)이든 다른 행 펼침(전환)이든, 열려 있던 편집기는
      // 언마운트되어 편집분이 사라진다 — 동일한 확인을 여기서 받는다.
      if (editorDirtyRef.current) {
        const ok = window.confirm(
          "저장하지 않은 편집 내용이 있습니다. 닫으면 사라져요. 계속할까요?",
        );
        if (!ok) return prev;
        editorDirtyRef.current = false;
      }
      return prev === p.id ? null : p.id;
    });
  }, []);
  const handleInlineEditorSaved = useCallback(
    (passageId: string, next: { content: string }) => {
      // 제목은 편집기가 건드리지 않는다(행의 연필 소관) — 본문만 반영한다.
      setPassages((prev) =>
        prev.map((p) =>
          p.id === passageId ? { ...p, content: next.content } : p,
        ),
      );
    },
    [setPassages],
  );
  const handleCloseInlineEditor = useCallback(
    () => setExpandedPassageId(null),
    [],
  );
  // ⚠ useCallback 필수 — memo(PassageListRow) 의 prop 으로 흐른다. 인라인
  //   화살표로 두면 렌더마다 새 참조가 되어 행 memo 가 통째로 무력화된다
  //   (2026-08-15 마키 렉 수술).
  const handlePassageRenamed = useCallback(
    (passageId: string, title: string) => {
      setPassages((prev) =>
        prev.map((p) => (p.id === passageId ? { ...p, title } : p)),
      );
    },
    [setPassages],
  );
  const renderRowExpansion = useCallback(
    (p: PassageItem) =>
      p.id === expandedPassageId ? (
        <LibraryInlinePassageEditor
          passage={p}
          onSaved={handleInlineEditorSaved}
          onClose={handleCloseInlineEditor}
          onDirtyChange={handleEditorDirtyChange}
          onVariantSaved={() => {
            void loadPassages();
            onLibraryChanged();
          }}
        />
      ) : null,
    [
      expandedPassageId,
      handleCloseInlineEditor,
      handleEditorDirtyChange,
      handleInlineEditorSaved,
      loadPassages,
      onLibraryChanged,
    ],
  );

  // 인라인 JSX prop 은 렌더마다 새 element — memo(PassageCardGrid) 를 무력화한다.
  const loadingCardsNode = useMemo(
    () => <ExtractionLoadingCards pending={intake.extractionPending} />,
    [intake.extractionPending],
  );

  const passageScopeControl = useMemo(
    () => (
      <div
        role="group"
        aria-label="지문함 범위"
        className="grid max-w-full shrink-0 grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1"
      >
        {[
          { key: "class", label: "이 클래스", count: classScopeCount, active: scopeOnly },
          { key: "all", label: "전체 자료", count: passages.length, active: !scopeOnly },
        ].map(({ key, label, count, active }) => (
          <button
            key={key}
            type="button"
            aria-label={`${label} (${count})`}
            aria-pressed={active}
            onClick={() => setScopeOnly(key === "class")}
            className={
              "flex min-h-9 min-w-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[12px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 " +
              (active
                ? "border-blue-200 bg-white text-blue-700 shadow-sm"
                : "border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900")
            }
          >
            <span>{label}</span>
            <span
              aria-hidden="true"
              className={
                "inline-flex min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold leading-none " +
                (active ? "bg-blue-50 text-blue-700" : "bg-slate-200/60 text-slate-500")
              }
            >
              {count}
            </span>
          </button>
        ))}
      </div>
    ),
    [scopeOnly, classScopeCount, passages.length],
  );

  // 빈 클래스·등록 목록 로딩 중에는 그리드가 없으므로 범위 전환을 별도로 유지한다.
  const showScopeWithoutGrid = classCtx && scopeOnly && (
    classCtx.registeredLoading || (!lib.loadingPassages && classScopeCount === 0)
  );

  // ── 내 지문함 판 (library 슬롯) ──
  const selectedCount = selectedIds.size;
  const ctaDisabled = selectedCount === 0 || lib.passageBulkAction !== null;
  const ctaBusy = workbookBusy || questionGenBusy;
  const libraryNode = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 클래스 등록·해제는 지문을 선택한 동안에만 표시한다. 범위 선택은 폴더 툴바. */}
      {classCtx && selectedCount > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-1.5">
          <span className="min-w-0 flex-1" aria-hidden="true" />
          {/* 「클래스에서 빼기 (K)」 보조 버튼(§3.10.4) — 선택 중 등록 지문이
              있을 때만. aria-disabled + onClick 초입 return(§3.9v2 정본). */}
          {onUnregisterFromClass && selectedRegisteredIds.length > 0 ? (
            <button
              type="button"
              aria-disabled={unregisterBusy}
              onClick={() => {
                if (unregisterBusy) return;
                void handleUnregisterSelected();
              }}
              title={`선택한 ${selectedRegisteredIds.length}개 지문을 「${classCtx.className}」에서 뺍니다 (연결만 해제)`}
              className={
                "flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[11.5px] font-semibold text-red-600 shadow-sm transition-colors " +
                (unregisterBusy
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-red-300 hover:bg-red-50")
              }
            >
              {unregisterBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FolderMinus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              클래스에서 빼기 ({selectedRegisteredIds.length})
            </button>
          ) : null}
          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleRegisterSelected()}
              disabled={registerBusy}
              title={`선택한 ${selectedCount}개 지문을 「${classCtx.className}」에 담습니다`}
              className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11.5px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {registerBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              클래스에 담기 ({selectedCount})
            </button>
          ) : null}
        </div>
      ) : null}

      <div ref={gridBoxRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showScopeWithoutGrid ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 pt-3 pb-1.5">
            {passageScopeControl}
            {addPassageAction}
          </div>
        ) : null}
        {classCtx && scopeOnly && classCtx.registeredLoading ? (
          /* 등록 지문 로딩 스켈레톤(§3.10.4) — 기본 스코프(이 클래스)의 첫
             프레임에 registeredIds 미도착으로 "0개" 빈 그리드가 깜빡이는
             것을 가린다. 행 스켈레톤은 listRows 행 높이 계열(h-12). */
          <div
            aria-busy="true"
            className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-5 py-4"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-12 shrink-0 animate-pulse rounded-lg border border-slate-100 bg-slate-50"
              />
            ))}
          </div>
        ) : classCtx &&
          scopeOnly &&
          !lib.loadingPassages &&
          classScopeCount === 0 ? (
          /* 이 클래스 빈 상태(§3.10.14 개정) — 등록 지문 0개. 구 "위 탭에서
             새로 만드세요" 자구는 탭이 사라져 폐기 — 「지문 추가」 3방법을
             그 자리에서 바로 고르게 한다(헤더 팝오버와 같은 목적지). */
          /* 26-08-15 지시("완전 빡 보이게"): 구 280px 폭 h-9 아웃라인 버튼 3개
             → **대형 액션 카드 3장**. 빈 상태는 이 화면에서 사용자가 다음
             행동을 고르는 유일한 지점이라 시각 무게를 여기에 몰아준다.
             폭 적응은 뷰포트가 아니라 **컨테이너 쿼리**(@container) — 조판 중
             중앙 열이 420px 로 접혀도 1열로 정상 낙하한다(뷰포트 미디어쿼리는
             넓은 화면의 좁은 열에서 3열을 강제해 붕괴한다 — §3.8.11 함정 계열).
             설명 문구는 헤더 팝오버(source-switcher INTAKE_METHODS)와 동일
             자구로 맞춘다(같은 목적지 = 같은 표현). */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-8">
            <div className="flex flex-col items-center gap-2.5">
              <span
                className="flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-500 ring-1 ring-inset ring-blue-100"
                aria-hidden="true"
              >
                <FileText className="size-8" />
              </span>
              <p className="text-center text-[19px] font-extrabold tracking-tight text-slate-800 break-keep">
                아직 이 클래스에 담긴 지문이 없습니다
              </p>
              <p className="text-center text-[13px] font-medium text-slate-400 break-keep">
                {/* §M off 면 배포 없는 자구 — 실행 동선이 조판 단독형이라
                    다음 행동(조판·인쇄)을 그대로 말한다(반토막 금지 T4). */}
                {SHOW_MOBILE
                  ? "지문을 추가하면 문제·학습지를 만들어 배포할 수 있어요"
                  : "지문을 추가하면 문제·학습지를 만들어 조판·인쇄할 수 있어요"}
              </p>
            </div>
            <div className="@container w-full max-w-[900px]">
              <div className="grid grid-cols-1 gap-3 @[620px]:grid-cols-3">
                {(
                  [
                    {
                      key: "exam" as const,
                      label: "기출 지문에서 가져오기",
                      desc: "기출 시험지에서 지문을 골라 담습니다",
                      Icon: GraduationCap,
                    },
                    {
                      key: "paste" as const,
                      label: "직접 입력·AI 지문 생성",
                      desc: "본문 붙여넣기 · AI 지문 생성으로 작성합니다",
                      Icon: ClipboardPaste,
                    },
                    {
                      key: "upload" as const,
                      label: "PDF·이미지 업로드",
                      desc: "PDF·이미지에서 AI가 지문을 추출합니다",
                      Icon: ImageUp,
                    },
                  ]
                ).map(({ key, label, desc, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectIntake(key)}
                    className="group/intake flex cursor-pointer items-center gap-3.5 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-500 hover:bg-blue-50/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 @[620px]:flex-col @[620px]:items-start @[620px]:gap-3 @[620px]:p-5"
                  >
                    <span
                      className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover/intake:bg-blue-600 group-hover/intake:text-white"
                      aria-hidden="true"
                    >
                      <Icon className="size-6" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 text-[15px] font-extrabold leading-snug tracking-tight text-slate-800 break-keep transition-colors group-hover/intake:text-blue-700">
                          {label}
                        </span>
                        <ArrowRight
                          className="size-4 shrink-0 text-blue-400 opacity-0 transition-all group-hover/intake:translate-x-0.5 group-hover/intake:opacity-100"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="text-[12px] leading-relaxed text-slate-400 break-keep">
                        {desc}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <span className="text-center text-[12px] leading-relaxed text-slate-400 break-keep">
              이미 만든 지문은 위 「전체 자료」에서 골라 담을 수 있어요
            </span>
          </div>
        ) : (
          <PassageCardGrid
            // 라벨 정합(감사 B1·B2 소비) — 브레드크럼 루트 라벨을 스튜디오 정본
            // ("지문관리" — §3.10.14 개칭)으로 주입. 기본값 경로는 기존 호스트 불변.
            breadcrumbRootLabel="지문관리"
            // 세로 공간 우선 — 폴더 칩은 접힌 채 시작(펼치기 한 클릭) + 전폭 가로
            // 행 목록(§3.8.4 — 본문 미리보기 없음·제목 무절단·이력 클러스터).
            initialFolderCollapsed
            listRows
            // 「담김」 배지(§3.10.4) — 클래스 등록 지문 표시(listRows 전용 additive)
            classBadgePassageIds={classCtx ? classCtx.registeredIds : undefined}
            // 스코프 전환 시 모바일 페이지 1로 리셋(§3.10.4 — resetKey 토큰)
            mobilePageResetToken={
              classCtx ? (scopeOnly ? "scope:class" : "scope:all") : undefined
            }
            onLazyLoadQuestions={handleLazyLoadQuestions}
            // 「지문 추가」 런처(26-09-01) — 구 소스 스위처 sticky 클러스터에서
            // 정렬·검색 옆으로 이사(사용자 지시). handleSelectIntake 는
            // useCallback([]) 안정 참조라 이 엘리먼트도 useMemo 로 고정한다.
            toolbarAction={addPassageAction}
            toolbarScope={classCtx ? passageScopeControl : undefined}
            // 이력 팝오버 문제 행 클릭 = 상세 모달(§3.9.5① — 세터 안정 참조)
            onOpenQuestionDetail={setDetailQuestion}
            loadingCards={loadingCardsNode}
            passages={passages}
            filteredPassages={scopedFilteredPassages}
            filterOptions={lib.filterOptions}
            collections={lib.collections}
            loadingPassages={lib.loadingPassages}
            passageSearch={lib.passageSearch}
            setPassageSearch={lib.setPassageSearch}
            filterSchool={lib.filterSchool}
            setFilterSchool={lib.setFilterSchool}
            filterGrade={lib.filterGrade}
            setFilterGrade={lib.setFilterGrade}
            filterSemester={lib.filterSemester}
            setFilterSemester={lib.setFilterSemester}
            analysisStatusFilter={lib.analysisStatusFilter}
            setAnalysisStatusFilter={lib.setAnalysisStatusFilter}
            passageSortOrder={lib.passageSortOrder}
            setPassageSortOrder={lib.setPassageSortOrder}
            passageStatusCounts={lib.passageStatusCounts}
            activeFilterCount={lib.activeFilterCount}
            selectedCollectionId={lib.selectedCollectionId}
            setSelectedCollectionId={lib.setSelectedCollectionId}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            toggleCheckbox={lib.toggleCheckbox}
            selectAll={selectAllVisible}
            deselectAll={lib.deselectAll}
            // §3.10.15(E14) — 스튜디오 벌크 툴바 정화: 이동/복사·삭제·검수완료
            // 벌크 3종은 prop 미전달로 통째 미렌더(canManageSelectedPassages
            // AND 게이트). 조직 축은 「클래스에 담기/빼기」 스트립이 담당하고,
            // 파괴적 삭제·폴더 벌크는 지문 등록·문제 생성 화면에 남는다.
            // 카드 단위 드래그→폴더 이동/복사·폴더 생성/이름변경은 유지.
            onMovePassagesToCollection={lib.handleMovePassagesToCollection}
            onCopyPassagesToCollection={lib.handleCopyPassagesToCollection}
            onCreateCollection={lib.handleCreatePassageCollection}
            onRenameCollection={intake.handleRenameCollection}
            onRemovePassagesFromFolder={intake.handleRemovePassagesFromFolder}
            passageBulkAction={lib.passageBulkAction}
            genMode="manual"
            totalQuestions={0}
            handleBatchGenerate={NOOP_BATCH_GENERATE}
            freshAnalysisPassageIds={lib.freshAnalysisPassageIds}
            onFreshAnalysisAcknowledged={lib.acknowledgeFreshAnalysisPassage}
            // §3.10.15(E14) — 행별 검수 토글(3렌더 경로)·미검수 붉은 테두리,
            // 학교/분석상태 필터 팝오버+툴바 검색 쌍을 스튜디오에서만 숨긴다
            // (additive prop — 타 호스트 기본값 경로 픽셀 불변). 살아남는
            // 유일 쌍 = 폴더 헤더의 정렬+검색 팝오버.
            hideReviewToggle
            hideToolbarFilterSearch
            // 벌크·필터가 없는 스튜디오에선 전체선택이 행을 독점(§3.10.17-c)
            inlineSelectAllInHeader
            // 툴바 일괄 「학습 만들기」 자리는 §3.8.5 로 폐기 — onBulkGenerateLearning
            // 미전달이면 툴바 버튼 자체가 렌더되지 않는다(생성 진입은 워크스페이스
            // 행 CTA 로 일원화, 담기는 하단 단일 primary CTA).
            handleOpenAnalysisModal={handleOpenAnalysisModal}
            onViewPassageContent={handleViewPassageContent}
            onPassageRenamed={handlePassageRenamed}
            lastViewedPassageId={lastViewedPassageId}
            openPassageDetailId={detailPassage?.id ?? null}
            // 행 액션 = 「지문 수정」 + 행 아래 인라인 편집기(§3.10.18 E18-d/f).
            // 이 3종은 스튜디오만 넘긴다 — 타 호스트는 기존 「상세보기」 그대로.
            rowPrimaryAction="edit"
            onEditPassageInline={handleEditPassageInline}
            renderRowExpansion={renderRowExpansion}
            // 「생성 중」 활동 표식(§3.10.20) — 행 테두리 링 + 메타줄 라벨.
            // 오케스트레이터가 시그니처 메모로 참조를 고정해 내린다.
            rowActivity={passageActivity}
          />
        )}
      </div>

      {/* ── 그리드 하단 전폭 CTA(§3.10.18 E18-b) — 생성 2분기 직행 ──
          구 단일 「워크스페이스에 담기」 폐기. 토큰은 구 워크스페이스 행 푸터
          정본(workspace-passage-row.tsx:2687-2741)을 그대로 승계한다:
          grid-cols-2 gap-1.5 · 각 h-10 rounded-lg bg-blue-600 text-[13px] font-bold.
          ⚠ native disabled 금지 — aria-disabled 라야 선택 0에서 클릭이 살아
          hintSelectCards() 글로우가 발화한다(triggerHintGlow 계약). ── */}
      <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3">
        {/* data-tour="cta-generate-pair": 온보딩 투어(E26) — 두 생성 버튼을 한
            컷아웃으로 비추는 스텝(ch2-scope)의 앵커. 정적 속성, memo 무접촉. */}
        <div data-tour="cta-generate-pair" className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-tour="cta-sheet-generate"
            aria-disabled={ctaDisabled || ctaBusy}
            onClick={() => {
              if (lib.passageBulkAction !== null || ctaBusy) return;
              if (selectedCount === 0) {
                hintSelectCards();
                return;
              }
              void handleOpenWorkbookFromSelection();
            }}
            // [F3 26-08-31] reading 합류로 4상품 자구. ⚠ 이 title 은 프로브 셀렉터다
            // (.tmp-studio-qa/ws-gate·ws-launch-smoke·_probe-modal-width 의
            //  button[title=…]) — 바꾸면 세 하네스를 같은 커밋에서 함께 바꿔라.
            title="기본·실전·파이널·직독직해 학습지를 만듭니다"
            className={
              "flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-white shadow-sm transition-colors " +
              (ctaDisabled || ctaBusy
                ? "cursor-not-allowed bg-blue-300 shadow-none"
                : "cursor-pointer bg-blue-600 hover:bg-blue-700")
            }
          >
            {workbookBusy ? (
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="whitespace-nowrap">학습지 생성</span>
            {selectedCount > 0 ? (
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[12px] font-bold tabular-nums">
                {selectedCount}개
              </span>
            ) : null}
          </button>
          <button
            type="button"
            data-generate-tour="row-generate-button"
            aria-disabled={ctaDisabled || ctaBusy}
            onClick={() => {
              if (lib.passageBulkAction !== null || ctaBusy) return;
              if (selectedCount === 0) {
                hintSelectCards();
                return;
              }
              void handleOpenQuestionGenFromSelection();
            }}
            title="이 지문의 유형을 선택하고 문제를 생성합니다"
            className={
              "flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-white shadow-sm transition-colors " +
              (ctaDisabled || ctaBusy
                ? "cursor-not-allowed bg-blue-300 shadow-none"
                : "cursor-pointer bg-blue-600 hover:bg-blue-700")
            }
          >
            {questionGenBusy ? (
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="whitespace-nowrap">실전 문제 생성</span>
            {selectedCount > 0 ? (
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[12px] font-bold tabular-nums">
                {selectedCount}개
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );

  // ── 자산 뷰 카운트 — 미조회는 null(스위처가 숫자 생략), 재조회 중엔 직전 값.
  // §3.10.23 E24: 필이 3개로 접히면서 카운트도 **2개뿐**이다 —
  //   questionCount → 「시험지 조판」 필 · worksheetCount → 「학습지 조판」 필.
  // 구 studioCount(두 축 합)는 조판실 필과 함께 삭제됐다(U1 이 스위처의 prop 도
  // 지웠다). ⚠ 되살리지 마라: 학습지 조판 뷰의 목록은 두 축 병합이라 합계를
  // 실으면 문항이 **양쪽 필에 계상**돼 「학습지 조판 (167)」·「시험지 조판 (159)」
  // 처럼 두 숫자가 겹쳐 보이고, 사용자가 알고 싶은 「어느 쪽에 뭐가 있나」가
  // 오히려 흐려진다. 라벨은 **그 뷰의 주 재료**만 센다 — 병합 사실은 필의
  // title/aria-label 이 문장으로 고지한다(E24 §1⑦-b).
  const questionCount =
    questionsState.status === "ready" || questionsState.rows.length > 0
      ? questionsState.rows.length
      : null;
  const worksheetCount =
    worksheetsState.status === "ready" || worksheetsState.rows.length > 0
      ? worksheetsState.rows.length
      : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ── 자산 헤더(§3.10.23 E24) — 3필 [지문관리 | 학습지 조판 | 시험지 조판]
          + 「지문 추가」 팝오버. 워크스페이스 필은 §3.10.18 E18-a 로, 구
          [문제관리 | 학습지 관리 | 조판실] 3필은 E24 로 폐기됐다.
          구 studioCount prop 은 U1 이 스위처에서 지웠다 — 다시 넘기지 마라. ── */}
      <SourceSwitcher
        assetView={assetView}
        onSelectView={handleSelectView}
        intakeActive={assetView === "passages" && intakeView === "intake"}
        intakeTab={intakeTab}
        onSelectIntake={handleSelectIntake}
        onBackToLibrary={handleBackToLibrary}
        libraryCount={passages.length}
        questionCount={questionCount}
        worksheetCount={worksheetCount}
        // 「학생 관리」 필 건수(v4 §3 U6-1) — 셸이 클래스 행에서 내린 원시값.
        studentCount={studentCount}
        // §M 조판 유도 — 생성 완료 축의 필이 비활성일 때만 펄스(스위처 내부 판정).
        nudgeSheet={nudgeSheet}
        nudgeExam={nudgeExam}
      />
      {/* 지문관리 뷰 — hidden 유지 마운트(추출·붙여넣기 진행 보존, 슬롯 계약).
          hidden ↔ flex 는 문자열 전체 교체(디스플레이 유틸 충돌 금지). */}
      <div className={assetView === "passages" ? "min-h-0 flex-1" : "hidden"}>
        <IntakeSurface
          intakeView={intakeView}
          setIntakeView={setIntakeView}
          intakeTab={intakeTab}
          setIntakeTab={setIntakeTab}
          // 탭 스트립은 소스 스위처가 대체한다(§3.8.2) — 본문 슬롯·hidden 유지
          // 마운트·overlay·pasteVisible 판정(함정 6)은 그대로.
          hideTabBar
          libraryCount={passages.length}
          libraryLabel="지문관리"
          onSubmitPastedRows={intake.handleCreatePastedPassages}
          pasteSaving={intake.pasteSaving}
          // 3분할 중앙(~560px)은 뷰포트 미디어쿼리가 넓다고 판단하는 좁은 열 —
          // 직접 입력 보드를 세로 적층으로 강제한다(2026-08-10 데스크톱 붕괴 실측).
          stackedPasteBoard
          // 고정 높이 중앙 열 — 보드가 잘리는 대신 내부 스크롤로 하단 요소
          // ([+ 지문 추가]·가이드)에 항상 도달 가능하게(2026-08-11 검수 A2).
          scrollPasteBoard
          showUploadTab
          // 좁은 중앙 열에서는 튜토리얼 팝업(직접 입력·업로드)이 입력 전면을
          // 덮으므로 억제한다(2026-08-10 적대 감사 실측).
          suppressTutorial
          // 인테이크 간소화(§3.9v2.8 D9·D10 — 스튜디오 호스트 한정 additive):
          // 「사용 순서」 가이드 박스 대신 muted 1줄 + AI 지문 생성 보드 간소판
          // (분량·편수만). IntakeSurface 가 MultiPassagePaste →
          // TextInputBoard/AuthoringBoard 체인으로 내려보낸다.
          hideEmptyGuide
          simplifiedAuthoring
          // 「지문관리」 개칭(§3.10.14) — 직접 입력 시작 CTA 라벨 패스스루
          pasteStartLabel="다음으로 (지문관리)"
          // overlay/onDismissOverlay/workspaceActive/onReopenWorkspace 4종은
          // §3.10.18 E18-a 로 폐기 — 오버레이가 없으므로 미전달이 곧 정답이다.
          // 부수 효과로 IntakeSurface 의 pasteVisible(= 탭 활성 && !overlay)이
          // 항상 참이 되어 붙여넣기 보드가 정상 표시된다(함정 6 소멸).
          upload={
            <GenerateUploadPanel
              onBegin={intake.handleExtractionBegin}
              onResult={intake.handleExtractionResult}
              inFlightCount={intake.extractionPending.length}
              // 업로드 탭 튜토리얼 팝업도 같은 이유로 억제(IntakeSurface 의
              // suppressTutorial 은 직접 입력에만 흐른다 — 업로드는 직접 전달).
              suppressTutorial
              // 좁은 중앙 열: 우측 340px 가이드 aside 를 세로 적층으로 접어
              // 드롭존 187px 붕괴를 막는다(2026-08-10 실측).
              stacked
              // 「지문관리」 개칭(§3.10.14) — 추출 시작 CTA 라벨 패스스루
              pickLabel="다음으로 (지문관리)"
            />
          }
          examBrowser={
            <ExamPassageLibrary
              onPick={handleImportExamPicksWithBadge}
              busy={intake.examImporting}
              pickLabel="다음으로 (지문관리)"
              headerHint="고른 지문이 지문관리에 담깁니다"
              // 좁은 중앙 열: 필터 바 lg 한 줄 강제 해제 — facet 행 → 검색·
              // 토글 행 줄바꿈 허용(검색 짜부·토글 절단 실측).
              narrowHost
              // 콤팩트 브라우저(§3.8.3) — 시험지 전폭 행 리스트(1클릭 드릴인)
              // + 지문 배지 전용 행(본문 미리보기 없음).
              compactBrowser
              // 담김 배지(2026-08-11, 2026-08-15 클래스 스코프화) — 「담김」은
              // **선택한 클래스 기준**, 지문함에만 있는 기출은 「지문함」으로
              // 갈라 표시한다. 클래스 미선택(전체 자료)이면 지문함 기준 「담음」.
              importedExamIds={examBadgeSets.imported}
              libraryOnlyExamIds={examBadgeSets.libraryOnly}
              importScopeLabel={classCtx?.className}
              // 마키(드래그) 선택 — deferCommit(드래그 중 리액트 무접촉).
              enableDragSelect
            />
          }
          library={libraryNode}
        />
      </div>

      {/* ── 목록판(§3.10.23 E24 §1④) — 두 조판 뷰가 **공유하는 단일 인스턴스**
          ─────────────────────────────────────────────────────────────────────
          구 3판(ClassQuestionsPane · ClassWorksheetsPane · ComposerListPane)이
          hidden 으로 공존하던 구간은 끝났다. 레거시 2판은 **파일째 삭제**됐고,
          hidden 공존 3판 → 1판으로 DOM 비용을 회수한다 — 사용자가 말한
          「복잡함」의 물리적 해소가 정확히 이것이다.
          삭제 근거: 두 판을 남겨 두던 유일한 이유는 「뷰 강제 채널의 착지점 +
          기존 프로브 셀렉터의 상태 도메인」이었는데, 채널이 "sheet"/"exam" 으로
          재조준되고 프로브가 `data-asset-view` 셀렉터로 이행되면 그 근거가
          둘 다 소멸한다.

          ⚠ 인스턴스는 반드시 **하나**다. 뷰별로 둘로 쪼개면 (a) 판 로컬 필터·
            스크롤·렌더캡이 뷰마다 갈리고 (b) 같은 rows 를 두 벌 그려 방금 회수한
            DOM 비용이 그대로 돌아온다.

          ⚠ 마운트 게이트는 `sheet || exam` 두 뷰 **모두**다. 한 뷰만 넣으면 반대 뷰가
            빈 화면이 된다. hidden 유지 마운트인 이유도 그대로 — 언마운트로 바꾸면
            탭을 한 번 오가는 것만으로 필터·스크롤이 날아간다(G6·G7 왕복 게이트).

          ⚠ **key={classId} 리마운트 규약 유지**(무회귀 계약 6). key 에 뷰를 섞지 마라 —
            탭을 한 번 오가는 것만으로 판 로컬 필터(종류 세그먼트·지문·검색·2층 5종)·
            스크롤 위치·렌더캡이 전부 초기화된다. 클래스 전환 축의 자동 초기화(G10)만
            이 key 가 담당한다. ── */}
      {classCtx ? (
        <div
          ref={composerListHostRef}
          className={
            (assetView === "sheet" || assetView === "exam") && !examBankMode
              ? "flex min-h-0 flex-1 flex-col"
              : "hidden"
          }
        >
          <ComposerListPane
            key={classCtx.classId}
            classId={classCtx.classId}
            // 축 고정(E24 §1④) — 시험지 조판 뷰는 **문항만**, 학습지 조판 뷰는
            // 자유 축(학습지 + 문항 병합)이다. 학습지 뷰에서 문항을 숨기는
            // 대칭 설계("worksheet" 고정)는 **금지** — 사용자가 극찬한 합본
            // (「학습지 뒤에 문항 이어붙이기」)의 **재료 창구**가 사라진다.
            // null 을 명시적으로 넘기는 이유: 판이 `lockedKind ?? kindFilter` 로
            // override 하므로 undefined 와 동치지만, 「이 뷰는 일부러 자유 축」
            // 이라는 결정을 코드에 남긴다(다음 사람이 「빠트렸나」로 오인하지 않게).
            lockedKind={assetView === "exam" ? "question" : null}
            questionsState={questionsState}
            worksheetsState={worksheetsState}
            onRefreshQuestions={refreshQuestions}
            onRefreshWorksheets={refreshWorksheets}
            pickedQuestionIds={flatPickedIds}
            pickedSheets={sheetPicked ?? EMPTY_SHEET_PICKED}
            onCommit={handleComposerCommit}
            onOpenQuestion={onOpenQuestionById}
            // 기출 문항 은행 진입(§8.1) — 판은 문항 축(qAxis) 표면에만 그린다.
            // 두 조판 뷰가 같은 인스턴스를 공유하므로 뷰로 갈라 내리지 않는다:
            // 학습지 조판 뷰는 카드 모드라 2층 바 자체가 없고, 빈 상태 CTA 는
            // 「아직 조판할 문항이 없습니다」(qOnly) 분기에서만 의미가 있다.
            onOpenExamBank={openExamBank}
            examBankSummary={EXAM_BANK_SUMMARY}
            // 좁은 폭(@container 34rem 미만)의 짧은 보조 문구 — 원시 string(memo 계약).
            examBankSummaryShort={EXAM_BANK_SUMMARY_SHORT}
            onDeploySheet={onSheetDeploy ? handleSheetDeployRow : undefined}
            onComposeSheet={onSheetCompose ? handleSheetComposeRow : undefined}
            // [E31] 되짚기 3종 패스스루(위 prop 선언 주석). 이 판은 값을 해석하지
            // 않는다 — 해석은 판정 재료(pickedSheets)를 가진 ComposerListPane 소관.
            activeSheetId={sheetActiveId}
            revealPassageId={sheetRevealPassageId}
            revealSeq={sheetRevealSeq}
          />
        </div>
      ) : null}

      {/* ── 인라인 기출 브라우저(docs/gichul-question-bank-spec.md §11.2 「자리」) ──
          시험지 조판 뷰의 **같은 열**에, ComposerListPane 의 형제로 그린다(DragSelect
          밖 — 마키가 은행 행을 집지 않게). 기출 모드면 위 목록판이 hidden 으로 내려가고
          이 판이 그 자리를 쓴다. 한 번 열린 뒤엔 hidden 유지 마운트(examBankMounted) —
          필터·페이지가 「← 내 문항으로」 왕복에 살아남는다(§11.3). key 없음: 클래스
          전환은 호스트 상태(bankMap·pending·failed) 청산으로 받고 패널 필터는 클래스와
          무관하다(§11.3 「클래스 바뀌면 유지」). 마운트 조건은 examBankMounted **만** —
          classCtx 를 게이트에 섞으면 클래스 null 전이(선택 해제)에서 패널이 언마운트돼
          필터가 날아간다. 클래스 없음은 계약의 scopeLabel=null 분기(패널이 체크를
          비활성)로 받고, 그때 뷰는 상류 불변식이 passages 로 내리므로 hidden 은 유지된다. ── */}
      {examBankMounted ? (
        <div
          ref={examBankPanelHostRef}
          className={
            examBankMode ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <ExamBankInlinePanel
            className="min-h-0 flex-1"
            scopeLabel={classCtx?.className ?? null}
            pickedBankIds={pickedBankIds}
            pendingBankIds={pendingBankIds}
            failedBankIds={failedBankIds}
            bankTotal={EXAM_BANK_TOTAL}
            onTogglePick={handleExamBankTogglePick}
            onTogglePickMany={handleExamBankTogglePickMany}
            onBack={closeExamBank}
          />
        </div>
      ) : null}

      {/* ── 「시험 분석」 뷰(26-09-01, 정본 docs/studio-exam-analysis-integration.md)
          hidden 유지 마운트 — 인테이크 업로드 진행이 뷰 전환에 살아남는다(지문관리
          IntakeSurface 와 같은 규약). 폴은 판 내부에서 active 게이트(뷰 가시일
          때만). key={classId} 리마운트는 ComposerListPane 무회귀 계약 6 과 동일
          축 — 클래스 전환만 판 로컬 상태(인테이크 메타·모달)를 초기화한다.
          classCtx 게이트: 분석 뷰는 클래스 문맥 필수(불변식 「클래스 null →
          passages」가 상류에서 이미 보장하지만 이중 안전). */}
      {classCtx ? (
        <div
          className={
            assetView === "analysis" ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <StudioAnalysisPane
            key={classCtx.classId}
            active={assetView === "analysis"}
            onSelect={onAnalysisSelect}
            activeRowId={analysisActiveRowId}
            // v4 채널 4종(§2.5 U4 행) — 후보 선택·하이라이트·학생 관리 건너오기.
            onSelectCandidate={onAnalysisSelectCandidate}
            activeCandidateId={analysisActiveCandidateId}
            focusAnalysisId={analysisFocusId}
            onFocusConsumed={onAnalysisFocusConsumed}
            // 감독 배선(26-09-02): 후보 「이 클래스 우선 + 나머지 접이」 축.
            classId={classCtx.classId}
          />
        </div>
      ) : null}

      {/* ── 「학생 관리」 뷰(v4 26-09-02, docs/exam-analysis-v4-spec.md §3 U6-4) ──
          시험 분석 판과 같은 hidden 유지 마운트 + key={classId} 리마운트 규약.
          데이터는 페치하지 않는다 — 셸 훅(useStudioStudents) 산출을 패스스루
          (aside·드로어 2중 마운트 규칙 §5). 폴 없음. */}
      {classCtx ? (
        <div
          className={
            assetView === "students" ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <StudioStudentsPane
            key={classCtx.classId}
            classId={classCtx.classId}
            active={assetView === "students"}
            activeStudentId={studentsActiveId}
            onSelectStudent={onStudentSelect}
            onRequestAdd={onStudentsRequestAdd}
            rows={studentsRows}
            academyCode={studentsAcademyCode}
            loading={studentsLoading}
            error={studentsError}
            onReload={onStudentsReload}
          />
        </div>
      ) : null}

      {/* 미분석/분석 지문 원문 뷰어 (분석 모달 폴백 — §3.9.5②) */}
      <PassageContentModal
        open={!!contentModalPassage}
        onClose={() => setContentModalPassage(null)}
        passage={contentModalPassage}
      />

      {/* 분석 조회 중 간소화 오버레이(§3.9.5② — 이중 클릭 가드와 한 쌍) */}
      {analysisLoading ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20">
          <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            <span className="text-[12.5px] font-medium text-slate-600">
              분석 자료를 불러오는 중입니다
            </span>
          </div>
        </div>
      ) : null}

      {/* 학습자료 행 → 분석 상세(§3.9.5② — generate-page-client:2044-2057 배선 복제) */}
      {analysisModal ? (
        <PassageAnalysisModal
          open
          onClose={() => setAnalysisModal(null)}
          passage={analysisModal.passage}
          initialAnalysis={analysisModal.initialAnalysis}
        />
      ) : null}

      {/* 문제 이력 행 → 문제 상세(§3.9.5① — item 경로) */}
      <QuestionItemPreviewModal
        item={detailQuestion}
        onClose={() => setDetailQuestion(null)}
      />

      {/* 추출/입력 지문 "전체 보기" — 복원 근거 + 추출 이미지 상세 모달 */}
      {detailPassage && (
        <ExtractionDetailModal
          passage={detailPassage}
          onClose={() => setDetailPassage(null)}
          onPassageSaved={(passageId, updated) =>
            setPassages((prev) =>
              prev.map((p) =>
                p.id === passageId
                  ? { ...p, title: updated.title, content: updated.content }
                  : p,
              ),
            )
          }
        />
      )}

      {/* 실전 문제 생성 모달(§3.8.8) — genModalOpen && activeRow 일 때만 마운트
          (언마운트 리셋 계약 — generate-page 와 동형). 워크북 모달과의 동시
          오픈은 openWorkbook* 가 선차단한다(Esc 1중 §3.8.7). */}
      <StudioQuestionGenModal api={qgen} />
    </div>
  );
}

// ── 문제 상세 모달(§3.9.5① item 경로) — WideModal + QuestionCard 계보 ─────────
// dock-question-preview-modal.tsx:82-108 의 프레임을 단건용으로 이식했다.
// onOpenQuestionDetail 이 넘기는 값은 이미 QuestionCardItem 이라 변환이 없다.
// ⚠ U2 유닛(공유 QuestionPreviewModal)이 빈 산출로 종료돼 이 파일이 임시
// 호스팅한다 — 공유 모달이 생기면 이 컴포넌트를 그 import 로 교체한다.
function QuestionItemPreviewModal({
  item,
  onClose,
}: {
  /** null = 닫힘(WideModal open 파생) */
  item: QuestionCardItem | null;
  onClose: () => void;
}) {
  return (
    <WideModal
      open={item !== null}
      onClose={onClose}
      icon={ListChecks}
      title={
        item?.passage?.title
          ? sanitizeAiModelDisclosureText(item.passage.title)
          : "문제 상세"
      }
      description={item ? "생성된 문제" : undefined}
    >
      <div className="space-y-3 px-4 py-4 sm:px-5">
        {item ? (
          <QuestionCard
            q={item}
            num={1}
            readonly
            suppressUnapprovedBorder
            // 완전 펼침(§3.9v2.3 D3) — compact 폐기: 전체 선택지·정답·해설·
            // 지문까지 처음부터 펼쳐 보인다(variant-source-modal.tsx 계보).
            // 읽기 전용 열람이라 회전 스탬프는 소음 — 같은 계보로 숨긴다.
            hideReviewStatusStamp
            answerReveal="show-all"
            passageDefaultOpen
            explanationDefaultOpen
          />
        ) : null}
      </div>
    </WideModal>
  );
}

// memo: 오케스트레이터는 생성 큐 폴링(5초)마다 리렌더된다 — 이 판은 카드 수백
// 장을 품고 있어 매 폴링 재렌더가 전역 버벅임의 주범이었다. props 는 전부 참조
// 안정(useMemo classCtx·useCallback 핸들러)이라 여기서 끊는다(2026-08-11 수술).
export const LibraryPane = memo(LibraryPaneInner);
