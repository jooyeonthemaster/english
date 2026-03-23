import { streamText } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { NextRequest, NextResponse } from "next/server";

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
    const { questionId, message, conversationId } = body;

    if (!questionId || !message) {
      return NextResponse.json(
        { error: "questionId와 message는 필수입니다." },
        { status: 400 }
      );
    }

    // 3. Fetch question with explanation and passage
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        explanation: true,
        passage: true,
      },
    });

    if (!question) {
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
    let conversationHistory: { role: string; content: string }[] = [];
    let existingConversationId: string | null = conversationId || null;

    if (existingConversationId) {
      const existingConversation = await prisma.aIConversation.findUnique({
        where: { id: existingConversationId },
      });
      if (existingConversation) {
        try {
          conversationHistory = JSON.parse(existingConversation.messages);
        } catch {
          conversationHistory = [];
        }
      }
    } else {
      const existingConversation = await prisma.aIConversation.findUnique({
        where: {
          studentId_questionId: {
            studentId: session.studentId,
            questionId,
          },
        },
      });
      if (existingConversation) {
        existingConversationId = existingConversation.id;
        try {
          conversationHistory = JSON.parse(existingConversation.messages);
        } catch {
          conversationHistory = [];
        }
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
      onFinish: async ({ text }) => {
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
