import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { CONTENT_HUBS } from "@/lib/seo/articles-content";
import { HubIndexShell } from "@/components/seo/hub-index-shell";

const HUB = CONTENT_HUBS.textbooks;

export const metadata: Metadata = buildMetadata({
  title: "영어 교과서별 내신 변형문제 가이드",
  description: HUB.description,
  path: HUB.path,
  keywords: [
    "영어 교과서 변형문제",
    "능률 영어 변형문제",
    "YBM 영어 변형문제",
    "천재 영어 변형문제",
    "비상 영어 변형문제",
    "고등 영어 내신 문제",
  ],
});

export default function TextbooksHubPage() {
  return <HubIndexShell category="textbooks" />;
}
