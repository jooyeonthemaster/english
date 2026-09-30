/**
 * 저장된 시험지(행 + 문항) → HWPX 문서(IR). export-hwpx 라우트의 조립 전부 — DB 조회·권한·
 * 기록(printCount·이벤트)만 라우트에 남긴다. 검증 하니스도 이 함수를 그대로 부른다(SELECT 전용 재현).
 *
 *   settings(JSON) → parseSavedPaperSettings → (이미지 PNG 변환) → buildPaperItemsFromExam(공용 정본)
 *                 → hwpxBuilderInput → buildBuilderHwpxDocument
 */
import { buildBuilderHwpxDocument } from "./builder";
import { hwpxBuilderInput } from "./export-model";
import type { HwpxDocument } from "./types";
import type { PaperItem } from "@/components/exams/paper-builder/types";
import {
  buildPaperItemsFromExam,
  parseSavedPaperSettings,
  type SavedPaperExamQuestion,
  type SavedPaperSettings,
} from "@/components/exams/paper-builder/saved-paper-items";
import { toEmbeddableImageDataUrl } from "@/lib/server-image";

/**
 * 한컴이 임베드 못 하는 이미지 포맷(webp 등)을 PNG 로 — hp:pic 은 png/jpg/gif/bmp 만.
 * 본문 이미지 블록과 **학원 로고**(E36 부터 표지에 그린다)를 제자리 변환한다.
 * (DOCX 라우트도 같은 변환을 한다 — export-docx/route.ts 의 academyLogoDataUrl.)
 */
async function embedImagesInPlace(saved: SavedPaperSettings): Promise<void> {
  const header = saved.header as { academyLogoDataUrl?: string | null } | undefined;
  await Promise.all([
    ...(Array.isArray(saved.blocks)
      ? saved.blocks.map(async (b) => {
          if (b.blockType === "image" && b.imageDataUrl) {
            b.imageDataUrl = await toEmbeddableImageDataUrl(b.imageDataUrl);
          }
        })
      : []),
    (async () => {
      if (header?.academyLogoDataUrl) {
        header.academyLogoDataUrl = await toEmbeddableImageDataUrl(header.academyLogoDataUrl);
      }
    })(),
  ]);
}

export async function buildExamHwpxDocument(opts: {
  title: string;
  /** exams.settings 원문(JSON 문자열) 또는 NULL. */
  settings: string | null;
  questions: readonly SavedPaperExamQuestion[];
  includeAnswers: boolean;
  examDateLabel: string;
}): Promise<{ doc: HwpxDocument; paperItems: PaperItem[] }> {
  const saved = parseSavedPaperSettings(opts.settings);
  if (saved) await embedImagesInPlace(saved);
  const paperItems = buildPaperItemsFromExam(opts.questions, saved);
  const input = hwpxBuilderInput(paperItems, saved);
  const doc = buildBuilderHwpxDocument({
    title: opts.title,
    settings: input.settings,
    resolvedItems: input.resolvedItems,
    includeAnswers: opts.includeAnswers,
    fullExamQuestions: input.fullExamQuestions,
    // 표지 정보 박스의 "시험일" 칸 — exam.examDate 는 settings 에 없어서 따로 넘긴다.
    examDateLabel: opts.examDateLabel,
  });
  return { doc, paperItems };
}
