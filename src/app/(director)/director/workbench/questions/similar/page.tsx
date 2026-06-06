import { redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import {
  getAcademyM1DraftCollectionMembership,
  getM1DraftCollections,
} from "@/actions/workbench";

import { SimilarQuestionGeneratorClient } from "./similar-question-generator-client";

// 동형 문제 생성 (재설계): 원본 문항(사진/PDF)을 분석해, 기존 자료 풀에서 고른
// 지문에 같은 출제 의도의 동형 문항을 생성. 자료 선택 UI/UX는 동형 시험지 생성과 동일.

export const dynamic = "force-dynamic";

export default async function SimilarQuestionGenerationPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [collections, membershipRaw] = await Promise.all([
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
  ]);

  const draftMembership = Object.fromEntries(
    Object.entries(membershipRaw).map(([key, value]) => [key, new Set(value)]),
  );

  return (
    <SimilarQuestionGeneratorClient
      academyId={staff.academyId}
      draftCollections={collections}
      draftMembership={draftMembership}
    />
  );
}
