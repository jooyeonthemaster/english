import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const { questionId } = await params;

    if (!questionId) {
      return NextResponse.json(
        { error: "questionId는 필수입니다." },
        { status: 400 }
      );
    }

    const conversation = await prisma.aIConversation.findUnique({
      where: {
        studentId_questionId: {
          studentId: session.studentId,
          questionId,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ messages: [] });
    }

    let messages: { role: string; content: string }[] = [];
    try {
      messages = JSON.parse(conversation.messages);
    } catch {
      messages = [];
    }

    return NextResponse.json({
      conversationId: conversation.id,
      messages,
    });
  } catch (error) {
    console.error("Conversation fetch error:", error);
    return NextResponse.json(
      { error: "대화 내역을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
