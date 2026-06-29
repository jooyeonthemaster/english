import type { Metadata } from "next";
import { getHelpPosts } from "@/actions/help-center";
import { HelpBoardClient } from "@/components/help-center/help-board-client";

export const metadata: Metadata = {
  title: "피드백 게시판",
};

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const posts = await getHelpPosts({ board: "FEEDBACK", sort: "recent" });
  return <HelpBoardClient board="FEEDBACK" initialPosts={posts} />;
}
