import type { Metadata } from "next";
import { getHelpPosts } from "@/actions/help-center";
import { HelpBoardClient } from "@/components/help-center/help-board-client";

export const metadata: Metadata = {
  title: "고객 지원",
};

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const posts = await getHelpPosts({ board: "SUPPORT", sort: "recent" });
  return <HelpBoardClient board="SUPPORT" initialPosts={posts} />;
}
