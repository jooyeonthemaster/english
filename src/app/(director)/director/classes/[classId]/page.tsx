import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ classId: string }>;
}

export default async function ClassDetailPage({ params }: Props) {
  const { classId } = await params;
  redirect(`/director/tutor?classId=${classId}`);
}
