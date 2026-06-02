import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function WorkbenchExamPage({ params }: PageProps) {
  const { examId } = await params;
  redirect(`/director/workbench/exams/${examId}/edit`);
}
