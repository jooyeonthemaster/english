// ============================================================================
// export-parity / pipeline — 감사가 재는 「내보내기 구현」의 모양. 기본은 현행 라우트의 진입점(CURRENT_PIPELINE).
// --pipeline <module> 로 다른 구현(수정 전 사본·브랜치 비교 등)을 같은 계기로 잴 수 있다 — 모듈은 이 모양의
// 객체를 default export 하거나 label·buildHwpx·buildDocx 를 이름으로 export 한다.
// ============================================================================
import { pathToFileURL } from "node:url";
import type { Document } from "docx";
import type { HwpxDocument } from "@/app/api/exams/[examId]/export-hwpx/_lib/types";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import { buildHwpxLikeRoute } from "./hwpx-adapter";
import { buildDocxLikeRoute } from "./docx-adapter";

type NumberedItem = { orderNum: number; questionId: string };

export type ExportPipeline = {
  label: string;
  /** items = 본문 머리 순서(파이프라인이 찍는 차례), answerItems = 정답표 번호 대응(없으면 items). */
  buildHwpx(
    title: string,
    settingsRaw: string | null,
    examQuestions: ExamQuestionData[],
  ): Promise<{ doc: HwpxDocument; items: NumberedItem[]; answerItems?: NumberedItem[] }>;
  buildDocx(
    title: string,
    settingsRaw: string | null,
    examQuestions: ExamQuestionData[],
  ): Promise<{ doc: Document; path: "builder" | "legacy"; items: NumberedItem[]; answerItems?: NumberedItem[] }>;
};

export const CURRENT_PIPELINE: ExportPipeline = {
  label: "current-routes",
  buildHwpx: (title, settingsRaw, eqs) => buildHwpxLikeRoute(title, settingsRaw, eqs as never),
  buildDocx: async (title, settingsRaw, eqs) => buildDocxLikeRoute(title, settingsRaw, eqs as never),
};

export async function loadPipeline(modulePath: string): Promise<ExportPipeline> {
  // Windows 절대 경로는 ESM 로더가 file:// URL 로만 받는다.
  const mod = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
  const candidate = (mod.default && typeof mod.default === "object" ? mod.default : mod) as Partial<ExportPipeline>;
  if (typeof candidate.buildHwpx !== "function" || typeof candidate.buildDocx !== "function") {
    throw new Error(`--pipeline ${modulePath}: buildHwpx/buildDocx export 가 없다`);
  }
  return {
    label: candidate.label ?? modulePath,
    buildHwpx: candidate.buildHwpx.bind(candidate),
    buildDocx: candidate.buildDocx.bind(candidate),
  };
}
