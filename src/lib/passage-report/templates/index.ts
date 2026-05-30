import type { TemplateId } from "../schema";
import { classicTemplate } from "./classic";
import { examSheetTemplate } from "./exam-sheet";
import { magazineTemplate } from "./magazine";
import { modernTemplate } from "./modern";
import { notebookTemplate } from "./notebook";
import type { DesignTemplate, PageTemplate } from "./types";

export * from "./types";

const TEMPLATES: Record<TemplateId, DesignTemplate> = {
  modern: modernTemplate,
  classic: classicTemplate,
  magazine: magazineTemplate,
  notebook: notebookTemplate,
  "exam-sheet": examSheetTemplate,
};

export function getTemplate(id: TemplateId): DesignTemplate {
  return TEMPLATES[id];
}

export function listTemplates(): DesignTemplate[] {
  return [
    modernTemplate,
    classicTemplate,
    magazineTemplate,
    notebookTemplate,
    examSheetTemplate,
  ];
}

export function templateMetadata() {
  return listTemplates().map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    thumbnail: t.thumbnail,
    paletteName: t.theme.paletteName,
    primary: t.theme.primary,
    accent: t.theme.accent,
  }));
}

/** 추가 페이지 슬롯 — 기본 3페이지 초과 시 사용 */
export function buildExtraPage(
  templateId: TemplateId,
  pageNumber: number,
  primaryKind: PageTemplate["slots"][number]["blockKind"],
): PageTemplate {
  const template = getTemplate(templateId);
  return template.extraPage(pageNumber, { primaryKind });
}
