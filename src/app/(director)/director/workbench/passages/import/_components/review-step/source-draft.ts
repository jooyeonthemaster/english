// ============================================================================
// SourceMaterial draft helpers and firstPageOf helper.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import type {
  ExtractionItemSnapshot,
  SourceMaterialSnapshot,
} from "@/lib/extraction/types";
import type { M2SourceMatchSnapshot, SourceMaterialDraft } from "./types";

export function firstPageOf(item: ExtractionItemSnapshot): number {
  if (item.boundingBox?.page != null) return item.boundingBox.page;
  return item.sourcePageIndex[0] ?? 0;
}

export function buildSourceDraft(
  meta: SourceMaterialSnapshot | null,
): SourceMaterialDraft {
  return {
    title: meta?.title ?? "",
    subtitle: meta?.subtitle ?? "",
    subject: ((meta?.subject as SourceMaterialDraft["subject"]) ?? "") || "",
    type: ((meta?.type as SourceMaterialDraft["type"]) ?? "") || "",
    grade: meta?.grade != null ? String(meta.grade) : "",
    semester: ((meta?.semester as SourceMaterialDraft["semester"]) ?? "") || "",
    year: meta?.year != null ? String(meta.year) : "",
    round: meta?.round ?? "",
    examType: ((meta?.examType as SourceMaterialDraft["examType"]) ?? "") || "",
    publisher: meta?.publisher ?? "",
    school: "",
  };
}

export function sourceDraftToPayload(draft: SourceMaterialDraft) {
  const grade = draft.grade ? Number(draft.grade) : undefined;
  const year = draft.year ? Number(draft.year) : undefined;
  const payload: Record<string, unknown> = {
    title: draft.title.trim() || "제목 없음",
  };
  if (draft.subtitle.trim()) payload.subtitle = draft.subtitle.trim();
  if (draft.subject) payload.subject = draft.subject;
  if (draft.type) payload.type = draft.type;
  if (grade && !Number.isNaN(grade)) payload.grade = grade;
  if (draft.semester) payload.semester = draft.semester;
  if (year && !Number.isNaN(year)) payload.year = year;
  if (draft.round.trim()) payload.round = draft.round.trim();
  if (draft.examType) payload.examType = draft.examType;
  if (draft.publisher.trim()) payload.publisher = draft.publisher.trim();
  // 학교명은 MVP에서 문자열로 전송 — 서버에서 academy 내 매칭을 통해 schoolId 결정.
  // (zod schema는 optional `schoolId`를 받으므로 별도 `schoolName` 키로 분리 전송한다.)
  if (draft.school.trim()) payload.schoolName = draft.school.trim();
  return payload;
}

export function mergeSourceMatchIntoDraft(
  draft: SourceMaterialDraft,
  match: M2SourceMatchSnapshot | null,
): SourceMaterialDraft {
  if (!match) return draft;
  const metadata =
    match.metadata && typeof match.metadata === "object"
      ? (match.metadata as Record<string, unknown>)
      : {};

  return {
    ...draft,
    title: draft.title || match.title || "",
    publisher: draft.publisher || match.publisher || "",
    grade:
      draft.grade ||
      stringFromUnknown(metadata.grade) ||
      stringFromUnknown(metadata.sourceMaterialGrade),
    semester:
      draft.semester ||
      enumFromUnknown<SourceMaterialDraft["semester"]>(
        metadata.semester ?? metadata.sourceMaterialSemester,
        ["FIRST", "SECOND", ""],
      ),
    year:
      draft.year ||
      stringFromUnknown(match.year) ||
      stringFromUnknown(metadata.year),
    round: draft.round || stringFromUnknown(metadata.round),
    examType:
      draft.examType ||
      enumFromUnknown<SourceMaterialDraft["examType"]>(metadata.examType, [
        "MIDTERM",
        "FINAL",
        "MOCK",
        "SUNEUNG",
        "DIAGNOSTIC",
        "EBS",
        "PRIVATE",
        "",
      ]),
    type:
      draft.type ||
      enumFromUnknown<SourceMaterialDraft["type"]>(metadata.type, [
        "EXAM",
        "TEXTBOOK",
        "WORKBOOK",
        "HANDOUT",
        "MOCK",
        "SUNEUNG",
        "OTHER",
        "",
      ]),
    subject:
      draft.subject ||
      enumFromUnknown<SourceMaterialDraft["subject"]>(metadata.subject, [
        "ENGLISH",
        "KOREAN",
        "MATH",
        "OTHER",
        "",
      ]),
    school: draft.school || stringFromUnknown(metadata.schoolName),
  };
}

function stringFromUnknown(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function enumFromUnknown<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  const text = stringFromUnknown(value);
  return allowed.includes(text as T)
    ? (text as T)
    : allowed[allowed.length - 1];
}
