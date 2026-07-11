// ============================================================================
// 어법 드릴 질문 탭 — Gemini flash 스트리밍 챗 (무과금 · 일일 캡 40)
//
// tutor 챗 라우트(api/tutor/conversations/.../messages) 패턴 미러:
// streamText → 수동 ReadableStream 릴레이(text/plain 청크), 종료 후
// 행 단위 저장 + 실측 원가 원장 기록. 컨텍스트(문항·개념)는 클라이언트가
// 아니라 서버 번들에서 조립한다(변조 차단).
//
// GET: 현재 컨텍스트의 최근 대화 이력.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { prisma } from "@/lib/prisma";
import {
  ATLAS_CLOUD_PROVIDER,
  ATLAS_STANDARD_MODEL_ID,
  atlasChatModel,
  atlasUsageWithCost,
} from "@/lib/atlas-ai";
import {
  providerFromModel,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { getGrammarBundle } from "@/lib/grammar-drill/bundle";
import { renderMarkupForAi, stripMarkup } from "@/lib/grammar-drill/markup";
import { CHAT_DAILY_LIMIT, seoulDayStart } from "@/lib/grammar-drill/home";
import {
  CONCEPT_SKELETON_BY_ID,
  UNIT_BY_ID,
} from "@/lib/grammar-drill/curriculum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAT_MODEL =
  process.env.GRAMMAR_DRILL_CHAT_MODEL?.trim() || ATLAS_STANDARD_MODEL_ID;
// gemini-3.5-flash 는 게이트웨이의 reasoning disable(enabled:false+none)을
// 무시하고 매 호출 ~700 사고 토큰을 몰래 생성한다(26-07-10 실측: TTFT 5.5s +
// 700 예산 잠식으로 답변 절단). effort:"minimal" 만이 사고를 실제 0으로
// 만든다(3연속 재현: reasoning=0·완결 답변·비스트리밍 ~4s). 게이트웨이는
// 요청 본문의 reasoning_effort 문자열을 Gemini 분기에서 존중하므로
// providerOptions 로 per-request 주입한다 — 전역 env 는 건드리지 않는다.
const CHAT_REASONING_EFFORT =
  process.env.GRAMMAR_DRILL_CHAT_REASONING?.trim() || "minimal";
const MAX_MESSAGE_LEN = 600;
const HISTORY_TURNS = 8;

/**
 * 스트림 마크다운 제거기 — 프롬프트 금지에 더한 2차 방어.
 * 별표·백틱은 짝 여부와 무관하게 전역 삭제라 청크 경계 분할에 안전하고,
 * 라인 선두의 #(헤더)·선두 공백은 줄 시작 상태를 청크 간 유지하며 제거한다.
 */
function createMarkdownStripper() {
  let atLineStart = true;
  return (chunk: string): string => {
    let out = "";
    for (const ch of chunk) {
      if (ch === "*" || ch === "`") continue;
      if (atLineStart && (ch === "#" || ch === " ")) continue;
      out += ch;
      atLineStart = ch === "\n";
    }
    return out;
  };
}

function buildSystemPrompt(context: {
  itemContext: string | null;
  conceptContext: string | null;
  revealAllowed: boolean;
}): string {
  const lines = [
    "당신은 SMOAT 어법 드릴의 영어 어법 전담 튜터입니다.",
    "대상은 한국 고등학생입니다. 반드시 합니다체로만 답합니다(해요체 금지).",
    "어법(문법) 학습과 무관한 요청(잡담·숙제 대행·다른 과목)은 정중히 거절하고 어법 질문으로 돌아오도록 안내합니다.",
    "출력 형식(절대 규칙): 마크다운 문법을 절대 사용하지 않습니다 — 별표(*)와 백틱(`)과 샵(#)과 표·링크 문법 전부 금지입니다. 일반 텍스트 문장과 줄바꿈만 씁니다. 단어를 강조하고 싶으면 작은따옴표로 감쌉니다(예: 'hidden').",
    "답변 깊이는 질문 난이도에 맞춥니다. 용어 뜻 확인이나 단순한 질문은 2~3문장으로 바로 답하고 끝냅니다. 구조 판단·비교·'왜'처럼 어려운 질문은 쉬운 말로 단계를 나눠 풀고, 짧은 새 예문 1~2개(한국어 해석 포함)를 붙입니다.",
    "학생이 '자세히'나 '쉽게'를 요청하면 더 풀어서, '짧게'를 요청하면 핵심만 답합니다. 어떤 경우든 반드시 문장을 완결하고 끝냅니다.",
  ];
  if (context.revealAllowed) {
    lines.push(
      "학생은 이미 이 문항을 제출해 정답과 해설을 확인했습니다. 정답 근거를 자유롭게 설명해도 됩니다.",
    );
  } else {
    lines.push(
      "학생은 아직 이 문항을 풀지 않았습니다. 절대 정답(선택지 번호·올바른 어형)을 직접 알려주지 마십시오. 판단 순서와 봐야 할 구조만 짚어 스스로 풀도록 유도합니다.",
    );
  }
  if (context.itemContext) {
    lines.push("", "── 학생이 보고 있는 문항 ──", context.itemContext);
  }
  if (context.conceptContext) {
    lines.push("", "── 관련 개념 ──", context.conceptContext);
  }
  return lines.join("\n");
}

function buildItemContext(itemId: string): string | null {
  const item = getGrammarBundle().itemsById.get(itemId);
  if (!item) return null;
  const unit = UNIT_BY_ID.get(item.unitId);
  const concept = CONCEPT_SKELETON_BY_ID.get(item.conceptId);
  const head = `유닛: ${unit?.title ?? item.unitId} / 개념: ${concept?.title ?? item.conceptId} / 유형: ${item.type} / 난이도: ${item.difficulty}`;
  switch (item.type) {
    case "CHOICE":
      return `${head}\n문장: ${renderMarkupForAi(item.stem)}\n보기: ${item.options.join(" / ")}`;
    case "OX":
      return `${head}\n문장(밑줄은 <>): ${renderMarkupForAi(item.sentence)}\n과제: 밑줄이 어법상 옳은지 판단`;
    case "MULTI_UNDERLINE":
      return `${head}\n텍스트(밑줄은 ①<>~): ${renderMarkupForAi(item.text)}\n과제: 어법상 틀린 밑줄 찾기`;
    case "PASSAGE":
      return `${head}\n지시문: ${item.directive}\n지문(밑줄은 ①<>~): ${renderMarkupForAi(item.text)}`;
    case "WRITE_FORM":
      return `${head}\n문장: ${renderMarkupForAi(item.stem)}\n괄호 제시어: ${item.given}\n과제: 제시어를 어법에 맞게 변형`;
    case "WRITE_CORRECT":
      return `${head}\n문장(밑줄은 <>): ${renderMarkupForAi(item.sentence)}\n과제: 밑줄 친 부분을 바르게 고쳐 쓰기`;
  }
}

function buildConceptContext(conceptId: string): string | null {
  const concept = getGrammarBundle().conceptsById.get(conceptId);
  if (!concept) {
    const skeleton = CONCEPT_SKELETON_BY_ID.get(conceptId);
    return skeleton ? `${skeleton.title} — ${skeleton.oneLiner}` : null;
  }
  const rules = concept.rules
    .map((r) => `- ${r.rule} (예: ${stripMarkup(r.examples[0]?.en ?? "")})`)
    .join("\n");
  return `${concept.title} — ${concept.oneLiner}\n판단 순서: ${concept.algorithm.join(" → ")}\n${rules}`;
}

export async function POST(req: NextRequest) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: {
    message?: string;
    itemId?: string;
    conceptId?: string;
    revealAllowed?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }
  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);
  if (!message) {
    return NextResponse.json({ ok: false, error: "EMPTY" }, { status: 400 });
  }

  // 일일 캡 — 무과금 남용 가드(서울 자정 기준 user 메시지 수)
  const usedToday = await prisma.grammarDrillChatMessage.count({
    where: {
      studentId: session.studentId,
      role: "user",
      createdAt: { gte: seoulDayStart() },
    },
  });
  if (usedToday >= CHAT_DAILY_LIMIT) {
    return NextResponse.json(
      { ok: false, error: "DAILY_LIMIT", limit: CHAT_DAILY_LIMIT },
      { status: 429 },
    );
  }

  const itemId = body.itemId ? String(body.itemId) : null;
  const conceptId = body.conceptId ? String(body.conceptId) : null;

  // 같은 컨텍스트의 직전 대화(연속성) — 최근 HISTORY_TURNS×2 행
  const historyRows = await prisma.grammarDrillChatMessage.findMany({
    where: {
      studentId: session.studentId,
      ...(itemId ? { contextItemId: itemId } : { contextConceptId: conceptId }),
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS * 2,
  });
  const history = historyRows
    .reverse()
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

  await prisma.grammarDrillChatMessage.create({
    data: {
      academyId: session.academyId,
      studentId: session.studentId,
      contextItemId: itemId,
      contextConceptId: conceptId,
      role: "user",
      content: message,
    },
  });

  const system = buildSystemPrompt({
    itemContext: itemId ? buildItemContext(itemId) : null,
    conceptContext: conceptId
      ? buildConceptContext(conceptId)
      : itemId
        ? buildConceptContext(
            getGrammarBundle().itemsById.get(itemId)?.conceptId ?? "",
          )
        : null,
    revealAllowed: Boolean(body.revealAllowed),
  });

  const result = streamText({
    model: atlasChatModel(CHAT_MODEL),
    system,
    messages: [...history, { role: "user" as const, content: message }],
    temperature: 0.4,
    maxOutputTokens: 1600,
    providerOptions: {
      [ATLAS_CLOUD_PROVIDER]: { reasoning_effort: CHAT_REASONING_EFFORT },
    },
  });

  const encoder = new TextEncoder();
  const stripMarkdown = createMarkdownStripper();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";
      try {
        for await (const chunk of result.textStream) {
          const safe = stripMarkdown(chunk);
          if (!safe) continue;
          assistantText += safe;
          controller.enqueue(encoder.encode(safe));
        }
        controller.close();
      } catch (error) {
        console.error("[grammar-drill/chat] stream error", error);
        controller.error(error);
      }

      // 종료 후처리 — 저장 + 원가 원장(무과금이어도 기록)
      try {
        if (assistantText.trim()) {
          const saved = await prisma.grammarDrillChatMessage.create({
            data: {
              academyId: session.academyId,
              studentId: session.studentId,
              contextItemId: itemId,
              contextConceptId: conceptId,
              role: "assistant",
              content: assistantText,
            },
          });
          const [usageRaw, providerMetadata] = await Promise.all([
            Promise.resolve(result.totalUsage).catch(() => undefined),
            Promise.resolve(result.providerMetadata).catch(() => undefined),
          ]);
          const usage = atlasUsageWithCost({
            usage: usageRaw,
            providerMetadata,
          }) as
            | { inputTokens?: number; outputTokens?: number; costUsd?: number }
            | undefined;
          await recordPlatformApiUsageCost({
            sourceKey: `grammar_drill_chat:${saved.id}`,
            sourceType: "GRAMMAR_DRILL_CHAT",
            sourceId: saved.id,
            sourceDetail: itemId ?? conceptId ?? "general",
            academyId: session.academyId,
            provider: providerFromModel(CHAT_MODEL),
            model: CHAT_MODEL,
            operationType: "AI_CHAT",
            unitType: "TOKENS",
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
            recordedCostUsd: usage?.costUsd ?? null,
            usageAt: new Date(),
          });
        }
      } catch (error) {
        console.error("[grammar-drill/chat] post-stream persist failed", error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Chat-Remaining": String(Math.max(0, CHAT_DAILY_LIMIT - usedToday - 1)),
    },
  });
}

export async function GET(req: NextRequest) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const itemId = sp.get("itemId");
  const conceptId = sp.get("conceptId");
  const rows = await prisma.grammarDrillChatMessage.findMany({
    where: {
      studentId: session.studentId,
      ...(itemId
        ? { contextItemId: itemId }
        : conceptId
          ? { contextConceptId: conceptId }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  const usedToday = await prisma.grammarDrillChatMessage.count({
    where: {
      studentId: session.studentId,
      role: "user",
      createdAt: { gte: seoulDayStart() },
    },
  });
  return NextResponse.json({
    ok: true,
    messages: rows.reverse(),
    remaining: Math.max(0, CHAT_DAILY_LIMIT - usedToday),
  });
}
