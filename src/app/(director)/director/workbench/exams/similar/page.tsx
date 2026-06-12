import { redirect } from "next/navigation";

import { FEATURE_FLAGS } from "@/lib/feature-flags";

export default async function SimilarExamGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const params = await searchParams;
  const suffix = params.jobId ? `?jobId=${encodeURIComponent(params.jobId)}` : "";
  if (!FEATURE_FLAGS.SHOW_SIMILAR_EXAM_GENERATION) {
    redirect("/director/workbench/exams");
  }

  redirect(`/director/workbench/similar-exams${suffix}`);
}
