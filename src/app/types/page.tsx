import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { CONTENT_HUBS } from "@/lib/seo/articles-content";
import { HubIndexShell } from "@/components/seo/hub-index-shell";

const HUB = CONTENT_HUBS.types;

export const metadata: Metadata = buildMetadata({
  title: "영어 문제 유형백과 — 수능·내신 전 유형",
  description: HUB.description,
  path: HUB.path,
  keywords: [
    "영어 문제 유형",
    "수능 영어 유형",
    "내신 영어 유형",
    "빈칸추론",
    "영어 어법 문제",
    "영어 서술형 유형",
    "영어 문제 만들기",
  ],
});

export default function TypesHubPage() {
  return <HubIndexShell category="types" />;
}
