import { redirect } from "next/navigation";

export default async function SimilarExamGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const params = await searchParams;
  const suffix = params.jobId ? `?jobId=${encodeURIComponent(params.jobId)}` : "";
  redirect(`/director/workbench/similar-exams${suffix}`);
}
