import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getExamBankItem, getExamBankItemsByIds } from "@/lib/exam-passages/question-bank";
import { getExamBankSet } from "@/lib/exam-passages/question-bank-sets";

// GET /api/exam-passages/questions/[id] — 기출 문항 은행 1건 전문(미리보기용).
// 목록 응답은 경량(preview 140자)이라 미리보기 열은 행 선택 시 이 라우트로 본문·선지·구조 데이터를 받는다.
// 인증 필요(라이선스 콘텐츠). 정답은 함께 내려간다 — 스태프 전용 화면이고 「정답 보기」 토글이 UI 게이트다.

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }
    const { id } = await context.params;
    const item = getExamBankItem(String(id ?? "").trim());
    if (!item) {
      return NextResponse.json({ error: "문항을 찾을 수 없습니다." }, { status: 404 });
    }
    const set = item.setKey ? getExamBankSet(item.setKey) : null;
    return NextResponse.json({ item, ...(set ? { set, members: getExamBankItemsByIds([set.key]) } : {}) });
  } catch (err) {
    console.error("[exam-bank] item failed", err);
    return NextResponse.json({ error: "기출 문항을 불러오지 못했습니다." }, { status: 500 });
  }
}
