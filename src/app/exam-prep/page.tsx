import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { CONTENT_HUBS } from "@/lib/seo/articles-content";
import { HubIndexShell } from "@/components/seo/hub-index-shell";

const HUB = CONTENT_HUBS.exams;

export const metadata: Metadata = buildMetadata({
  title: "영어 시험 대비 — 모의고사·수능·내신·EBS",
  description: HUB.description,
  path: HUB.path,
  keywords: [
    "고1 모의고사 영어",
    "고2 모의고사 영어",
    "고3 모의고사 영어",
    "수능 영어 대비",
    "내신 영어 대비",
    "수능특강 변형문제",
    "영어 모의고사 변형문제",
  ],
});

export default function ExamsHubPage() {
  return <HubIndexShell category="exams" />;
}
