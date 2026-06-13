import { redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import {
  getAcademyM1DraftCollectionMembership,
  getM1DraftCollections,
} from "@/actions/workbench";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { SimilarExamGeneratorClient } from "../exams/similar/similar-exam-generator-client";

export const dynamic = "force-dynamic";

export default async function SimilarExamsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");
  if (!FEATURE_FLAGS.SHOW_SIMILAR_EXAM_GENERATION) {
    redirect("/director/workbench/exams");
  }

  const [collections, membershipRaw] = await Promise.all([
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
  ]);

  const draftMembership = Object.fromEntries(
    Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
  );

  return (
    <SimilarExamGeneratorClient
      academyId={staff.academyId}
      draftCollections={collections}
      draftMembership={draftMembership}
    />
  );
}
