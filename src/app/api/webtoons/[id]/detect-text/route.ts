import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { detectWebtoonText } from "@/lib/webtoon-text/detect";
import { expectedLetteringFromStoryboard } from "@/lib/webtoon-text/detect-lettering";
import type { WebtoonTextDoc } from "@/lib/webtoon-text/types";
import { isPersistedStoryboard } from "@/lib/webtoon-storyboard/types";

export const runtime = "nodejs";
// 예산: 이미지 다운로드 ≤15s + 인식 호출 ≤90s(detect.ts DETECT_TIMEOUT_MS) + sharp·DB 저장 여유.
export const maxDuration = 120;

const IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 스토리보드(v2)로 만든 웹툰이면 이미지에 찍으라고 지시한 정확한 문자열 목록 — 인식 힌트.
 * 깨진 레터링 박스는 이 원문으로 다시 그리도록(edited) 저장된다(detect-lettering.ts).
 * 힌트는 품질 보강일 뿐이라 어떤 실패(레거시 행·컬럼 미적용·형식 불일치)도 인식을 막지 않는다.
 */
async function loadLetteringHints(webtoonId: string): Promise<string[]> {
  try {
    const row = await prisma.webtoon.findUnique({
      where: { id: webtoonId },
      select: { storyboard: true },
    });
    const storyboard = row?.storyboard;
    return isPersistedStoryboard(storyboard) ? expectedLetteringFromStoryboard(storyboard) : [];
  } catch (err) {
    console.warn("[webtoon detect-text] storyboard hint unavailable", {
      id: webtoonId,
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// POST /api/webtoons/[id]/detect-text
// Detect baked-in text regions once and persist as `textDoc`. Idempotent: returns the
// existing doc unless `?force=1`. This is the one-time cost before opening the editor.
export async function POST(req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  const force = req.nextUrl.searchParams.get("force") === "1";

  const webtoon = await prisma.webtoon.findFirst({
    where: { id, academyId: staff.academyId },
    select: { id: true, status: true, imageUrl: true, textDoc: true },
  });
  if (!webtoon) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }
  if (webtoon.status !== "COMPLETED" || !webtoon.imageUrl) {
    return NextResponse.json(
      { error: "완료된 웹툰만 편집할 수 있습니다" },
      { status: 409 },
    );
  }

  if (!force && webtoon.textDoc) {
    return NextResponse.json({ ok: true, textDoc: webtoon.textDoc, cached: true });
  }

  let imageBuffer: Buffer;
  try {
    const res = await fetch(webtoon.imageUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`download ${res.status}`);
    imageBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: `웹툰 이미지를 불러오지 못했습니다: ${message}` },
      { status: 502 },
    );
  }

  const expectedTexts = await loadLetteringHints(webtoon.id);

  let textDoc: WebtoonTextDoc;
  try {
    textDoc = await detectWebtoonText({
      imageBuffer,
      originalUrl: webtoon.imageUrl,
      academyId: staff.academyId,
      expectedTexts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[webtoon detect-text] failed", { id, message });
    return NextResponse.json(
      { error: `텍스트 인식에 실패했습니다: ${message}` },
      { status: 500 },
    );
  }

  await prisma.webtoon.update({
    where: { id: webtoon.id },
    data: { textDoc: textDoc as unknown as object },
  });

  return NextResponse.json({ ok: true, textDoc, cached: false });
}
