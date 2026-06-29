import type { Metadata } from "next";
import { HelpPostDetailClient } from "@/components/help-center/help-post-detail-client";

export const metadata: Metadata = {
  title: "고객 지원",
};

export default async function SupportDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <HelpPostDetailClient board="SUPPORT" postId={postId} />;
}
