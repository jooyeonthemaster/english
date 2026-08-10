import { NextResponse, type NextRequest } from "next/server";

import { getStaffSession } from "@/lib/auth";
import {
  AI_PASSAGE_AUTHORING_JOB_DOMAIN,
  MATERIAL_ROLES,
  MATERIAL_SOURCE_KINDS,
  type AuthoringJobResult,
  type AuthoringResultItem,
  type MaterialRole,
  type MaterialSourceKind,
} from "@/lib/passage-authoring/schema";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ============================================================================
// GET /api/workbench/passage-authoring/[jobId] — 생성 잡 폴링
//
// POST 가 after() 로 백그라운드 실행을 남기고 즉시 응답하므로, 진행 상황은
// 오직 이 엔드포인트로만 관찰된다. run-job 이 한 편 끝날 때마다 result 를
// 갱신하기 때문에 폴링은 완성된 편부터 차례로 받아 카드를 채울 수 있다.
//
// 응답은 잡 row 를 그대로 흘려보내지 않는다 — config(원본 자료 본문 등)와
// 내부 필드는 빼고, 클라이언트가 실제로 쓰는 스칼라 + items + request 스냅샷만
// 내려보낸다 (몇 초 간격 폴링이라 페이로드가 곧 egress 비용이다).
//
// ⚠️ request 스냅샷을 내려보내는 이유(회귀 방지):
//   이 라우트가 items 만 내려보내던 동안, 스튜디오를 다시 열어 복구한 실행은
//   spec/instruction 이 **기본값으로 되살아났다.** 그리고 그 가짜 값이 결과 모달
//   헤더·목표 대비 %·offTarget 경고·후속 요청 금액을 전부 계산했다(고2·165단어로
//   적어 놓고 실제로는 중3·240단어로 만든 결과를 그렸다).
//   → run-job.buildRequestSnapshot 이 result.request 에 남긴 값을 그대로 흘린다.
//   없으면 **null 을 내려보낸다.** 클라이언트가 기본값으로 채우는 것보다 렌더를
//   생략하는 편이 언제나 낫다 — 모르는 것을 아는 척하지 않는다.
//   페이로드 상한: 자료 12개 × preview 200자 ≈ 2.5KB. 본문(items)에 비해 작다.
// ============================================================================

/**
 * result JSON → AuthoringResultItem[]. 잡 row 의 JSON 은 스키마 강제가 없는
 * 저장소이므로(구형 레코드·중단된 쓰기) 구조가 맞는 원소만 통과시킨다.
 */
function readItems(result: unknown): AuthoringResultItem[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const items = (result as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is AuthoringResultItem => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.passage === "string";
  });
}

// ── 요청 스냅샷 ─────────────────────────────────────────────────────────────

type RequestSnapshot = NonNullable<AuthoringJobResult["request"]>;
type SnapshotMaterial = RequestSnapshot["materials"][number];

const ROLE_SET: ReadonlySet<string> = new Set(MATERIAL_ROLES);
const SOURCE_KIND_SET: ReadonlySet<string> = new Set(MATERIAL_SOURCE_KINDS);

/** 자료 미리보기 상한 — run-job 이 저장할 때 쓰는 값과 같다(이중 안전). */
const PREVIEW_CHARS = 200;

function readSnapshotMaterial(raw: unknown): SnapshotMaterial | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;

  // 역할·출처는 열거형이다. 모르는 값이 통과하면 화면이 라벨을 찾지 못해 빈칸을
  // 그린다 — 그때는 "기타"가 사실에 더 가깝다(자료가 있다는 것만은 사실이다).
  const role: MaterialRole =
    typeof row.role === "string" && ROLE_SET.has(row.role)
      ? (row.role as MaterialRole)
      : "OTHER";
  const sourceKind: MaterialSourceKind =
    typeof row.sourceKind === "string" && SOURCE_KIND_SET.has(row.sourceKind)
      ? (row.sourceKind as MaterialSourceKind)
      : "TEXT";

  const chars = row.charsSent;
  const charsOk =
    !!chars &&
    typeof chars === "object" &&
    !Array.isArray(chars) &&
    typeof (chars as { sent?: unknown }).sent === "number" &&
    typeof (chars as { total?: unknown }).total === "number";

  return {
    id,
    role,
    name: typeof row.name === "string" ? row.name : "",
    sourceKind,
    note: typeof row.note === "string" ? row.note : "",
    preview:
      typeof row.preview === "string" ? row.preview.slice(0, PREVIEW_CHARS) : "",
    ...(typeof row.sendPages === "boolean" ? { sendPages: row.sendPages } : {}),
    ...(charsOk ? { charsSent: chars as { sent: number; total: number } } : {}),
  };
}

/**
 * result JSON → 요청 스냅샷. 없으면 **null**(= 모른다). 절대 기본값으로 채우지
 * 않는다 — 위 헤더 주석의 사고가 정확히 그 "친절한 기본값"에서 나왔다.
 *
 * spec 이 없는 반쪽 스냅샷도 통째로 버린다. 지시문만 남기고 설계를 기본값으로
 * 메우면 "설계는 모르는데 설계 대비 %는 그린다"는 최악의 상태가 된다.
 */
function readRequestSnapshot(result: unknown): RequestSnapshot | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const raw = (result as { request?: unknown }).request;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const spec = row.spec;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return null;

  const materials = Array.isArray(row.materials) ? row.materials : [];
  const skeletons = Array.isArray(row.skeletons)
    ? row.skeletons.filter((code): code is string => typeof code === "string")
    : null;

  return {
    instruction: typeof row.instruction === "string" ? row.instruction : "",
    spec: spec as RequestSnapshot["spec"],
    count:
      typeof row.count === "number" && Number.isFinite(row.count) ? row.count : 0,
    ...(skeletons
      ? { skeletons: skeletons as NonNullable<RequestSnapshot["skeletons"]> }
      : {}),
    materials: materials
      .map(readSnapshotMaterial)
      .filter((item): item is SnapshotMaterial => item !== null),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await prisma.workbenchAiJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      academyId: true,
      domain: true,
      deletedAt: true,
      status: true,
      title: true,
      requestedCount: true,
      successCount: true,
      failedCount: true,
      result: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
    },
  });

  // 다른 학원의 잡·삭제된 잡·다른 도메인의 잡은 존재 자체를 알리지 않는다(404).
  if (
    !job ||
    job.academyId !== staff.academyId ||
    job.deletedAt ||
    job.domain !== AI_PASSAGE_AUTHORING_JOB_DOMAIN
  ) {
    return NextResponse.json(
      { error: "생성 작업을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    requestedCount: job.requestedCount,
    successCount: job.successCount,
    failedCount: job.failedCount,
    items: readItems(job.result),
    // null = "이 실행의 발주 조건을 모른다". 클라이언트는 이때 spec 렌더 자체를
    // 생략한다(authoring-store-io.normalizeJobRow).
    request: readRequestSnapshot(job.result),
    title: job.title,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.errorMessage,
  });
}
