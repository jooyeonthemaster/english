// ============================================================================
// 오프라인 홍보물 시드 — smoat-offline-marketing/ 의 배포 PDF를 관리자 페이지
// (오프라인 홍보)에 등록한다. Supabase 공개 버킷(offline-marketing) 업로드 +
// offline_marketing_assets 레코드 생성. 파일명 기준 멱등(이미 있으면 건너뜀).
//
//   npx tsx scripts/seed-offline-marketing.ts
//
// 필요 env: DATABASE_URL(.env, Prisma 자동로드), SUPABASE_URL,
//           SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

// ── .env / .env.local 을 process.env 로 로드(Prisma 외 키: SUPABASE_*) ──────
function loadEnv(file: string) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const BUCKET = "offline-marketing";
const SRC_DIR = "smoat-offline-marketing";

// 파일 → 표시용 메타데이터.
const FILES: Array<{ file: string; title: string; category: string; description?: string }> = [
  {
    file: "2027_영어_실전모의고사_문제지.pdf",
    title: "2027 영어 실전모의고사 문제지",
    category: "학습지 샘플",
    description: "오프라인 배포용 실전모의고사 문제지 샘플",
  },
  {
    file: "4_SMOAT_세미나_결합 1.pdf",
    title: "SMOAT 세미나 안내",
    category: "세미나",
    description: "세미나 홍보 결합본",
  },
  {
    file: "전단지용 학습지.pdf",
    title: "전단지용 학습지",
    category: "전단지",
    description: "오프라인 전단지 배포용 학습지",
  },
];

function slugify(name: string): string {
  return (
    name
      .replace(/\.pdf$/i, "")
      .slice(0, 40)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "file"
  );
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다(.env 확인).");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const prisma = new PrismaClient();

  // 공개 버킷 보장.
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (!existing) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 30 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf"],
    });
    if (error && !/already|exists/i.test(error.message)) throw error;
    console.log(`✓ 버킷 생성: ${BUCKET}`);
  }

  // 새 시드는 기존 목록 위로(가장 작은 sortOrder 아래로 쌓음).
  const top = await prisma.offlineMarketingCampaign.findFirst({
    orderBy: { sortOrder: "asc" },
    select: { sortOrder: true },
  });
  let sortOrder = (top?.sortOrder ?? 0) - 1;

  for (const item of FILES) {
    const abs = path.resolve(process.cwd(), SRC_DIR, item.file);
    if (!fs.existsSync(abs)) {
      console.warn(`⚠ 파일 없음, 건너뜀: ${item.file}`);
      continue;
    }

    // 파일명 기준 멱등.
    const dup = await prisma.offlineMarketingAsset.findFirst({
      where: { fileName: item.file },
      select: { id: true },
    });
    if (dup) {
      console.log(`• 이미 등록됨, 건너뜀: ${item.title}`);
      continue;
    }

    const buffer = fs.readFileSync(abs);
    const storagePath = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${slugify(item.file)}.pdf`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      console.error(`✗ 업로드 실패(${item.title}): ${upErr.message}`);
      continue;
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    // 홍보(캠페인) 1개 → 그 안에 파일 1개(파일별 관리는 UI에서 추가).
    await prisma.offlineMarketingCampaign.create({
      data: {
        title: item.title,
        description: item.description ?? null,
        category: item.category,
        sortOrder: sortOrder--,
        isActive: true,
        assets: {
          create: {
            title: item.title,
            fileUrl: pub.publicUrl,
            storagePath,
            fileName: item.file,
            fileSize: buffer.byteLength,
            sortOrder: 0,
          },
        },
      },
    });
    console.log(`✓ 등록: ${item.title} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
  }

  await prisma.$disconnect();
  console.log("완료.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
