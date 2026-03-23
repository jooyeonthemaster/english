"use server";

import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

interface PassageRow {
  title: string;
  content: string;
  grade?: number;
  semester?: string;
  unit?: string;
  publisher?: string;
  difficulty?: string;
  source?: string;
  schoolSlug?: string;
  tags?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: { row: number; reason: string }[];
}

export async function POST(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const format = (formData.get("format") as string) || "csv"; // csv | tsv | json

    if (!file) {
      return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
    }

    const text = await file.text();
    let rows: PassageRow[] = [];

    // ── Parse based on format ──
    if (format === "json") {
      try {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.passages || parsed.data || [];
      } catch {
        return NextResponse.json({ error: "JSON 파싱에 실패했습니다." }, { status: 400 });
      }
    } else {
      // CSV or TSV
      const delimiter = format === "tsv" ? "\t" : detectDelimiter(text);
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

      if (lines.length < 2) {
        return NextResponse.json({ error: "헤더와 최소 1개 데이터 행이 필요합니다." }, { status: 400 });
      }

      // Parse header
      const headerLine = lines[0].toLowerCase().trim();
      const headers = parseCSVLine(headerLine, delimiter);

      // Map header names (Korean + English support)
      const headerMap: Record<string, string> = {};
      const HEADER_ALIASES: Record<string, string[]> = {
        title: ["title", "제목", "지문제목", "passage_title"],
        content: ["content", "본문", "지문", "지문내용", "passage", "text", "지문본문"],
        grade: ["grade", "학년"],
        semester: ["semester", "학기"],
        unit: ["unit", "단원", "단원명", "lesson"],
        publisher: ["publisher", "출판사", "교과서"],
        difficulty: ["difficulty", "난이도"],
        source: ["source", "출처", "원본"],
        schoolSlug: ["school", "학교", "school_slug", "schoolslug"],
        tags: ["tags", "태그", "키워드"],
      };

      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        const idx = headers.findIndex((h) =>
          aliases.some((alias) => h.replace(/["\s]/g, "").includes(alias))
        );
        if (idx !== -1) headerMap[field] = String(idx);
      }

      if (!headerMap.title && !headerMap.content) {
        return NextResponse.json(
          {
            error:
              "필수 컬럼을 찾을 수 없습니다. 최소 '제목'과 '본문' 컬럼이 필요합니다.\n" +
              "감지된 헤더: " + headers.join(", "),
          },
          { status: 400 }
        );
      }

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i], delimiter);
        const get = (field: string) => {
          const idx = headerMap[field];
          return idx !== undefined ? cols[Number(idx)]?.trim().replace(/^"|"$/g, "") : undefined;
        };

        const gradeStr = get("grade");
        rows.push({
          title: get("title") || `지문 ${i}`,
          content: get("content") || "",
          grade: gradeStr ? parseInt(gradeStr, 10) : undefined,
          semester: normalizeSemester(get("semester")),
          unit: get("unit"),
          publisher: get("publisher"),
          difficulty: normalizeDifficulty(get("difficulty")),
          source: get("source"),
          schoolSlug: get("school"),
          tags: get("tags"),
        });
      }
    }

    // ── Validate and insert ──
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    // Pre-fetch schools for slug lookup
    const schools = await prisma.school.findMany({
      where: { academyId: staff.academyId },
      select: { id: true, slug: true, name: true },
    });
    const schoolMap = new Map(schools.map((s) => [s.slug, s.id]));
    // Also map by name
    for (const s of schools) {
      schoolMap.set(s.name, s.id);
    }

    const passagesToCreate: {
      academyId: string;
      title: string;
      content: string;
      grade?: number;
      semester?: string;
      unit?: string;
      publisher?: string;
      difficulty?: string;
      source?: string;
      schoolId?: string;
      tags?: string;
      order: number;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header

      // Validate required fields
      if (!row.content || row.content.trim().length === 0) {
        result.failed++;
        result.errors.push({ row: rowNum, reason: "본문(content)이 비어있습니다." });
        continue;
      }

      if (row.content.trim().length < 20) {
        result.failed++;
        result.errors.push({ row: rowNum, reason: "본문이 너무 짧습니다 (최소 20자)." });
        continue;
      }

      // Resolve school
      let schoolId: string | undefined;
      if (row.schoolSlug) {
        schoolId = schoolMap.get(row.schoolSlug) || schoolMap.get(row.schoolSlug.trim());
        if (!schoolId) {
          result.errors.push({
            row: rowNum,
            reason: `학교 '${row.schoolSlug}'를 찾을 수 없습니다. (무시하고 계속 진행)`,
          });
        }
      }

      // Parse tags
      let tagsJson: string | undefined;
      if (row.tags) {
        const tagList = row.tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
        tagsJson = tagList.length > 0 ? JSON.stringify(tagList) : undefined;
      }

      passagesToCreate.push({
        academyId: staff.academyId,
        title: row.title || `지문 ${i + 1}`,
        content: row.content.trim(),
        grade: row.grade && !isNaN(row.grade) ? row.grade : undefined,
        semester: row.semester,
        unit: row.unit,
        publisher: row.publisher,
        difficulty: row.difficulty,
        source: row.source,
        schoolId,
        tags: tagsJson,
        order: i,
      });
    }

    // Batch insert
    if (passagesToCreate.length > 0) {
      // createMany doesn't support undefined fields well, so insert one by one in a transaction
      await prisma.$transaction(
        passagesToCreate.map((p) =>
          prisma.passage.create({
            data: {
              academyId: p.academyId,
              title: p.title,
              content: p.content,
              grade: p.grade ?? null,
              semester: p.semester ?? null,
              unit: p.unit ?? null,
              publisher: p.publisher ?? null,
              difficulty: p.difficulty ?? null,
              source: p.source ?? null,
              schoolId: p.schoolId ?? null,
              tags: p.tags ?? null,
              order: p.order,
            },
          })
        )
      );
      result.success = passagesToCreate.length;
    }

    return NextResponse.json({
      message: `${result.success}개 지문이 등록되었습니다.${result.failed > 0 ? ` (${result.failed}개 실패)` : ""}`,
      ...result,
      total: rows.length,
    });
  } catch (error) {
    console.error("Passage import error:", error);
    return NextResponse.json(
      { error: "지문 가져오기 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : "알 수 없는 오류") },
      { status: 500 }
    );
  }
}

// ── Helpers ──

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const pipeCount = (firstLine.match(/\|/g) || []).length;
  if (tabCount > commaCount && tabCount > pipeCount) return "\t";
  if (pipeCount > commaCount) return "|";
  return ",";
}

function parseCSVLine(line: string, delimiter: string): string[] {
  // Handle quoted fields properly
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function normalizeSemester(val?: string): string | undefined {
  if (!val) return undefined;
  const v = val.trim().toUpperCase();
  if (v === "1" || v === "1학기" || v === "FIRST") return "FIRST";
  if (v === "2" || v === "2학기" || v === "SECOND") return "SECOND";
  return undefined;
}

function normalizeDifficulty(val?: string): string | undefined {
  if (!val) return undefined;
  const v = val.trim().toUpperCase();
  const map: Record<string, string> = {
    초급: "BEGINNER", 초등: "BEGINNER", BEGINNER: "BEGINNER",
    기초: "ELEMENTARY", ELEMENTARY: "ELEMENTARY",
    중급: "INTERMEDIATE", 중등: "INTERMEDIATE", INTERMEDIATE: "INTERMEDIATE",
    중상: "UPPER_INTERMEDIATE", UPPER_INTERMEDIATE: "UPPER_INTERMEDIATE",
    고급: "ADVANCED", 고등: "ADVANCED", ADVANCED: "ADVANCED",
    최상: "EXPERT", EXPERT: "EXPERT",
  };
  return map[v] || undefined;
}
