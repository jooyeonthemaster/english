"use client";

import { AUTHORING_CONCURRENCY } from "@/lib/passage-authoring/schema";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import type { MaterialLayout } from "@/lib/passage-authoring/material-readers";
// 미리보기 프레임 계약은 **공유 컴포넌트가 소유한다**(문제 생성 md-stream · 학습지
// 분석 SSE 와 같은 타입). 여기서 다시 선언하면 패널이 읽는 모양과 스토어가 만드는
// 모양이 갈라진다. type-only import 라 "use client" 모듈을 런타임으로 끌어오지 않는다.
import type { StreamPreview } from "../../stream-preview-pane";
import type {
  AuthoringJobResult,
  AuthoringResultItem,
  AuthoringSpec,
  MaterialRole,
  MaterialSourceKind,
  PassageSkeleton,
} from "@/lib/passage-authoring/schema";

// ============================================================================
// AI 지문 생성 — 클라이언트 공유 계약.
//
// 입력 보드(authoring-board) · 결과 밴드/인라인 편집기(authoring-loading-cards) · 진행 카드
// (authoring-loading-cards) · 백그라운드 스토어(use-authoring-store) 가 모두
// 이 파일만 바라본다. 컴포넌트끼리 직접 타입을 주고받지 않는다.
// ============================================================================

/** 판독 진행 상태 — 파일을 붙인 직후부터 텍스트가 확정될 때까지. */
export type MaterialReadStatus = "READING" | "READY" | "FAILED";

/**
 * 화면에 있는 자료 1건. 서버로 보낼 땐 READY 인 것만 골라
 * `{ id, role, name, sourceKind, content, note }` 로 좁혀 보낸다.
 */
export interface DraftMaterial {
  id: string;
  role: MaterialRole;
  /** 사용자가 자동분류 결과를 직접 바꿨는가 — true 면 재분류하지 않는다. */
  roleLocked: boolean;
  name: string;
  sourceKind: MaterialSourceKind;
  /** 판독·정규화된 본문 (사용자가 직접 고칠 수 있다). */
  content: string;
  note: string;
  status: MaterialReadStatus;
  /** READING 동안 보여줄 진행 문구 ("PDF 3/8쪽 읽는 중…"). */
  progressLabel?: string;
  /** FAILED 사유 — 사용자가 읽고 조치할 수 있는 한국어 문장. */
  error?: string;
  /**
   * 원본 바이트 크기. material-intake 가 채우지만 화면에는 쓰지 않는다 —
   * 칩은 [아이콘 이름 · 역할 ×] 한 줄이고 용량은 거기 들어갈 자리가 없다.
   * (판독 실패 원인 추적·로그용으로 남겨 둔다.)
   */
  bytes?: number;
  /** 판독 전 원본 파일 — 재시도용. 텍스트 붙여넣기면 없다. */
  file?: File;

  // ── 하이브리드 판독 · 자동분류 확신도 ────────────────────────────────────
  // 이 6개는 한동안 material-intake.ts 가 `MaterialDraft = DraftMaterial & {…}`
  // 교차 타입으로 임시 소유했다(그 파일과 이 파일의 작업 단계가 달랐다). 그 결과
  // **use-authoring-store 의 payload 매핑이 이 필드들을 보지 못해** sendPages·
  // storagePath 가 서버에 한 번도 전달되지 않았다 — 서버(schema.authoringMaterial
  // Schema)·조달(run-job.collectPageImages)·화면 스위치(material-reader-modal)가
  // 전부 준비된 상태에서 클라이언트 경계 한 곳 때문에 하이브리드가 통째로 죽어
  // 있었다. 타입 정본을 여기로 합쳐 그 구멍을 닫는다.
  /** 자동분류 확신이 낮아 사람이 한 번 봐야 하는 자료 — 행에 '역할을 확인해 주세요'. */
  roleUncertain?: boolean;
  /** 판독 라우트가 같은 콜의 꼬리줄로 돌려준 지면 형태(TABLE_HEAVY/DIAGRAM/PLAIN). */
  layout?: MaterialLayout;
  /** 원본 페이지 이미지도 함께 보낼지 — 숨은 자동 결정이 아니라 표면 스위치다. */
  sendPages?: boolean;
  /** 함께 보낼 수 있는 페이지 수(문서 전체 쪽수가 아니라 **실제로 보낼** 수). */
  pageCount?: number;
  /** 페이지 JPEG 묶음의 스토리지 경로 접두사(서명 업로드 결과). */
  storagePath?: string;
  /** 판독기가 남긴 주의 — 토스트는 사라지지만 이 값은 남아 배지가 된다. */
  warning?: string;
}

/** 생성 실행 1건의 클라이언트 상태. */
export type AuthoringRunStatus =
  | "IDLE"
  | "STARTING"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

/**
 * 잡 result 에 남은 요청 스냅샷의 자료 1건(본문 없이 미리보기 200자).
 * 서버 계약(AuthoringJobResult)을 그대로 재사용한다 — 여기서 다시 선언하면
 * 필드가 하나 늘 때마다 두 벌이 갈라진다.
 */
export type AuthoringSnapshotMaterial = NonNullable<
  AuthoringJobResult["request"]
>["materials"][number];

export interface AuthoringRun {
  /** 서버 잡 id. STARTING 동안엔 아직 없을 수 있다. */
  jobId: string | null;
  /** 낙관적 로컬 id — 잡 id 가 붙기 전 카드 키. */
  localId: string;
  status: AuthoringRunStatus;
  /** 요청한 지문 편수. */
  requestedCount: number;
  /** 완성된 편수. */
  successCount: number;
  failedCount: number;
  /** 시작 시각(ms) — 경과시간 기반 진행률 추정에 쓴다. */
  startedAt: number;
  /** 잡 카드 제목. */
  title: string;
  /** 완료된 결과. 진행 중엔 부분적으로 차오른다. */
  items: AuthoringResultItem[];
  /** 사용자에게 보여줄 실패 사유. */
  error?: string;
  /**
   * 스트리밍 레인(count===1)의 실시간 미리보기 프레임 — 진행 밴드가 StreamPreviewPane
   * 으로 그린다. 없으면(잡+폴링 레인·터미널 도달 후) 패널 자체를 그리지 않는다.
   *
   * ⚠️ 이 값은 **화면 전용 휘발 상태**다. 서버 잡 row 에는 없고, 새로고침으로 복구한
   * 실행에도 없다(그 실행의 SSE 연결은 이미 끊겼다 — 델타를 되돌려 받을 채널이
   * 없으므로 없는 것이 사실이다). 터미널 상태에 도달하면 스토어가 지워, 완료된
   * 밴드가 마지막 사고 조각을 영원히 붙들고 있지 않게 한다.
   */
  preview?: StreamPreview;
  /**
   * 실행 당시 설계 스냅샷 — 결과 모달 헤더·목표 대비 %·후속 요청이 쓴다.
   *
   * ⚠️ **null 은 "모른다"이며, 기본값으로 절대 메우지 않는다.**
   * 예전에는 복구된 실행(요약만 있고 발주 조건이 없는 상태)에 DEFAULT_AUTHORING_SPEC
   * 을 꽂았다. 그러자 고2·165단어라고 적힌 헤더 밑에서 중3·240단어로 만든 지문이
   * "목표 대비 +45%"라는 경고를 달았고, "같은 조건으로 다시 만들기"는 그 가짜 조건
   * 으로 크레딧을 태웠다. 이제 [jobId] 라우트가 result.request 를 내려보내고
   * (store-io.normalizeJobRow 가 그 값으로 덮는다), 그것조차 없으면 null 로 둔다.
   * 렌더 측은 null 이면 describeSpec·offTarget·expectedUseRange 를 **생략**한다 —
   * 아무것도 안 그리는 것이 거짓말보다 낫다.
   */
  spec: AuthoringSpec | null;
  instruction: string;
  /**
   * 편별로 실제 배분된 골격 코드(index 순 = items 의 index 순). 모르면 null.
   * 결과 카드의 골격 뱃지가 items[].plan 을 못 읽을 때의 사실 출처다.
   */
  skeletons?: PassageSkeleton[] | null;
  /**
   * 발주 당시 자료의 **미리보기 스냅샷**(서버 result.request 유래). 복구된 실행이
   * "무엇을 재료로 썼는지"를 말할 수 있는 유일한 근거다.
   * ⚠️ 아래 materials(DraftMaterial[]) 와 절대 합치지 않는다 — 이쪽 content 는
   * 200자로 잘린 미리보기라, 이걸 DraftMaterial 로 둔갑시켜 재실행에 태우면
   * "같은 조건"이라고 적힌 버튼이 200자짜리 자료로 조용히 다른 요청을 보낸다.
   */
  materialPreviews?: AuthoringSnapshotMaterial[] | null;
  /**
   * 지문함에 넣은 시각(ms). 등록 사실은 jobId 기준 localStorage 에 남으므로
   * 새로고침해도 완료 밴드가 "또 넣으세요"라고 조르지 않는다. 안 넣었으면 없다.
   */
  registeredAt?: number;
  /**
   * 실행 당시 자료 스냅샷. "같은 조건으로 다시 만들기"가 **그때 그 자료**로 돌게
   * 하는 근거다 — 이게 없으면 지시문·설계·편수만 스냅샷을 쓰고 자료만 보드의
   * 현재 값을 써서, 결과를 보는 동안 자료 하나를 빼면 "같은 조건"이라고 적힌
   * 버튼이 조용히 다른 요청을 보낸다.
   * 새로고침으로 복구한 실행은 자료를 알 수 없어 null 이며, 그때만 보드의
   * 현재 자료로 대체한다(모르는 것을 아는 척하지 않는다).
   */
  materials: DraftMaterial[] | null;
}

/** 스토어가 밖으로 내보내는 스냅샷. */
export interface AuthoringStoreState {
  /** 최신순. 완료된 실행도 세션 동안 남아 결과를 다시 열 수 있다. */
  runs: AuthoringRun[];
}

/** 생성 시작 인자 — 보드가 스토어에 넘긴다. */
export interface StartAuthoringArgs {
  materials: DraftMaterial[];
  instruction: string;
  spec: AuthoringSpec;
  count: number;
  diversify: boolean;
  /** 재생성일 때 회피할 직전 본문들. */
  avoidTexts?: string[];
}

/** 진행 중 실행이 있는지 — 보드 CTA·탭 뱃지가 쓴다. */
export function isRunActive(run: AuthoringRun): boolean {
  return run.status === "STARTING" || run.status === "RUNNING";
}

/**
 * 지문 1편의 생성 벽시계(ms) 실측 가정. 진행률과 ETA가 **같은 상수 하나**를 봐야
 * 진행바가 90%인데 "약 2분 남음"이 함께 뜨는 모순이 생기지 않는다.
 */
const PER_ITEM_MS = 28_000;

/**
 * 이 실행이 걸릴 총 시간(ms).
 *
 * ⚠️ 분모는 편수가 아니라 **ceil(편수 / 동시 실행 수)** 다. run-job 은
 * AUTHORING_CONCURRENCY 개의 워커로 동시에 돌기 때문에, 6편이라고 6×28초가
 * 걸리는 것이 아니라 2웨이브 = 약 56초가 걸린다. 편수를 그대로 곱하던 옛 식은
 * 6편에서 실제의 약 3배(168초)를 불러, 30초 만에 끝난 실행을 사용자가 3분짜리로
 * 알고 화면을 떠났다. AUTHORING_CONCURRENCY 가 서버 파일이 아니라 schema.ts 에
 * 사는 이유가 바로 이 계산이다(서버 워커 수 = 클라이언트 ETA 분모).
 */
function runTotalMs(run: AuthoringRun): number {
  const waves = Math.ceil(Math.max(1, run.requestedCount) / AUTHORING_CONCURRENCY);
  return Math.max(1, waves * PER_ITEM_MS);
}

/**
 * 경과 시간 기반 진행률(0~100). 서버가 실제 %를 주지 않으므로 웨이브 기반 추정으로
 * 부드럽게 차오르게 하되, 완료 편수가 있으면 그 비율을 하한으로 삼아 실제보다
 * 뒤처져 보이지 않게 한다. 95% 에서 멈춰 완료 순간에만 100 이 된다.
 */
export function estimateRunProgress(run: AuthoringRun, nowMs: number): number {
  if (run.status === "COMPLETED") return 100;
  const elapsed = Math.max(0, nowMs - run.startedAt);
  const byTime = (elapsed / runTotalMs(run)) * 100;
  const byCount = run.requestedCount
    ? (run.successCount / run.requestedCount) * 100
    : 0;
  return Math.min(95, Math.max(byTime, byCount));
}

/** 사람이 읽는 남은 시간 문구. 진행률과 같은 runTotalMs 를 쓴다. */
export function formatRunEta(run: AuthoringRun, nowMs: number): string {
  const remain = Math.max(0, runTotalMs(run) - (nowMs - run.startedAt));
  if (remain < 5_000) return AUTHORING_COPY.RUN.etaSoon;
  const sec = Math.ceil(remain / 1000);
  if (sec < 60) return AUTHORING_COPY.RUN.etaSeconds(sec);
  return AUTHORING_COPY.RUN.etaMinutes(Math.ceil(sec / 60));
}
