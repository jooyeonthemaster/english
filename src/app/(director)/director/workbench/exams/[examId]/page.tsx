"use client";

// 구 상세 URL 호환 셔틀 — /workbench/exams/[examId] 는 편집 화면으로 보낸다.
// 서버 redirect() 는 이 세그먼트의 loading.tsx 가 셸을 먼저 플러시하는 탓에
// HTTP 307 이 아니라 스트리밍 본문 속 클라이언트 리다이렉트로 내려가고,
// 하이드레이션 중 라우터 전환이 끼어들며 dev 에서 훅 불일치로 크래시했다
// ("Rendered more hooks than during the previous render"). 마운트 후
// router.replace 로 전환해 하이드레이션과 리다이렉트를 분리한다.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function WorkbenchExamPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const examId = params?.examId;

  useEffect(() => {
    if (!examId) return;
    router.replace(`/director/workbench/exams/${examId}/edit`);
  }, [examId, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
      <Loader2 className="size-6 animate-spin" aria-label="편집 화면으로 이동 중" />
    </div>
  );
}
