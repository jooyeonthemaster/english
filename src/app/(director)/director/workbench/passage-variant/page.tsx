import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchPassages } from "@/actions/workbench";
import { PassageVariantClient } from "./passage-variant-client";
import type { SourcePassage } from "./passage-variant-types";

// ============================================================================
// /director/workbench/passage-variant — AI 지문 변형 전용 페이지 (server)
//
// webtoon/page.tsx 와 동일한 골격: getStaffSession → 인증 → 데이터 페치 →
// 클라이언트 렌더. 원본 지문 선택기를 위해 학원의 "분석 완료 + 직접 입력"
// 지문 목록을 서버에서 한 번 불러와 가벼운 SourcePassage 로 좁혀 넘긴다.
// (학습지 관리 페이지와 동일한 analyzedOnly + includeDirectInput 필터.)
// ============================================================================

export default async function PassageVariantPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  // 변형 가능한 지문 풀 — 분석 완료 지문 + 직접 붙여넣은 지문. 변형은 본문만
  // 있으면 가능하므로 넉넉히(최대 100개) 한 번에 불러와 클라이언트에서 검색한다.
  const { passages } = await getWorkbenchPassages(staff.academyId, {
    analyzedOnly: true,
    includeDirectInput: true,
    limit: 100,
  });

  const sources: SourcePassage[] = passages.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    grade: p.grade ?? null,
    semester: p.semester ?? null,
    unit: p.unit ?? null,
    publisher: p.publisher ?? null,
    difficulty: p.difficulty ?? null,
    source: p.source ?? null,
  }));

  return <PassageVariantClient passages={sources} />;
}
