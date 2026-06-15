// ============================================================================
// AppEvent writer — 관리자 활동 모니터링용 이벤트 기록.
//
// 설계 원칙:
//   - 도메인 테이블(extraction_jobs, workbench_ai_jobs, exams …)에 이미 남는
//     행동은 여기 다시 적지 않는다. 관리자 타임라인이 그 테이블들을 직접
//     유니온하므로 중복 기록은 노이즈만 만든다.
//   - app_events에는 도메인 테이블에 흔적이 없는 것만 적는다:
//     페이지 이동(PAGE_VIEW), 로그인(LOGIN), 문서 내보내기(EXAM_EXPORT) 등.
//   - 기록 실패가 사용자 요청을 깨뜨리면 안 된다 → 절대 throw하지 않는다.
//
// 서버 전용 모듈 (prisma 의존). 클라이언트 컴포넌트에서 import 금지.
// ============================================================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const APP_EVENT_TYPES = {
  PAGE_VIEW: "PAGE_VIEW",
  LOGIN: "LOGIN",
  EXAM_EXPORT: "EXAM_EXPORT",
} as const;

export type AppEventType =
  (typeof APP_EVENT_TYPES)[keyof typeof APP_EVENT_TYPES];

export type AppEventActorType =
  | "STAFF"
  | "STUDENT"
  | "PARENT"
  | "ADMIN"
  | "SYSTEM";

export interface AppEventInput {
  academyId: string;
  actorType: AppEventActorType;
  actorId?: string | null;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** 같은 탭 세션의 이벤트를 묶는 키 (클라이언트 sessionStorage 발급). */
  correlationId?: string | null;
  createdAt?: Date;
}

function toCreateData(input: AppEventInput): Prisma.AppEventCreateManyInput {
  return {
    academyId: input.academyId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: input.eventType,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    metadata: (input.metadata ?? undefined) as
      | Prisma.InputJsonValue
      | undefined,
    correlationId: input.correlationId ?? null,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
}

/** 이벤트 1건 기록. 실패해도 throw하지 않는다(콘솔 로그만). */
export async function logAppEvent(input: AppEventInput): Promise<void> {
  try {
    await prisma.appEvent.create({ data: toCreateData(input) });
  } catch (err) {
    console.error("[app-events] write failed", err);
  }
}

/** 이벤트 배치 기록 (페이지뷰 수집용). 실패해도 throw하지 않는다. */
export async function logAppEvents(inputs: AppEventInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await prisma.appEvent.createMany({ data: inputs.map(toCreateData) });
  } catch (err) {
    console.error("[app-events] batch write failed", err);
  }
}

// ─── 경로 정규화 ─────────────────────────────────────────────────────────────

const MAX_PATH_LENGTH = 200;
// cuid(2) id 세그먼트 — 이 코드베이스의 PK 형식 (예: cmqal90eu0001jl041cnbc8az)
const CUID_SEGMENT = /^c[a-z0-9]{20,}$/;
const NUMERIC_SEGMENT = /^\d+$/;
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 클라이언트가 보낸 경로를 저장용으로 정규화한다.
 *   - 쿼리스트링/해시 제거, 길이 제한
 *   - 동적 세그먼트(cuid/uuid/숫자)는 [id]로 치환 → 집계 가능한 경로 템플릿
 * 원본 id는 잃지만, 리소스 식별이 필요한 이벤트는 PAGE_VIEW가 아니라
 * 도메인 테이블이 담당한다. 유효하지 않은 입력이면 null.
 */
export function normalizeClientPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!raw.startsWith("/")) return null;
  const pathOnly = raw.split(/[?#]/, 1)[0].slice(0, MAX_PATH_LENGTH);
  const segments = pathOnly.split("/").map((seg) => {
    if (
      CUID_SEGMENT.test(seg) ||
      NUMERIC_SEGMENT.test(seg) ||
      UUID_SEGMENT.test(seg)
    ) {
      return "[id]";
    }
    return seg;
  });
  return segments.join("/") || "/";
}
