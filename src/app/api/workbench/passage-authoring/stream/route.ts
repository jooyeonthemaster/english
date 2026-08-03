import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  ATLASCLOUD_API_KEY,
  ATLASCLOUD_BASE_URL,
  ATLAS_AUTHORING_MODEL_ID,
  getAtlasCloudHeaders,
} from "@/lib/atlas-ai";
import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  checkBalance,
  deductCredits,
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import {
  resolveAuthoringReasoningEffort,
  runAuthoringGeneration,
} from "@/lib/passage-authoring/generate";
import {
  adaptAuthoredMdToItem,
  authoringEnvelopeViolations,
  buildAuthoringMdRevisionPrompt,
} from "@/lib/passage-authoring/md/adapter";
import { parseAuthoredMd } from "@/lib/passage-authoring/md/parser";
import { buildAuthoringMdOutputBlock } from "@/lib/passage-authoring/md/prompt";
import {
  assignSkeletons,
  authoringSkeletonSeed,
  buildAuthoringSystemPrompt,
  buildAuthoringUserPrompt,
  selectAuthoringMaterialsWithBudget,
} from "@/lib/passage-authoring/prompts";
import {
  AI_PASSAGE_AUTHORING_JOB_DOMAIN,
  authoringRequestSchema,
  buildAuthoringJobTitle,
  REFUND_CHECK_MARK,
  type AuthoringJobResult,
  type AuthoringRequest,
  type AuthoringResultItem,
  type PassageSkeleton,
} from "@/lib/passage-authoring/schema";
import { recordAiCost } from "@/lib/platform-api-costs";
import { prisma } from "@/lib/prisma";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";

// ============================================================================
// POST /api/workbench/passage-authoring/stream — 지문 1편을 SSE 로 **생중계**하며 만든다
//
// 오너 지적("여전히 그냥 로딩만 되고 있어")의 물리적 원인:
//   기존 경로는 POST → 잡 생성 → after() 백그라운드 → 폴링이다. 서버리스에서
//   after() 안의 모델 델타를 **다른 요청이 볼 방법이 없다** — 폴링은 완성된 편만
//   본다. 그래서 "미리보기 채널만 얹는" 설계는 원리적으로 불가능하고, 생성 자체가
//   SSE 라우트 안에서 돌아야 한다. 문제 생성(md-stream)이 같은 이유로 같은 구조를
//   택했고 이 라우트는 그 정본을 따른다.
//
// ── 왜 count === 1 에서만 쓰는가 (분기 근거) ────────────────────────────────
//   SSE 연결 하나가 지문 1편을 끝까지 책임진다. count>=2 는 잡+폴링 경로가 그대로
//   맡는다 — 거기에 (a) 동시성 3 워커, (b) 편 단위 점진 저장, (c) **실패 편수만큼의
//   부분 환불**, (d) 편 간 소재 중복 경고, (e) 원본 페이지 이미지 조달이 살아 있다.
//   그 다섯을 스트림으로 옮기면 한 연결이 6편·250초를 붙들고, 중간에 끊기면 부분
//   환불의 주체가 사라진다. 스트리밍의 가치(사용자가 화면 앞에 있다)는 1편일 때
//   가장 크고, 6편은 애초에 "다른 작업을 하세요"가 계약이다.
//
// ── 부적격 → 400 AUTHORING_STREAM_INELIGIBLE → 클라이언트가 잡 경로로 폴백 ──
//   ① count !== 1
//   ② 원본 페이지 이미지(하이브리드)를 요청한 자료가 있음 — 조달(run-job.procure
//      PageImages)이 그 파일의 module-private 함수라 이 레인이 쓸 수 없다. 텍스트만
//      실어 조용히 다르게 만드는 것보다, 이미지가 사는 경로로 보내는 편이 옳다.
//   ③ env PASSAGE_AUTHORING_STREAM=off (재빌드 없는 런타임 킬스위치)
//   ④ 자료도 지시도 없음(잡 라우트와 같은 사전 차단)
//
// ── 크레딧 계약(절대 파기 금지) ────────────────────────────────────────────
//   잔액 게이트 → 잡 PROCESSING 생성 → deductCredits(2) → 스트림 안에서 생성 →
//   성공: COMPLETED / 실패: FAILED + refundCredits(2, 전액=1편치 부분환불).
//   잡 라우트와 **같은 함수·같은 순서**다. 차감은 스트림을 열기 전에 끝내 402 를
//   정상 HTTP 로 돌려준다(클라이언트가 잔액/필요액을 그대로 읽는다).
//   멱등키(x-authoring-request-id)는 잡 라우트와 같은 창(10분)으로 검사하고,
//   중복이면 SSE 를 열지 않고 JSON 으로 기존 jobId 를 돌려준다 — 클라이언트는 그걸
//   "접수됨"으로 보고 폴링으로 붙는다(이중 과금 구조적 차단).
//
// ── 품질 계약 ──────────────────────────────────────────────────────────────
//   · 프롬프트는 JSON 레인과 **같은 것**을 쓰고 출력 형식 블록만 갈아끼운다.
//   · metrics/coverage/usedMaterialIds 는 여전히 서버가 계산한다(모델에게 안 묻는다).
//   · 봉투 위반 시 1회 수리 콜 — JSON 레인의 MAX_MODEL_CALLS=2 와 같은 상한이다.
//   · 파싱/하드게이트 실패 시 **JSON 레인(generateObject)으로 폴백**한다. 사용자
//     화면에는 실패가 아니라 "다시 쓰는 중"으로 보이고, 크레딧은 이미 차감된
//     그 1건 그대로다(추가 차감 없음).
//
// ⚠️ 사고+출력이 같은 completion 예산을 먹는다. 26-07-25 실사고(자료 18k자 + effort
//    high → JSON 절단)와 md-stream 의 6k 절단 실측이 같은 함정이다. 이 레인은
//    exclude:false(사고 델타를 실제로 받는다)라 더 크게 잡는다 — 16,000.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 잡 라우트와 공유하는 멱등키 헤더 이름. */
const REQUEST_ID_HEADER = "x-authoring-request-id";
const REQUEST_ID_WINDOW_MS = 10 * 60 * 1000;

/**
 * 스트림 전체 예산(ms). 라우트 벽(300s)보다 35s 앞서 끊어 "마지막 잡 갱신 + 환불"이
 * 반드시 완주하게 한다(run-job 의 AUTHORING_RUN_BUDGET_MS 와 같은 취지).
 */
const STREAM_BUDGET_MS = 265_000;
/** 1차 마크다운 콜. 사고를 실제로 받으므로 JSON 레인 1차(60s)보다 넉넉하다. */
const PRIMARY_TIMEOUT_MS = 150_000;
/** 봉투 수리 콜 — 남은 예산을 아껴야 하므로 짧게. */
const REVISION_TIMEOUT_MS = 70_000;
/** 이만큼도 안 남았으면 수리를 시작하지 않는다(빈손 과금 방지). */
const MIN_REVISION_MS = 90_000;
/** JSON 레인 폴백에 필요한 최소 잔여 예산. */
const MIN_FALLBACK_MS = 70_000;
/** 사고 델타를 받는 레인의 출력 상한(위 박스 주석의 절단 함정). */
const MD_MAX_TOKENS = 16_000;

function sseEncode(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * 사용자에게 그대로 보여줄 한국어 실패 사유.
 * ⚠️ 원문(게이트웨이 응답 본문·모델 id·잔액 문구)을 절대 붙이지 않는다 —
 * 이 값은 잡 errorMessage 로 저장돼 진행 밴드·작업 큐에 그대로 렌더된다.
 * (run-job.toUserErrorMessage 의 쌍둥이 — 그쪽이 module-private 라 여기 둔다.)
 */
function toUserErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message.trim() : "";
  if (!raw) return "지문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";
  if (/timeout|deadline|abort|etimedout|econnreset/i.test(raw)) {
    return "생성 시간이 초과됐습니다. 편수를 줄이거나 다시 시도해주세요.";
  }
  if (/rate.?limit|too many requests|429|quota|overload/i.test(raw)) {
    return "지금 요청이 몰려 있습니다. 잠시 후 다시 시도해주세요.";
  }
  if (/schema|json|parse|validation|invalid.*response|no object generated/i.test(raw)) {
    return "결과 형식이 올바르지 않아 이 편을 만들지 못했습니다. 다시 시도해주세요.";
  }
  return "지문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";
}

/**
 * 표시용 델타 마스킹 — 사고/본문 스트림에 프로바이더·모델명이 실릴 수 있다.
 * ⚠️ 정본 sanitize 는 trim + 공백 접기를 하므로 델타에 그대로 쓰면 낱말이 달라붙는다
 * ("the brain" → "thebrain"). 앞뒤 공백을 보존해 되붙인다. 파싱에 쓰는 내부 누적
 * 텍스트는 **원문 그대로** 유지한다(마스킹은 화면 전용).
 */
function maskDelta(raw: string): string {
  const core = sanitizeAiModelDisclosureText(raw);
  if (!core) return raw.replace(/\S/g, "");
  const lead = /^\s*/.exec(raw)?.[0] ?? "";
  const tail = /\s*$/.exec(raw)?.[0] ?? "";
  return `${lead}${core}${tail}`;
}

interface StreamCallResult {
  text: string;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * 게이트웨이 직접 스트림 1콜 — 사고/본문 델타를 emit 으로 흘리고 usage 를 회수한다.
 *
 * ⚠️ `reasoning.exclude` 는 반드시 **false** 여야 한다. 기본 경로
 * (atlas-ai.atlasReasoningRequestFor)는 gemini 계열에 exclude:true 를 실어 사고
 * 델타가 아예 오지 않는다 — 그 상태로는 "사고 중" 단계가 영원히 빈 화면이다.
 */
async function streamMarkdownOnce(args: {
  system: string;
  userTurns: Array<{ role: "user" | "assistant"; content: string }>;
  modelId: string;
  reasoningEffort: string;
  timeoutMs: number;
  emit: (payload: Record<string, unknown>) => void;
}): Promise<StreamCallResult> {
  if (!ATLASCLOUD_API_KEY) throw new Error("Missing gateway API key");
  const startedAt = Date.now();
  const res = await fetch(`${ATLASCLOUD_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ATLASCLOUD_API_KEY}`,
      "Content-Type": "application/json",
      ...getAtlasCloudHeaders(),
    },
    body: JSON.stringify({
      model: args.modelId,
      messages: [
        { role: "system", content: args.system },
        ...args.userTurns,
      ],
      max_tokens: MD_MAX_TOKENS,
      // 같은 자료로 여러 번 뽑아도 소재가 겹치지 않아야 한다 — JSON 레인과 같은 값.
      temperature: 0.85,
      stream: true,
      usage: { include: true },
      reasoning: { enabled: true, effort: args.reasoningEffort, exclude: false },
    }),
    signal: AbortSignal.timeout(Math.max(10_000, args.timeoutMs)),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`authoring upstream ${res.status}: ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const frame = JSON.parse(payload);
        const delta = frame.choices?.[0]?.delta ?? {};
        const reasoningDelta: string = delta.reasoning ?? delta.reasoning_content ?? "";
        if (reasoningDelta) args.emit({ t: "r", d: maskDelta(reasoningDelta) });
        const contentDelta: string = delta.content ?? "";
        if (contentDelta) {
          text += contentDelta;
          args.emit({ t: "c", d: maskDelta(contentDelta) });
        }
        if (frame.usage) usage = frame.usage;
      } catch {
        /* 조각난 SSE 줄 — 다음 청크에서 이어진다 */
      }
    }
  }
  if (!text.trim()) throw new Error("모델이 본문 출력을 내지 않았습니다.");

  return {
    text,
    costUsd: typeof usage?.cost === "number" && usage.cost > 0 ? usage.cost : null,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * 잡 result 에 싣는 요청 스냅샷.
 * ⚠️ run-job.buildRequestSnapshot 의 쌍둥이다(그쪽이 module-private). 자료 본문은
 * 절대 통째로 넣지 않는다 — 미리보기 200자만(잡 row 비대 → 폴링 egress 폭증).
 * charsSent 는 generate.ts 와 **같은 함수**로 계산하므로 어긋날 수 없다.
 */
function buildStreamRequestSnapshot(
  request: AuthoringRequest,
  skeletons: ReadonlyArray<PassageSkeleton>,
): NonNullable<AuthoringJobResult["request"]> {
  const charsSent = new Map(
    selectAuthoringMaterialsWithBudget(request.materials).map((entry) => [
      entry.material.id,
      { sent: entry.sentChars, total: entry.totalChars },
    ]),
  );
  return {
    instruction: request.instruction,
    spec: request.spec,
    count: request.count,
    skeletons: [...skeletons],
    materials: request.materials.map((m) => ({
      id: m.id,
      role: m.role,
      name: m.name,
      sourceKind: m.sourceKind,
      note: m.note,
      preview: m.content.slice(0, 200),
      // 이 레인은 원본 페이지를 싣지 않는다(적격성 ②) — 사실대로 false.
      sendPages: false,
      charsSent: charsSent.get(m.id) ?? { sent: 0, total: m.content.length },
    })),
  };
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = authoringRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }
  const request = parsed.data;

  const ineligible = (reason: string) =>
    NextResponse.json(
      { error: reason, code: "AUTHORING_STREAM_INELIGIBLE" },
      { status: 400 },
    );

  // ── 적격성 (위 박스 주석의 ①~④) ──────────────────────────────────────────
  if (process.env.PASSAGE_AUTHORING_STREAM?.trim().toLowerCase() === "off") {
    return ineligible("stream lane disabled");
  }
  if (request.count !== 1) return ineligible("stream lane is single-passage only");
  if (request.materials.some((m) => m.sendPages && m.storagePath)) {
    return ineligible("stream lane cannot carry page images");
  }
  if (request.materials.length === 0 && !request.instruction.trim()) {
    return NextResponse.json(
      { error: "무엇을 만들지 알려주세요. 자료를 넣거나 요청을 적어주세요." },
      { status: 400 },
    );
  }

  // ── 멱등 검사 — 반드시 잡 생성·차감 **이전** ─────────────────────────────
  const requestId = (req.headers.get(REQUEST_ID_HEADER) ?? "").trim().slice(0, 100);
  if (requestId) {
    const existing = await prisma.workbenchAiJob.findFirst({
      where: {
        academyId: staff.academyId,
        domain: AI_PASSAGE_AUTHORING_JOB_DOMAIN,
        deletedAt: null,
        createdAt: { gt: new Date(Date.now() - REQUEST_ID_WINDOW_MS) },
        config: { path: ["requestId"], equals: requestId },
      },
      select: {
        id: true,
        status: true,
        title: true,
        requestedCount: true,
        successCount: true,
        failedCount: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      // SSE 를 열지 않는다 — 이미 접수된 실행이므로 클라이언트는 폴링으로 붙는다.
      return NextResponse.json({
        jobId: existing.id,
        status: existing.status,
        title: existing.title,
        requestedCount: existing.requestedCount,
        successCount: existing.successCount,
        failedCount: existing.failedCount,
        deduplicated: true,
      });
    }
  }

  const creditCost = CREDIT_COSTS.PASSAGE_AUTHORING * request.count;

  const balance = await checkBalance(staff.academyId);
  if (balance.balance < creditCost) {
    return NextResponse.json(
      {
        error: "크레딧이 부족합니다.",
        code: "INSUFFICIENT_CREDITS",
        balance: balance.balance,
        required: creditCost,
      },
      { status: 402 },
    );
  }

  const title = buildAuthoringJobTitle({
    instruction: request.instruction,
    materials: request.materials,
    count: request.count,
  });

  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: AI_PASSAGE_AUTHORING_JOB_DOMAIN,
      status: "PROCESSING",
      title,
      startedAt: new Date(),
      requestedCount: request.count,
      // fastPath:true = 좀비 리퍼(6분 규칙)의 대상. 이 실행은 265s 예산 안에서
      // 끝나므로, 그보다 오래 PROCESSING 이면 함수가 죽은 것이고 리퍼가
      // FAILED+환불로 정리해야 한다. config 는 스칼라 최소치만(요약 폴링 egress).
      config: toJson({
        fastPath: true,
        streamLane: true,
        ...(requestId ? { requestId } : {}),
        spec: request.spec,
        count: request.count,
        diversify: request.diversify,
        materialCount: request.materials.length,
        instructionHead: request.instruction.trim().slice(0, 200),
        materials: request.materials.map((m) => ({ id: m.id, role: m.role })),
      }),
    },
    select: { id: true, createdAt: true },
  });

  let creditTxId: string;
  try {
    const credit = await deductCredits(
      staff.academyId,
      "PASSAGE_AUTHORING",
      staff.id,
      {
        source: "WORKBENCH_PASSAGE_AUTHORING",
        jobId: job.id,
        count: request.count,
        materialCount: request.materials.length,
        gradeBand: request.spec.gradeBand,
        targetWords: request.spec.targetWords,
        creditCost,
        fastPath: true,
        streamLane: true,
      },
      creditCost,
    );
    creditTxId = credit.transactionId;
  } catch (err) {
    const insufficient = err instanceof InsufficientCreditsError;
    await prisma.workbenchAiJob
      .update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: request.count,
          completedAt: new Date(),
          errorMessage: insufficient
            ? "크레딧이 부족합니다."
            : "크레딧 차감에 실패했습니다.",
        },
      })
      .catch(() => {});
    if (insufficient) {
      return NextResponse.json(
        {
          error: "크레딧이 부족합니다.",
          code: "INSUFFICIENT_CREDITS",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }
    throw err;
  }

  await prisma.workbenchAiJob
    .update({ where: { id: job.id }, data: { creditTxId } })
    .catch((err) => {
      console.error(
        `[PASSAGE-AUTHORING-STREAM] creditTxId 저장 실패 (job=${job.id}):`,
        err instanceof Error ? err.message : err,
      );
    });

  // ⚠️ 프롬프트 조립은 여기서 하지 않는다 — **차감 이후의 모든 실패는 스트림 안에서
  //   일어나야** 환불·잡 종결 경로가 그것을 받는다. 여기서 throw 하면 Next 가 500 을
  //   돌려주고, 그때 잡은 PROCESSING·크레딧은 차감된 채 남아 리퍼(6분)를 기다리게 된다.

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(sseEncode(payload));
        } catch {
          // 클라이언트 이탈 — 이후 emit 은 무시하고 생성·저장은 계속한다.
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        closed = true;
      };
      // 개통 즉시 주석 프레임 — 프록시/런타임의 초기 버퍼링을 뚫는다.
      try {
        controller.enqueue(new TextEncoder().encode(": open\n\n"));
      } catch {
        closed = true;
      }

      void (async () => {
        const deadlineAt = requestStartedAt + STREAM_BUDGET_MS;
        const remainingMs = () => deadlineAt - Date.now();
        const calls: StreamCallResult[] = [];

        try {
          // ── 프롬프트 조립 (JSON 레인과 동일 + 출력 형식 블록만 교체) ────────
          // 시스템 프롬프트·난이도 표·골격·자료 블록·SELF-CHECK 는 두 레인이 같은
          // 것을 쓴다. 레인마다 프롬프트가 다르면 품질 차이가 "출력 형식"이라는
          // 한 축으로 설명되지 않는다.
          const skeletons = assignSkeletons(
            request.count,
            request.diversify,
            request.spec,
            // 씨앗이 없으면 count=1 인 이 레인은 **영원히 S1** 이다(회전표 0번).
            // 스트림 레인은 정의상 1편짜리라 그 고착이 그대로 사용자 경험이 된다 —
            // 한 편씩 세 번 뽑으면 셋 다 정의→기제→함의로 나왔다.
            authoringSkeletonSeed(request),
          );
          const skeleton = skeletons[0] ?? "S1";
          const budgets = selectAuthoringMaterialsWithBudget(request.materials);
          const materials = budgets.map((entry) => entry.material);
          const perMaterialCharsSent: Record<
            string,
            { sent: number; total: number }
          > = Object.fromEntries(
            budgets.map((entry) => [
              entry.material.id,
              { sent: entry.sentChars, total: entry.totalChars },
            ]),
          );
          const system = buildAuthoringSystemPrompt({
            gradeBand: request.spec.gradeBand,
            genre: request.spec.genre,
            examTrack: request.spec.examTrack,
          });
          const prompt = `${buildAuthoringUserPrompt({
            request,
            index: 0,
            avoidTexts: request.avoidTexts ?? [],
            skeleton,
          })}\n\n${buildAuthoringMdOutputBlock()}`;
          // 사고 강도는 이 요청의 실제 부피에서 파생한다(generate.ts 의 리졸버를
          // 그대로 쓴다 — 고정 손잡이를 하나 더 만들지 않는다). 이 레인은 출력
          // 상한이 16,000 이라 JSON 레인보다 여유가 크지만, 임계값은 공유한다.
          const reasoningEffort = resolveAuthoringReasoningEffort({
            promptChars: system.length + prompt.length,
            imageCount: 0,
          });
          const snapshot = buildStreamRequestSnapshot(request, skeletons);

          const recordCall = async (index: number, call: StreamCallResult) => {
            try {
              await recordAiCost({
                sourceType: "AI_INTERACTIVE",
                sourceDetail: "passage-authoring-stream",
                academyId: staff.academyId,
                model: ATLAS_AUTHORING_MODEL_ID,
                operationType: "PASSAGE_AUTHORING",
                inputTokens: call.inputTokens,
                outputTokens: call.outputTokens,
                recordedCostUsd: call.costUsd,
                metadata: {
                  jobId: job.id,
                  index,
                  streamLane: true,
                  durationMs: call.durationMs,
                  reasoningEffort,
                },
              });
            } catch (costErr) {
              console.error(
                `[PASSAGE-AUTHORING-STREAM] recordAiCost failed (job=${job.id}):`,
                costErr instanceof Error ? costErr.message : costErr,
              );
            }
          };

          emit({ t: "meta", jobId: job.id });

          // ── 1차 마크다운 콜 ────────────────────────────────────────────
          const first = await streamMarkdownOnce({
            system,
            userTurns: [{ role: "user", content: prompt }],
            modelId: ATLAS_AUTHORING_MODEL_ID,
            reasoningEffort,
            timeoutMs: Math.min(PRIMARY_TIMEOUT_MS, remainingMs()),
            emit,
          });
          calls.push(first);
          await recordCall(0, first);

          let adapted = adaptAuthoredMdToItem(parseAuthoredMd(first.text), {
            request,
            materials,
            skeleton,
            perMaterialCharsSent,
          });

          // ── 봉투 수리 1회 (JSON 레인의 MAX_MODEL_CALLS=2 와 같은 상한) ──
          if (adapted.ok && adapted.item) {
            const violations = authoringEnvelopeViolations(adapted.item.metrics, request);
            if (violations.length > 0 && remainingMs() > MIN_REVISION_MS) {
              emit({ t: "revise", reason: violations.join(" / ").slice(0, 200) });
              try {
                const second = await streamMarkdownOnce({
                  system,
                  userTurns: [
                    { role: "user", content: prompt },
                    { role: "assistant", content: first.text },
                    { role: "user", content: buildAuthoringMdRevisionPrompt(violations) },
                  ],
                  modelId: ATLAS_AUTHORING_MODEL_ID,
                  reasoningEffort,
                  timeoutMs: Math.min(REVISION_TIMEOUT_MS, remainingMs()),
                  emit,
                });
                calls.push(second);
                await recordCall(1, second);
                const revised = adaptAuthoredMdToItem(parseAuthoredMd(second.text), {
                  request,
                  materials,
                  skeleton,
                  perMaterialCharsSent,
                });
                // 수리본이 더 나빠졌으면 원본을 지킨다(모델이 고치다 망가뜨리는 경우).
                if (
                  revised.ok &&
                  revised.item &&
                  authoringEnvelopeViolations(revised.item.metrics, request).length <
                    violations.length
                ) {
                  adapted = revised;
                }
              } catch (reviseErr) {
                console.warn(
                  `[PASSAGE-AUTHORING-STREAM] revision call failed (job=${job.id}):`,
                  reviseErr instanceof Error ? reviseErr.message : reviseErr,
                );
              }
            }
          }

          // ── 하드 게이트 실패 → JSON 레인 폴백 ──────────────────────────
          let body = adapted.item ?? null;
          let usedFallback = false;
          if (!body) {
            console.warn(
              `[PASSAGE-AUTHORING-STREAM] md gate rejected (job=${job.id}):`,
              adapted.issues.join(" / "),
            );
            if (remainingMs() < MIN_FALLBACK_MS) {
              throw new Error(adapted.issues[0] ?? "생성 결과를 읽지 못했습니다.");
            }
            emit({ t: "fallback" });
            const generated = await runAuthoringGeneration({
              request,
              index: 0,
              avoidTexts: request.avoidTexts ?? [],
              deadlineAt,
              skeleton,
            });
            body = generated.item;
            usedFallback = true;
            try {
              await recordAiCost({
                sourceType: "AI_INTERACTIVE",
                sourceDetail: "passage-authoring",
                academyId: staff.academyId,
                model: generated.modelId,
                operationType: "PASSAGE_AUTHORING",
                usage: generated.usage,
                metadata: { jobId: job.id, index: 0, streamLaneFallback: true },
              });
            } catch (costErr) {
              console.error(
                `[PASSAGE-AUTHORING-STREAM] fallback recordAiCost failed (job=${job.id}):`,
                costErr instanceof Error ? costErr.message : costErr,
              );
            }
          }

          // ── 저장 → 잡 완료 ────────────────────────────────────────────
          const item: AuthoringResultItem = {
            id: `${job.id}-0`,
            index: 0,
            status: "OK",
            ...body,
          };
          const payload: AuthoringJobResult = { items: [item], request: snapshot };
          const completedAt = new Date();
          await prisma.workbenchAiJob.update({
            where: { id: job.id },
            data: {
              status: "COMPLETED",
              successCount: 1,
              failedCount: 0,
              resultCount: 1,
              result: toJson(payload),
              completedAt,
              errorMessage: null,
            },
          });

          console.log(
            `[PASSAGE-AUTHORING-STREAM] ${ATLAS_AUTHORING_MODEL_ID} job=${job.id} ok in ${
              Date.now() - requestStartedAt
            }ms (${item.metrics.words}w / target ${request.spec.targetWords}w, calls=${
              calls.length
            }, effort=${reasoningEffort}, prompt=${(system.length + prompt.length).toLocaleString()}자${
              usedFallback ? ", json-fallback" : ""
            })`,
          );

          // done 프레임은 GET /[jobId] 와 **같은 모양**이다 — 클라이언트가 폴링
          // 응답 파서(normalizeJobRow)를 그대로 재사용한다.
          emit({
            t: "done",
            row: {
              jobId: job.id,
              status: "COMPLETED",
              requestedCount: 1,
              successCount: 1,
              failedCount: 0,
              items: [item],
              request: snapshot,
              title,
              createdAt: job.createdAt.toISOString(),
              completedAt: completedAt.toISOString(),
              error: null,
            },
          });
          finish();
        } catch (err) {
          const rawMessage = err instanceof Error ? err.message : String(err);
          console.error(
            `[PASSAGE-AUTHORING-STREAM] failed (job=${job.id}):`,
            rawMessage,
          );
          const message = toUserErrorMessage(err);
          // 1편치 = 전액 환불(부분 환불 계약의 count=1 사례).
          let refunded = true;
          try {
            await refundCredits(
              staff.academyId,
              "PASSAGE_AUTHORING",
              creditTxId,
              "AI 지문 생성 실패 1편 환불",
              creditCost,
            );
          } catch (refundErr) {
            // 환불 실패 = 크레딧 유실. 화면이 "돌려드려요"라고 단언하지 않도록
            // 잡 errorMessage 에 표식을 남긴다(schema.REFUND_CHECK_MARK 가 정본이고
            // 클라이언트 creditNoticeFor 가 그 존재만 보고 문구를 바꾼다).
            refunded = false;
            console.error(
              `[PASSAGE-AUTHORING-STREAM] refund FAILED (academy=${staff.academyId}, tx=${creditTxId}):`,
              refundErr instanceof Error ? refundErr.message : refundErr,
            );
          }
          const storedMessage = refunded
            ? message.slice(0, 500)
            : `${message} ${REFUND_CHECK_MARK}`.slice(0, 500);
          await prisma.workbenchAiJob
            .update({
              where: { id: job.id },
              data: {
                status: "FAILED",
                successCount: 0,
                failedCount: 1,
                completedAt: new Date(),
                errorMessage: storedMessage,
              },
            })
            .catch(() => undefined);
          emit({ t: "error", jobId: job.id, message });
          finish();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 프록시 응답 버퍼링 방지 — 델타가 실시간으로 흘러야 한다.
      "X-Accel-Buffering": "no",
    },
  });
}
