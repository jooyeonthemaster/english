"use client";

import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import {
  AI_PASSAGE_AUTHORING_JOB_DOMAIN,
  REFUND_CHECK_MARK,
  type AuthoringResultItem,
  type AuthoringSpec,
  type MaterialRole,
  type MaterialSourceKind,
  type PassageSkeleton,
} from "@/lib/passage-authoring/schema";
import type { StreamPreview } from "../../stream-preview-pane";
import type {
  AuthoringRun,
  AuthoringRunStatus,
  AuthoringSnapshotMaterial,
} from "./authoring-types";

// ============================================================================
// AI 지문 생성 스토어 — 무상태 I/O·파싱 계층.
//
// use-authoring-store.ts 가 400줄을 넘겨 분리했다. 경계는 "상태를 만지느냐"다.
//   · 이 파일: fetch 하고, 응답을 방어적으로 읽고, 값만 돌려준다. 스토어 배열도
//     타이머도 토스트도 모른다 → 단독으로 읽고 검증할 수 있다.
//   · 스토어: 낙관적 삽입·패치·폴 수명·토스트 1회 보장 같은 "상태"만 책임진다.
//
// 방어적 파싱이 필요한 이유(회귀 계약): 잡 라우트는 다른 에이전트 소유다.
// 응답이 `{job:{...}}` 로 감싸일 수도, 평면일 수도, 필드가 빠질 수도 있다.
// 어느 경우에도 던지지 않고 "직전 값 유지"로 흘러가야 진행 중 카드가 통째로
// 죽지 않는다.
//
// ⚠️ 실측 계약(적대 검수 CRITICAL 회귀 방지) — 응답 모양이 두 가지다.
//   · GET /passage-authoring/[jobId] : `items` 를 **최상위 평면**으로, 실패 사유를
//     `error` 키로 내려준다(슬림 투영).
//   · ai-jobs 요약/구형 래핑 : 결과가 `result.items`, 사유가 `errorMessage`.
//   두 모양을 **모두** 읽지 않으면 지문 본문·실패 사유가 UI 에 영원히 도달하지
//   않는다(크레딧은 나가고 산출물 0편). readItems/normalizeJobRow 를 고칠 때
//   반드시 양쪽 키를 유지할 것.
//
// ⚠️ 발주 조건(spec/instruction/자료/골격)은 **모르면 모른다고 둔다.**
//   [jobId] 라우트가 result.request 스냅샷을 내려보내면 그 값으로 덮고, 없으면
//   spec 을 null 로 남긴다. 예전에는 여기서 DEFAULT_AUTHORING_SPEC 을 꽂았고,
//   그 가짜 값이 결과 헤더·목표 대비 %·offTarget 경고·재실행 금액을 전부 계산했다.
//   렌더를 생략하는 편이 언제나 거짓말보다 낫다.
// ============================================================================

// ── 엔드포인트·상수 ─────────────────────────────────────────────────────────

export const AUTHORING_API = "/api/workbench/passage-authoring";

/** 실시간 생중계 레인(지문 1편 전용). 부적격이면 서버가 400 으로 되돌린다. */
export const AUTHORING_STREAM_API = `${AUTHORING_API}/stream`;

const JOBS_SUMMARY_API = `/api/workbench/ai-jobs?domain=${AI_PASSAGE_AUTHORING_JOB_DOMAIN}&limit=10&view=summary`;

/** 복구 대상으로 인정하는 최대 경과 시간 — 그보다 오래된 잡은 좀비로 본다. */
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 402 안내 문구에 쓰는 지문 1편당 크레딧(표시용 폴백).
 * 실제 청구는 서버가 하고 응답의 required 가 항상 우선이다. 이 값은 서버가
 * required 를 주지 않았을 때 문구가 비지 않게 하는 용도일 뿐이다.
 */
const CREDIT_PER_PASSAGE = 2;

const TERMINAL_RUN_STATUSES: ReadonlySet<AuthoringRunStatus> = new Set([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
]);

export function isTerminalRunStatus(status: AuthoringRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

/** SSR 가드 — 모듈 로드 시점이 아니라 호출 시점에만 crypto 를 만진다. */
export function createLocalRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── 방어적 리더 ─────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(rec: Record<string, unknown>, key: string): string {
  const value = rec[key];
  return typeof value === "string" ? value : "";
}

function readNumber(
  rec: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = rec[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** `{job:{...}}` 이든 평면이든 잡 행처럼 보이는 레코드를 뽑는다. */
function pickJobRow(root: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!root) return null;
  return asRecord(root.job) ?? root;
}

function pickJobId(root: Record<string, unknown> | null): string {
  if (!root) return "";
  const direct = readString(root, "jobId");
  if (direct) return direct;
  const job = asRecord(root.job);
  if (job) {
    const nested = readString(job, "id");
    if (nested) return nested;
  }
  return readString(root, "id");
}

/**
 * 결과 배열을 평면(`row.items`)·중첩(`row.result.items`) 양쪽에서 읽는다.
 * 폴링 대상인 GET [jobId] 는 평면이고 요약/구형 응답은 중첩이다 — 한쪽만 읽으면
 * run.items 가 영원히 [] 로 고정돼 결과 모달이 텅 빈다.
 */
function readItems(rec: Record<string, unknown>): AuthoringResultItem[] | null {
  const direct = rec.items;
  if (Array.isArray(direct)) return direct as AuthoringResultItem[];
  const result = asRecord(rec.result);
  if (!result) return null;
  const nested = result.items;
  return Array.isArray(nested) ? (nested as AuthoringResultItem[]) : null;
}

/** 실패 사유 키도 두 모양(`errorMessage` / `error`)을 모두 수용한다. */
function readErrorMessage(rec: Record<string, unknown>): string {
  return readString(rec, "errorMessage") || readString(rec, "error");
}

// ── 요청 스냅샷(발주 조건) ───────────────────────────────────────────────────

/** 이 실행이 무엇을 어떻게 발주해 만든 것인지 — 아는 만큼만 담는다. */
export interface AuthoringRequestSnapshot {
  spec: AuthoringSpec | null;
  instruction: string;
  count: number;
  skeletons: PassageSkeleton[] | null;
  materials: AuthoringSnapshotMaterial[] | null;
}

/**
 * spec 처럼 보이는가. `{}` 한 덩어리도 zod 기본값을 태우면 "고2·165단어"라는
 * 그럴듯한 거짓 스냅샷이 되므로, **서버가 실제로 쓴 흔적**(gradeBand 문자열 +
 * targetWords 숫자)이 있을 때만 spec 으로 인정한다. 없으면 null 이 사실이다.
 */
function readSpec(value: unknown): AuthoringSpec | null {
  const rec = asRecord(value);
  if (!rec) return null;
  if (typeof rec.gradeBand !== "string") return null;
  if (typeof rec.targetWords !== "number") return null;
  return rec as unknown as AuthoringSpec;
}

function readSnapshotMaterials(value: unknown): AuthoringSnapshotMaterial[] | null {
  if (!Array.isArray(value)) return null;
  const list = value
    .map((raw) => asRecord(raw))
    .filter((rec): rec is Record<string, unknown> => !!rec && typeof rec.id === "string")
    .map((rec) => rec as unknown as AuthoringSnapshotMaterial);
  return list;
}

/**
 * 잡 행에서 발주 조건 스냅샷을 읽는다. 평면(`row.request`)·중첩
 * (`row.result.request`) 두 모양을 모두 본다 — items 와 같은 이유로 갈라져 있다.
 * 스냅샷이 아예 없거나 spec 을 인정할 수 없으면 **null**(= 덮지 않는다).
 */
export function readRequestSnapshot(
  rec: Record<string, unknown>,
): AuthoringRequestSnapshot | null {
  const direct = asRecord(rec.request);
  const nested = direct ? null : asRecord(asRecord(rec.result)?.request);
  const raw = direct ?? nested;
  if (!raw) return null;

  const spec = readSpec(raw.spec);
  // spec 이 없는 반쪽 스냅샷은 통째로 버린다 — "설계는 모르는데 설계 대비 %는
  // 그린다"가 이 화면에서 가장 나쁜 상태다.
  if (!spec) return null;

  const skeletons = Array.isArray(raw.skeletons)
    ? (raw.skeletons.filter(
        (code): code is string => typeof code === "string",
      ) as PassageSkeleton[])
    : null;

  return {
    spec,
    instruction: readString(raw, "instruction"),
    count: readNumber(raw, "count", 0),
    skeletons: skeletons && skeletons.length > 0 ? skeletons : null,
    materials: readSnapshotMaterials(raw.materials),
  };
}

export function mapJobStatus(raw: string): AuthoringRunStatus {
  switch (raw) {
    case "COMPLETED":
      return "COMPLETED";
    case "PARTIAL":
      return "PARTIAL";
    case "FAILED":
    case "CANCELLED":
      return "FAILED";
    default:
      // PENDING·PROCESSING·미지의 값 — 아직 도는 중으로 본다.
      return "RUNNING";
  }
}

// ── 잡 행 → run 패치 정규화 ─────────────────────────────────────────────────

export interface RunProgressSnapshot {
  items: AuthoringResultItem[];
  successCount: number;
  failedCount: number;
  requestedCount: number;
  title: string;
}

export interface NormalizedJobRow {
  status: AuthoringRunStatus;
  patch: Partial<AuthoringRun>;
}

/**
 * 잡 행을 run 패치로 정규화한다. 빠진 필드는 prev(직전 run 값)로 메운다.
 * 완성 편수는 서버 카운터와 실제 결과 배열 중 큰 값을 쓴다 — 서버가 카운터를
 * 마지막에 한 번만 올리는 구현이어도 진행률이 뒤처져 보이지 않는다.
 *
 * 발주 조건은 스냅샷이 **있을 때만** 덮는다. 없으면 키 자체를 넣지 않아 직전 값이
 * 그대로 남는다 — 같은 세션에서 시작한 실행은 이미 진짜 spec 을 들고 있고,
 * 복구된 실행은 null(=모른다)인 채로 남는 것이 사실이다.
 */
export function normalizeJobRow(
  row: Record<string, unknown>,
  prev: RunProgressSnapshot,
): NormalizedJobRow {
  const status = mapJobStatus(readString(row, "status"));
  const items = readItems(row) ?? prev.items;
  const okItems = items.filter((item) => item.status === "OK").length;
  const errorMessage = readErrorMessage(row);
  const title = readString(row, "title");
  const request = readRequestSnapshot(row);

  return {
    status,
    patch: {
      status,
      items,
      successCount: Math.max(readNumber(row, "successCount", 0), okItems),
      failedCount: Math.max(
        readNumber(row, "failedCount", 0),
        items.length - okItems,
      ),
      requestedCount: readNumber(row, "requestedCount", 0) || prev.requestedCount,
      ...(title ? { title } : {}),
      ...(errorMessage ? { error: errorMessage } : {}),
      ...(request
        ? {
            spec: request.spec,
            instruction: request.instruction,
            skeletons: request.skeletons,
            materialPreviews: request.materials,
            // 편수도 스냅샷이 정본이다 — 요약 응답의 requestedCount 가 비어 있는
            // 구형 행에서도 "몇 편을 발주했는지"가 살아난다.
            ...(request.count > 0 ? { requestedCount: request.count } : {}),
          }
        : {}),
    },
  };
}

// ── 과금 문구 (한 밴드에 하나만) ─────────────────────────────────────────────

/**
 * (해소 완료) 서버가 환불 실패 시 잡 errorMessage 뒤에 덧대는 표식은 이제
 * schema.ts 가 정본이고 이 파일은 그걸 import 한다 — 위 import 블록의
 * REFUND_CHECK_MARK 참조.
 *
 * 경위: STEP 10-4 는 "run-job 에서 import" 였지만 run-job 은 최상단에서
 * `node:crypto`·prisma·supabase 서비스 클라이언트를 끌어와 `"use client"` 인 이
 * 파일이 import 할 수 없다. 그래서 한동안 여기서 문자열을 손코딩했고, 그 사이
 * authoring-loading-cards 가 자기 판정("환불 확인이 필요" 조각 매칭)을 따로 갖게
 * 되어 판정이 두 벌로 갈라졌다 — 계약이 막으려던 바로 그 상태다.
 * 지금은 zod 만 import 하는 순수 계약 파일(schema.ts)이 정본을 갖고,
 * run-job 은 re-export, 이 파일은 import, loading-cards 는 아래 creditNoticeFor
 * 를 import 한다. **클라이언트 쪽 판정 소유자는 이 파일 하나뿐이다.**
 */

/**
 * 이 실행에 대해 화면이 **주장해도 되는** 과금 사실. 완료 밴드와 실패 밴드가 같은
 * 규칙을 쓰게 하는 단일 진실원이다(문구는 glossary, 판정은 여기).
 *  · 환불 확인 표식이 있으면 그 한 문장만. 다른 문장과 겹치면 "돌려드려요"와
 *    "확인이 필요해요"가 같은 밴드에서 동시에 뜬다(실제 사고).
 *  · 실패가 0편이면 아무 말도 하지 않는다 — 정상 완료에 과금 문장을 붙이면
 *    선생님은 무언가 잘못됐다고 읽는다.
 *  · jobId 가 붙었다 = 서버가 잡을 만들고 2N 을 선차감했다 → 실패 편만큼 환불된다.
 *  · jobId 가 없고 전송 확인이 안 된 경우 = 차감 여부를 **모른다**. 아무 주장도
 *    하지 않는다(여기서 "환불됐다"고 하면 실제로 진행 중인 실행을 사용자가 다시
 *    눌러 이중 과금한다).
 *  · jobId 가 없고 그 외(402 크레딧 부족·400 검증 실패) = 애초에 차감이 없었다.
 */
export function creditNoticeFor(run: AuthoringRun): string | null {
  const message = (run.error ?? "").trim();
  if (message.includes(REFUND_CHECK_MARK)) return AUTHORING_COPY.CREDIT.refundCheck;
  const settledWithLoss =
    run.status === "FAILED" || run.status === "PARTIAL" || run.failedCount > 0;
  if (!settledWithLoss) return null;
  if (run.jobId) return AUTHORING_COPY.CREDIT.refundAuto;
  if (message === AUTHORING_DELIVERY_UNKNOWN_MESSAGE) return null;
  return AUTHORING_COPY.CREDIT.notCharged;
}

// ── 생성 요청 ───────────────────────────────────────────────────────────────

/**
 * 서버로 좁혀 보내는 자료 1건 — READY 인 자료만 이 형태가 된다.
 *
 * ⚠️ 이 모양은 서버 계약(schema.authoringMaterialSchema)의 **부분집합**이어야 하고,
 * 서버가 실제로 읽는 필드를 빠뜨리면 안 된다. 하이브리드 3필드가 여기 없던 동안
 * 서버·조달·화면 스위치가 전부 준비돼 있는데도 원본 페이지가 한 장도 실리지
 * 않았다(요청 본문에는 **경로 문자열만** 싣는다 — 이미지 바이트를 실으면 4.5MB
 * 요청 본문 벽에 걸린다. 실제 다운로드는 run-job 의 after() 안에서 한다).
 */
export interface AuthoringPayloadMaterial {
  id: string;
  role: MaterialRole;
  name: string;
  sourceKind: MaterialSourceKind;
  content: string;
  note: string;
  /** 원본 페이지 이미지도 함께 보낼지(사용자가 켠 것만 — 숨은 자동 결정 금지). */
  sendPages?: boolean;
  /** 보낼 수 있는 원본 페이지 수. 편당 상한은 서버가 따로 건다. */
  pageCount?: number;
  /** 페이지 JPEG 묶음의 스토리지 경로. 서버가 academyId 로 다시 검증한다. */
  storagePath?: string;
}

export interface AuthoringPayload {
  materials: AuthoringPayloadMaterial[];
  instruction: string;
  spec: AuthoringSpec;
  count: number;
  diversify: boolean;
  avoidTexts: string[];
}

export type StartJobOutcome =
  | { ok: true; jobId: string; row: Record<string, unknown> | null }
  | { ok: false; message: string };

/**
 * 요청 멱등키 헤더. 같은 키로 다시 POST 하면 서버가 기존 잡 id 를 그대로 돌려주고
 * 재차 과금하지 않는다 — 응답만 유실된 재시도가 2N 크레딧을 두 번 태우는 사고를
 * 구조적으로 막는다(요청 본문은 계약 파일이라 헤더로 싣는다).
 */
export const AUTHORING_REQUEST_ID_HEADER = "x-authoring-request-id";

/**
 * 응답을 받지 못했을 때의 안내. "실패했다"고 단정하면 서버가 정상 과금·정상
 * 생성 중인 실행을 사용자가 다시 눌러 이중 과금한다. 그래서 이 문구는
 * **판정을 보류**하고 확인 경로를 알려주는 역할만 한다.
 *
 * 문장 자체는 사전(TOAST.deliveryUnknown)이 소유하고 여기서는 **별칭만** 둔다 —
 * 이 상수는 실패 카드가 환불 문구를 감출 때(creditNoticeFor) 쓰는 **식별자**이기도
 * 해서 참조가 하나여야 한다. 문구를 여기서 손코딩하면 사전 키가 사문이 되고,
 * 이 파일이 반복해서 겪은 '문구 두 벌 표류'가 그대로 돌아온다.
 */
export const AUTHORING_DELIVERY_UNKNOWN_MESSAGE =
  AUTHORING_COPY.TOAST.deliveryUnknown;

/** 새 요청 멱등키. createLocalRunId 와 같은 SSR 가드를 쓴다. */
export function createRequestId(): string {
  return createLocalRunId();
}

/**
 * 생성 잡 등록. 402(크레딧 부족)를 포함한 모든 실패를 "사용자가 읽고 조치할 수
 * 있는 한국어 문장" 하나로 정규화해서 돌려준다 — 스토어는 그걸 그대로 띄운다.
 */
export async function postAuthoringJob(
  payload: AuthoringPayload,
  requestId: string,
): Promise<StartJobOutcome> {
  const res = await fetch(AUTHORING_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [AUTHORING_REQUEST_ID_HEADER]: requestId,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const root = asRecord((await res.json().catch(() => null)) as unknown);

  if (res.status === 402) {
    const fallbackRequired = payload.count * CREDIT_PER_PASSAGE;
    const balance = root ? readNumber(root, "balance", 0) : 0;
    const required = root
      ? readNumber(root, "required", fallbackRequired)
      : fallbackRequired;
    return {
      ok: false,
      message: AUTHORING_COPY.TOAST.insufficientCredits(balance, required),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        (root && readString(root, "error")) || AUTHORING_COPY.TOAST.startFailed,
    };
  }

  const jobId = pickJobId(root);
  if (!jobId) {
    return { ok: false, message: AUTHORING_COPY.TOAST.jobRegisterFailed };
  }
  return { ok: true, jobId, row: pickJobRow(root) };
}

// ── 실시간 생중계(SSE) 레인 ─────────────────────────────────────────────────
//
// 왜 잡+폴링 옆에 이 레인이 따로 있는가:
//   잡 라우트는 after() 백그라운드에서 생성한다. 서버리스라 **다른 요청이 그 안의
//   모델 델타를 볼 방법이 없다** — 폴링은 완성된 편만 본다. 그래서 "사고/집필을
//   실시간으로 보여 달라"는 요구는 생성 자체가 SSE 응답 안에서 돌아야 성립한다.
//   지문 1편(count===1)일 때만 쓰고, 그 외에는 기존 잡 경로가 그대로 맡는다
//   (동시성 3 워커·부분 환불·페이지 이미지 조달이 거기 있다).
//
// ⚠️ 이중 과금 차단(가장 중요한 계약):
//   서버는 크레딧을 차감한 **직후** meta 프레임을 보낸다. 그러므로
//     · 프레임을 하나라도 받았다 = 접수·차감됐다 → **절대 잡 경로로 폴백하지 않는다.**
//       스트림이 끊기면 kind:"detached" 로 알리고, 스토어는 그 jobId 로 폴링에 붙는다.
//     · 프레임을 하나도 못 받았다(HTTP 400/네트워크 선실패) = 차감이 없었다 →
//       조용히 잡 경로로 폴백해도 안전하다.

/** 스트림 1건의 결말. 어느 갈래인지가 곧 "폴백해도 되는가"의 답이다. */
export type AuthoringStreamOutcome =
  /** 서버가 끝까지 만들어 결과 행까지 보냈다. 폴링 불필요. */
  | { kind: "done"; jobId: string; row: Record<string, unknown> }
  /** 접수는 됐는데 연결이 끊겼다(또는 멱등 중복). jobId 로 폴링에 붙어야 한다. */
  | { kind: "detached"; jobId: string }
  /** 서버가 실패를 확정했다(환불까지 끝난 상태). 그대로 사용자에게 알린다. */
  | { kind: "failed"; jobId: string | null; message: string }
  /** 서버가 이 요청을 접수하지 않았다. 잡 경로로 폴백해도 이중 과금이 없다. */
  | { kind: "ineligible" };

export interface AuthoringStreamHandlers {
  /** 첫 프레임(=차감 완료) 시 1회. 이후 폴백 금지 신호이기도 하다. */
  onAccepted?: (jobId: string) => void;
  /** 미리보기 프레임. 호출 빈도는 이 함수가 스로틀한다(아래 PREVIEW_THROTTLE_MS). */
  onPreview?: (preview: StreamPreview) => void;
}

/** 델타 1건마다 리렌더하면 밴드 전체가 초당 수십 번 다시 그려진다. */
const PREVIEW_THROTTLE_MS = 120;
/** 패널에 남기는 꼬리 길이 — 고정 높이 4줄을 채우고도 남는 양. */
const PREVIEW_TAIL_CHARS = 900;
/** 스트림 전체 상한. 서버 예산(265s)+여유. 끊기면 detached 로 폴링에 넘긴다. */
const STREAM_TIMEOUT_MS = 320_000;

/**
 * 지문 1편을 SSE 로 받으며 만든다. 반환값의 kind 로 스토어가 다음 행동을 정한다.
 *
 * 응답이 SSE 가 아니라 JSON 이면 "멱등 중복"이다 — 서버가 이미 접수한 실행이므로
 * 새 스트림을 열지 않고 기존 jobId 를 돌려준다(그 경로도 detached = 폴링).
 */
export async function streamAuthoringJob(
  payload: AuthoringPayload,
  requestId: string,
  handlers: AuthoringStreamHandlers = {},
): Promise<AuthoringStreamOutcome> {
  let jobId: string | null = null;

  const res = await fetch(AUTHORING_STREAM_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [AUTHORING_REQUEST_ID_HEADER]: requestId,
    },
    credentials: "include",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!res.ok) {
    // 402 만 사용자에게 알린다 — 잡 경로로 폴백해도 같은 402 를 받을 뿐이다.
    if (res.status === 402) {
      const root = asRecord((await res.json().catch(() => null)) as unknown);
      const fallbackRequired = payload.count * CREDIT_PER_PASSAGE;
      const balance = root ? readNumber(root, "balance", 0) : 0;
      const required = root
        ? readNumber(root, "required", fallbackRequired)
        : fallbackRequired;
      return {
        kind: "failed",
        jobId: null,
        message: AUTHORING_COPY.TOAST.insufficientCredits(balance, required),
      };
    }
    // 그 외 비정상 응답은 **접수 전**이라 차감이 없다 → 잡 경로로 조용히 폴백.
    return { kind: "ineligible" };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") || !res.body) {
    const root = asRecord((await res.json().catch(() => null)) as unknown);
    const existingId = pickJobId(root);
    return existingId
      ? { kind: "detached", jobId: existingId }
      : { kind: "ineligible" };
  }

  const startedAt = Date.now();
  let outputStartedAt: number | undefined;
  let reasoningTail = "";
  let contentTail = "";
  let stage: string | undefined;
  let lastEmit = 0;
  const pushPreview = (force = false) => {
    if (!handlers.onPreview) return;
    const now = Date.now();
    if (!force && now - lastEmit < PREVIEW_THROTTLE_MS) return;
    lastEmit = now;
    handlers.onPreview({
      phase: outputStartedAt ? "generating" : "thinking",
      startedAt,
      outputStartedAt,
      tail: (outputStartedAt ? contentTail : reasoningTail).slice(
        -PREVIEW_TAIL_CHARS,
      ),
      ...(stage ? { stage } : {}),
    });
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneRow: Record<string, unknown> | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = typeof frame.t === "string" ? frame.t : "";
        if (typeof frame.jobId === "string" && frame.jobId && !jobId) {
          jobId = frame.jobId;
          handlers.onAccepted?.(jobId);
        }
        if (type === "meta") {
          // 첫 델타 전에도 패널을 띄운다 — 사용자가 "사고 중 0s"부터 본다.
          reasoningTail = AUTHORING_COPY.PREVIEW.waiting;
          pushPreview(true);
        } else if (type === "r" && typeof frame.d === "string") {
          reasoningTail = (reasoningTail + frame.d).slice(-PREVIEW_TAIL_CHARS);
          pushPreview();
        } else if (type === "c" && typeof frame.d === "string") {
          if (!outputStartedAt) {
            outputStartedAt = Date.now();
            if (!stage) stage = AUTHORING_COPY.PREVIEW.stageDraft;
          }
          contentTail = (contentTail + frame.d).slice(-PREVIEW_TAIL_CHARS);
          pushPreview();
        } else if (type === "revise" || type === "fallback") {
          // 두 프레임 모두 "다시 쓴다"는 사실이라 패널을 사고 단계로 되감는다.
          outputStartedAt = undefined;
          contentTail = "";
          stage =
            type === "revise"
              ? AUTHORING_COPY.PREVIEW.stageRevise
              : AUTHORING_COPY.PREVIEW.stageFallback;
          reasoningTail =
            type === "revise"
              ? AUTHORING_COPY.PREVIEW.reviseBody
              : AUTHORING_COPY.PREVIEW.fallbackBody;
          pushPreview(true);
        } else if (type === "error") {
          return {
            kind: "failed",
            jobId,
            message:
              (typeof frame.message === "string" && frame.message.trim()) ||
              AUTHORING_COPY.TOAST.failed,
          };
        } else if (type === "done") {
          const row = asRecord(frame.row);
          if (row) doneRow = row;
        }
      }
    }
  } catch {
    // 읽는 도중 끊김 — 서버는 계속 만들고 있을 수 있다(잡 row 가 정본).
    return jobId ? { kind: "detached", jobId } : { kind: "ineligible" };
  } finally {
    // error 프레임을 만나면 루프 한복판에서 반환한다 — 남은 본문을 놓아주지 않으면
    // 커넥션이 탭 수명 동안 매달린다(서버는 이미 잡을 종결했다).
    void reader.cancel().catch(() => undefined);
  }

  if (doneRow) {
    const id = pickJobId(doneRow) || jobId || "";
    if (id) return { kind: "done", jobId: id, row: doneRow };
  }
  // 프레임을 하나라도 받았다면 서버가 접수했다는 뜻이므로 폴백하지 않는다.
  return jobId ? { kind: "detached", jobId } : { kind: "ineligible" };
}

/** 잡 상세 1회 조회. 실패·비정상 응답은 null(= 이번 폴은 없던 일). */
export async function fetchAuthoringJobRow(
  jobId: string,
  signal: AbortSignal,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${AUTHORING_API}/${jobId}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!res.ok) return null;
  const payload = (await res.json().catch(() => null)) as unknown;
  if (signal.aborted) return null;
  return pickJobRow(asRecord(payload));
}

// ── 페이지 재진입 복구 ──────────────────────────────────────────────────────

/**
 * 사용자가 명시적으로 닫은(=버린) 완료 잡. 복구는 24시간 창을 훑으므로, 이걸
 * 기억하지 않으면 닫은 카드가 새로고침마다 되살아난다.
 *
 * ⚠️ **등록 시점에는 기록하지 않는다.** 6편 중 2편만 넣고 새로고침하면 남은 4편을
 * 회수할 길이 사라지기 때문이다(이 파일이 고치려는 바로 그 사고). 되살아난 카드는
 * 다시 열 수 있으므로 무해하지만, 잃어버린 결과는 되돌릴 수 없다.
 */
const DISMISSED_JOBS_KEY = "smoat:authoring:dismissed-jobs";
const DISMISSED_JOBS_LIMIT = 100;

function readDismissedJobIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_JOBS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

/** 닫은 잡 id 를 기억한다. 저장 실패(사파리 프라이빗 등)는 무해하게 무시한다. */
export function rememberDismissedAuthoringJob(jobId: string): void {
  if (typeof window === "undefined" || !jobId) return;
  try {
    const next = [...readDismissedJobIds()].filter((id) => id !== jobId);
    next.push(jobId);
    window.localStorage.setItem(
      DISMISSED_JOBS_KEY,
      JSON.stringify(next.slice(-DISMISSED_JOBS_LIMIT)),
    );
  } catch {
    // 저장 못 해도 기능은 돈다 — 카드가 한 번 더 보일 뿐이다.
  }
}

// ── 지문함 등록 기록 ────────────────────────────────────────────────────────

/**
 * 이미 지문함에 넣은 잡. dismiss 기록과 **같은 방식**(jobId 기준 localStorage)이다.
 *
 * 왜 컴포넌트 state 에서 승격했는가: 등록 사실이 보드 로컬 state 에만 있으면
 * 새로고침 한 번에 사라져, 이미 넣은 6편짜리 결과가 다시 "지문함에 넣기"를 조르고
 * 선생님은 같은 지문을 두 번 등록한다. 반대로 "아직 안 넣은 결과"를 경고 없이
 * 버리지 못하게 막는 근거이기도 하므로 localId(세션 한정)가 아니라 jobId 여야 한다.
 *
 * dismiss 와 달리 값이 **시각(ms)** 인 이유는 run.registeredAt 이 그걸 그대로 쓰기
 * 때문이다(밴드가 "지문함에 넣었어요"를 언제 기준으로 말하는지가 사실이어야 한다).
 */
const REGISTERED_JOBS_KEY = "smoat:authoring:registered-jobs";
const REGISTERED_JOBS_LIMIT = 100;

/** jobId → 등록 시각(ms). 읽기 실패는 빈 맵(= 기록 없음)으로 흘린다. */
export function readRegisteredAuthoringJobs(): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(REGISTERED_JOBS_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    const rec = asRecord(parsed);
    if (!rec) return new Map();
    const entries: Array<[string, number]> = [];
    for (const [jobId, at] of Object.entries(rec)) {
      if (typeof at === "number" && Number.isFinite(at)) entries.push([jobId, at]);
    }
    return new Map(entries);
  } catch {
    return new Map();
  }
}

/** 등록 사실을 남긴다. 저장 실패(사파리 프라이빗 등)는 무해하게 무시한다. */
export function rememberRegisteredAuthoringJob(
  jobId: string,
  at: number = Date.now(),
): void {
  if (typeof window === "undefined" || !jobId) return;
  try {
    const map = readRegisteredAuthoringJobs();
    map.delete(jobId);
    map.set(jobId, at);
    // 오래된 기록부터 버린다(Map 은 삽입 순서를 지킨다).
    const kept = [...map.entries()].slice(-REGISTERED_JOBS_LIMIT);
    window.localStorage.setItem(
      REGISTERED_JOBS_KEY,
      JSON.stringify(Object.fromEntries(kept)),
    );
  } catch {
    // 저장 못 해도 기능은 돈다 — 이 세션에서만 등록 표시가 유지된다.
  }
}

/** 복구된 run 1건 — 아직 도는 중인지(active)를 함께 알려준다. */
export interface RecoveredAuthoringRun {
  run: AuthoringRun;
  /** true 면 폴을 걸어야 하고, false 면 이미 끝난 실행(알림·자동펼침 금지)이다. */
  active: boolean;
}

/**
 * 최근 24시간 내 잡을 run 으로 복원한다. 두 부류를 모두 되살린다.
 *
 *  1) PROCESSING·PENDING — 아직 도는 중(active). 새로고침해도 진행 카드가
 *     사라지지 않아야 한다. 큐 대기(PENDING)도 진행 중으로 본다.
 *  2) COMPLETED·PARTIAL — **이미 끝난 실행**(inactive). 이걸 빼면 새로고침 한 번에
 *     2N 크레딧으로 만든 지문에 접근할 방법이 0이 된다(결과 본문은 잡 result 에만
 *     있고, 그걸 여는 UI 는 이 run 목록뿐이다). 복원 시 폴은 걸지 않고, 스토어가
 *     완료 알림·자동 펼침을 "이미 지난 것"으로 선등록해 재접속마다 토스트와
 *     전면 모달이 튀어나오지 않게 한다.
 *
 * 요약 뷰에는 요청 스냅샷도 결과 본문도 없다. 그래서 items 는 빈 배열,
 * **spec 은 null(= 모른다)** 로 시작한다 — 사용자가 결과를 열 때 loadRunItems 가
 * 상세([jobId])를 1회 조회하고, 그 응답의 request 스냅샷이 spec/instruction/
 * 자료 미리보기/골격을 채운다(지연 로드).
 *
 * ⚠️ 여기서 DEFAULT_AUTHORING_SPEC 을 꽂지 않는다. 예전에는 꽂았고, 그 가짜 값이
 * 결과 헤더·목표 대비 %·offTarget 경고·재실행 금액을 전부 계산했다. 상세를 아직
 * 안 받아온 동안 spec 자리가 비는 것은 사실의 반영이지 결함이 아니다.
 */
export async function fetchRecoverableAuthoringRuns(): Promise<
  RecoveredAuthoringRun[]
> {
  const res = await fetch(JOBS_SUMMARY_API, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return [];
  const root = asRecord((await res.json().catch(() => null)) as unknown);
  const rows = root && Array.isArray(root.jobs) ? root.jobs : [];
  const cutoff = Date.now() - RECOVERY_WINDOW_MS;
  const dismissed = readDismissedJobIds();
  const registered = readRegisteredAuthoringJobs();

  const restored: RecoveredAuthoringRun[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    const rawStatus = readString(row, "status");
    const active = rawStatus === "PROCESSING" || rawStatus === "PENDING";
    const finished = rawStatus === "COMPLETED" || rawStatus === "PARTIAL";
    if (!active && !finished) continue;
    const jobId = readString(row, "id");
    if (!jobId) continue;
    // 진행 중인 실행은 사용자가 닫았더라도 반드시 되살린다(과금이 진행 중이다).
    if (finished && dismissed.has(jobId)) continue;
    const createdAt = Date.parse(readString(row, "createdAt"));
    const startedAt = Number.isFinite(createdAt) ? createdAt : Date.now();
    if (startedAt < cutoff) continue;

    restored.push({
      active,
      run: {
        jobId,
        localId: createLocalRunId(),
        status: active ? "RUNNING" : mapJobStatus(rawStatus),
        requestedCount: readNumber(row, "requestedCount", 1),
        successCount: readNumber(row, "successCount", 0),
        failedCount: readNumber(row, "failedCount", 0),
        startedAt,
        title: readString(row, "title") || AUTHORING_COPY.RUN.untitled,
        items: [],
        // 요약 응답에는 발주 조건이 없다 → 모른다(null). 상세 조회가 채운다.
        spec: null,
        instruction: "",
        skeletons: null,
        materialPreviews: null,
        // 복구된 실행은 어떤 자료 **원본**으로 만들었는지 알 수 없다 — 빈 배열
        // (=자료 없음)이 아니라 null(=모름)로 남겨, 후속 요청이 보드의 현재 자료로
        // 대체하게 한다. materialPreviews 는 200자 미리보기라 재실행에 못 쓴다.
        materials: null,
        ...(registered.has(jobId) ? { registeredAt: registered.get(jobId) } : {}),
        ...(finished ? { error: readErrorMessage(row) || undefined } : {}),
      },
    });
  }
  return restored;
}
