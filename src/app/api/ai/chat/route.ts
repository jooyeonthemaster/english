import { streamText } from "ai";
import { GEMINI_MODEL_ID, model } from "@/lib/ai";
import { atlasUsageWithCost } from "@/lib/atlas-ai";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { NextRequest, NextResponse } from "next/server";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { recordAiCost } from "@/lib/platform-api-costs";

export async function POST(request: NextRequest) {
  try {
    // 1. Validate student session
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    const body = await request.json();
    // body.conversationId 는 읽지 않는다 — 대화는 아래에서 (세션 학생, 문항)으로만 찾는다(IDOR 수리 26-09-30).
    const { questionId, message } = body;

    if (!questionId || !message) {
      return NextResponse.json(
        { error: "questionId와 message는 필수입니다." },
        { status: 400 }
      );
    }

    // 2.5. Deduct credits before AI call
    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(session.academyId, "AI_CHAT", undefined, {
        studentId: session.studentId,
        questionId,
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        );
      }
      throw err;
    }

    // 3. Fetch question with explanation and passage
    // 학원 범위(IDOR 수리 26-09-30) — 학생의 학원 문항만(해설·지문 본문을 AI 문맥으로 쓴다).
    const question = await prisma.question.findFirst({
      where: { id: questionId, academyId: session.academyId, deletedAt: null },
      include: {
        explanation: true,
        passage: true,
      },
    });

    if (!question) {
      await refundCredits(session.academyId, "AI_CHAT", creditResult.transactionId, "Question not found");
      return NextResponse.json(
        { error: "문항을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 4. Fetch teacher prompts for the academy + passage
    const teacherPrompts = await prisma.teacherPrompt.findMany({
      where: {
        academyId: question.academyId,
        isActive: true,
        OR: [
          { passageId: null },
          ...(question.passageId ? [{ passageId: question.passageId }] : []),
        ],
      },
    });

    // 5. Load existing conversation
    // 세션 학생의 이 문항 대화만(IDOR 수리 26-09-30). 예전에는 클라이언트가 보낸 conversationId 를
    // 범위 없이 id 로 읽어, 남의 학생(다른 학원 포함) 대화가 AI 문맥에 실리고 아래 upsert 로 공격자
    // 본인 행에 복사됐다(GET /api/ai/conversation/[questionId] 로 되읽힘). 대화는 (studentId, questionId)
    // 유니크라 아래 저장 대상과 같은 행을 읽는 것이 곧 올바른 이어 쓰기다.
    let conversationHistory: { role: string; content: string }[] = [];
    const existingConversation = await prisma.aIConversation.findUnique({
      where: {
        studentId_questionId: {
          studentId: session.studentId,
          questionId,
        },
      },
    });
    if (existingConversation) {
      try {
        conversationHistory = JSON.parse(existingConversation.messages);
      } catch {
        conversationHistory = [];
      }
    }

    // 6. Parse key points
    let keyPointsText = "";
    if (question.explanation?.keyPoints) {
      try {
        const keyPoints: string[] = JSON.parse(question.explanation.keyPoints);
        keyPointsText = keyPoints.map((p) => `- ${p}`).join("\n");
      } catch {
        keyPointsText = "";
      }
    }

    // 7. Build system prompt
    const teacherPromptsText =
      teacherPrompts.length > 0
        ? teacherPrompts
            .map((p) => `[${p.promptType}] ${p.content}`)
            .join("\n")
        : "없음";

    const systemPrompt = `당신은 영어학원의 영어 튜터입니다.
학생이 시험 문항에 대해 질문하고 있습니다.

## 문항 정보
문제: ${question.questionText}
정답: ${question.correctAnswer}

${
  question.explanation
    ? `## 공식 해설
${question.explanation.content}

## 핵심 포인트
${keyPointsText || "없음"}`
    : ""
}

${question.passage ? `## 관련 지문\n${question.passage.title}\n${question.passage.content}` : ""}

## 선생님 강조 사항
${teacherPromptsText}

## 규칙
- 반드시 한국어로 답변하세요
- 이 문항에 대한 질문에만 답변하세요
- 다른 문항의 답을 알려주지 마세요
- 학생이 이해할 수 있도록 쉽게 설명하세요
- 선생님이 강조한 내용을 반영하여 설명하세요
- 답변은 간결하고 명확하게 하세요`;

    // 8. Build messages array for AI
    const aiMessages: { role: "user" | "assistant"; content: string }[] = [
      ...conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    // 9. Stream the response
    const result = streamText({
      model,
      system: systemPrompt,
      messages: aiMessages,
      onFinish: async ({ text, finishReason, usage, providerMetadata }) => {
        // Refund if the generation was aborted or errored
        if (finishReason === "error") {
          try {
            await refundCredits(session.academyId, "AI_CHAT", creditResult.transactionId, "Chat stream error");
          } catch (refundErr) {
            console.error("Failed to refund credits:", refundErr);
          }
          return;
        }
        await recordAiCost({
          sourceType: "AI_INTERACTIVE",
          sourceDetail: "chat",
          operationType: "QUESTION_EXPLANATION",
          academyId: session.academyId,
          model: GEMINI_MODEL_ID,
          usage: atlasUsageWithCost({ usage, providerMetadata }),
        });
        const updatedMessages = [
          ...conversationHistory,
          { role: "user", content: message },
          { role: "assistant", content: text },
        ];

        try {
          await prisma.aIConversation.upsert({
            where: {
              studentId_questionId: {
                studentId: session.studentId,
                questionId,
              },
            },
            update: {
              messages: JSON.stringify(updatedMessages),
            },
            create: {
              studentId: session.studentId,
              questionId,
              messages: JSON.stringify(updatedMessages),
            },
          });

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          await prisma.studyProgress.upsert({
            where: {
              studentId_date: {
                studentId: session.studentId,
                date: today,
              },
            },
            update: {
              aiQuestionsAsked: { increment: 1 },
            },
            create: {
              studentId: session.studentId,
              date: today,
              aiQuestionsAsked: 1,
            },
          });
        } catch (err) {
          console.error("Failed to save conversation:", err);
        }
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json(
      { error: "AI 응답 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
