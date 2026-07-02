import type { Metadata } from "next";
import { HelpPostDetailClient } from "@/components/help-center/help-post-detail-client";

export const metadata: Metadata = {
  title: "피드백 게시판",
};

export default async function FeedbackDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <HelpPostDetailClient board="FEEDBACK" postId={postId} />;
}
