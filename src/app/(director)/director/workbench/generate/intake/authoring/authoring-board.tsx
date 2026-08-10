"use client";

// ============================================================================
// AuthoringBoard — 「조판대(組版臺)」 The Composing Desk. 이 기능의 셸.
//
// 이 파일이 그리는 것은 세 개의 선이다(그 외엔 전부 자식 컴포넌트다).
//   ① 마스트헤드 h-14 아래 **전폭 구조선**(slate-200)
//   ② 좌·우 컬럼 헤더 h-9 아래 **전폭 hairline**(slate-100)
//   ③ 좌 컬럼 / 레일 사이 세로선(레일이 그린다)
//
// 왜 이 두 줄이 이번 개편의 핵심인가:
//   오너의 지적("정렬이 하나도 안 맞다")은 취향이 아니라 물리적 사실이었다.
//   개편 전 이 화면에는 좌우 두 컬럼이 **공유하는 가로선이 0개**였고, 좌측은
//   p-3(12) · 자료 칩은 14 · 사유 줄은 px-1 로 좌측 기준선이 3개였으며, 결과가
//   없을 때 좌측만 justify-center 로 세로 중앙에 떠 우측 레일(상단정렬)과 어떤
//   배치로도 맞지 않았다. 그래서 이번에는 **모든 층이 같은 16px 인셋(px-4)** 을
//   쓰고, 좌·우가 **같은 높이(h-9)·같은 인셋의 컬럼 헤더**를 각자 그려 두 헤더의
//   아래 테두리가 화면을 가로지르는 한 줄이 되게 했다.
//   ⚠️ 레일 헤더(authoring-spec-rail.tsx RailHeader)와 이 파일의 좌측 컬럼 헤더는
//     h-9 · px-4 · border-b border-slate-100 이 **정확히 같아야** 한다. 한쪽만
//     고치면 그 순간 선이 두 동강 나고 개편 전으로 되돌아간다.
//
// 회귀 방지 계약 (유지)
//  · 스크롤은 좌측 컬럼 1개 + 우측 레일 1개, 정확히 두 개다. 바깥은 overflow-hidden.
//    (자료 목록은 4개째부터 접어 3번째 스크롤을 만들지 않는다 — 컴포저 소유.)
//  · 주 CTA 는 절대 native disabled 로 막지 않는다. aria-disabled + 힌트 글로우 +
//    "왜 못 누르는지" 한 줄이 하우스 규약이다(AuthoringComposer 가 그린다).
//  · 생성을 시작해도 입력을 비우지 않는다 — 같은 조건으로 더 만드는 흐름이 최빈이다.
//  · **주 CTA 는 '접수 왕복'(STARTING) 동안에만 잠긴다. 생성 중에는 살아 있다.**
//    한때 이 보드가 `await startRun(...)` 전후로 로컬 starting state 를 잠갔는데,
//    생중계 레인(1편)의 startRun 은 SSE 종료(30~150s, 상한 320s)까지 resolve 하지
//    않아 **생성 내내** CTA 가 회색 스피너로 죽고 두 번째 발주가 막혔다(count>=2 잡
//    레인은 POST 응답 즉시 풀려서 스트림 레인만 조용히 퇴행해 있었다). 이 화면의
//    전제("다른 작업을 하셔도 돼요")와 바로 위 계약을 동시에 배신하는 상태다.
//    → CTA 시각 상태는 스토어 파생값(accepting = STARTING 인 run 이 있는가)이
//      소유하고, 로컬 ref 는 재진입 가드로만 남는다. 되돌리지 말 것.
//  · **시작 토스트는 이 보드가 띄우지 않는다.** 소유자는 use-authoring-store 의
//    '접수 확정' 지점이다(그 파일 계약 3-1). 여기서(=await 뒤) 띄우면 스트림
//    레인에서 완료 토스트가 먼저 뜬 다음 "만들기 시작했어요"가 따라붙는다.
//  · 결과 모달의 open 상태는 이 보드가 소유한다(진행 밴드가 아니라).
//  · 자료 역할은 roleLocked=true 인 순간부터 자동분류가 절대 덮지 않는다.
//  · **보이지 않을 때는 포털 모달을 절대 열지 않는다.** 이 보드는 모드를 바꿔도
//    언마운트되지 않고 `hidden` 으로만 숨는데, WideModal 은 document.body 포털이라
//    조상의 display:none 이 통하지 않는다. 이 화면의 포털 모달은 둘이다 —
//    결과 모달(여기서 소유)과 자료 검토 모달(AuthoringComposer 소유). 그래서
//    visible 은 **composer 에도 반드시 넘긴다**. 한쪽만 막으면 남은 쪽이 같은 사고를 낸다.
//  · **후속 요청은 그 실행의 스냅샷(spec/편수/지시문)으로 컴포저를 채운다.**
//    보드의 현재 값으로 실행하면 표시 금액과 청구가 최대 6배 어긋난다.
//  · **조판 결과가 있으면 호스트 본문 높이 확장을 요청한다(visible 일 때만).**
//    기본 본문(600px)에서 좌 컬럼 뷰포트는 367px 인데 결과 1건이 붙은 최소
//    콘텐츠가 419px 라 결과 밴드가 늘 잘린 채 태어난다. 여기서 스크롤을 더
//    만들어 해결하지 말 것 — 스크롤 2개 계약을 깬다. 아래 확장 훅이 정본이다.
//
// 이번 개편에서 **의도적으로 파기한** 계약 3건 (되돌리지 말 것)
//  1) "항상 가로 2단" → 파기. 390px 뷰포트에서 레일 175 + 핸들 12 로 입력 컬럼이
//     203px 이 되어 이 기능의 주 작업면이 파괴됐다. 이제 720cqi 미만에서는 레일이
//     발주 컬럼 **아래**로 내려간다. **사라지지도, 접히지도, 덮지도 않는다**
//     (spec-rail 의 "어떤 폭에서도 사라지지 않는다" 계약은 그대로 살아 있다).
//     좁은 폭에서 '접기 토글'을 다시 만들지 말 것 — 그건 사용자가 명시적으로 거부한 것이다.
//  2) 빈 상태 justify-center → 파기. 우측 레일이 항상 상단정렬인 구성에서 좌측만
//     세로 중앙정렬하면 두 컬럼이 어떤 배치로도 정렬돼 보이지 않는다(오너 불만의
//     거시 원인). 원 계약의 의도("아래로 빈 화면이 한참 남아 '여기서 뭘 해야
//     하지'가 된다")는 **견본 조판(ghost proof)** 으로 더 강하게 만족시킨다 —
//     결과 밴드의 축소판을 미리 보여 주므로 완성 후 인지 비용까지 줄어든다.
//  3) 완료 시 결과 모달 자동펼침 → 파기. "생성은 백그라운드니 다른 작업을
//     하세요"라는 이 기능의 핵심 약속(시작 토스트가 그렇게 광고한다)과 정면
//     충돌한다. 시작·완료 알림은 **둘 다 use-authoring-store 소유**이고 각각
//     실행당 1회다(그 파일 계약 3-1 / 3). 그 '1회' 계약 때문에 이 보드는 어떤
//     토스트도 덧붙이지 않으며, 결과로 들어가는 문은 완료 밴드의 [결과 보기] 가 맡는다.
// ============================================================================

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { PenLine } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/layout/page-frame";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { triggerHintGlow } from "@/lib/hint-glow";
import {
  describeUnsupportedFile,
  isSupportedMaterialFile,
} from "@/lib/passage-authoring/material-readers";
import {
  DEFAULT_AUTHORING_SPEC,
  type AuthoringResultItem,
  type AuthoringSpec,
} from "@/lib/passage-authoring/schema";
import { cn } from "@/lib/utils";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";

import { useWorkspaceBodyExpansion } from "../../workspace-body-context";
import { KoreanFixedBanner } from "./authoring-board-parts";
import { AuthoringComposer } from "./authoring-composer";
import { AuthoringRunCards } from "./authoring-loading-cards";
import { Kicker } from "./authoring-primitives";
import { AuthoringSpecPanel, describeSpecSummary } from "./authoring-spec-panel";
import { AuthoringSpecRail } from "./authoring-spec-rail";
import {
  readRegisteredAuthoringJobs,
  rememberRegisteredAuthoringJob,
} from "./authoring-store-io";
import { DESK, HAIRLINE, RULE } from "./authoring-tokens";
import { isRunActive, type AuthoringRun } from "./authoring-types";
import { predictMaterialBudgets } from "./material-budget";
import {
  MAX_AUTHORING_MATERIALS,
  useMaterialDrafts,
} from "./use-material-drafts";
import { useAuthoringStore } from "./use-authoring-store";

export interface AuthoringBoardProps {
  /** 부모가 지문함 저장 중 — 입력을 잠근다. */
  busy: boolean;
  /** 국어 고정 라우트면 true. 이 기능은 영어 전용이라 안내 배너만 띄우고 CTA 를 막는다. */
  koreanFixed?: boolean;
  /**
   * 지금 이 보드가 화면에 보이는가(활성 탭 + 오버레이 없음). 숨겨진 동안에는
   * 포털 모달을 절대 열지 않는다 — 조상의 hidden 이 body 포털에는 통하지 않는다.
   * 미전달이면 true(단독 사용 호스트 무영향).
   */
  visible?: boolean;
  /** 생성 결과를 내 지문함에 등록. true 를 돌려주면 성공. */
  onRegisterRows: (rows: { title: string; content: string }[]) => Promise<boolean>;
}

const CREDIT_PER_PASSAGE = CREDIT_COSTS.PASSAGE_AUTHORING;

/**
 * 요청문 상한. schema.ts `instruction: z.string().max(4_000)` · 컴포저의
 * INSTRUCTION_MAX_CHARS 와 같은 값이다. 후속 요청이 스냅샷 지시문에 한 줄을
 * 덧붙일 때 이 상한을 넘기면 서버 zod 가 영문 메시지로 튕긴다.
 */
const INSTRUCTION_MAX_CHARS = 4_000;

/**
 * 지시문이 자료 역할에 주는 신호("이 지문을 변형해 주세요" → SOURCE_TO_VARY)를
 * 반영하는 지연. 실행 직전에 부르면 setState 가 이번 실행의 payload 에 닿지
 * 못해(같은 틱의 readyMaterials 는 이미 굳었다) 다음 실행부터 적용되는 유령
 * 동작이 된다. 타이핑이 멎은 뒤 반영해야 사용자가 자료 행에서 눈으로 확인하고
 * 실행할 수 있다. roleLocked 자료는 어떤 경우에도 덮지 않는다(계약).
 */
const INSTRUCTION_SIGNAL_DELAY_MS = 600;

export function AuthoringBoard({
  busy,
  koreanFixed = false,
  visible = true,
  onRegisterRows,
}: AuthoringBoardProps) {
  const { runs, startRun, dismissRun, loadRunItems } = useAuthoringStore();
  const {
    materials,
    readyMaterials,
    pendingCount,
    atCapacity,
    patchMaterial,
    handleFiles,
    handlePasteText,
    handleRetry,
    handleRemove,
    applyInstructionSignal,
  } = useMaterialDrafts();

  const [instruction, setInstruction] = useState("");
  const [spec, setSpec] = useState<AuthoringSpec>(DEFAULT_AUTHORING_SPEC);
  const [count, setCount] = useState(1);
  const [diversify, setDiversify] = useState(true);
  /**
   * **재진입 가드 전용**(CTA 시각 상태가 아니다 — 그건 아래 accepting 이 소유한다).
   *
   * 왜 state 가 아니라 ref 인가: 생중계 레인의 startRun 은 SSE 가 끝날 때까지
   * (30~150s, 상한 320s) resolve 하지 않는다. 이 값을 state 로 두고 composer 의
   * starting 에 넘기면 **생성 내내** 주 CTA 가 회색 스피너로 죽고 두 번째 발주가
   * 막혔다 — "같은 조건으로 더 만드는 흐름이 최빈"(위 계약)과 "다른 작업을 하셔도
   * 돼요"(시작 토스트)를 동시에 배신한다. count>=2 잡 레인은 POST 응답 즉시 풀려서
   * 스트림 레인만 조용히 퇴행해 있었다.
   * ref 로 두면 같은 클릭이 두 번 발주되는 것만 막고 렌더에는 아무 영향이 없다.
   */
  const startingRef = useRef(false);
  /**
   * "판독이 끝나면 자동으로 시작한다" 예약 — 26-08-04 오너 지시("붙이자마자 판독을
   * 기다리는 게 최대 마찰이다")의 배선.
   *
   * 왜 state 인가(ref 가 아니라): 이 값은 **화면에 보여야 한다**. CTA 가 스피너로
   * 바뀌고 그 밑에 "자료를 마저 읽고 바로 시작할게요"가 떠야, 누른 사람이 자기
   * 클릭이 접수됐다는 것을 안다. ref 로 두면 눌러도 아무 일이 없는 것처럼 보여
   * 사람이 한 번 더 누르고, 그 두 번째 클릭이 취소가 되어 영영 시작되지 않는다.
   *
   * 회귀 방지: 예약은 **반드시 사용자가 취소할 수 있어야 한다**(다시 누르면 해제).
   * 취소 없는 자동 실행은 크레딧이 걸린 행동을 사용자 손에서 빼앗는 것이다.
   */
  const [queuedStart, setQueuedStart] = useState(false);
  const [registering, setRegistering] = useState(false);
  /**
   * 이 편을 지문함에 넣었을 때 받은 Passage id. **변형 지문 저장에만 쓴다** —
   * 변형본은 원본 id 를 알아야 계보(변형본 뱃지·메타 승계)가 선다.
   * 26-08-04 오너 결정: 평소엔 미등록으로 두고, '변형 지문 생성'을 누르는 순간에만
   * 조용히 등록한다(초안이 지문함을 더럽히지 않게).
   */
  const [itemPassageIds, setItemPassageIds] = useState<Record<string, string>>({});
  /**
   * 이미 지문함에 넣은 **잡 id**. 보드 로컬 state 이던 시절에는 새로고침 한 번에
   * 사라져, 이미 넣은 6편짜리 결과가 다시 "지문함에 넣기"를 졸랐다(같은 지문 이중
   * 등록). 이제 dismiss 기록과 같은 방식(jobId 기준 localStorage)이 정본이고
   * 여기서는 그 스냅샷만 들고 다닌다. 첫 렌더에서 읽어도 SSR 과 어긋나지 않는다 —
   * 그 시점의 runs 는 항상 빈 배열이라(스토어 getServerSnapshot 고정 배열) 이
   * 값이 마크업에 반영되지 않기 때문이다.
   */
  const [registeredJobIds, setRegisteredJobIds] = useState<ReadonlySet<string>>(
    () => new Set(readRegisteredAuthoringJobs().keys()),
  );
  /**
   * 편(item) 단위 등록 기록 — 밴드 지문 카드의 "지문함에 있어요" 표식 근거.
   * 세션 한정이다(정본 영속은 실행 단위 registeredJobIds). 여러 편짜리 실행에서
   * 한 편만 넣었을 때 실행 전체를 "넣음"으로 표시하면 나머지 편이 무경고로
   * 버려지므로, 실행 단위 승격은 **모든 OK 편이 등록됐을 때만** 한다.
   */
  const [registeredItemIds, setRegisteredItemIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // CTA 가 막혔을 때 "여기를 채우세요"라고 가리킬 대상 = 발주 밴드 루트.
  const composerBoxRef = useRef<HTMLDivElement>(null);
  /** 파일 드래그가 **발주 밴드 위**에 있는가(컴포저가 알려 준다). */
  const [bandDragging, setBandDragging] = useState(false);
  /** 파일 드래그가 **좌 컬럼 어딘가**에 있는가(밴드 밖 포함). */
  const [columnDragging, setColumnDragging] = useState(false);
  const columnDragDepth = useRef(0);

  const locked = busy || koreanFixed;
  const credits = CREDIT_PER_PASSAGE * count;

  // ── 상태 요약 ─────────────────────────────────────────────────────────────

  const activeCount = useMemo(() => runs.filter(isRunActive).length, [runs]);

  /**
   * 주 CTA 를 잠그는 유일한 근거 — **"서버가 아직 접수하지 않았다"** 뿐이다.
   *
   * 스토어는 발주 즉시 낙관적 run 을 STARTING 으로 넣고, 접수가 확정되는 순간
   * (스트림 onAccepted = 첫 프레임 = 차감 확정 / 잡 POST 성공 / 스트림 detached)
   * RUNNING 으로 패치한다. 그래서 이 파생값은 정확히 **접수 왕복 구간**에서만
   * true 다 — 생성이 얼마나 오래 걸리든 CTA 는 그 뒤로 살아 있다.
   * ⚠️ 여기에 RUNNING 을 더하지 말 것. 그 순간 "생성 내내 CTA 가 죽는" 퇴행이
   *   그대로 복원되고, 백그라운드 실행이라는 이 기능의 전제가 무너진다.
   */
  const accepting = useMemo(
    () => runs.some((run) => run.status === "STARTING"),
    [runs],
  );

  const failedCount = useMemo(
    () => materials.filter((m) => m.status === "FAILED").length,
    [materials],
  );

  /**
   * 좌 컬럼 헤더 우측 한 줄 — "붙인 자료 2개 · 18,400/24,000자".
   * 분자는 **이번 생성에 실제로 실리는 글자 수**(역할별 예산까지)이고 분모는 자료가
   * 가진 전체 글자 수다. 60,000자를 붙여도 전부 실리지 않는다는 사실을 화면이
   * 먼저 말하는 자리 — 자료 행·검토 모달의 게이지와 **같은 예측 함수**를 쓴다
   * (두 곳이 갈라지면 헤더가 거짓말을 한다).
   */
  const briefSummary = useMemo(() => {
    if (materials.length === 0) return null;
    const budgets = predictMaterialBudgets(
      readyMaterials.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    );
    let sent = 0;
    let total = 0;
    for (const entry of Object.values(budgets)) {
      sent += entry.sent;
      total += entry.total;
    }
    return `${AUTHORING_COPY.MATERIAL.countLine(materials.length)} · ${AUTHORING_COPY.MATERIAL.budgetShort(sent, total)}`;
  }, [materials, readyMaterials]);

  /**
   * 경고 층 — blockedReason 과 달리 **막지 않는다**. 사실 통지이므로 사용자가
   * 아직 아무것도 시도하지 않았어도 상시 보여 준다("첫 화면은 혼내지 않는다"의
   * 명시 예외 — 훈계가 아니라 "이 자료는 빼고 만들어요"라는 사실이다).
   */
  const warnReason: string | null =
    failedCount > 0 ? AUTHORING_COPY.WARN.failedMaterials(failedCount) : null;

  /**
   * 주 CTA 가 막힌 이유. 다섯 갈래가 **같은 자리(툴바 아래 한 줄)** 에 번갈아
   * 찍히므로 말투가 전부 해요체로 맞춰져 있다(사전이 그것을 보증한다).
   * koreanFixed 는 이 화면에 바꿀 과목 컨트롤이 없으므로 "영어로 바꾸세요"가 아니라
   * "영어 지문 만드는 화면에서 써 주세요"다.
   *
   * ⚠️ **판독 중(pendingCount > 0)은 더 이상 여기 없다**(26-08-04). 그 분기가
   * 있던 동안 사진 한 장을 붙이면 판독이 끝날 때까지 CTA 가 죽어 있었고, 판독은
   * 지면 전문을 축자 전사하는 콜이라 10~20초가 든다 — 이 화면의 최대 마찰이
   * 정확히 그 대기였다. 지금은 눌러 두면 판독 완료 시점에 자동으로 실행된다
   * (queuedStart). 막는 대신 **예약**한다.
   */
  const blockedReason: string | null = koreanFixed
    ? AUTHORING_COPY.BLOCKED.korean
    : busy
      ? AUTHORING_COPY.BLOCKED.busy
      : materials.length > MAX_AUTHORING_MATERIALS
        ? AUTHORING_COPY.BLOCKED.overCapacity(MAX_AUTHORING_MATERIALS)
        : // 판독 중인 자료가 하나라도 있으면 "지금은 실을 게 없다"가 아직 사실이
          // 아니다 — 그 자료가 곧 readyMaterials 가 된다. 여기서 empty 로 막으면
          // 자료만 붙이고 곧바로 누른 사람이 예약 경로에 닿지 못한다.
          readyMaterials.length === 0 && pendingCount === 0 && !instruction.trim()
          ? AUTHORING_COPY.BLOCKED.empty
          : null;

  // ── 조판 결과가 생기면 호스트 본문을 아래로 늘린다 ────────────────────────
  //
  // 왜 필요한가(실측, 호스트 본문 600px · PC 2단):
  //   좌 컬럼 스크롤 뷰포트는 367px 인데, 결과 1건이 붙은 최소 콘텐츠가
  //   [발주 밴드 165 + space-y-6 24 + 결과 섹션 230] = 419px 다 → **52px 잘림**.
  //   자료 1행(41)·막힌 사유 줄(27.5)까지 붙는 실사용 상태면 487px = 120px 잘림.
  //   좌 컬럼은 이미 자체 스크롤(이 화면의 스크롤 ①)을 갖고 있으므로 내용이
  //   사라지지는 않지만, 결과 밴드가 늘 접힌 채로 태어나 오너가 본 그림이 된다.
  //   여기서 스크롤을 하나 더 만드는 것은 계약 위반이라(좌 1 + 레일 1, 정확히 둘),
  //   남은 길은 본문을 **더 아래로 내리는 것** 하나뿐이다. 확장분·상한·드래그
  //   충돌 처리는 전부 셸 소유다(workspace-shell.tsx BODY_AUTO_EXPAND).
  //
  // ⚠️ **보이지 않을 때는 요청하지 않는다.** 이 보드는 모드를 바꿔도 언마운트되지
  //   않고 hidden 으로만 숨는데, 확장은 셸 본문 **전체**(내 지문함·워크스페이스)에
  //   걸린다 — 숨은 채로 붙들고 있으면 다른 화면이 이유 없이 300px 길어진다.
  //   포털 모달을 visible 로 막는 것과 정확히 같은 이유이자 같은 게이트다.
  // 셸 밖 호스트(학습지·웹툰 등)에서는 컨텍스트가 no-op 이라 무해하다.
  const { requestExpand, releaseExpand } = useWorkspaceBodyExpansion();
  // 보드 인스턴스마다 다른 키 — 상수로 두면 (미래에) 한 셸 아래 보드가 둘일 때
  // 한쪽의 해제가 나머지 한쪽의 확장까지 걷어간다.
  const bodyExpandId = useId();
  const hasRuns = runs.length > 0;
  useEffect(() => {
    if (!visible || !hasRuns) return;
    requestExpand(bodyExpandId);
    return () => releaseExpand(bodyExpandId);
  }, [visible, hasRuns, bodyExpandId, requestExpand, releaseExpand]);

  // ── 지시문 → 자료 역할 신호 ───────────────────────────────────────────────
  useEffect(() => {
    const text = instruction.trim();
    if (!text) return;
    const timer = window.setTimeout(
      () => applyInstructionSignal(text),
      INSTRUCTION_SIGNAL_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [instruction, applyInstructionSignal]);

  // ── 실행 ──────────────────────────────────────────────────────────────────

  /**
   * 실제 발주 — 게이트를 통과한 뒤에만 불린다(직접 호출 금지). 예약 경로와 즉시
   * 경로가 **같은 한 벌**을 쓰게 하려고 갈라 뒀다: 두 벌이 되면 예약으로 시작한
   * 실행만 조용히 다른 인자로 도는 사고가 난다.
   */
  const runStart = useCallback(async () => {
    startingRef.current = true;
    // ⚠️ 여기서 await 를 잡고 finally 로 가드를 푸는 구조로 되돌리지 말 것.
    //   생중계 레인의 startRun 은 SSE 가 끝나야 resolve 하므로, 그 구조는 생성이
    //   끝날 때까지 두 번째 발주를 막는다(=수리 대상이던 그 퇴행). 가드는 아래
    //   효과가 '접수 완료'(STARTING 이탈) 시점에 푼다.
    //
    // 입력은 비우지 않는다(계약) — 같은 조건으로 더 만드는 흐름이 최빈이다.
    // 시작 토스트도 여기서 띄우지 않는다: 이 await 는 SSE 종료까지 매달려 있어
    // 여기서 알리면 완료 토스트가 먼저 뜬 뒤 "만들기 시작했어요"가 따라붙는다
    // (이미 끝난 작업을 시작했다고 말하는 상태). 알림 소유권은 use-authoring-store
    // 의 '접수 확정' 지점에 있다(그 파일 계약 3-1).
    await startRun({
      materials: readyMaterials,
      instruction: instruction.trim(),
      spec,
      count,
      diversify,
    });
  }, [count, diversify, instruction, readyMaterials, spec, startRun]);

  const handleStart = useCallback(async () => {
    if (startingRef.current) return;
    // 예약 상태에서 한 번 더 누르면 **취소**다. 이 분기가 blockedReason 검사보다
    // 먼저여야 한다 — 예약 중에 자료를 다 빼면 blockedReason.empty 가 켜지는데,
    // 그때 글로우만 띄우고 돌아가면 예약이 해제되지 않은 채 남는다.
    if (queuedStart) {
      setQueuedStart(false);
      return;
    }
    if (blockedReason) {
      // 하우스 규약: 막힌 CTA 는 침묵하지 않고 "무엇을 하면 되는지"를 가리킨다.
      // 단 글로우는 손볼 칸이 있을 때만 — 국어 고정·저장 중은 어느 입력칸의 잘못도
      // 아니라, 빛내면 멀쩡한 칸을 고치라고 시키는 셈이다(그땐 토스트로 말한다).
      const target = locked ? null : composerBoxRef.current;
      if (target) triggerHintGlow(target, { scrollBlock: "center" });
      else toast.warning(blockedReason);
      return;
    }
    // 아직 읽는 중인 자료가 있으면 **막지 않고 예약한다**. 지금 그냥 보내면 그
    // 자료가 readyMaterials 에 없어 통째로 빠진 채 크레딧이 나간다 — 붙인 자료가
    // 무시된 결과만큼 나쁜 것은 없다.
    if (pendingCount > 0) {
      setQueuedStart(true);
      return;
    }
    await runStart();
  }, [blockedReason, locked, queuedStart, pendingCount, runStart]);

  /**
   * 예약 소진 — 판독이 전부 끝난 프레임에서 자동으로 발주한다.
   *
   * blockedReason 을 여기서 **다시** 본다. 판독이 전부 실패해 실을 자료가 하나도
   * 남지 않았는데 지시문도 비어 있으면 그때는 실행하면 안 되고(빈 발주로 크레딧이
   * 나간다), 그 사실을 사람에게 말해야 한다 — 예약해 놓고 조용히 아무 일도
   * 일어나지 않는 것이 이 흐름의 최악이다.
   */
  useEffect(() => {
    if (!queuedStart || pendingCount > 0) return;
    setQueuedStart(false);
    if (startingRef.current) return;
    if (blockedReason) {
      toast.warning(blockedReason);
      return;
    }
    void runStart();
  }, [queuedStart, pendingCount, blockedReason, runStart]);

  // 실행이 접수되면 예약은 목적을 다했다. (예약 → runStart 경로는 위에서 이미
  // 내렸지만, 즉시 실행 중에 새 자료가 들어와 pendingCount 가 오르는 경합에서
  // 예약이 되살아나 두 번째 발주가 나가는 것을 막는 안전핀이다.)
  useEffect(() => {
    if (accepting) setQueuedStart(false);
  }, [accepting]);

  /**
   * 재진입 가드 해제 — 접수가 끝나(STARTING 이탈) accepting 이 내려간 렌더에서 푼다.
   * 의존성 배열을 **일부러 두지 않는다**: 접수가 아주 빨라 STARTING 프레임이 한 번도
   * 그려지지 않으면 [accepting] 로 묶은 효과는 값이 안 바뀌어 재실행되지 않고,
   * 가드가 영구히 잠긴 채 남는다(그 순간 CTA 는 멀쩡해 보이는데 눌러도 아무 일이
   * 없는 최악의 모양이 된다). 하는 일이 불리언 검사 하나뿐이라 매 렌더 실행이 싸다.
   */
  useEffect(() => {
    if (!accepting) startingRef.current = false;
  });

  /**
   * 지문함에 넣은 실행 = 밴드가 "또 넣으세요"라고 조르지 않을 근거이자, 아직 안 넣은
   * 결과를 무경고로 버리지 못하게 막는 근거. localId 는 세션 한정이라 판정의 정본은
   * jobId(localStorage)이고, 복구된 실행은 store-io 가 이미 registeredAt 을 채워 준다.
   */
  const registeredIds = useMemo(() => {
    const set = new Set<string>();
    for (const run of runs) {
      if (run.registeredAt !== undefined) {
        set.add(run.localId);
        continue;
      }
      if (run.jobId && registeredJobIds.has(run.jobId)) set.add(run.localId);
    }
    return set;
  }, [runs, registeredJobIds]);

  /**
   * 밴드 지문 카드의 편 단위 등록(26-07-26 인라인 등록). 모달 경로(handleRegister)와
   * 달리 어느 편을 넣었는지 알므로 registeredItemIds 를 정확히 채우고, 그 실행의
   * **모든 OK 편이 등록된 순간에만** 실행 단위(jobId 영속)로 승격한다 — 한 편만
   * 넣고 실행 전체를 "넣음" 처리하면 나머지 편이 무경고로 버려진다(밴드 계약).
   */
  const handleRegisterItems = useCallback(
    async (run: AuthoringRun, items: AuthoringResultItem[]) => {
      if (registering) return false;
      const rows = items
        .map((item) => ({
          title: item.title.trim() || item.title,
          content: item.passage.trim(),
        }))
        .filter((row) => row.content.length > 0);
      if (rows.length === 0) return false;
      setRegistering(true);
      try {
        const ok = await onRegisterRows(rows);
        if (!ok) return false;
        toast.success(AUTHORING_COPY.TOAST.registered(rows.length));
        // 스테일 클로저 방지 — 승격 판정은 지역 union 으로 계산한다.
        const union = new Set(registeredItemIds);
        for (const item of items) union.add(item.id);
        setRegisteredItemIds(union);
        const okIds = run.items
          .filter((item) => item.status === "OK")
          .map((item) => item.id);
        if (run.jobId && okIds.every((id) => union.has(id))) {
          rememberRegisteredAuthoringJob(run.jobId);
          setRegisteredJobIds((prev) => {
            const next = new Set(prev);
            next.add(run.jobId as string);
            return next;
          });
        }
        return true;
      } finally {
        setRegistering(false);
      }
    },
    [registering, onRegisterRows, registeredItemIds],
  );

  /**
   * 변형 지문을 저장하기 직전, 이 편의 **원본 Passage id** 를 확보한다.
   * 이미 넣었으면 그 id 를 재사용하고, 아직이면 **지금** 지문함에 넣어 만든다.
   *
   * ⚠️ 여기서만 createDirectInputPassageMaterial 을 직접 부른다. 평소 등록 경로
   *   (onRegisterRows)는 성공 여부만 돌려주고 만들어진 id 를 알려주지 않아,
   *   변형본의 계보(sourcePassageId → 변형본 뱃지·메타 승계)를 세울 수 없다.
   *   두 경로가 만드는 Passage 자체는 같다(같은 서버 액션·같은 버킷).
   */
  const handleEnsureRegisteredId = useCallback(
    async (
      run: AuthoringRun,
      item: AuthoringResultItem,
    ): Promise<string | null> => {
      const known = itemPassageIds[item.id];
      if (known) return known;

      const content = item.passage.trim();
      if (content.length < 20) {
        toast.error(AUTHORING_COPY.TOAST.tooShortToSave);
        return null;
      }
      setRegistering(true);
      try {
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
        const result = await createDirectInputPassageMaterial({
          title: item.title.trim() || content.slice(0, 40),
          content,
        });
        if (!result?.success || !result.id) {
          toast.error(AUTHORING_COPY.TOAST.registerFailed);
          return null;
        }
        const passageId = result.id;
        setItemPassageIds((prev) => ({ ...prev, [item.id]: passageId }));
        // 카드를 "넣음"으로 바꾼다 — 같은 지문을 두 번 넣지 않게.
        const union = new Set(registeredItemIds);
        union.add(item.id);
        setRegisteredItemIds(union);
        const okIds = run.items
          .filter((entry) => entry.status === "OK")
          .map((entry) => entry.id);
        if (run.jobId && okIds.every((id) => union.has(id))) {
          rememberRegisteredAuthoringJob(run.jobId);
          setRegisteredJobIds((prev) => {
            const next = new Set(prev);
            next.add(run.jobId as string);
            return next;
          });
        }
        toast.success(AUTHORING_COPY.TOAST.registeredForVariant);
        return passageId;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : AUTHORING_COPY.TOAST.registerFailed,
        );
        return null;
      } finally {
        setRegistering(false);
      }
    },
    [itemPassageIds, registeredItemIds],
  );

  /**
   * 변형본을 지문함에 새 Passage 로 저장한다. 워크스페이스의 handleAddVariant 와
   * **같은 서버 액션·같은 태그 규약**을 쓴다 — 두 표면이 만든 변형본이 지문 목록에서
   * 다르게 보이면 안 된다.
   */
  const handleSaveVariant = useCallback(
    async (input: {
      sourcePassageId: string;
      title: string;
      content: string;
      variantKind: string;
      variantDirection?: string;
      tags?: string[];
    }): Promise<boolean> => {
      const title = input.title.trim();
      const content = input.content.trim();
      if (title.length === 0 || content.length < 20) {
        toast.error(AUTHORING_COPY.TOAST.variantEmpty);
        return false;
      }
      try {
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
        const result = await createDirectInputPassageMaterial({
          title,
          content,
          sourcePassageId: input.sourcePassageId,
          variantKind: input.variantKind,
          variantDirection: input.variantDirection,
          tags: input.tags,
        });
        if (!result?.success || !result.id) {
          toast.error(AUTHORING_COPY.TOAST.variantFailed);
          return false;
        }
        toast.success(AUTHORING_COPY.TOAST.variantSaved);
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : AUTHORING_COPY.TOAST.variantFailed,
        );
        return false;
      }
    },
    [],
  );

  /** 복구된 실행의 본문 인라인 적재 — 밴드가 부른다(모달을 열지 않는다). */
  const handleEnsureItems = useCallback(
    async (localId: string) => {
      await loadRunItems(localId);
    },
    [loadRunItems],
  );

  /**
   * 후속 요청 — **컴포저를 채울 뿐 실행하지 않는다.**
   *
   * 구 "같은 조건으로 다시 만들기"는 누르는 즉시 크레딧을 태웠고, 복구된 실행
   * (spec === null)에서는 기본값 설계로 조용히 다른 요청을 보냈다. 실행을 사람의
   * 손에 돌려주면 그 사고가 **구조적으로** 불가능해진다 — 화면에 채워진 값이
   * 곧 보낼 값이기 때문이다.
   *
   * 복원 범위: 지시문(스냅샷 + 후속 한 줄) · 설계 · 편수. spec 이 null 인 복구
   * 실행에서는 설계를 건드리지 않는다(모르는 것을 아는 척하지 않는다).
   * ⚠️ 자료는 아직 복원하지 못한다 — useMaterialDrafts 에 목록을 통째로 되돌리는
   *   API 가 없다. 지금 붙어 있는 자료가 그대로 쓰인다.
   */
  const handleFollowUp = useCallback((prompt: string, run: AuthoringRun) => {
    const base = run.instruction.trim();
    const line = prompt.trim();
    const merged = !base || base === line ? line : `${base}\n${line}`;
    setInstruction(merged.slice(0, INSTRUCTION_MAX_CHARS));
    if (run.spec) setSpec(run.spec);
    if (run.requestedCount > 0) setCount(run.requestedCount);
    // 모달이 닫히며 화면이 바뀌므로, 어디에 채워졌는지 눈으로 잇는다.
    const target = composerBoxRef.current;
    if (target) triggerHintGlow(target, { scrollBlock: "center" });
  }, []);

  // ── 전역 파일 드롭 방어 ───────────────────────────────────────────────────
  //
  // 브라우저 기본 동작은 "떨어뜨린 파일로 창을 이동"이다. 발주 밴드를 아주 조금
  // 빗나가게 놓기만 해도 작성 중인 요청·붙여 둔 자료·진행 중인 실행 카드가 통째로
  // 증발한다(뒤로 가기로도 못 돌아온다). 파일 드래그일 때만 기본 동작을 끄고,
  // 텍스트 드래그는 손대지 않는다 — 브라우저가 공짜로 해 주는 "고른 글을 캐럿에
  // 끼워넣기"를 삼키면 안 된다(컴포저의 드롭 핸들러와 같은 원칙).
  useEffect(() => {
    if (!visible) return;
    const hasFiles = (event: globalThis.DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const swallow = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };
    const reset = () => {
      columnDragDepth.current = 0;
      setColumnDragging(false);
    };
    const onDrop = (event: globalThis.DragEvent) => {
      swallow(event);
      reset();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", reset);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", reset);
    };
  }, [visible]);

  /**
   * 좌 컬럼 전체가 드롭 표면이다(상자를 없앤 대가의 어포던스 상환).
   * 밴드가 이미 받은 드롭은 preventDefault 된 채 올라오므로 여기서 다시 받지 않는다.
   */
  const acceptDroppedFiles = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      columnDragDepth.current = 0;
      setColumnDragging(false);
      if (event.defaultPrevented || locked || atCapacity) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      const ok = files.filter((file) => isSupportedMaterialFile(file));
      const bad = files.filter((file) => !isSupportedMaterialFile(file));
      if (bad.length > 0) {
        const first = describeUnsupportedFile(bad[0]);
        toast.warning(
          bad.length === 1
            ? first
            : AUTHORING_COPY.TOAST.unsupportedMore(first, bad.length - 1),
        );
      }
      if (ok.length > 0) handleFiles(ok);
    },
    [atCapacity, handleFiles, locked],
  );

  // 밴드 위에 있을 때는 밴드가 자기 테두리를 그린다 — 두 겹으로 그리지 않는다.
  const showColumnDrop = columnDragging && !bandDragging;

  const specPanelProps = {
    spec,
    onChange: (patch: Partial<AuthoringSpec>) =>
      setSpec((prev) => ({ ...prev, ...patch })),
    count,
    onCountChange: setCount,
    diversify,
    onDiversifyChange: setDiversify,
    disabled: locked,
  };

  return (
    // ⚠️ 컨테이너를 선언한 엘리먼트는 **자기 자신을 질의할 수 없다**(컨테이너 쿼리는
    // 조상 컨테이너 기준으로 평가된다). 그래서 @container 는 이 껍데기에 두고,
    // 실제 분기(@min-[720px]:flex-row 등)는 전부 자식에 건다.
    //
    // 뷰포트 질의(lg:)를 다시 들이지 말 것: 이 보드가 받는 폭은 뷰포트와 무관하다 —
    // 동형 문제 생성 호스트는 좌측 패널을 드래그로 줄일 수 있고 하한이 380px 다.
    // lg: 를 쓰면 1440px 화면의 380px 패널에 2단이 적용돼 화면이 무너진다.
    <section
      aria-label={AUTHORING_COPY.A11Y.section}
      className="@container flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
    >
      {/* ── 마스트헤드 h-14 + 전폭 구조선 ①. 하우스 SectionCard 껍데기는 쓰지
          않는다 — 호스트가 이미 흰 카드라 card-in-card 가 된다. 헤더 기하학만
          차용한다(size-7 그릇 + 14/700 제목 + 12/500 한 줄). */}
      <header
        className={cn(
          "flex h-14 shrink-0 items-center gap-3 border-b px-4",
          RULE,
        )}
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100"
          aria-hidden="true"
        >
          {/* 이 기능의 대표 아이콘은 PenLine 이다. 별·반짝이 계열 금지(오너 지시). */}
          <PenLine className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h2 className={cn(DESK.title, "shrink-0 text-slate-900")}>
            {AUTHORING_COPY.TITLE}
          </h2>
          {/* 한 줄 설명은 좁아지면 먼저 접는다 — 제목과 상태가 우선이다. */}
          <p
            className={cn(
              DESK.meta,
              "min-w-0 truncate text-slate-500 @max-[600px]:hidden",
            )}
          >
            {AUTHORING_COPY.ONELINER}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeCount > 0 ? (
            <StatusPill tone="blue" pulse>
              {AUTHORING_COPY.MASTHEAD.running(activeCount)}
            </StatusPill>
          ) : null}
          {/* 잔액이 아니라 **단가**를 적는다. 잔액은 이 화면에 사실 출처가 없고
              (사이드바 크레딧 뱃지가 60초 폴링으로 소유한다), 여기서 또 폴링하면
              같은 값을 두 번 받아 오면서 어긋날 수 있다. 총액은 주 CTA 의 크레딧
              칩이 항상 말한다. */}
          <span className={cn(DESK.meta, "shrink-0 text-slate-500")}>
            {AUTHORING_COPY.CREDIT.perPassage(CREDIT_PER_PASSAGE)}
          </span>
        </div>
      </header>

      {/* ── 두 컬럼. 720cqi 미만에서는 레일이 발주 아래로 내려간다(사라지지 않는다).
          세로로 쌓일 때 레일이 갖는 두 가지 보정 — 둘 다 **레일 자신이 갖는 편이
          옳지만 그 파일은 이번 작업의 배정 밖**이라 부모에서 잠근다(옮길 때 이
          주석도 함께 옮길 것):
           · 폭 조절 핸들(role=separator) 숨김 — 세로 그립은 h-full 이라 세로로
             쌓이는 순간 컬럼 전체 높이를 먹고, 전폭이 된 레일에서 폭 조절은 의미가 없다.
           · 레일 aside 의 shrink 허용 + 높이 상한 — 기본이 shrink-0 라 세로로 쌓이면
             레일이 자기 콘텐츠 높이(약 480px)를 통째로 가져가고 발주 컬럼이 0까지
             눌린다. 이 기능의 주 작업면이 파괴되는 정확히 그 실패 모드다.
             레일은 자체 스크롤을 이미 갖고 있으므로 눌러도 내용이 사라지지 않는다. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          "@min-[720px]:flex-row",
          "@max-[720px]:[&>[role=separator]]:hidden",
          "@max-[720px]:[&>aside]:max-h-[50%] @max-[720px]:[&>aside]:shrink",
        )}
      >
        {/* ── 좌: 발주 컬럼 ── */}
        <div
          className="group/brief flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          onDragEnter={(event) => {
            if (locked) return;
            if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
              return;
            }
            columnDragDepth.current += 1;
            setColumnDragging(true);
          }}
          onDragOver={(event) => {
            if (locked) return;
            if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
              event.preventDefault();
            }
          }}
          onDragLeave={() => {
            columnDragDepth.current = Math.max(0, columnDragDepth.current - 1);
            if (columnDragDepth.current === 0) setColumnDragging(false);
          }}
          onDrop={acceptDroppedFiles}
        >
          {/* 컬럼 헤더 h-9 — **레일 헤더와 같은 기하학**(h-9 · px-4 · hairline).
              이 두 헤더의 아래 테두리가 이어져 전폭 가로선 ②가 된다. */}
          <div
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 border-b px-4",
              HAIRLINE,
            )}
          >
            <Kicker
              className="shrink-0 group-focus-within/brief:text-blue-700"
            >
              {AUTHORING_COPY.KICKER.brief}
            </Kicker>
            {briefSummary ? (
              <span
                title={AUTHORING_COPY.MATERIAL.budgetTitle}
                className={cn(DESK.meta, "min-w-0 truncate text-slate-500")}
              >
                {briefSummary}
              </span>
            ) : null}
            {/* 못 읽은 자료 — 조치가 필요한 사실이라 rose(안내는 slate, 조치는 rose). */}
            {warnReason ? (
              <span
                className={cn(DESK.meta, "ml-auto shrink-0 truncate text-rose-600")}
              >
                {warnReason}
              </span>
            ) : null}
          </div>

          {/* 이 화면의 스크롤 ①(레일이 ②). 인셋은 16px 단일 — 구 p-3(12) 폐기.
              블록 사이는 24px: 발주 밴드와 조판 결과는 성격이 다른 덩어리다. */}
          <div
            className={cn(
              "min-h-0 flex-1 space-y-6 overflow-y-auto p-4",
              showColumnDrop
                ? "outline-2 -outline-offset-2 outline-dashed outline-blue-400"
                : null,
            )}
          >
            {koreanFixed ? <KoreanFixedBanner /> : null}

            <AuthoringComposer
              instruction={instruction}
              onInstructionChange={setInstruction}
              materials={materials}
              disabled={locked}
              atCapacity={atCapacity}
              onFiles={handleFiles}
              onPasteText={handlePasteText}
              onMaterialChange={patchMaterial}
              onMaterialRemove={handleRemove}
              onMaterialRetry={handleRetry}
              onStart={handleStart}
              // 접수 왕복 구간에서만 true — 생성 중에는 CTA 가 살아 있어야 한다.
              // 예약(판독 대기)도 같은 스피너를 쓴다: 사용자 입장에서 둘 다
              // "눌렀고, 시작을 기다리는 중"이라 모양이 갈릴 이유가 없다.
              starting={accepting || queuedStart}
              blockedReason={blockedReason}
              // 예약 중임을 CTA 밑 캡션으로 말한다. blockedReason 과 같은 자리이고
              // 이 값이 우선한다 — 예약은 사유가 아니라 **진행 상태**다.
              queuedReason={queuedStart ? AUTHORING_COPY.BLOCKED.reading : null}
              credits={credits}
              count={count}
              boxRef={composerBoxRef}
              onDraggingChange={setBandDragging}
              visible={visible}
            />

            {runs.length === 0 ? (
              <GhostProof />
            ) : (
              <AuthoringRunCards
                runs={runs}
                registeredIds={registeredIds}
                registeredItemIds={registeredItemIds}
                registering={registering}
                onEnsureItems={handleEnsureItems}
                onRegisterItems={handleRegisterItems}
                onEnsureRegisteredId={handleEnsureRegisteredId}
                onSaveVariant={handleSaveVariant}
                onDismiss={dismissRun}
                onFollowUp={handleFollowUp}
              />
            )}
          </div>
        </div>

        {/* ── 우: 설계 레일 — 항상 펼쳐져 있고, 항상 폭을 끌 수 있다.
            헤더는 레일이 직접 그린다(좌측 컬럼 헤더와 같은 h-9). ── */}
        <AuthoringSpecRail summary={describeSpecSummary(spec, count)}>
          <AuthoringSpecPanel {...specPanelProps} />
        </AuthoringSpecRail>
      </div>
    </section>
  );
}

/**
 * 견본 조판(ghost proof) — 빈 상태.
 *
 * 구 처리는 좌 컬럼만 `justify-center` 로 띄우는 것이었다. 우측 레일은 언제나
 * 상단정렬이라 두 컬럼이 어떤 배치로도 맞지 않았고, 그것이 "정렬이 하나도 안
 * 맞다"의 거시 원인이었다. 대신 **결과 밴드의 축소판 한 장**을 그 자리에 정적으로
 * 둔다 — 원 계약의 의도("아래로 빈 화면이 한참 남아 '여기서 뭘 해야 하지'가
 * 된다")를 만족시키면서, 완성 결과가 어떤 모양으로 오는지까지 미리 학습시킨다.
 *
 * TabEmpty 의 점선 상자는 쓰지 않는다 — 상자를 없앤 화면에 상자를 다시 들이는 일이다.
 */
function GhostProof() {
  return (
    <section className="min-w-0">
      <Kicker>{AUTHORING_COPY.EMPTY.kicker}</Kicker>
      <p className={cn(DESK.meta, "pt-2 text-slate-500")}>
        {AUTHORING_COPY.EMPTY.body}
      </p>
      {/* 견본이지 결과가 아니다 — 스크린리더에는 읽히지 않게 하고(가짜 산출물을
          사실처럼 읽어 주면 안 된다) 포인터도 받지 않는다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none pt-2 opacity-45"
      >
        <div
          className={cn(
            "relative border-b px-4 py-3",
            // 결과 밴드와 같은 문법: 카드가 아니라 좌측 2px 액센트 바 + 16px 인셋 +
            // 아래 hairline. 선은 간격 그리드의 대상이 아니다(설계 바이블 §1 예외).
            "before:absolute before:left-0 before:top-0 before:h-full before:w-0.5 before:bg-blue-600 before:content-['']",
            HAIRLINE,
          )}
        >
          <p className={cn(DESK.title, "text-slate-900")}>
            {AUTHORING_COPY.EMPTY.SAMPLE.title}
          </p>
          <p className={cn(DESK.meta, "pt-1 text-slate-500")}>
            {AUTHORING_COPY.EMPTY.SAMPLE.summary}
          </p>
          <p className={cn(DESK.read, "max-w-[68ch] pt-2 text-slate-700")}>
            {AUTHORING_COPY.EMPTY.SAMPLE.lines.join(" ")}
          </p>
        </div>
      </div>
    </section>
  );
}
